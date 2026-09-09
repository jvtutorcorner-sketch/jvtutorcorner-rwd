/**
 * Licenses API Route
 *
 * Endpoints:
 * - GET /api/licenses?orgId=<id>[&status=] - List licenses for an organization
 * - GET /api/licenses?userId=<id> - List licenses assigned to a user (self or system admin)
 * - POST /api/licenses - Provision one or more unassigned (pending) licenses for an org
 *
 * Assigning/unassigning a license (which affects Organization.usedSeats) is handled by
 * /api/licenses/[id]/assign — this file only covers plain license-record CRUD.
 */

import { NextResponse } from 'next/server';
import licenseService from '@/lib/licenseService';
import organizationService from '@/lib/organizationService';
import type { License } from '@/lib/types/b2b';
import { withAuth } from '@/lib/auth/apiGuard';
import { requireOrgAccess, resolveOrgActor } from '@/lib/auth/orgAccess';

export const dynamic = 'force-dynamic';

const MAX_BULK_PROVISION = 100;

// ==========================================
// GET - List licenses
// ==========================================
export const GET = withAuth(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('orgId');
    const userId = searchParams.get('userId');
    const status = searchParams.get('status') as License['status'] | null;

    if (orgId) {
      const guard = await requireOrgAccess(req, orgId, 'read');
      if (!guard.ok) return guard.response;

      const licenses = await licenseService.listLicensesByOrg(orgId, status || undefined);
      return NextResponse.json({ ok: true, licenses, count: licenses.length });
    }

    if (userId) {
      const actor = await resolveOrgActor(req);
      if (!actor.isSystemAdmin && actor.session.userId !== userId) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }

      const licenses = await licenseService.listLicensesByUser(userId);
      return NextResponse.json({ ok: true, licenses, count: licenses.length });
    }

    return NextResponse.json(
      { ok: false, error: 'orgId or userId parameter is required' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[LicensesAPI] GET failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to list licenses' },
      { status: 500 }
    );
  }
});

// ==========================================
// POST - Provision unassigned licenses
// ==========================================
export const POST = withAuth(async (req) => {
  try {
    const body = await req.json();
    const { orgId } = body;

    if (!orgId) {
      return NextResponse.json(
        { ok: false, error: 'orgId is required' },
        { status: 400 }
      );
    }

    const guard = await requireOrgAccess(req, orgId, 'write');
    if (!guard.ok) return guard.response;

    const org = await organizationService.getOrganizationById(orgId);
    if (!org) {
      return NextResponse.json(
        { ok: false, error: 'Organization not found' },
        { status: 404 }
      );
    }

    const count = body.count !== undefined ? parseInt(body.count, 10) : 1;
    if (!Number.isFinite(count) || count < 1 || count > MAX_BULK_PROVISION) {
      return NextResponse.json(
        { ok: false, error: `count must be between 1 and ${MAX_BULK_PROVISION}` },
        { status: 400 }
      );
    }

    // 未指派的授權不佔席次，但防止備妥超過組織上限的庫存（永遠無法被指派完）。
    // 只算「目前還活著」的容量（org.usedSeats 反映的 active + 尚未指派的 pending）——
    // 不能用 listLicensesByOrg(orgId) 撈全部歷史記錄，那樣 revoked/expired 的舊授權
    // （例如成員離職後 DELETE /api/licenses/[id]/assign 留下的 revoked 記錄）會永久佔掉
    // 核發上限，讓組織在人員流動後即使還有空席次也核發不出新授權。
    const pending = await licenseService.listLicensesByOrg(orgId, 'pending');
    const liveCount = org.usedSeats + pending.length;
    if (liveCount + count > org.maxSeats) {
      return NextResponse.json(
        {
          ok: false,
          error: `無法核發：目前已使用 ${liveCount} 個席次（含未指派庫存），加上 ${count} 筆將超過組織席次上限 ${org.maxSeats}`
        },
        { status: 409 }
      );
    }

    const created = [];
    for (let i = 0; i < count; i++) {
      created.push(
        await licenseService.createLicense({
          orgId,
          courseId: body.courseId,
          expiresAt: body.expiresAt,
          metadata: body.metadata
        })
      );
    }

    return NextResponse.json(
      { ok: true, licenses: created, count: created.length, message: `已核發 ${created.length} 筆授權` },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[LicensesAPI] POST failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to provision licenses' },
      { status: 500 }
    );
  }
});
