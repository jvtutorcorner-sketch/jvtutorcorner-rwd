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

import { NextRequest, NextResponse } from 'next/server';
import organizationService from '@/lib/organizationService';

export const dynamic = 'force-dynamic';

// ==========================================
// GET - Get organization by ID
// ==========================================
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Organization ID is required' },
        { status: 400 }
      );
    }
    
    const organization = await organizationService.getOrganizationById(id);
    
    if (!organization) {
      return NextResponse.json(
        { ok: false, error: 'Organization not found' },
        { status: 404 }
      );
    }
    
    // TODO: Check if user has permission to view this organization
    // const session = await getServerSession();
    // if (!session) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }
    // const isAdmin = session.user.role === 'admin';
    // const isMember = session.user.orgId === id;
    // if (!isAdmin && !isMember) {
    //   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    // }
    
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
}

// ==========================================
// PATCH - Update organization
// ==========================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Organization ID is required' },
        { status: 400 }
      );
    }
    
    // TODO: Check if user is org admin or system admin
    // const session = await getServerSession();
    // if (!session) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }
    // const isSystemAdmin = session.user.role === 'admin';
    // const isOrgAdmin = session.user.orgId === id && session.user.isOrgAdmin;
    // if (!isSystemAdmin && !isOrgAdmin) {
    //   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    // }
    
    const body = await req.json();
    
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
}

// ==========================================
// DELETE - Delete organization
// ==========================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Organization ID is required' },
        { status: 400 }
      );
    }
    
    // TODO: Check if user is system admin
    // const session = await getServerSession();
    // if (!session || session.user.role !== 'admin') {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }
    
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
}
