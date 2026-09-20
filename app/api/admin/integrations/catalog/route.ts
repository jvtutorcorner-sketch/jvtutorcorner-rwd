// app/api/admin/integrations/catalog/route.ts
// 目錄管理（僅 admin）。GET 回 registry 預設 + 目前覆寫，PUT 整份儲存覆寫。

import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { listProviders, CATEGORIES } from '@/lib/integrations/registry';
import { getCatalogOverrides, saveCatalogOverrides } from '@/lib/integrations/catalogStore';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(async () => {
    const { overrides, updatedAt } = await getCatalogOverrides();
    const providers = listProviders().map((p) => ({
        type: p.type,
        category: p.category,
        defaults: p.defaults,       // 程式預設（供「還原」與 diff）
        deprecated: !!p.deprecated,
    }));
    return NextResponse.json({ ok: true, categories: CATEGORIES, providers, overrides, updatedAt });
});

export const PUT = withAdmin(async (req) => {
    try {
        const body = await req.json();
        const overrides = body?.overrides;
        if (!overrides || typeof overrides !== 'object') {
            return NextResponse.json({ ok: false, error: 'overrides 物件為必填' }, { status: 400 });
        }
        await saveCatalogOverrides(overrides, req.session.email || req.session.userId);
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || '儲存失敗' }, { status: 500 });
    }
});
