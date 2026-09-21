/**
 * Organizations API Route
 *
 * Handles CRUD operations for corporate organizations.
 *
 * Endpoints:
 * - GET /api/organizations - List organizations (system admin: all; org admin: only their own)
 * - POST /api/organizations - Create new organization (system admin only — billing action)
 * - GET /api/organizations/[id] - Get organization by ID
 * - PATCH /api/organizations/[id] - Update organization
 * - DELETE /api/organizations/[id] - Delete organization
 */

import { NextResponse } from 'next/server';
import organizationService from '@/lib/organizationService';
import type { CreateOrganizationInput } from '@/lib/types/b2b';
import { withAuth } from '@/lib/auth/apiGuard';
import { resolveOrgActor, requireSystemAdmin } from '@/lib/auth/orgAccess';
import { writeAuditLog } from '@/lib/auditLogService';
import { getProfileById } from '@/lib/profilesService';
import orgMembershipService from '@/lib/orgMembershipService';

export const dynamic = 'force-dynamic';

// ==========================================
// GET - List organizations
// ==========================================
export const GET = withAuth(async (req) => {
  try {
    const actor = await resolveOrgActor(req);

    if (!actor.isSystemAdmin) {
      // 非系統管理員：只能看到自己所屬的組織（若有）
      if (!actor.orgId) {
        return NextResponse.json({ ok: true, organizations: [], count: 0 });
      }
      const org = await organizationService.getOrganizationById(actor.orgId);
      const organizations = org ? [org] : [];
      return NextResponse.json({ ok: true, organizations, count: organizations.length });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as any;

    const organizations = await organizationService.listOrganizations(status);

    return NextResponse.json({
      ok: true,
      organizations,
      count: organizations.length
    });
  } catch (error: any) {
    console.error('[OrganizationsAPI] GET failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to list organizations' },
      { status: 500 }
    );
  }
});

// ==========================================
// POST - Create new organization (system admin only)
// ==========================================
export const POST = withAuth(async (req) => {
  try {
    const guard = await requireSystemAdmin(req);
    if (!guard.ok) return guard.response;

    const body = await req.json();

    // Validate required fields
    const { name, planTier, maxSeats, billingEmail } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Organization name is required' },
        { status: 400 }
      );
    }

    if (!planTier || !['starter', 'business', 'enterprise'].includes(planTier)) {
      return NextResponse.json(
        { ok: false, error: 'Valid plan tier is required (starter, business, enterprise)' },
        { status: 400 }
      );
    }

    if (!maxSeats || maxSeats < 1) {
      return NextResponse.json(
        { ok: false, error: 'maxSeats must be at least 1' },
        { status: 400 }
      );
    }

    if (!billingEmail || !billingEmail.includes('@')) {
      return NextResponse.json(
        { ok: false, error: 'Valid billing email is required' },
        { status: 400 }
      );
    }

    const domain = organizationService.normalizeOrgDomain(body.domain);
    if (domain) {
      const clash = await organizationService.findOrganizationByDomain(domain);
      if (clash) {
        return NextResponse.json(
          { ok: false, error: `Email domain "${domain}" is already used by organization "${clash.name}"` },
          { status: 409 }
        );
      }
    }

    // adminUserId used to be stored as a bare string with no effect on the profile
    // (no orgId, no isOrgAdmin), while members DELETE treated it as the protected
    // primary admin. It must now name an existing user who is not in another org;
    // they are seated as an org admin right after the organization is created.
    const adminUserId = body.adminUserId ? String(body.adminUserId) : undefined;
    if (adminUserId) {
      const adminProfile = (await getProfileById(adminUserId)) as { orgId?: string | null } | null;
      if (!adminProfile) {
        return NextResponse.json({ ok: false, error: 'adminUserId does not match an existing user' }, { status: 400 });
      }
      if (adminProfile.orgId) {
        return NextResponse.json({ ok: false, error: 'adminUserId already belongs to an organization' }, { status: 409 });
      }
    }

    const input: CreateOrganizationInput = {
      name: name.trim(),
      domain: domain || undefined,
      planTier,
      maxSeats: parseInt(maxSeats, 10),
      billingEmail: billingEmail.toLowerCase().trim(),
      adminUserId,
      industry: body.industry,
      country: body.country,
      taxId: body.taxId
    };

    const organization = await organizationService.createOrganization(input);

    await writeAuditLog({
      actorId: guard.actor.session.userId,
      action: 'organization.create',
      targetType: 'organization',
      targetId: organization.id,
      orgId: organization.id,
      metadata: { name: organization.name, planTier: organization.planTier },
    });

    let adminLink: { ok: boolean; licenseId?: string; error?: string } | undefined;
    if (adminUserId) {
      try {
        const seated = await orgMembershipService.assignMemberWithLicense({
          orgId: organization.id,
          profileId: adminUserId,
          isOrgAdmin: true,
          assignedBy: guard.actor.session.userId,
        });
        adminLink = { ok: true, licenseId: seated.license.id };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('[OrganizationsAPI] could not seat adminUserId as org admin:', message);
        adminLink = { ok: false, error: message || 'Failed to seat admin user' };
      }
    }

    return NextResponse.json({
      ok: true,
      organization,
      adminLink,
      message: `Organization "${organization.name}" created successfully`
    }, { status: 201 });
  } catch (error: any) {
    console.error('[OrganizationsAPI] POST failed:', error.message);

    // Check for duplicate billing email (if using unique index)
    if (error.message?.includes('ConditionalCheckFailed')) {
      return NextResponse.json(
        { ok: false, error: 'Organization with this billing email already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to create organization' },
      { status: 500 }
    );
  }
});
