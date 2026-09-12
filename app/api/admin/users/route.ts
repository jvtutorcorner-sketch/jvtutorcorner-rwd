// app/api/admin/users/route.ts
// 管理員用的使用者清單（帳號狀態管理頁 /admin/users）。
// 只回傳管理所需欄位，不回傳密碼雜湊、驗證 token 等敏感資料。

import { NextResponse } from 'next/server';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { PROFILES_TABLE } from '@/lib/profilesService';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { getAccountBlock } from '@/lib/auth/accountStatus';

export const dynamic = 'force-dynamic';

function toSummary(p: any) {
  const block = getAccountBlock(p);
  return {
    id: p.id,
    roid_id: p.roid_id || p.id,
    email: p.email || '',
    name: p.nickname || p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || '',
    role: p.role || 'student',
    plan: p.plan || '',
    authProvider: p.authProvider || (p.lineUid ? 'line' : 'password'),
    emailVerified: p.emailVerified === true || p.emailVerificationStatus === 'verified',
    // 有效狀態：suspendedUntil 已過期的暫停會被算回 active
    accountStatus: block ? block.status : 'active',
    suspendedReason: p.suspendedReason || null,
    suspendedAt: p.suspendedAt || null,
    suspendedBy: p.suspendedBy || null,
    suspendedUntil: p.suspendedUntil || null,
    createdAt: p.createdAt || null,
  };
}

async function handleList(req: AuthedRequest) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const statusFilter = (url.searchParams.get('status') || '').trim();

    const items: any[] = [];
    let lastKey: Record<string, unknown> | undefined;
    do {
      const res = await ddbDocClient.send(new ScanCommand({
        TableName: PROFILES_TABLE,
        ProjectionExpression:
          'id, roid_id, email, nickname, #n, firstName, lastName, #r, #p, authProvider, lineUid, emailVerified, emailVerificationStatus, accountStatus, suspendedReason, suspendedAt, suspendedBy, suspendedUntil, createdAt',
        ExpressionAttributeNames: { '#n': 'name', '#r': 'role', '#p': 'plan' },
        ExclusiveStartKey: lastKey,
      }));
      items.push(...(res.Items || []));
      lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);

    let users = items.map(toSummary);
    if (q) {
      users = users.filter(u =>
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        String(u.id).toLowerCase().includes(q)
      );
    }
    if (statusFilter && statusFilter !== 'all') {
      users = users.filter(u => u.accountStatus === statusFilter);
    }
    users.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    return NextResponse.json({ ok: true, users, total: users.length });
  } catch (err: any) {
    console.error('[admin/users] list failed', err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || 'Failed to list users' }, { status: 500 });
  }
}

export const GET = withAdmin(handleList);
