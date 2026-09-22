// /api/admin/ai-budgets  (system admin only)
//   GET — list all budget scopes (GLOBAL + TENANT#<org>) with NT$ convenience.
//   PUT — upsert a budget: { scopeKey, monthlyCapMusd?, dailyCapMusd?, hardStop?, note? }.
//         Setting a tenant/global cap is a billing-class action → system admin.
//         org-admins read their own cap via /api/admin/cost/tenants/<orgId>.

import { NextResponse } from 'next/server';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { listBudgets, setBudget } from '@/lib/ai/budgetStore';
import { writeAuditLog } from '@/lib/auditLogService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FX = Number.parseFloat(process.env.FX_USD_TWD || '32');
const musdToNt = (m: number) => Math.round((((m || 0) / 1_000_000) * FX) * 100) / 100;

async function handleGet() {
  const budgets = await listBudgets();
  return NextResponse.json({
    ok: true,
    fx: FX,
    budgets: budgets.map((b) => ({
      ...b,
      monthly_nt: b.monthlyCapMusd != null ? musdToNt(b.monthlyCapMusd) : null,
    })),
  });
}

const isValidScopeKey = (s: string) => s === 'GLOBAL' || /^TENANT#.+/.test(s);

async function handlePut(req: AuthedRequest) {
  let body: { scopeKey?: unknown; monthlyCapMusd?: unknown; dailyCapMusd?: unknown; hardStop?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const scopeKey = typeof body.scopeKey === 'string' ? body.scopeKey.trim() : '';
  if (!isValidScopeKey(scopeKey)) {
    return NextResponse.json({ ok: false, error: 'scopeKey must be GLOBAL or TENANT#<orgId>' }, { status: 400 });
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined);

  const saved = await setBudget({
    scopeKey,
    monthlyCapMusd: num(body.monthlyCapMusd),
    dailyCapMusd: num(body.dailyCapMusd),
    hardStop: body.hardStop === true,
    note: typeof body.note === 'string' ? body.note.slice(0, 300) : undefined,
    updatedBy: req.session.userId,
  });

  await writeAuditLog({
    actorId: req.session.userId,
    action: 'ai_budget.update',
    targetType: 'ai_budget',
    targetId: scopeKey,
    orgId: scopeKey.startsWith('TENANT#') ? scopeKey.slice('TENANT#'.length) : null,
    metadata: { monthlyCapMusd: saved.monthlyCapMusd, hardStop: saved.hardStop },
  });

  return NextResponse.json({ ok: true, budget: saved });
}

export const GET = withAdmin(handleGet);
export const PUT = withAdmin(handlePut);
