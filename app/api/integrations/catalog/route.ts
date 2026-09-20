// app/api/integrations/catalog/route.ts
//
// 服務目錄：registry 的 provider 定義（欄位 schema、能力、預設外觀），供 CatalogGrid 與
// SchemaForm 使用。需登入。不含任何密鑰。
// 注意：Phase 4 會在此疊上後台的 catalog-overrides（上下架 / 排序 / 名稱）。

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/apiGuard';
import { listProviders, CATEGORIES } from '@/lib/integrations/registry';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
    const providers = listProviders().map((p) => ({
        type: p.type,
        category: p.category,
        defaults: p.defaults,
        fields: p.fields,
        hint: p.hint,
        capabilities: { ...p.capabilities, webhookUrl: undefined }, // 函式無法序列化
        hasWebhook: typeof p.capabilities.webhookUrl === 'function',
        deprecated: !!p.deprecated,
    }));
    return NextResponse.json({ ok: true, categories: CATEGORIES, providers });
});
