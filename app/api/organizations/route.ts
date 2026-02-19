/**
 * Organizations API Route
 * 
 * Handles CRUD operations for corporate organizations.
 * 
 * Endpoints:
 * - GET /api/organizations - List all organizations (admin only)
 * - POST /api/organizations - Create new organization (admin only)
 * - GET /api/organizations/[id] - Get organization by ID
 * - PATCH /api/organizations/[id] - Update organization
 * - DELETE /api/organizations/[id] - Delete organization
 */

import { NextRequest, NextResponse } from 'next/server';
import organizationService from '@/lib/organizationService';
import type { CreateOrganizationInput } from '@/lib/types/b2b';

export const dynamic = 'force-dynamic';

// ==========================================
// GET - List all organizations
// ==========================================
export async function GET(req: NextRequest) {
  try {
    // TODO: Add authentication check
    // const session = await getServerSession();
    // if (!session || session.user.role !== 'admin') {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }
    
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
}

// ==========================================
// POST - Create new organization
// ==========================================
export async function POST(req: NextRequest) {
  try {
    // TODO: Add authentication check
    // const session = await getServerSession();
    // if (!session || session.user.role !== 'admin') {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }
    
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
    
    const input: CreateOrganizationInput = {
      name: name.trim(),
      domain: body.domain?.trim(),
      planTier,
      maxSeats: parseInt(maxSeats, 10),
      billingEmail: billingEmail.toLowerCase().trim(),
      adminUserId: body.adminUserId,
      industry: body.industry,
      country: body.country,
      taxId: body.taxId
    };
    
    const organization = await organizationService.createOrganization(input);
    
    return NextResponse.json({ 
      ok: true, 
      organization,
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
}
