// lib/auditLogService.ts
// Minimal append-only audit trail for high-risk mutations (org lifecycle, license
// assignment, role changes, order deletion). Intentionally not a generic
// request-interceptor/observability layer — call writeAuditLog() explicitly from
// the handful of routes that need it.

import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const AUDIT_LOG_TABLE = process.env.DYNAMODB_TABLE_AUDIT_LOGS || 'jvtutorcorner-audit-logs';

export interface AuditLogEntry {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  /**
   * Owning organisation, top-level so org-scoped audit queries do not have to dig
   * through the free-form metadata bag. Set it on every B2B mutation.
   */
  orgId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const { orgId, ...rest } = entry;
    await ddbDocClient.send(new PutCommand({
      TableName: AUDIT_LOG_TABLE,
      Item: {
        auditId: randomUUID(),
        createdAt: new Date().toISOString(),
        ...rest,
        ...(orgId ? { orgId } : {}),
      },
    }));
  } catch (err) {
    // Audit logging must never block the underlying mutation it's describing.
    console.error('[auditLogService] Failed to write audit log:', entry.action, (err as any)?.message || err);
  }
}
