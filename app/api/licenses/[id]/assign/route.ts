/**
 * License Assign/Unassign API Route
 *
 * Assignment consumes a seat (Organization.usedSeats) and is a cross-table transaction,
 * so it's a dedicated action route rather than a PATCH on /api/licenses/[id].
 *
 * - POST /api/licenses/[id]/assign   { userId? | email? } - assign this (pending) license
 * - DELETE /api/licenses/[id]/assign - unassign (revoke) this license, freeing the seat
 */

import { NextResponse } from 'next/server';
import { findProfileByEmail, getProfileById } from '@/lib/profilesService';
import licenseService from '@/lib/licenseService';
import orgMembershipService from '@/lib/orgMembershipService';
import { withAuth } from '@/lib/auth/apiGuard';
import { requireOrgAccess } from '@/lib/auth/orgAccess';

export const dynamic = 'force-dynamic';

function mapError(error: any): { status: number; message: string } {
  const message = error?.message || 'Operation failed';
  if (message.includes('not found') || message.includes('does not belong')) {
    return { status: 404, message };
  }
  if (
    message.includes('席次已滿') ||
    message.includes('占用') ||
    message.includes('已屬於其他組織') ||
    message.includes('already assigned') ||
    message.includes('already belongs')
  ) {
    return { status: 409, message };
  }
  return { status: 500, message };
}

// ==========================================
// POST - Assign license to a user
// ==========================================
export const POST = withAuth(async (req, context) => {
  try {
    const { id: licenseId } = await (context as { params: Promise<{ id: string }> }).params;

    const license = await licenseService.getLicenseById(licenseId);
    if (!license) {
      return NextResponse.json({ ok: false, error: 'License not found' }, { status: 404 });
    }

    const guard = await requireOrgAccess(req, license.orgId, 'write');
    if (!guard.ok) return guard.response;

    const body = await req.json();
    let profileId = body.userId as string | undefined;

    if (!profileId) {
      if (!body.email) {
        return NextResponse.json({ ok: false, error: 'userId or email is required' }, { status: 400 });
      }
      const found = await findProfileByEmail(body.email);
      if (!found) {
        return NextResponse.json({ ok: false, error: '找不到此 Email 對應的使用者' }, { status: 404 });
      }
      profileId = found.id;
    } else {
      const found = await getProfileById(profileId);
      if (!found) {
        return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 });
      }
    }

    const result = await orgMembershipService.assignMemberWithLicense({
      orgId: license.orgId,
      profileId: profileId!,
      licenseId,
      assignedBy: guard.actor.session.userId
    });

    return NextResponse.json({
      ok: true,
      profile: { ...result.profile, password: undefined },
      license: result.license,
      usedSeats: result.usedSeats,
      message: '授權已指派'
    });
  } catch (error: any) {
    console.error('[LicenseAssignAPI] POST failed:', error.message);
    const { status, message } = mapError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
});

// ==========================================
// DELETE - Unassign (revoke) license
// ==========================================
export const DELETE = withAuth(async (req, context) => {
  try {
    const { id: licenseId } = await (context as { params: Promise<{ id: string }> }).params;

    const license = await licenseService.getLicenseById(licenseId);
    if (!license) {
      return NextResponse.json({ ok: false, error: 'License not found' }, { status: 404 });
    }

    const guard = await requireOrgAccess(req, license.orgId, 'write');
    if (!guard.ok) return guard.response;

    if (license.status !== 'active' || !license.userId) {
      return NextResponse.json({ ok: false, error: '此授權目前未指派給任何使用者' }, { status: 400 });
    }

    const result = await orgMembershipService.removeMemberFromOrg({
      orgId: license.orgId,
      profileId: license.userId
    });

    return NextResponse.json({
      ok: true,
      profile: { ...result.profile, password: undefined },
      usedSeats: result.usedSeats,
      message: '已取消指派'
    });
  } catch (error: any) {
    console.error('[LicenseAssignAPI] DELETE failed:', error.message);
    const { status, message } = mapError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
});
