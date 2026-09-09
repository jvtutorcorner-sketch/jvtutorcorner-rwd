/**
 * Organization Members API Route
 *
 * Endpoints:
 * - GET /api/organizations/[id]/members - List members (profiles) of this organization,
 *   annotated with their license status
 * - POST /api/organizations/[id]/members - Assign an existing user (by email or profileId)
 *   to this organization — mints/consumes a license and increments usedSeats atomically
 */

import { NextResponse } from 'next/server';
import { findProfilesByOrgId, findProfileByEmail, getProfileById } from '@/lib/profilesService';
import licenseService from '@/lib/licenseService';
import orgMembershipService from '@/lib/orgMembershipService';
import { withAuth } from '@/lib/auth/apiGuard';
import { requireOrgAccess, requireMemberScopeAccess, filterMembersForActor, resolveOrgActor } from '@/lib/auth/orgAccess';

export const dynamic = 'force-dynamic';

function sanitizeProfile(profile: any) {
  if (!profile) return profile;
  const { password, ...rest } = profile;
  return rest;
}

function mapAssignError(error: any): { status: number; message: string } {
  const message = error?.message || 'Failed to assign member';
  if (message.includes('not found')) return { status: 404, message };
  if (
    message.includes('席次已滿') ||
    message.includes('占用') ||
    message.includes('已屬於其他組織') ||
    message.includes('already assigned') ||
    message.includes('already belongs')
  ) {
    return { status: 409, message };
  }
  if (message.includes('not active') || message.includes('archived')) {
    return { status: 400, message };
  }
  return { status: 500, message };
}

// ==========================================
// GET - List organization members
// ==========================================
export const GET = withAuth(async (req, context) => {
  try {
    const { id: orgId } = await (context as { params: Promise<{ id: string }> }).params;

    // 系統管理員／組織管理員讀整組織成員；dept_admin 讀不到就用範圍過濾而不是直接 403，
    // 才能支撐「dept_admin 可見 /admin/learners 且僅列出自己部門下學員」的需求。
    const orgGuard = await requireOrgAccess(req, orgId, 'read');
    const actor = orgGuard.ok ? orgGuard.actor : await resolveOrgActor(req);
    if (!orgGuard.ok && !(actor.isDeptAdmin && actor.orgId === orgId)) {
      return orgGuard.response;
    }

    const [profiles, activeLicenses] = await Promise.all([
      findProfilesByOrgId(orgId),
      licenseService.listLicensesByOrg(orgId, 'active')
    ]);

    const licenseByUserId = new Map(activeLicenses.map((l) => [l.userId, l]));

    const members = await filterMembersForActor(
      actor,
      orgId,
      profiles.map((profile: any) => ({
        ...sanitizeProfile(profile),
        license: licenseByUserId.get(profile.id) || null
      }))
    );

    return NextResponse.json({ ok: true, members, count: members.length });
  } catch (error: any) {
    console.error('[OrgMembersAPI] GET failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to list members' },
      { status: 500 }
    );
  }
});

// ==========================================
// POST - Assign an existing user to this organization
// ==========================================
export const POST = withAuth(async (req, context) => {
  try {
    const { id: orgId } = await (context as { params: Promise<{ id: string }> }).params;

    const body = await req.json();
    const { email, profileId: bodyProfileId, orgUnitId, isOrgAdmin, courseId, expiresAt } = body;

    // dept_admin 只能把新成員指派進自己子樹內的部門（沒填 orgUnitId 一律拒絕，不能塞進「無部門」）。
    const guard = await requireMemberScopeAccess(req, orgId, orgUnitId ?? null);
    if (!guard.ok) return guard.response;

    if (isOrgAdmin === true && !guard.actor.isSystemAdmin) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: only system administrators may grant org-admin' },
        { status: 403 }
      );
    }

    let profileId = bodyProfileId as string | undefined;
    if (!profileId) {
      if (!email) {
        return NextResponse.json(
          { ok: false, error: 'email or profileId is required' },
          { status: 400 }
        );
      }
      const found = await findProfileByEmail(email);
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
      orgId,
      profileId: profileId!,
      orgUnitId: orgUnitId || null,
      isOrgAdmin: isOrgAdmin === true,
      courseId,
      expiresAt,
      assignedBy: guard.actor.session.userId
    });

    return NextResponse.json(
      {
        ok: true,
        profile: sanitizeProfile(result.profile),
        license: result.license,
        usedSeats: result.usedSeats,
        message: '成員已加入組織'
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[OrgMembersAPI] POST failed:', error.message);
    const { status, message } = mapAssignError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
});
