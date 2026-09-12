/**
 * Move Org Unit API Route
 * 
 * Handles moving an organizational unit to a new parent.
 * This is a complex operation that updates the unit and all its descendants.
 * 
 * POST /api/org-units/[id]/move
 */

import { NextResponse } from 'next/server';
import orgUnitService from '@/lib/orgUnitService';
import { withAuth } from '@/lib/auth/apiGuard';
import { writeAuditLog } from '@/lib/auditLogService';
import { requireOrgUnitAccess } from '@/lib/auth/orgAccess';

export const dynamic = 'force-dynamic';

// ==========================================
// POST - Move org unit to new parent
// ==========================================
export const POST = withAuth(async (req, context) => {
  try {
    const { id } = await (context as { params: Promise<{ id: string }> }).params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Org unit ID is required' },
        { status: 400 }
      );
    }

    const unit = await orgUnitService.getOrgUnitById(id);
    if (!unit) {
      return NextResponse.json(
        { ok: false, error: 'Org unit not found' },
        { status: 404 }
      );
    }

    const guard = await requireOrgUnitAccess(req, unit, 'write');
    if (!guard.ok) return guard.response;

    const body = await req.json();
    const { newParentId } = body;

    // newParentId can be null (move to root), string (move to new parent), or undefined (error)
    if (newParentId === undefined) {
      return NextResponse.json(
        { ok: false, error: 'newParentId is required (use null for root)' },
        { status: 400 }
      );
    }

    // dept_admin 對自己子樹有 write 權限，但不能把子樹搬到自己管轄範圍外（含搬去根層），
    // 否則等於繞過範圍限制把部門「過繼」給別人或脫離監管。只有整組織權限的人可以這樣搬。
    if (!guard.actor.isSystemAdmin && !guard.actor.isOrgAdmin) {
      if (!newParentId) {
        return NextResponse.json(
          { ok: false, error: 'Forbidden: dept_admin cannot move a unit to root' },
          { status: 403 }
        );
      }
      const newParent = await orgUnitService.getOrgUnitById(newParentId);
      if (!newParent) {
        return NextResponse.json({ ok: false, error: 'New parent unit not found' }, { status: 404 });
      }
      const targetGuard = await requireOrgUnitAccess(req, newParent, 'write');
      if (!targetGuard.ok) return targetGuard.response;
    }

    console.log(`[OrgUnitsAPI] Moving unit ${id} to parent ${newParentId || 'ROOT'}`);

    const orgUnit = await orgUnitService.moveOrgUnit(id, newParentId);

    await writeAuditLog({
      actorId: guard.actor.session.userId,
      action: 'orgunit.move',
      targetType: 'orgUnit',
      targetId: id,
      metadata: { orgId: unit.orgId, fromParentId: unit.parentId ?? null, toParentId: newParentId }
    });

    return NextResponse.json({
      ok: true,
      orgUnit,
      message: `Org unit moved successfully to ${orgUnit.path}`
    });
  } catch (error: any) {
    console.error('[OrgUnitsAPI] Move failed:', error.message);

    // Handle specific error cases
    if (error.message.includes('not found')) {
      return NextResponse.json(
        { ok: false, error: 'Unit or parent not found' },
        { status: 404 }
      );
    }

    if (error.message.includes('Cannot move unit to itself')) {
      return NextResponse.json(
        { ok: false, error: 'Cannot move unit to itself' },
        { status: 400 }
      );
    }

    if (error.message.includes('already under parent')) {
      return NextResponse.json(
        { ok: false, error: 'Unit is already under the specified parent' },
        { status: 400 }
      );
    }

    if (error.message.includes('descendant')) {
      return NextResponse.json(
        { ok: false, error: 'Cannot move unit to its own descendant (circular reference)' },
        { status: 400 }
      );
    }

    if (error.message.includes('different organization')) {
      return NextResponse.json(
        { ok: false, error: 'Cannot move unit to a different organization' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to move org unit' },
      { status: 500 }
    );
  }
});
