/**
 * Organization Member by Profile ID API Route
 *
 * Endpoints:
 * - PATCH /api/organizations/[id]/members/[profileId] - Change org unit / org-admin flag
 * - DELETE /api/organizations/[id]/members/[profileId] - Remove member (revokes license,
 *   frees the seat, reverts the profile to B2C) atomically
 */

import { NextResponse } from 'next/server';
import { getProfileById } from '@/lib/profilesService';
import organizationService from '@/lib/organizationService';
import orgMembershipService from '@/lib/orgMembershipService';
import { withAuth } from '@/lib/auth/apiGuard';
import { requireOrgAccess } from '@/lib/auth/orgAccess';

export const dynamic = 'force-dynamic';

function sanitizeProfile(profile: any) {
  if (!profile) return profile;
  const { password, ...rest } = profile;
  return rest;
}

function mapMembershipError(error: any): { status: number; message: string } {
  const message = error?.message || 'Operation failed';
  if (message.includes('not found') || message.includes('does not belong')) {
    return { status: 404, message };
  }
  return { status: 500, message };
}

// ==========================================
// PATCH - Change member's org unit / org-admin flag
// ==========================================
export const PATCH = withAuth(async (req, context) => {
  try {
    const { id: orgId, profileId } = await (
      context as { params: Promise<{ id: string; profileId: string }> }
    ).params;

    const guard = await requireOrgAccess(req, orgId, 'write');
    if (!guard.ok) return guard.response;

    const target = await getProfileById(profileId);
    if (!target || target.orgId !== orgId) {
      return NextResponse.json({ ok: false, error: 'Member not found in this organization' }, { status: 404 });
    }

    const body = await req.json();

    if (body.isOrgAdmin !== undefined && !guard.actor.isSystemAdmin) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: only system administrators may change org-admin status' },
        { status: 403 }
      );
    }

    let profile = target;
    if (body.orgUnitId !== undefined) {
      profile = await orgMembershipService.changeMemberOrgUnit({
        orgId,
        profileId,
        orgUnitId: body.orgUnitId || null
      });
    }
    if (body.isOrgAdmin !== undefined) {
      profile = await orgMembershipService.setMemberOrgAdmin({
        orgId,
        profileId,
        isOrgAdmin: body.isOrgAdmin === true
      });
    }

    return NextResponse.json({ ok: true, profile: sanitizeProfile(profile), message: 'Member updated successfully' });
  } catch (error: any) {
    console.error('[OrgMemberAPI] PATCH failed:', error.message);
    const { status, message } = mapMembershipError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
});

// ==========================================
// DELETE - Remove member from organization
// ==========================================
export const DELETE = withAuth(async (req, context) => {
  try {
    const { id: orgId, profileId } = await (
      context as { params: Promise<{ id: string; profileId: string }> }
    ).params;

    const guard = await requireOrgAccess(req, orgId, 'write');
    if (!guard.ok) return guard.response;

    const org = await organizationService.getOrganizationById(orgId);
    if (org?.adminUserId === profileId && !guard.actor.isSystemAdmin) {
      return NextResponse.json(
        { ok: false, error: '無法移除組織的主要管理員，請由系統管理員操作' },
        { status: 400 }
      );
    }

    const result = await orgMembershipService.removeMemberFromOrg({ orgId, profileId });

    return NextResponse.json({
      ok: true,
      profile: sanitizeProfile(result.profile),
      usedSeats: result.usedSeats,
      message: '成員已移出組織'
    });
  } catch (error: any) {
    console.error('[OrgMemberAPI] DELETE failed:', error.message);
    const { status, message } = mapMembershipError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
});
