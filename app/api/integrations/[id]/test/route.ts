// app/api/integrations/[id]/test/route.ts
//
// 測試「已儲存」的連線（僅 admin）。使用 DB 內的真實密鑰，並可套用尚未儲存的編輯
// （configOverrides，遮罩 / 空的密鑰欄位會保留 DB 原值）。測試結果寫回 lastTest*。
// POST { configOverrides?, prompt?, emailTest?, testParams? }

import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { getIntegration, recordTestResult } from '@/lib/integrations/store';
import { runTest } from '@/lib/integrations/testHandlers';
import { mergeSecrets } from '@/lib/integrations/mask';
import { secretKeysOf } from '@/lib/integrations/registry';

export const dynamic = 'force-dynamic';

export const POST = withAdmin(async (req, context: any) => {
    try {
        const { id } = await context.params;
        const body = (await req.json()) || {};
        const { configOverrides, prompt, emailTest, testParams } = body;

        const record = await getIntegration(id);
        if (!record) return NextResponse.json({ ok: false, error: '整合項目不存在' }, { status: 404 });

        // 以 DB 密鑰為底，套用未儲存的修改（遮罩 / 空 = 不變更）
        const effectiveConfig = configOverrides
            ? mergeSecrets(configOverrides, record.config, secretKeysOf(record.type))
            : record.config;

        const result = await runTest(record.type, effectiveConfig, { prompt, emailTest, testParams });
        if (!result) {
            return NextResponse.json({ ok: false, error: `不支援的整合類型: ${record.type}` }, { status: 400 });
        }
        await recordTestResult(id, { ok: result.success, message: result.message });
        return NextResponse.json({ ok: true, type: record.type, integrationId: id, result });
    } catch (error: any) {
        console.error('[integrations/[id]/test] error:', error?.message || error);
        return NextResponse.json({ ok: false, error: `測試發生錯誤: ${error?.message || '未知錯誤'}` }, { status: 500 });
    }
});
