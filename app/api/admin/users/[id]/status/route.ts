// app/api/admin/users/[id]/status/route.ts
// 管理員變更帳號狀態：停權（suspended）/ 封鎖（banned）/ 恢復（active）。
// 停權或封鎖時會同步刪除該使用者所有 session，讓已登入的裝置立刻失效。
//
// POST body: { status: 'active' | 'suspended' | 'banned', reason?: string, until?: ISO string | null }

import { NextResponse } from 'next/server';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { setAccountStatus, ACCOUNT_STATUSES, type AccountStatus } from '@/lib/auth/accountStatus';
import { getProfileById } from '@/lib/profilesService';

export const dynamic = 'force-dynamic';

async function handleSetStatus(req: AuthedRequest, context?: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const params = await Promise.resolve(context?.params);
    const targetId = params?.id ? decodeURIComponent(params.id) : '';
    if (!targetId) {
      return NextResponse.json({ ok: false, error: 'user id required' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const status = String(body?.status || '') as AccountStatus;
    if (!ACCOUNT_STATUSES.includes(status)) {
      return NextResponse.json(
        { ok: false, error: `status must be one of ${ACCOUNT_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    let until: string | null = null;
    if (status === 'suspended' && body?.until) {
      const ts = Date.parse(String(body.until));
      if (Number.isNaN(ts) || ts <= Date.now()) {
        return NextResponse.json({ ok: false, error: 'until must be a future ISO date' }, { status: 400 });
      }
      until = new Date(ts).toISOString();
    }

    const target = await getProfileById(targetId);
    if (!target) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    // 不能對自己停權 —— 避免把最後一個管理員鎖在門外。
    const actorId = req.session.userId;
    if (status !== 'active' && (target.id === actorId || target.roid_id === actorId)) {
      return NextResponse.json({ ok: false, error: '不能停權自己的帳號' }, { status: 400 });
    }
    // 管理員之間互相停權必須由 system 角色執行，避免一個被盜的 admin 帳號癱瘓整個後台。
    if (status !== 'active' && ['admin', 'system'].includes(target.role) && req.session.role !== 'system') {
      return NextResponse.json({ ok: false, error: '停權管理員帳號需要 system 權限' }, { status: 403 });
    }

    const result = await setAccountStatus({
      profileId: target.id,
      status,
      reason,
      until,
      actorId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[admin/users/status] failed', err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || 'Failed to update status' }, { status: 500 });
  }
}

export const POST = withAdmin(handleSetStatus);
