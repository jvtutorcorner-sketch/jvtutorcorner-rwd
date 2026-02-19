/**
 * Move Org Unit API Route
 * 
 * Handles moving an organizational unit to a new parent.
 * This is a complex operation that updates the unit and all its descendants.
 * 
 * POST /api/org-units/[id]/move
 */

import { NextRequest, NextResponse } from 'next/server';
import orgUnitService from '@/lib/orgUnitService';

export const dynamic = 'force-dynamic';

// ==========================================
// POST - Move org unit to new parent
// ==========================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    const body = await req.json();
    const { newParentId } = body;

    // newParentId can be null (move to root), string (move to new parent), or undefined (error)
    if (newParentId === undefined) {
      return NextResponse.json(
        { ok: false, error: 'newParentId is required (use null for root)' },
        { status: 400 }
      );
    }

    console.log(`[OrgUnitsAPI] Moving unit ${id} to parent ${newParentId || 'ROOT'}`);

    const orgUnit = await orgUnitService.moveOrgUnit(id, newParentId);

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
}
