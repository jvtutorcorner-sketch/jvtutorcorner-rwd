// GET /api/admin/cost/tenants/<orgId>?month=yyyymm&format=csv
//
// Per-tenant AI cost report (Phase 6). System admin or that org's org-admin
// (requireOrgAccess 'read'). Reads the TENANT#<org>#<month> rollup + budget;
// ?format=csv returns a per-feature CSV.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { requireOrgAccess } from '@/lib/auth/orgAccess';
import { currentYyyymm } from '@/lib/ai/budget';
import { buildTenantUsage, tenantUsageCsv } from '@/lib/enterprise/tenantUsage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(req: AuthedRequest, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const guard = await requireOrgAccess(req, orgId, 'read');
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const month = url.searchParams.get('month') || currentYyyymm();
  const format = url.searchParams.get('format');
  const report = await buildTenantUsage(orgId, month, { detail: true });

  if (format === 'csv') {
    return new Response(tenantUsageCsv(report), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tenant-${orgId}-${month}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }
  return NextResponse.json({ ok: true, ...report });
}

export const GET = withAuth(handleGet);
