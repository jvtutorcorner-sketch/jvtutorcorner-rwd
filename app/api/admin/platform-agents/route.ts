// app/api/admin/platform-agents/route.ts
// Platform Agents 管理（僅 admin）。GET 列出全部（含停用），POST 新增/更新。

import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { listAgents, upsertAgent } from '@/lib/ai/agentsStore';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(async () => {
    const agents = await listAgents({ includeDisabled: true });
    return NextResponse.json({ ok: true, agents });
});

export const POST = withAdmin(async (req) => {
    try {
        const body = await req.json();
        if (!body?.name) return NextResponse.json({ ok: false, error: 'name 為必填' }, { status: 400 });
        const agent = await upsertAgent(body, req.session.email || req.session.userId);
        return NextResponse.json({ ok: true, agent }, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || '建立失敗' }, { status: 500 });
    }
});
