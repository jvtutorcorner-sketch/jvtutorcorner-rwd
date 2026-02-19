/**
 * Org Unit by ID API Route
 * 
 * Handles operations on a specific organizational unit.
 * 
 * Endpoints:
 * - GET /api/org-units/[id] - Get org unit by ID
 * - PATCH /api/org-units/[id] - Update org unit
 * - DELETE /api/org-units/[id] - Delete org unit
 * - POST /api/org-units/[id]/move - Move unit to new parent
 */

import { NextRequest, NextResponse } from 'next/server';
import orgUnitService from '@/lib/orgUnitService';
import type { UpdateOrgUnitInput } from '@/lib/types/b2b';

export const dynamic = 'force-dynamic';

// ==========================================
// GET - Get org unit by ID
// ==========================================
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Org unit ID is required' },
        { status: 400 }
      );
    }
    
    const { searchParams } = new URL(req.url);
    const includeChildren = searchParams.get('children') === 'true';
    const includeDescendants = searchParams.get('descendants') === 'true';
    
    const orgUnit = await orgUnitService.getOrgUnitById(id);
    
    if (!orgUnit) {
      return NextResponse.json(
        { ok: false, error: 'Org unit not found' },
        { status: 404 }
      );
    }
    
    const response: any = { ok: true, orgUnit };
    
    // Include children if requested
    if (includeChildren) {
      response.children = await orgUnitService.getChildUnits(id);
    }
    
    // Include all descendants if requested
    if (includeDescendants) {
      response.descendants = await orgUnitService.getDescendantUnits(id);
    }
    
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[OrgUnitsAPI] GET by ID failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to get org unit' },
      { status: 500 }
    );
  }
}

// ==========================================
// PATCH - Update org unit
// ==========================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Org unit ID is required' },
        { status: 400 }
      );
    }
    
    // TODO: Check if user is org admin or unit manager
    // const session = await getServerSession();
    // if (!session) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }
    
    const body = await req.json();
    
    // Extract allowed updatable fields
    const updates: UpdateOrgUnitInput = {};
    
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.managerId !== undefined) updates.managerId = body.managerId;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) {
      if (!['active', 'archived'].includes(body.status)) {
        return NextResponse.json(
          { ok: false, error: 'Status must be "active" or "archived"' },
          { status: 400 }
        );
      }
      updates.status = body.status;
    }
    
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }
    
    const orgUnit = await orgUnitService.updateOrgUnit(id, updates);
    
    return NextResponse.json({ 
      ok: true, 
      orgUnit,
      message: 'Org unit updated successfully' 
    });
  } catch (error: any) {
    console.error('[OrgUnitsAPI] PATCH failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to update org unit' },
      { status: 500 }
    );
  }
}

// ==========================================
// DELETE - Delete org unit
// ==========================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Org unit ID is required' },
        { status: 400 }
      );
    }
    
    // TODO: Check if user is org admin
    // const session = await getServerSession();
    // if (!session || !session.user.isOrgAdmin) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }
    
    const { searchParams } = new URL(req.url);
    const hardDelete = searchParams.get('hard') === 'true';
    
    // Verify org unit exists
    const orgUnit = await orgUnitService.getOrgUnitById(id);
    if (!orgUnit) {
      return NextResponse.json(
        { ok: false, error: 'Org unit not found' },
        { status: 404 }
      );
    }
    
    await orgUnitService.deleteOrgUnit(id, hardDelete);
    
    return NextResponse.json({ 
      ok: true, 
      message: hardDelete 
        ? 'Org unit permanently deleted' 
        : 'Org unit archived'
    });
  } catch (error: any) {
    console.error('[OrgUnitsAPI] DELETE failed:', error.message);
    
    if (error.message.includes('children')) {
      return NextResponse.json(
        { ok: false, error: 'Cannot delete unit with children. Remove children first or use soft delete.' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to delete org unit' },
      { status: 500 }
    );
  }
}
