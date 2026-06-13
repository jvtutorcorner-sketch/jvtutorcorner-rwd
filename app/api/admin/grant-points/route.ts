import { NextRequest, NextResponse } from 'next/server';
import { ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { LOCAL_POINTS } from '@/lib/pointsStorage';

const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';
const POINTS_TABLE = process.env.DYNAMODB_TABLE_USER_POINTS || 'jvtutorcorner-user-points';

const useDynamo =
  typeof POINTS_TABLE === 'string' &&
  POINTS_TABLE.length > 0 &&
  (process.env.NODE_ENV === 'production' ||
    !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

/**
 * POST /api/admin/grant-points
 *
 * Grants points to a specific @test.com account only.
 * Bulk-granting all users is disabled to prevent polluting real production data.
 *
 * Body: { email: string, amount?: number }
 *
 * Auth (one of):
 *   - X-E2E-Secret header matching LOGIN_BYPASS_SECRET (E2E tests)
 *   - ?secret=ADMIN_SECRET query param (manual admin use)
 *   - NODE_ENV !== 'production' (local dev)
 */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret') || '';
    const envAllow = process.env.NODE_ENV !== 'production';
    const adminSecret = process.env.ADMIN_SECRET || '';

    // Auth: E2E bypass header
    const e2eHeader = req.headers.get('x-e2e-secret') || '';
    const bypassSecret = process.env.LOGIN_BYPASS_SECRET || '';
    const isE2E = !!(e2eHeader && bypassSecret && e2eHeader === bypassSecret);

    if (!isE2E && !envAllow && (!adminSecret || secret !== adminSecret)) {
      return NextResponse.json({ ok: false, message: 'Not allowed' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const targetEmail: string = (body.email || '').toLowerCase().trim();
    const amount: number = typeof body.amount === 'number' ? body.amount : 9999;

    // Require an explicit target email — bulk grant is disabled for safety
    if (!targetEmail) {
      return NextResponse.json(
        { ok: false, message: 'email is required. Bulk grant to all users is disabled for safety.' },
        { status: 400 }
      );
    }

    // Server-side safety guard: only @test.com accounts may receive test points
    if (!targetEmail.endsWith('@test.com')) {
      console.warn(`[admin/grant-points] Blocked: attempt to grant points to non-test account "${targetEmail}"`);
      return NextResponse.json(
        { ok: false, message: 'Only @test.com accounts are allowed for automated point grants.' },
        { status: 403 }
      );
    }

    // Look up the profile by email
    const scanRes: any = await ddbDocClient.send(new ScanCommand({
      TableName: PROFILES_TABLE,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': targetEmail },
    }));
    const profile = scanRes?.Items?.[0];

    if (!profile) {
      return NextResponse.json({ ok: false, message: `Profile not found: ${targetEmail}` }, { status: 404 });
    }

    const userId = profile.roid_id || profile.id;
    if (!userId) {
      return NextResponse.json({ ok: false, message: `Profile has no id for: ${targetEmail}` }, { status: 500 });
    }

    const item = { userId, balance: amount, updatedAt: new Date().toISOString() };

    if (useDynamo) {
      await ddbDocClient.send(new PutCommand({ TableName: POINTS_TABLE, Item: item }));
      console.log(`[admin/grant-points] DynamoDB: granted ${amount} pts to ${targetEmail} (${userId})`);
    } else {
      LOCAL_POINTS[userId] = amount;
      console.log(`[admin/grant-points] local memory: granted ${amount} pts to ${targetEmail} (${userId})`);
    }

    return NextResponse.json({ ok: true, count: 1, userId, email: targetEmail, amount, useDynamo });
  } catch (err: any) {
    console.error('[admin/grant-points] error', err?.message || err);
    return NextResponse.json({ ok: false, message: err?.message || 'Internal error' }, { status: 500 });
  }
}
