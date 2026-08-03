/**
 * License by ID API Route
 *
 * Endpoints:
 * - GET /api/licenses/[id] - Get license by ID
 * - PATCH /api/licenses/[id] - Update non-status license fields (courseId/expiresAt/metadata)
 * - DELETE /api/licenses/[id] - Delete/revoke a license (must be unassigned first if active —
 *   use POST/DELETE /api/licenses/[id]/assign to unassign, which also frees the seat)
 */

import { NextResponse } from 'next/server';
import licenseService from '@/lib/licenseService';
import { withAuth } from '@/lib/auth/apiGuard';
import { requireOrgAccess } from '@/lib/auth/orgAccess';

export const dynamic = 'force-dynamic';

// ==========================================
// GET - Get license by ID
// ==========================================
export const GET = withAuth(async (req, context) => {
  try {
    const { id } = await (context as { params: Promise<{ id: string }> }).params;

    const license = await licenseService.getLicenseById(id);
    if (!license) {
      return NextResponse.json({ ok: false, error: 'License not found' }, { status: 404 });
    }

    const guard = await requireOrgAccess(req, license.orgId, 'read');
    if (!guard.ok) return guard.response;

    return NextResponse.json({ ok: true, license });
  } catch (error: any) {
    console.error('[LicensesAPI] GET by ID failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to get license' },
      { status: 500 }
    );
  }
});

// ==========================================
// PATCH - Update non-status license fields
// ==========================================
export const PATCH = withAuth(async (req, context) => {
  try {
    const { id } = await (context as { params: Promise<{ id: string }> }).params;

    const license = await licenseService.getLicenseById(id);
    if (!license) {
      return NextResponse.json({ ok: false, error: 'License not found' }, { status: 404 });
    }

    const guard = await requireOrgAccess(req, license.orgId, 'write');
    if (!guard.ok) return guard.response;

    const body = await req.json();

    // 狀態轉換必須走 /api/licenses/[id]/assign（交易化），保持席次計數一致
    if (body.status !== undefined || body.userId !== undefined) {
      return NextResponse.json(
        { ok: false, error: 'status/userId cannot be changed via PATCH — use /api/licenses/[id]/assign' },
        { status: 400 }
      );
    }

    const updates: any = {};
    if (body.courseId !== undefined) updates.courseId = body.courseId;
    if (body.expiresAt !== undefined) updates.expiresAt = body.expiresAt;
    if (body.metadata !== undefined) updates.metadata = body.metadata;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await licenseService.updateLicense(id, updates);
    return NextResponse.json({ ok: true, license: updated, message: 'License updated successfully' });
  } catch (error: any) {
    console.error('[LicensesAPI] PATCH failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to update license' },
      { status: 500 }
    );
  }
});

// ==========================================
// DELETE - Delete/revoke a license
// ==========================================
export const DELETE = withAuth(async (req, context) => {
  try {
    const { id } = await (context as { params: Promise<{ id: string }> }).params;

    const license = await licenseService.getLicenseById(id);
    if (!license) {
      return NextResponse.json({ ok: false, error: 'License not found' }, { status: 404 });
    }

    const guard = await requireOrgAccess(req, license.orgId, 'write');
    if (!guard.ok) return guard.response;

    if (license.status === 'active') {
      return NextResponse.json(
        {
          ok: false,
          error: '此授權目前已指派給使用者，請先呼叫 DELETE /api/licenses/[id]/assign 取消指派（會一併釋放席次）'
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const hardDelete = searchParams.get('hard') === 'true';

    await licenseService.deleteLicense(id, hardDelete);

    return NextResponse.json({
      ok: true,
      message: hardDelete ? 'License permanently deleted' : 'License revoked'
    });
  } catch (error: any) {
    console.error('[LicensesAPI] DELETE failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to delete license' },
      { status: 500 }
    );
  }
});
