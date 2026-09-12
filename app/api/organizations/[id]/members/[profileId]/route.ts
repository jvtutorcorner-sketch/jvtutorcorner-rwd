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
import { requireMemberScopeAccess } from '@/lib/auth/orgAccess';
import { writeAuditLog } from '@/lib/auditLogService';

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
  if (
    message.includes('必須先指派 orgUnit') ||
    message.includes('僅學生身分') ||
    message.includes('archived')
  ) {
    return { status: 400, message };
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

    const target = await getProfileById(profileId);
    if (!target || (target as any).orgId !== orgId) {
      return NextResponse.json({ ok: false, error: 'Member not found in this organization' }, { status: 404 });
    }

    // dept_admin 只能動「目前在自己子樹內」的成員 —— 不能碰其他部門的人。
    const guard = await requireMemberScopeAccess(req, orgId, (target as any).orgUnitId ?? null);
    if (!guard.ok) return guard.response;

    const body = await req.json();

    if (body.isOrgAdmin !== undefined && !guard.actor.isSystemAdmin) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: only system administrators may change org-admin status' },
        { status: 403 }
      );
    }

    // 指派/撤銷 dept_admin：system admin 或本組織自己的 org admin 都可以，
    // 純 dept_admin 或一般成員不行（避免自己把自己或同儕升級）。
    if (
      body.isDeptAdmin !== undefined &&
      !guard.actor.isSystemAdmin &&
      !(guard.actor.isOrgAdmin && guard.actor.orgId === orgId)
    ) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: only system administrators or this organization\'s admin may change dept-admin status' },
        { status: 403 }
      );
    }

    // 改部門也要確認「新部門」還是在 dept_admin 的子樹內，否則等於把成員過繼給範圍外的部門。
    if (
      body.orgUnitId !== undefined &&
      !guard.actor.isSystemAdmin &&
      !(guard.actor.isOrgAdmin && guard.actor.orgId === orgId)
    ) {
      const targetScopeGuard = await requireMemberScopeAccess(req, orgId, body.orgUnitId || null);
      if (!targetScopeGuard.ok) return targetScopeGuard.response;
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
    if (body.isDeptAdmin !== undefined) {
      profile = await orgMembershipService.setMemberDeptAdmin({
        orgId,
        profileId,
        isDeptAdmin: body.isDeptAdmin === true
      });
    }

    await writeAuditLog({
      actorId: guard.actor.session.userId,
      action: 'org.member.update',
      targetType: 'profile',
      targetId: profileId,
      orgId,
      metadata: {
        orgUnitId: body.orgUnitId,
        isOrgAdmin: body.isOrgAdmin,
        isDeptAdmin: body.isDeptAdmin,
      },
    });

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

    const target = await getProfileById(profileId);
    if (!target || (target as any).orgId !== orgId) {
      return NextResponse.json({ ok: false, error: 'Member not found in this organization' }, { status: 404 });
    }

    // dept_admin 只能移除「目前在自己子樹內」的成員。
    const guard = await requireMemberScopeAccess(req, orgId, (target as any).orgUnitId ?? null);
    if (!guard.ok) return guard.response;

    const org = await organizationService.getOrganizationById(orgId);
    if (org?.adminUserId === profileId && !guard.actor.isSystemAdmin) {
      return NextResponse.json(
        { ok: false, error: '無法移除組織的主要管理員，請由系統管理員操作' },
        { status: 400 }
      );
    }

    const result = await orgMembershipService.removeMemberFromOrg({ orgId, profileId });

    await writeAuditLog({
      actorId: guard.actor.session.userId,
      action: 'org.member.remove',
      targetType: 'profile',
      targetId: profileId,
      orgId,
      metadata: { usedSeats: result.usedSeats },
    });

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
