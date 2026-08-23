/**
 * Organization Invoice by ID API Route
 *
 * Endpoints:
 * - PATCH /api/organizations/[id]/invoices/[invoiceId] - Mark paid or void (system admin only)
 */

import { NextResponse } from 'next/server';
import orgBillingService from '@/lib/orgBillingService';
import { withAuth } from '@/lib/auth/apiGuard';
import { requireOrgAccess } from '@/lib/auth/orgAccess';
import { writeAuditLog } from '@/lib/auditLogService';

export const dynamic = 'force-dynamic';

export const PATCH = withAuth(async (req, context) => {
  try {
    const { id: orgId, invoiceId } = await (
      context as { params: Promise<{ id: string; invoiceId: string }> }
    ).params;

    const guard = await requireOrgAccess(req, orgId, 'system');
    if (!guard.ok) return guard.response;

    const existing = await orgBillingService.getInvoiceById(invoiceId);
    if (!existing || existing.orgId !== orgId) {
      return NextResponse.json({ ok: false, error: 'Invoice not found in this organization' }, { status: 404 });
    }

    const body = await req.json();
    if (body.status !== 'paid' && body.status !== 'void') {
      return NextResponse.json(
        { ok: false, error: 'status must be "paid" or "void"' },
        { status: 400 }
      );
    }

    const invoice =
      body.status === 'paid'
        ? await orgBillingService.markInvoicePaid({ id: invoiceId, paidAt: body.paidAt, notes: body.notes })
        : await orgBillingService.voidInvoice(invoiceId);

    await writeAuditLog({
      actorId: guard.actor.session.userId,
      action: body.status === 'paid' ? 'invoice.mark_paid' : 'invoice.void',
      targetType: 'orgInvoice',
      targetId: invoiceId,
      metadata: { orgId, amount: invoice.amount, currency: invoice.currency }
    });

    return NextResponse.json({ ok: true, invoice, message: body.status === 'paid' ? '發票已標記為已付款' : '發票已作廢' });
  } catch (error: any) {
    console.error('[OrgInvoiceAPI] PATCH failed:', error.message);
    const status = error.message?.includes('not found') ? 404 : error.message?.includes('Cannot') ? 400 : 500;
    return NextResponse.json({ ok: false, error: error.message || 'Failed to update invoice' }, { status });
  }
});
