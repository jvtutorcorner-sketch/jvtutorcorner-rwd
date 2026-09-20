// app/api/integrations/route.ts
//
// 整合連線清單 / 建立。取代舊 /api/app-integrations 作為新的正式端點。
//   GET  — 需登入。admin/system 取得遮罩後的完整設定；其他角色只取摘要（無 config）。
//   POST — 僅 admin 建立新連線（createdBy 取自 session，不信任 body）。

import { NextResponse } from 'next/server';
import { withAuth, withAdmin } from '@/lib/auth/apiGuard';
import { listIntegrations, createIntegration, toPublicView, toSummaryView } from '@/lib/integrations/store';
import { getProvider, validateConfig } from '@/lib/integrations/registry';

export const dynamic = 'force-dynamic';

const FULL_VIEW_ROLES = new Set(['admin', 'system']);

export const GET = withAuth(async (req) => {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type') || undefined;
        const category = searchParams.get('category') || undefined;
        const status = (searchParams.get('status') as any) || undefined;

        const items = await listIntegrations({ type, category, status });
        const isFull = FULL_VIEW_ROLES.has(req.session.role);
        const data = isFull ? items.map(toPublicView) : items.map(toSummaryView);
        return NextResponse.json({ ok: true, total: data.length, data });
    } catch (error: any) {
        console.error('[integrations] GET error:', error?.message || error);
        return NextResponse.json({ ok: false, error: 'Failed to list integrations.' }, { status: 500 });
    }
});

export const POST = withAdmin(async (req) => {
    try {
        const body = await req.json();
        const { type, name, config, status, customScript, scriptEnabled, isDefault } = body || {};
        if (!type) return NextResponse.json({ ok: false, error: 'type is required.' }, { status: 400 });
        if (!config || typeof config !== 'object') {
            return NextResponse.json({ ok: false, error: 'config object is required.' }, { status: 400 });
        }
        if (!getProvider(type)) {
            return NextResponse.json({ ok: false, error: `未知的整合類型: ${type}` }, { status: 400 });
        }
        const validation = validateConfig(type, config);
        if (!validation.ok) {
            return NextResponse.json({ ok: false, error: '欄位驗證失敗', errors: validation.errors }, { status: 400 });
        }
        const actor = req.session.email || req.session.userId;
        const record = await createIntegration(
            { type, name, config, status, customScript, scriptEnabled, isDefault },
            actor
        );
        return NextResponse.json({ ok: true, integration: toPublicView(record) }, { status: 201 });
    } catch (error: any) {
        console.error('[integrations] POST error:', error?.message || error);
        return NextResponse.json({ ok: false, error: 'Failed to create integration.' }, { status: 500 });
    }
});
