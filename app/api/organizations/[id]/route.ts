/**
 * Organization by ID API Route
 *
 * Handles operations on a specific organization.
 *
 * Endpoints:
 * - GET /api/organizations/[id] - Get organization by ID
 * - PATCH /api/organizations/[id] - Update organization
 * - DELETE /api/organizations/[id] - Delete organization
 */

import { NextResponse } from 'next/server';
import organizationService from '@/lib/organizationService';
import { withAuth } from '@/lib/auth/apiGuard';
import { requireOrgAccess, requireSystemAdmin } from '@/lib/auth/orgAccess';
import { writeAuditLog } from '@/lib/auditLogService';

export const dynamic = 'force-dynamic';

// 系統管理員專屬欄位 — 計費/合約相關，組織管理員不可透過 PATCH 改動
const SYSTEM_ADMIN_ONLY_FIELDS = [
  'planTier',
  'maxSeats',
  'status',
  'billingEmail',
  'contractStartDate',
  'contractEndDate',
  'billingCycle',
  'taxId'
];

// ==========================================
// GET - Get organization by ID
// ==========================================
export const GET = withAuth(async (req, context) => {
  try {
    const { id } = await (context as { params: Promise<{ id: string }> }).params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    const guard = await requireOrgAccess(req, id, 'read');
    if (!guard.ok) return guard.response;

    const organization = await organizationService.getOrganizationById(id);

    if (!organization) {
      return NextResponse.json(
        { ok: false, error: 'Organization not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      organization
    });
  } catch (error: any) {
    console.error('[OrganizationsAPI] GET by ID failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to get organization' },
      { status: 500 }
    );
  }
});

// ==========================================
// PATCH - Update organization
// ==========================================
export const PATCH = withAuth(async (req, context) => {
  try {
    const { id } = await (context as { params: Promise<{ id: string }> }).params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    const guard = await requireOrgAccess(req, id, 'write');
    if (!guard.ok) return guard.response;

    const body = await req.json();

    if (!guard.actor.isSystemAdmin) {
      const disallowed = SYSTEM_ADMIN_ONLY_FIELDS.filter((field) => body[field] !== undefined);
      if (disallowed.length > 0) {
        return NextResponse.json(
          { ok: false, error: `Only system administrators may change: ${disallowed.join(', ')}` },
          { status: 403 }
        );
      }
    }

    // usedSeats 永遠不能被直接 PATCH — 只能透過 orgMembershipService 的席次交易間接變動
    if (body.usedSeats !== undefined) {
      return NextResponse.json(
        { ok: false, error: 'usedSeats cannot be set directly' },
        { status: 400 }
      );
    }

    // Extract allowed updatable fields
    const updates: any = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.status !== undefined) {
      if (!['active', 'suspended', 'trial', 'cancelled'].includes(body.status)) {
        return NextResponse.json(
          { ok: false, error: 'Invalid status value' },
          { status: 400 }
        );
      }
      updates.status = body.status;
    }
    if (body.maxSeats !== undefined) {
      const maxSeats = parseInt(body.maxSeats, 10);
      if (maxSeats < 1) {
        return NextResponse.json(
          { ok: false, error: 'maxSeats must be at least 1' },
          { status: 400 }
        );
      }
      updates.maxSeats = maxSeats;
    }
    if (body.planTier !== undefined) {
      if (!['starter', 'business', 'enterprise'].includes(body.planTier)) {
        return NextResponse.json(
          { ok: false, error: 'Invalid plan tier' },
          { status: 400 }
        );
      }
      updates.planTier = body.planTier;
    }
    if (body.billingEmail !== undefined) updates.billingEmail = body.billingEmail;
    if (body.domain !== undefined) updates.domain = body.domain;
    if (body.industry !== undefined) updates.industry = body.industry;
    if (body.country !== undefined) updates.country = body.country;
    if (body.taxId !== undefined) updates.taxId = body.taxId;
    if (body.adminUserId !== undefined) updates.adminUserId = body.adminUserId;
    if (body.contractStartDate !== undefined) updates.contractStartDate = body.contractStartDate;
    if (body.contractEndDate !== undefined) updates.contractEndDate = body.contractEndDate;
    if (body.billingCycle !== undefined) updates.billingCycle = body.billingCycle;
    if (body.metadata !== undefined) updates.metadata = body.metadata;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const organization = await organizationService.updateOrganization(id, updates);

    return NextResponse.json({
      ok: true,
      organization,
      message: 'Organization updated successfully'
    });
  } catch (error: any) {
    console.error('[OrganizationsAPI] PATCH failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to update organization' },
      { status: 500 }
    );
  }
});

// ==========================================
// DELETE - Delete organization (system admin only)
// ==========================================
export const DELETE = withAuth(async (req, context) => {
  try {
    const { id } = await (context as { params: Promise<{ id: string }> }).params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    const guard = await requireSystemAdmin(req);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(req.url);
    const hardDelete = searchParams.get('hard') === 'true';

    // Verify organization exists
    const org = await organizationService.getOrganizationById(id);
    if (!org) {
      return NextResponse.json(
        { ok: false, error: 'Organization not found' },
        { status: 404 }
      );
    }

    await organizationService.deleteOrganization(id, hardDelete);

    await writeAuditLog({
      actorId: guard.actor.session.userId,
      action: hardDelete ? 'organization.delete.hard' : 'organization.delete.soft',
      targetType: 'organization',
      targetId: id,
      metadata: { name: org.name },
    });

    return NextResponse.json({
      ok: true,
      message: hardDelete
        ? 'Organization permanently deleted'
        : 'Organization marked as cancelled'
    });
  } catch (error: any) {
    console.error('[OrganizationsAPI] DELETE failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to delete organization' },
      { status: 500 }
    );
  }
});
