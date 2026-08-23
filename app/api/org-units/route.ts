/**
 * Organizational Units API Route
 *
 * Handles CRUD operations for organizational hierarchy units.
 *
 * Endpoints:
 * - GET /api/org-units?orgId=<id> - List org units for an organization
 * - GET /api/org-units?parentId=<id> - Get children of a unit
 * - POST /api/org-units - Create new org unit
 */

import { NextResponse } from 'next/server';
import orgUnitService from '@/lib/orgUnitService';
import type { CreateOrgUnitInput, OrgUnit } from '@/lib/types/b2b';
import { withAuth } from '@/lib/auth/apiGuard';
import { requireOrgOrDeptAccess, requireOrgUnitAccess, resolveDeptScopeUnitIds } from '@/lib/auth/orgAccess';

export const dynamic = 'force-dynamic';

// ==========================================
// GET - List org units (with filters)
// ==========================================
export const GET = withAuth(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('orgId');
    const parentId = searchParams.get('parentId');
    const tree = searchParams.get('tree') === 'true';

    if (!orgId && !parentId) {
      return NextResponse.json(
        { ok: false, error: 'Either orgId or parentId parameter is required' },
        { status: 400 }
      );
    }

    let units: OrgUnit[] = [];

    if (parentId) {
      // parentId 本身沒帶 orgId，先查出該 unit 屬於哪個組織再判斷權限，
      // 避免任何登入使用者都能用猜測的 parentId 撈到別的組織的子樹。
      const parent = await orgUnitService.getOrgUnitById(parentId);
      if (!parent) {
        return NextResponse.json(
          { ok: false, error: 'Parent unit not found' },
          { status: 404 }
        );
      }
      const guard = await requireOrgUnitAccess(req, parent, 'read');
      if (!guard.ok) return guard.response;

      units = await orgUnitService.getChildUnits(parentId);
    } else if (orgId) {
      const guard = await requireOrgOrDeptAccess(req, orgId, 'read');
      if (!guard.ok) return guard.response;

      units = await orgUnitService.listOrgUnitsByOrg(orgId);

      // 部門管理員透過 requireOrgOrDeptAccess 進來的，不代表整個組織的單位都能看——
      // 用範圍集合過濾成只剩自己與子孫單位。系統/組織管理員的 scope 是 null，不過濾。
      const scope = await resolveDeptScopeUnitIds(guard.actor);
      if (scope) {
        units = units.filter((u) => scope.has(u.id));
      }

      // If tree format requested, build hierarchical structure
      if (tree) {
        const treeData = orgUnitService.buildOrgTree(units);
        return NextResponse.json({
          ok: true,
          tree: treeData,
          count: units.length
        });
      }
    }

    return NextResponse.json({
      ok: true,
      orgUnits: units,
      count: units.length
    });
  } catch (error: any) {
    console.error('[OrgUnitsAPI] GET failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to list org units' },
      { status: 500 }
    );
  }
});

// ==========================================
// POST - Create new org unit
// ==========================================
export const POST = withAuth(async (req) => {
  try {
    const body = await req.json();

    // Validate required fields
    const { orgId, name, parentId } = body;

    if (!orgId || orgId.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Unit name is required' },
        { status: 400 }
      );
    }

    const guard = await requireOrgOrDeptAccess(req, orgId.trim(), 'write');
    if (!guard.ok) return guard.response;

    // 部門管理員不能建立組織根層級的單位——一定要指定範圍內的 parentId，否則就是在做組織
    // 層級的重組（那是組織/系統管理員的權限）。
    if (guard.actor.isDeptAdmin && !guard.actor.isOrgAdmin && !guard.actor.isSystemAdmin) {
      if (!parentId) {
        return NextResponse.json(
          { ok: false, error: 'Forbidden: department admins must create units under their own scope (parentId is required)' },
          { status: 403 }
        );
      }
      const parent = await orgUnitService.getOrgUnitById(parentId);
      if (!parent) {
        return NextResponse.json({ ok: false, error: 'Parent unit does not exist' }, { status: 404 });
      }
      const parentGuard = await requireOrgUnitAccess(req, parent, 'write');
      if (!parentGuard.ok) return parentGuard.response;
    }

    const input: CreateOrgUnitInput = {
      orgId: orgId.trim(),
      name: name.trim(),
      parentId: parentId || null,
      managerId: body.managerId,
      description: body.description
    };

    const orgUnit = await orgUnitService.createOrgUnit(input);

    return NextResponse.json({
      ok: true,
      orgUnit,
      message: `Org unit "${orgUnit.name}" created successfully at ${orgUnit.path}`
    }, { status: 201 });
  } catch (error: any) {
    console.error('[OrgUnitsAPI] POST failed:', error.message);

    if (error.message.includes('Parent unit not found')) {
      return NextResponse.json(
        { ok: false, error: 'Parent unit does not exist' },
        { status: 404 }
      );
    }

    if (error.message.includes('same organization')) {
      return NextResponse.json(
        { ok: false, error: 'Parent unit must belong to the same organization' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to create org unit' },
      { status: 500 }
    );
  }
});
