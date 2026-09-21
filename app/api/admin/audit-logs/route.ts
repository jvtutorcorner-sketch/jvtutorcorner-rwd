/**
 * Admin Audit Log Viewer API
 *
 * GET /api/admin/audit-logs
 *
 * Reads from the `jvtutorcorner-audit-logs` table written by lib/auditLogService.ts's
 * writeAuditLog(). This table has no `orgId` attribute (only 2 of 7 current call sites
 * put `orgId` inside the free-form `metadata` bag), so there is no reliable way to scope
 * results to "one organization's entries" — this route is intentionally system-admin-only,
 * matching the existing organizations/licenses route family's use of requireSystemAdmin
 * rather than an org-scoped guard.
 *
 * Query modes:
 *   - `targetId` given  -> Query the `byTargetId` GSI (efficient, indexed, newest first).
 *   - `targetId` absent -> bounded Scan (no other GSI exists on this table; acceptable at
 *     this table's current volume — 7 call sites total, admin-triggered mutations only).
 *
 * Query Parameters:
 *   targetId   – filter to one target's entries (uses the byTargetId GSI)
 *   targetType – exact-match filter, e.g. 'organization' | 'license' | 'order' | 'roles'
 *   action     – exact-match filter, e.g. 'organization.create' | 'license.assign'
 *   actorId    – exact-match filter
 *   limit      – max rows returned (default 50, capped at 200)
 */

import { NextResponse } from 'next/server';
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { requireSystemAdmin } from '@/lib/auth/orgAccess';

export const dynamic = 'force-dynamic';

const AUDIT_LOG_TABLE = process.env.DYNAMODB_TABLE_AUDIT_LOGS || 'jvtutorcorner-audit-logs';

function buildFilter(params: { targetType?: string; action?: string; actorId?: string }) {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const clauses: string[] = [];

  if (params.targetType) {
    names['#targetType'] = 'targetType';
    values[':targetType'] = params.targetType;
    clauses.push('#targetType = :targetType');
  }
  if (params.action) {
    names['#action'] = 'action';
    values[':action'] = params.action;
    clauses.push('#action = :action');
  }
  if (params.actorId) {
    names['#actorId'] = 'actorId';
    values[':actorId'] = params.actorId;
    clauses.push('#actorId = :actorId');
  }

  if (clauses.length === 0) return undefined;
  return {
    FilterExpression: clauses.join(' AND '),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values
  };
}

export const GET = withAuth(async (req: AuthedRequest) => {
  const guard = await requireSystemAdmin(req);
  if (!guard.ok) return guard.response;

  try {
    const sp = new URL(req.url).searchParams;
    const targetId = sp.get('targetId') || undefined;
    const targetType = sp.get('targetType') || undefined;
    const action = sp.get('action') || undefined;
    const actorId = sp.get('actorId') || undefined;
    const limit = Math.min(parseInt(sp.get('limit') || '50', 10) || 50, 200);

    const filter = buildFilter({ targetType, action, actorId });

    let entries: Record<string, unknown>[];

    if (targetId) {
      const result = await ddbDocClient.send(new QueryCommand({
        TableName: AUDIT_LOG_TABLE,
        IndexName: 'byTargetId',
        KeyConditionExpression: 'targetId = :targetId',
        ExpressionAttributeValues: { ':targetId': targetId, ...(filter?.ExpressionAttributeValues || {}) },
        ExpressionAttributeNames: filter?.ExpressionAttributeNames,
        FilterExpression: filter?.FilterExpression,
        ScanIndexForward: false,
        Limit: limit
      }));
      entries = result.Items || [];
    } else {
      // No Limit here on purpose: DynamoDB applies Limit to items examined BEFORE
      // FilterExpression runs, which could silently return fewer matching rows than
      // actually exist. This table is small (7 write call sites, admin-triggered
      // mutations only), so a full Scan is acceptable — truncate to `limit` after
      // filtering and sorting instead.
      const result = await ddbDocClient.send(new ScanCommand({
        TableName: AUDIT_LOG_TABLE,
        FilterExpression: filter?.FilterExpression,
        ExpressionAttributeNames: filter?.ExpressionAttributeNames,
        ExpressionAttributeValues: filter?.ExpressionAttributeValues
      }));
      entries = (result.Items || [])
        .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit);
    }

    return NextResponse.json({ ok: true, total: entries.length, entries });
  } catch (error: any) {
    console.error('[AuditLogAPI] GET failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to query audit logs' },
      { status: 500 }
    );
  }
});
