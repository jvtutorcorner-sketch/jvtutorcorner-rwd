/**
 * License Expiry Sweep
 *
 * POST /api/licenses/expire[?orgId=<id>][&dryRun=true]
 *
 * Moves every active license whose expiresAt has passed to 'expired' and frees its
 * seat (Organization.usedSeats). Before this existed, expiry was only checked at
 * read time: an expired license stayed 'active', kept consuming a seat, and the
 * organization could never reuse it.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` for the scheduler (same convention as
 * /api/cron/process-reminders), otherwise a system-admin session. Run it at least
 * daily.
 */

import { NextResponse } from 'next/server';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { expireOverdueLicenses } from '@/lib/orgMembershipService';
import { writeAuditLog } from '@/lib/auditLogService';

export const dynamic = 'force-dynamic';

async function runSweep(req: Request, actorId: string) {
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dryRun') === 'true';
    const orgId = url.searchParams.get('orgId') || undefined;

    const result = await expireOverdueLicenses({ orgId, dryRun });

    if (!dryRun) {
      for (const item of result.expired) {
        await writeAuditLog({
          actorId,
          action: 'license.expire',
          targetType: 'license',
          targetId: item.licenseId,
          orgId: item.orgId,
          metadata: { userId: item.userId ?? null },
        });
      }
    }

    return NextResponse.json({ ok: result.failed.length === 0, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[LicenseExpireAPI] sweep failed:', message);
    return NextResponse.json({ ok: false, error: message || 'License expiry sweep failed' }, { status: 500 });
  }
}

const adminHandler = withAdmin(async (req: AuthedRequest) => runSweep(req, req.session.userId));

export async function POST(req: Request, context?: unknown) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`) {
    return runSweep(req, 'cron:license-expiry');
  }
  return adminHandler(req, context);
}
