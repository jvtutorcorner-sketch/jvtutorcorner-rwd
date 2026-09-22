// GET /api/enterprise/usage?orgId=<org>&month=yyyymm&format=csv
//
// Enterprise (machine) AI usage + budget for one tenant — billing reconciliation.
// Auth: admin/system session OR HMAC (withAdminOrHmac). NOTE: HMAC uses a single
// shared secret with no per-tenant identity, so orgId is a REQUEST parameter, not
// derived from the caller — a per-tenant key store is future work. This is the
// first external/enterprise-facing API; internal callers sign with API_HMAC_SECRET.

import { NextResponse } from 'next/server';
import { withAdminOrHmac, type AuthedRequest } from '@/lib/auth/apiGuard';
import { currentYyyymm } from '@/lib/ai/budget';
import { buildTenantUsage, tenantUsageCsv } from '@/lib/enterprise/tenantUsage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(req: AuthedRequest) {
  const url = new URL(req.url);
  const orgId = (url.searchParams.get('orgId') || '').trim();
  if (!orgId) return NextResponse.json({ ok: false, error: 'orgId is required' }, { status: 400 });
  const month = url.searchParams.get('month') || currentYyyymm();
  const format = url.searchParams.get('format');

  const report = await buildTenantUsage(orgId, month, { detail: true });

  if (format === 'csv') {
    return new Response(tenantUsageCsv(report), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="usage-${orgId}-${month}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }
  return NextResponse.json({ ok: true, ...report });
}

export const GET = withAdminOrHmac('/api/enterprise/usage', handleGet);
