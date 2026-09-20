// app/api/app-integrations/route.ts
//
// ⚠️ 相容 shim（過渡期）。正式端點已改為 /api/integrations（見 app/api/integrations/*）。
// 此檔在舊 UI（app/apps 舊版）遷移完成前繼續存在，全部委派給 lib/integrations/store，
// 因此讀寫落在新表 jvtutorcorner-integrations。Phase 6 會移除本檔。
//
// 相容重點：
//   - GET 維持 { ok, total, data } 形狀（admin/system 取遮罩完整設定，其他角色取摘要）。
//   - POST/PUT/DELETE 以 integrationId 對應（PUT/DELETE 需帶 integrationId）。

import { NextResponse } from 'next/server';
import { withAuth, withAdmin } from '@/lib/auth/apiGuard';
import {
    listIntegrations, createIntegration, updateIntegration, deleteIntegration,
    getIntegration, toPublicView, toSummaryView,
} from '@/lib/integrations/store';
import { getProvider } from '@/lib/integrations/registry';

export const dynamic = 'force-dynamic';

const FULL_VIEW_ROLES = new Set(['admin', 'system']);

export const GET = withAuth(async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || undefined;
        const items = await listIntegrations({ type });
        const isFull = FULL_VIEW_ROLES.has(request.session.role);
        const data = isFull ? items.map(toPublicView) : items.map(toSummaryView);
        return NextResponse.json({ ok: true, total: data.length, data });
    } catch (error: any) {
        console.error('[app-integrations shim] GET error:', error?.message || error);
        return NextResponse.json({ ok: false, error: 'Failed to fetch integrations.' }, { status: 500 });
    }
});

export const POST = withAdmin(async (request) => {
    try {
        const body = await request.json();
        const { type, name, config } = body || {};
        if (!type) return NextResponse.json({ ok: false, error: 'type is required.' }, { status: 400 });
        if (!config || typeof config !== 'object') {
            return NextResponse.json({ ok: false, error: 'config object is required.' }, { status: 400 });
        }
        if (!getProvider(type)) {
            return NextResponse.json({ ok: false, error: `未知的整合類型: ${type}` }, { status: 400 });
        }
        const actor = request.session.email || request.session.userId;
        const record = await createIntegration({ type, name, config }, actor);
        return NextResponse.json({ ok: true, integration: toPublicView(record) }, { status: 201 });
    } catch (error: any) {
        console.error('[app-integrations shim] POST error:', error?.message || error);
        return NextResponse.json({ ok: false, error: 'Failed to create integration.' }, { status: 500 });
    }
});

export const PUT = withAdmin(async (request) => {
    try {
        const body = await request.json();
        const { integrationId, config, name, status } = body || {};
        if (!integrationId) {
            return NextResponse.json({ ok: false, error: 'integrationId is required.' }, { status: 400 });
        }
        // customScript 舊 UI 塞在 config 內，交給 store 一併處理
        const updated = await updateIntegration(integrationId, { config, name, status }, request.session.email || request.session.userId);
        if (!updated) return NextResponse.json({ ok: false, error: '整合項目不存在' }, { status: 404 });
        return NextResponse.json({ ok: true, integration: toPublicView(updated) });
    } catch (error: any) {
        console.error('[app-integrations shim] PUT error:', error?.message || error);
        return NextResponse.json({ ok: false, error: `Failed to update integration: ${error?.message}` }, { status: 500 });
    }
});

export const DELETE = withAdmin(async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        let integrationId = searchParams.get('integrationId');
        if (!integrationId) {
            // 舊呼叫可能以 userId+type 刪除：先查出對應 integrationId
            const userId = searchParams.get('userId');
            const type = searchParams.get('type');
            if (userId && type) {
                const items = await listIntegrations({ type });
                const match = items.find((i) => i.legacy?.userId === userId || i.createdBy === userId);
                integrationId = match?.integrationId || null;
            }
        }
        if (!integrationId) {
            return NextResponse.json({ ok: false, error: 'integrationId is required for deletion.' }, { status: 400 });
        }
        const result = await deleteIntegration(integrationId);
        if (!result.deleted) return NextResponse.json({ ok: false, error: '整合項目不存在' }, { status: 404 });
        return NextResponse.json({ ok: true, message: 'Integration deleted successfully' });
    } catch (error: any) {
        console.error('[app-integrations shim] DELETE error:', error?.message || error);
        return NextResponse.json({ ok: false, error: `Failed to delete integration: ${error?.message}` }, { status: 500 });
    }
});
