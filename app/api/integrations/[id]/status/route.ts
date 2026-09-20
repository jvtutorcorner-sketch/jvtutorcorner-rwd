// app/api/integrations/[id]/status/route.ts
// 切換啟用狀態（僅 admin）。PATCH { status: 'ACTIVE' | 'INACTIVE' }

import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { setStatus, toPublicView } from '@/lib/integrations/store';

export const dynamic = 'force-dynamic';

export const PATCH = withAdmin(async (req, context: any) => {
    try {
        const { id } = await context.params;
        const { status } = (await req.json()) || {};
        if (status !== 'ACTIVE' && status !== 'INACTIVE') {
            return NextResponse.json({ ok: false, error: "status 必須為 'ACTIVE' 或 'INACTIVE'" }, { status: 400 });
        }
        const actor = req.session.email || req.session.userId;
        const updated = await setStatus(id, status, actor);
        if (!updated) return NextResponse.json({ ok: false, error: '整合項目不存在' }, { status: 404 });
        return NextResponse.json({ ok: true, integration: toPublicView(updated) });
    } catch (error: any) {
        console.error('[integrations/[id]/status] error:', error?.message || error);
        return NextResponse.json({ ok: false, error: `狀態更新失敗: ${error?.message || '未知錯誤'}` }, { status: 500 });
    }
});
