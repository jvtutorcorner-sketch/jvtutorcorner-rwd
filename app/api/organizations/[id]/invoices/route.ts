/**
 * Organization Invoices API Route
 *
 * Manual billing (see lib/orgBillingService.ts for why there's no payment gateway here).
 *
 * Endpoints:
 * - GET /api/organizations/[id]/invoices - List invoices for this org (read: org/system admin)
 * - POST /api/organizations/[id]/invoices - Create a new invoice (system admin only — this
 *   is financial record-keeping, kept out of org-admin/dept-admin self-service on purpose)
 */

import { NextResponse } from 'next/server';
import orgBillingService from '@/lib/orgBillingService';
import { withAuth } from '@/lib/auth/apiGuard';
import { requireOrgAccess } from '@/lib/auth/orgAccess';
import { writeAuditLog } from '@/lib/auditLogService';

export const dynamic = 'force-dynamic';

// ==========================================
// GET - List invoices for this organization
// ==========================================
export const GET = withAuth(async (req, context) => {
  try {
    const { id: orgId } = await (context as { params: Promise<{ id: string }> }).params;

    const guard = await requireOrgAccess(req, orgId, 'read');
    if (!guard.ok) return guard.response;

    const invoices = await orgBillingService.listInvoicesByOrg(orgId);
    return NextResponse.json({ ok: true, invoices, count: invoices.length });
  } catch (error: any) {
    console.error('[OrgInvoicesAPI] GET failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to list invoices' },
      { status: 500 }
    );
  }
});

// ==========================================
// POST - Create a new invoice (system admin only)
// ==========================================
export const POST = withAuth(async (req, context) => {
  try {
    const { id: orgId } = await (context as { params: Promise<{ id: string }> }).params;

    const guard = await requireOrgAccess(req, orgId, 'system');
    if (!guard.ok) return guard.response;

    const body = await req.json();
    const { periodStart, periodEnd, seats, amount, currency, dueDate, notes } = body;

    if (!periodStart || !periodEnd || !dueDate) {
      return NextResponse.json(
        { ok: false, error: 'periodStart, periodEnd and dueDate are required' },
        { status: 400 }
      );
    }
    if (amount === undefined || amount === null || !currency) {
      return NextResponse.json({ ok: false, error: 'amount and currency are required' }, { status: 400 });
    }

    const invoice = await orgBillingService.createInvoice({
      orgId,
      periodStart,
      periodEnd,
      seats,
      amount: Number(amount),
      currency,
      dueDate,
      notes,
      createdBy: guard.actor.session.userId
    });

    await writeAuditLog({
      actorId: guard.actor.session.userId,
      action: 'invoice.create',
      targetType: 'orgInvoice',
      targetId: invoice.id,
      metadata: { orgId, amount: invoice.amount, currency: invoice.currency, dueDate: invoice.dueDate }
    });

    return NextResponse.json({ ok: true, invoice, message: '發票已建立' }, { status: 201 });
  } catch (error: any) {
    console.error('[OrgInvoicesAPI] POST failed:', error.message);
    const status = error.message?.includes('not found') ? 404 : error.message?.includes('must be') ? 400 : 500;
    return NextResponse.json({ ok: false, error: error.message || 'Failed to create invoice' }, { status });
  }
});
