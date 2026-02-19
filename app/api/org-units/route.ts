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

import { NextRequest, NextResponse } from 'next/server';
import orgUnitService from '@/lib/orgUnitService';
import type { CreateOrgUnitInput, OrgUnit } from '@/lib/types/b2b';

export const dynamic = 'force-dynamic';

// ==========================================
// GET - List org units (with filters)
// ==========================================
export async function GET(req: NextRequest) {
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
    
    // TODO: Check if user has permission to view this org
    // const session = await getServerSession();
    // if (!session) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }
    
    let units: OrgUnit[] = [];
    
    if (parentId) {
      // Get children of a specific unit
      units = await orgUnitService.getChildUnits(parentId);
    } else if (orgId) {
      // Get all units for an organization
      units = await orgUnitService.listOrgUnitsByOrg(orgId);
      
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
}

// ==========================================
// POST - Create new org unit
// ==========================================
export async function POST(req: NextRequest) {
  try {
    // TODO: Check if user is org admin
    // const session = await getServerSession();
    // if (!session) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }
    
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
}
