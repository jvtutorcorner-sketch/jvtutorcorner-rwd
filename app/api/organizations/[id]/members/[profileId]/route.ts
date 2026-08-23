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
import { requireOrgOrDeptAccess, requireOrgUnitAccess, resolveDeptScopeUnitIds } from '@/lib/auth/orgAccess';
import { getOrgUnitById } from '@/lib/orgUnitService';
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

    const guard = await requireOrgOrDeptAccess(req, orgId, 'write');
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

    // 部門管理員身分只能由系統/組織管理員授予或收回——部門管理員自己不能把這個身分轉給
    // 別人（沒有自我擴權/橫向授權的路徑），邏輯跟 isOrgAdmin 的保護一致，只是門檻放寬一級。
    if (
      (body.isDeptAdmin !== undefined || body.deptAdminUnitId !== undefined) &&
      !guard.actor.isSystemAdmin &&
      !guard.actor.isOrgAdmin
    ) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: only system or organization administrators may change department admin status' },
        { status: 403 }
      );
    }

    const isDeptAdminActor = guard.actor.isDeptAdmin && !guard.actor.isOrgAdmin && !guard.actor.isSystemAdmin;
    if (isDeptAdminActor) {
      // 部門管理員只能動範圍內的成員：目標成員目前所屬的單位、以及要改去的新單位都要在範圍內。
      const scope = await resolveDeptScopeUnitIds(guard.actor);
      if (!target.orgUnitId || !scope?.has(target.orgUnitId)) {
        return NextResponse.json({ ok: false, error: 'Forbidden: member is outside your department scope' }, { status: 403 });
      }
      if (body.orgUnitId !== undefined) {
        if (!body.orgUnitId || !scope.has(body.orgUnitId)) {
          return NextResponse.json(
            { ok: false, error: 'Forbidden: target org unit is outside your department scope' },
            { status: 403 }
          );
        }
      }
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
        isDeptAdmin: body.isDeptAdmin === true,
        deptAdminUnitId: body.deptAdminUnitId
      });

      await writeAuditLog({
        actorId: guard.actor.session.userId,
        action: body.isDeptAdmin ? 'member.grant_dept_admin' : 'member.revoke_dept_admin',
        targetType: 'organization',
        targetId: orgId,
        metadata: { profileId, deptAdminUnitId: body.isDeptAdmin ? body.deptAdminUnitId : null }
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

    const guard = await requireOrgOrDeptAccess(req, orgId, 'write');
    if (!guard.ok) return guard.response;

    const org = await organizationService.getOrganizationById(orgId);
    if (org?.adminUserId === profileId && !guard.actor.isSystemAdmin) {
      return NextResponse.json(
        { ok: false, error: '無法移除組織的主要管理員，請由系統管理員操作' },
        { status: 400 }
      );
    }

    if (guard.actor.isDeptAdmin && !guard.actor.isOrgAdmin && !guard.actor.isSystemAdmin) {
      const target = await getProfileById(profileId);
      const scope = await resolveDeptScopeUnitIds(guard.actor);
      if (!target || target.orgId !== orgId || !target.orgUnitId || !scope?.has(target.orgUnitId)) {
        return NextResponse.json({ ok: false, error: 'Forbidden: member is outside your department scope' }, { status: 403 });
      }
      // 部門管理員不能移除另一個部門管理員（避免同層互相清除彼此的部門管理權）。
      if ((target as any).isDeptAdmin) {
        return NextResponse.json(
          { ok: false, error: 'Forbidden: department admins cannot remove another department admin' },
          { status: 403 }
        );
      }
    }

    const result = await orgMembershipService.removeMemberFromOrg({ orgId, profileId });

    await writeAuditLog({
      actorId: guard.actor.session.userId,
      action: 'member.remove',
      targetType: 'organization',
      targetId: orgId,
      metadata: { profileId }
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
