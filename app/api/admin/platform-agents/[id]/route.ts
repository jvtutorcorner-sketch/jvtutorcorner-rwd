// app/api/admin/platform-agents/[id]/route.ts
// 更新 / 刪除單一 agent（僅 admin）。id 不可變。

import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { upsertAgent, deleteAgent } from '@/lib/ai/agentsStore';

export const dynamic = 'force-dynamic';

export const PUT = withAdmin(async (req, context: any) => {
    try {
        const { id } = await context.params;
        const body = await req.json();
        if (!body?.name) return NextResponse.json({ ok: false, error: 'name 為必填' }, { status: 400 });
        const agent = await upsertAgent({ ...body, id }, req.session.email || req.session.userId);
        return NextResponse.json({ ok: true, agent });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || '更新失敗' }, { status: 500 });
    }
});

export const DELETE = withAdmin(async (req, context: any) => {
    try {
        const { id } = await context.params;
        await deleteAgent(id, req.session.email || req.session.userId);
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || '刪除失敗' }, { status: 500 });
    }
});
