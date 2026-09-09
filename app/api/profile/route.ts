import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';

const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';

function isSelf(session: AuthedRequest['session'], profile: any): boolean {
  if (!profile) return false;
  return profile.id === session.userId || profile.roid_id === session.userId ||
    (typeof profile.email === 'string' && profile.email.toLowerCase() === session.email?.toLowerCase());
}

// 這支 API 被大量頁面拿來查「別人的」profile 只是為了顯示名字（教室參與者、老師儀表板的學生名單…），
// 不能整包 profile 回傳（含 password hash、points、生日等 PII）。非本人一律只回傳這個安全子集。
function publicSubset(profile: any) {
  if (!profile) return profile;
  const { id, roid_id, firstName, lastName, nickname, teacherId, role } = profile;
  return { id, roid_id, firstName, lastName, nickname, teacherId, role };
}

function sanitizeOwn(profile: any) {
  if (!profile) return profile;
  const { password, ...rest } = profile;
  return rest;
}

export const GET = withAuth(async (req: AuthedRequest) => {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const id = url.searchParams.get('id');
    const isAdmin = req.session.role === 'admin' || req.session.role === 'system';

    if (email) {
      const emailLower = String(email).toLowerCase();
      try {
        const scanRes: any = await ddbDocClient.send(new ScanCommand({
          TableName: PROFILES_TABLE,
          FilterExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': emailLower }
        }));

        const profile = scanRes?.Items?.[0] || null;
        if (profile) {
          const own = isAdmin || isSelf(req.session, profile);
          return NextResponse.json({ ok: true, profile: own ? sanitizeOwn(profile) : publicSubset(profile) });
        }
      } catch (e) {
        console.warn('[profile GET] Dynamo lookup failed', (e as any)?.message || e);
      }
      return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });
    }

    if (id) {
      try {
        const getRes: any = await ddbDocClient.send(new GetCommand({ TableName: PROFILES_TABLE, Key: { id } }));
        let profile = getRes?.Item || null;

        if (!profile) {
          // Fallback scan by roid_id
          const scanRes: any = await ddbDocClient.send(new ScanCommand({
            TableName: PROFILES_TABLE,
            FilterExpression: 'roid_id = :rid',
            ExpressionAttributeValues: { ':rid': id }
          }));
          profile = scanRes?.Items?.[0] || null;
        }

        if (profile) {
          const own = isAdmin || isSelf(req.session, profile);
          return NextResponse.json({ ok: true, profile: own ? sanitizeOwn(profile) : publicSubset(profile) });
        }
      } catch (e) {
        console.warn('[profile GET] Dynamo lookup by ID failed', (e as any)?.message || e);
      }
      return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });
    }

    // List all (scan) — 沒帶 id/email 等於整表列出，只有管理員能用。
    if (!isAdmin) {
      return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 });
    }
    const res: any = await ddbDocClient.send(new ScanCommand({ TableName: PROFILES_TABLE }));
    return NextResponse.json({ ok: true, profiles: (res.Items || []).map(sanitizeOwn) });
  } catch (err: any) {
    console.error('[profile GET] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to read profiles' }, { status: 500 });
  }
});

export const PATCH = withAuth(async (req: AuthedRequest) => {
  try {
    const body = await req.json();
    if (!body || (!body.email && !body.id)) {
      return NextResponse.json({ ok: false, message: 'email or id required' }, { status: 400 });
    }

    const email = body.email ? String(body.email).toLowerCase() : undefined;
    const id = body.id;

    let profile: any = null;

    // Look up existing profile in DynamoDB
    try {
      if (id) {
        const getRes: any = await ddbDocClient.send(new GetCommand({ TableName: PROFILES_TABLE, Key: { id } }));
        profile = getRes?.Item || null;
        if (!profile) {
          const scanRes: any = await ddbDocClient.send(new ScanCommand({
            TableName: PROFILES_TABLE,
            FilterExpression: 'roid_id = :rid',
            ExpressionAttributeValues: { ':rid': id }
          }));
          profile = scanRes?.Items?.[0] || null;
        }
      } else if (email) {
        const scanRes: any = await ddbDocClient.send(new ScanCommand({
          TableName: PROFILES_TABLE,
          FilterExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': email }
        }));
        profile = scanRes?.Items?.[0] || null;
      }
    } catch (e) {
      console.warn('[profile PATCH] Existing lookup failed', (e as any)?.message || e);
    }

    if (!profile) {
      return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });
    }

    const isAdmin = req.session.role === 'admin' || req.session.role === 'system';
    if (!isAdmin && !isSelf(req.session, profile)) {
      return NextResponse.json({ ok: false, message: 'Forbidden: cannot modify another user\'s profile' }, { status: 403 });
    }

    // pointsToAdd 一般人只能扣自己的點數（例如兌換商品），不能用這支 API 幫自己加點 —
    // 加點只能透過 admin 或真正的付款/退款流程。
    if (!isAdmin && typeof body.pointsToAdd === 'number' && body.pointsToAdd > 0) {
      return NextResponse.json({ ok: false, message: 'Forbidden: cannot grant points to yourself' }, { status: 403 });
    }

    // Apply updates
    const updates: any = {};
    const fields = ['firstName', 'lastName', 'bio', 'backupEmail', 'birthdate', 'gender', 'country', 'timezone', 'card'];
    fields.forEach(f => {
      if (body[f] !== undefined) updates[f] = body[f];
    });

    if (body.pointsToAdd !== undefined && typeof body.pointsToAdd === 'number') {
      const currentPoints = typeof profile.points === 'number' ? profile.points : 0;
      updates.points = Math.max(0, currentPoints + body.pointsToAdd);
    }

    if (updates.bio && String(updates.bio).length > 500) {
      return NextResponse.json({ ok: false, message: 'bio too long (max 500 chars)' }, { status: 400 });
    }

    const nowUtc = new Date().toISOString();
    const timezone = updates.timezone || profile.timezone || 'UTC';
    let local = nowUtc;
    try {
      const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const parts = fmt.formatToParts(new Date()).reduce((acc: any, part) => { acc[part.type] = (acc[part.type] || '') + part.value; return acc; }, {});
      local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    } catch { }

    const merged = { ...profile, ...updates, updatedAtUtc: nowUtc, updatedAtLocal: local };
    if (!merged.id) merged.id = merged.roid_id; // ensure primary key

    // Persist to DynamoDB
    try {
      await ddbDocClient.send(new PutCommand({ TableName: PROFILES_TABLE, Item: merged }));
      return NextResponse.json({ ok: true, profile: sanitizeOwn(merged) });
    } catch (e) {
      console.error('[profile PATCH] Dynamo write failed', (e as any)?.message || e);
      return NextResponse.json({ ok: false, message: 'Failed to update profile' }, { status: 500 });
    }
  } catch (err: any) {
    console.error('[profile PATCH] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to update profile' }, { status: 500 });
  }
});
