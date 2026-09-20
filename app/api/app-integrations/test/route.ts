// app/api/app-integrations/test/route.ts
//
// ⚠️ 相容 shim（過渡期）。測試邏輯已抽到 lib/integrations/testHandlers.ts，
// 正式端點為 /api/integrations/test 與 /api/integrations/[id]/test。
// 本檔委派給 runTest，並在收到遮罩密鑰時以 integrationId 從新表補回真值。Phase 6 移除。
// POST { integrationId?, type, config, prompt?, emailTest?, testParams? }

import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { runTest } from '@/lib/integrations/testHandlers';
import { getIntegration } from '@/lib/integrations/store';
import { mergeSecrets, isMaskedValue } from '@/lib/integrations/mask';
import { secretKeysOf } from '@/lib/integrations/registry';

export const dynamic = 'force-dynamic';

export const POST = withAdmin(async (request) => {
    try {
        const body = await request.json();
        const { integrationId, type, config, prompt, emailTest, testParams } = body || {};
        if (!type) return NextResponse.json({ ok: false, error: 'type is required.' }, { status: 400 });
        if (!config || typeof config !== 'object' || Object.keys(config).length === 0) {
            return NextResponse.json({ ok: false, error: '缺少 config 參數' }, { status: 400 });
        }

        // 若前端送回遮罩密鑰，從新表以既有值補回
        let effectiveConfig: Record<string, any> = config;
        if (integrationId && Object.values(config).some((v) => isMaskedValue(v))) {
            const record = await getIntegration(integrationId);
            if (record) effectiveConfig = mergeSecrets(config, record.config, secretKeysOf(record.type));
        }

        const result = await runTest(type, effectiveConfig, { prompt, emailTest, testParams });
        if (!result) {
            return NextResponse.json({ ok: false, error: `不支援的整合類型: ${String(type).toUpperCase()}` }, { status: 400 });
        }
        return NextResponse.json({ ok: true, type: String(type).toUpperCase(), integrationId: integrationId || null, result });
    } catch (error: any) {
        console.error('[app-integrations/test shim] error:', error?.message || error);
        return NextResponse.json({ ok: false, error: `測試發生錯誤: ${error?.message || '未知錯誤'}` }, { status: 500 });
    }
});
