// app/api/integrations/[id]/default/route.ts
// 將此連線設為同類型的預設（僅 admin）。POST（無 body）

import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { setDefault, toPublicView } from '@/lib/integrations/store';

export const dynamic = 'force-dynamic';

export const POST = withAdmin(async (req, context: any) => {
    try {
        const { id } = await context.params;
        const actor = req.session.email || req.session.userId;
        const updated = await setDefault(id, actor);
        if (!updated) return NextResponse.json({ ok: false, error: '整合項目不存在' }, { status: 404 });
        return NextResponse.json({ ok: true, integration: toPublicView(updated) });
    } catch (error: any) {
        console.error('[integrations/[id]/default] error:', error?.message || error);
        return NextResponse.json({ ok: false, error: `設定預設失敗: ${error?.message || '未知錯誤'}` }, { status: 500 });
    }
});
