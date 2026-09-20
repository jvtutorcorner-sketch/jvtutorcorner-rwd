// app/api/integrations/test/route.ts
//
// 建立前的連線測試（僅 admin）。使用呼叫端提供的 config（尚未儲存），不寫入 DB。
// POST { type, config, prompt?, emailTest?, testParams? }

import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { runTest } from '@/lib/integrations/testHandlers';

export const dynamic = 'force-dynamic';

export const POST = withAdmin(async (req) => {
    try {
        const body = (await req.json()) || {};
        const { type, config, prompt, emailTest, testParams } = body;
        if (!type) return NextResponse.json({ ok: false, error: 'type is required.' }, { status: 400 });
        if (!config || typeof config !== 'object' || Object.keys(config).length === 0) {
            return NextResponse.json({ ok: false, error: '缺少 config 參數' }, { status: 400 });
        }
        const result = await runTest(type, config, { prompt, emailTest, testParams });
        if (!result) {
            return NextResponse.json({ ok: false, error: `不支援的整合類型: ${String(type).toUpperCase()}` }, { status: 400 });
        }
        return NextResponse.json({ ok: true, type: String(type).toUpperCase(), result });
    } catch (error: any) {
        console.error('[integrations/test] error:', error?.message || error);
        return NextResponse.json({ ok: false, error: `測試發生錯誤: ${error?.message || '未知錯誤'}` }, { status: 500 });
    }
});
