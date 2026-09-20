// app/api/integrations/[id]/route.ts
//
// 單一整合的 GET / PUT / DELETE（僅 admin）。
//   GET    — 遮罩後完整設定 + secretsSet。
//   PUT    — 更新；密鑰以 mergeSecrets 合併（遮罩 / 空 = 不變更）。
//   DELETE — 刪除；若為 default 會自動改指派。

import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { getIntegration, updateIntegration, deleteIntegration, toPublicView } from '@/lib/integrations/store';
import { validateConfig } from '@/lib/integrations/registry';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> | { id: string } };
async function idOf(context: any): Promise<string> {
    const params = await context.params;
    return params.id;
}

export const GET = withAdmin(async (_req, context: Ctx) => {
    const id = await idOf(context);
    const record = await getIntegration(id);
    if (!record) return NextResponse.json({ ok: false, error: '整合項目不存在' }, { status: 404 });
    return NextResponse.json({ ok: true, integration: toPublicView(record) });
});

export const PUT = withAdmin(async (req, context: Ctx) => {
    try {
        const id = await idOf(context);
        const body = await req.json();
        const { name, config, status, customScript, scriptEnabled } = body || {};

        const existing = await getIntegration(id);
        if (!existing) return NextResponse.json({ ok: false, error: '整合項目不存在' }, { status: 404 });

        // 編輯時以 partial 驗證：只驗有送的欄位，避免遮罩密鑰被當成缺值
        if (config) {
            const validation = validateConfig(existing.type, config, { partial: true });
            if (!validation.ok) {
                return NextResponse.json({ ok: false, error: '欄位驗證失敗', errors: validation.errors }, { status: 400 });
            }
        }
        const actor = req.session.email || req.session.userId;
        const updated = await updateIntegration(id, { name, config, status, customScript, scriptEnabled }, actor);
        if (!updated) return NextResponse.json({ ok: false, error: '整合項目不存在' }, { status: 404 });
        return NextResponse.json({ ok: true, integration: toPublicView(updated) });
    } catch (error: any) {
        console.error('[integrations/[id]] PUT error:', error?.message || error);
        return NextResponse.json({ ok: false, error: `更新失敗: ${error?.message || '未知錯誤'}` }, { status: 500 });
    }
});

export const DELETE = withAdmin(async (_req, context: Ctx) => {
    try {
        const id = await idOf(context);
        const result = await deleteIntegration(id);
        if (!result.deleted) return NextResponse.json({ ok: false, error: '整合項目不存在' }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('[integrations/[id]] DELETE error:', error?.message || error);
        return NextResponse.json({ ok: false, error: `刪除失敗: ${error?.message || '未知錯誤'}` }, { status: 500 });
    }
});
