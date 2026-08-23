/**
 * Organization Contract Renewal API Route
 *
 * POST /api/organizations/[id]/renew - Extend the contract end date, optionally issuing
 * the next period's invoice in the same call. System admin only (billing action).
 */

import { NextResponse } from 'next/server';
import orgBillingService from '@/lib/orgBillingService';
import { withAuth } from '@/lib/auth/apiGuard';
import { requireOrgAccess } from '@/lib/auth/orgAccess';
import { writeAuditLog } from '@/lib/auditLogService';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (req, context) => {
  try {
    const { id: orgId } = await (context as { params: Promise<{ id: string }> }).params;

    const guard = await requireOrgAccess(req, orgId, 'system');
    if (!guard.ok) return guard.response;

    const body = await req.json();
    const { newContractEndDate, invoice } = body;

    if (!newContractEndDate) {
      return NextResponse.json({ ok: false, error: 'newContractEndDate is required' }, { status: 400 });
    }
    if (invoice && (invoice.amount === undefined || invoice.amount === null || !invoice.currency || !invoice.dueDate)) {
      return NextResponse.json(
        { ok: false, error: 'invoice.amount, invoice.currency and invoice.dueDate are required when issuing a renewal invoice' },
        { status: 400 }
      );
    }

    const result = await orgBillingService.renewOrganizationContract({
      orgId,
      newContractEndDate,
      invoice: invoice
        ? { amount: Number(invoice.amount), currency: invoice.currency, dueDate: invoice.dueDate, notes: invoice.notes }
        : undefined,
      actorId: guard.actor.session.userId
    });

    await writeAuditLog({
      actorId: guard.actor.session.userId,
      action: 'organization.renew',
      targetType: 'organization',
      targetId: orgId,
      metadata: { newContractEndDate: result.contractEndDate, invoiceId: result.invoice?.id ?? null }
    });

    return NextResponse.json({ ok: true, ...result, message: '合約已續約' });
  } catch (error: any) {
    console.error('[OrgRenewAPI] POST failed:', error.message);
    const status = error.message?.includes('not found') ? 404 : error.message?.includes('must be') ? 400 : 500;
    return NextResponse.json({ ok: false, error: error.message || 'Failed to renew contract' }, { status });
  }
});
