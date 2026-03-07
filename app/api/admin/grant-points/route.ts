import { NextRequest, NextResponse } from 'next/server';
import { ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';
const POINTS_TABLE = process.env.DYNAMODB_TABLE_USER_POINTS || 'jvtutorcorner-user-points';

// Check if DynamoDB is available (same logic as points API)
const useDynamo =
  typeof POINTS_TABLE === 'string' &&
  POINTS_TABLE.length > 0 &&
  (process.env.NODE_ENV === 'production' ||
    !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

// In-memory fallback for development
const LOCAL_POINTS: Record<string, number> = {};

// Only allow running in non-production by default, or require ADMIN_SECRET in production
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret') || '';
    const envAllow = process.env.NODE_ENV !== 'production';
    const adminSecret = process.env.ADMIN_SECRET || '';

    console.log('[admin/grant-points] DEBUG:', {
      NODE_ENV: process.env.NODE_ENV,
      envAllow,
      useDynamo,
      hasAccessKey: !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID),
      PROFILES_TABLE,
      POINTS_TABLE,
    });

    if (!envAllow && (!adminSecret || secret !== adminSecret)) {
      return NextResponse.json({ ok: false, message: 'Not allowed' }, { status: 403 });
    }

    // Scan profiles
    console.log('[admin/grant-points] Scanning profiles from', PROFILES_TABLE);
    const scanRes: any = await ddbDocClient.send(new ScanCommand({ TableName: PROFILES_TABLE }));
    const profiles = scanRes?.Items || [];
    console.log('[admin/grant-points] Found', profiles.length, 'profiles');

    const results: any[] = [];

    for (const p of profiles) {
      // Prefer email as userId, fallback to id or roid_id
      const userId = (p.email && String(p.email).toLowerCase()) || p.id || p.roid_id;
      if (!userId) {
        console.log('[admin/grant-points] Skipping profile with no userId:', p);
        continue;
      }

      const item = { userId, balance: 9999, updatedAt: new Date().toISOString() };
      
      if (useDynamo) {
        try {
          console.log('[admin/grant-points] Writing to DynamoDB:', { userId, POINTS_TABLE });
          await ddbDocClient.send(new PutCommand({ TableName: POINTS_TABLE, Item: item }));
          results.push({ userId, ok: true, source: 'dynamodb' });
        } catch (e) {
          console.error('[admin/grant-points] DynamoDB write error for', userId, ':', e);
          results.push({ userId, ok: false, error: (e as any)?.message || e, source: 'dynamodb' });
        }
      } else {
        console.log('[admin/grant-points] Writing to LOCAL memory:', { userId });
        LOCAL_POINTS[userId] = 9999;
        results.push({ userId, ok: true, source: 'local_memory' });
      }
    }

    console.log('[admin/grant-points] Complete:', { total: results.length, useDynamo });
    return NextResponse.json({ ok: true, count: results.length, useDynamo, results });
  } catch (err: any) {
    console.error('[admin/grant-points] error', err?.message || err);
    return NextResponse.json({ ok: false, message: err?.message || 'Internal error' }, { status: 500 });
  }
}
