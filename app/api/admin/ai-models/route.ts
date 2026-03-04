// app/api/admin/ai-models/route.ts
import { NextResponse } from 'next/server';
import { getAIModels, updateAIModels } from '@/lib/aiModelsService';

export const dynamic = 'force-dynamic';

/**
 * GET - 獲取所有 AI 模型的選項
 */
export async function GET() {
    try {
        const models = await getAIModels();
        return NextResponse.json({ ok: true, data: models });
    } catch (error: any) {
        console.error('[AI Models API] GET error:', error);
        return NextResponse.json({ ok: false, error: 'Failed to fetch AI models.' }, { status: 500 });
    }
}

/**
 * POST - 更新或初始化 AI 模型選項
 */
export async function POST(request: Request) {
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
}
