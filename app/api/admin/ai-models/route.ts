// app/api/admin/ai-models/route.ts
import { NextResponse } from 'next/server';
import { getAIModels, updateAIModels } from '@/lib/aiModelsService';
import { withAuth, withAdmin } from '@/lib/auth/apiGuard';

export const dynamic = 'force-dynamic';

/**
 * GET - 獲取所有 AI 模型的選項
 * 一般登入使用者（/add-app、/apps 等）也要讀這份型錄，所以只要求登入，不限 admin；
 * 先前完全沒有 auth，任何匿名請求都能撈。寫入（POST）才限 admin，見下方。
 */
export const GET = withAuth(async () => {
    try {
        const models = await getAIModels();
        return NextResponse.json({ ok: true, data: models });
    } catch (error: any) {
        console.error('[AI Models API] GET error:', error);
        return NextResponse.json({ ok: false, error: 'Failed to fetch AI models.' }, { status: 500 });
    }
});

/**
 * POST - 更新或初始化 AI 模型選項
 */
export const POST = withAdmin(async (request) => {
    try {
        const body = await request.json();
        const { provider, models } = body;

        if (!provider || !Array.isArray(models)) {
            return NextResponse.json({ ok: false, error: 'Provider and models (array) are required.' }, { status: 400 });
        }

        await updateAIModels(provider, models);
        return NextResponse.json({ ok: true, message: `Models for ${provider} updated successfully.` });
    } catch (error: any) {
        console.error('[AI Models API] POST error:', error);
        return NextResponse.json({ ok: false, error: 'Failed to update AI models.' }, { status: 500 });
    }
});
