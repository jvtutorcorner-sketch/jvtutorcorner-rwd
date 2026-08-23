/**
 * Organization Billing Status API Route
 *
 * GET /api/organizations/[id]/billing-status - Read-only summary: contract status
 * (active/expiring_soon/expired/no_contract) and overdue invoices. Purely informational —
 * nothing reads this to gate access; an overdue org is never auto-suspended (see
 * lib/orgBillingService.ts header).
 */

import { NextResponse } from 'next/server';
import orgBillingService from '@/lib/orgBillingService';
import { withAuth } from '@/lib/auth/apiGuard';
import { requireOrgAccess } from '@/lib/auth/orgAccess';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (req, context) => {
  try {
    const { id: orgId } = await (context as { params: Promise<{ id: string }> }).params;

    const guard = await requireOrgAccess(req, orgId, 'read');
    if (!guard.ok) return guard.response;

    const status = await orgBillingService.getOrgBillingStatus(orgId);
    return NextResponse.json({ ok: true, ...status });
  } catch (error: any) {
    console.error('[OrgBillingStatusAPI] GET failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to get billing status' },
      { status: 500 }
    );
  }
});
