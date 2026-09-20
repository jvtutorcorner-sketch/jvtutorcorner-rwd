// lib/integrations/catalogStore.ts
//
// 服務目錄的後台覆寫（server-only）。整份文件存在 integration-config 表的單一 item
// { configKey: 'catalog-overrides' }（同 pricing/appPermissions 的 whole-doc 模式）。
// 讀不到就回空覆寫，不自動寫入。registry defaults 疊上這裡的 overrides = 最終目錄外觀。

import 'server-only';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.DYNAMODB_TABLE_INTEGRATION_CONFIG || 'jvtutorcorner-integration-config';
const CONFIG_KEY = 'catalog-overrides';

export interface ProviderOverride {
    visible?: boolean;
    sortOrder?: number;
    label?: string;
    desc?: string;
    category?: string;
    icon?: string;
}

export interface CatalogOverrides {
    overrides: Record<string, ProviderOverride>;   // key = provider type
    updatedAt?: string;
    updatedBy?: string;
}

export async function getCatalogOverrides(): Promise<CatalogOverrides> {
    try {
        const res = await ddbDocClient.send(new GetCommand({ TableName: TABLE, Key: { configKey: CONFIG_KEY } }));
        if (res.Item?.overrides) return { overrides: res.Item.overrides, updatedAt: res.Item.updatedAt, updatedBy: res.Item.updatedBy };
    } catch (e: any) {
        if (e?.name !== 'ResourceNotFoundException') console.warn('[catalogStore] read failed:', e?.message || e);
    }
    return { overrides: {} };
}

export async function saveCatalogOverrides(overrides: Record<string, ProviderOverride>, actor?: string): Promise<void> {
    await ddbDocClient.send(new PutCommand({
        TableName: TABLE,
        Item: { configKey: CONFIG_KEY, overrides, updatedAt: new Date().toISOString(), updatedBy: actor },
    }));
}

/** 把 overrides 套到一組 provider 定義的 defaults 上（純函式，回傳新物件） */
export function applyOverrides<T extends { type: string; defaults: any }>(providers: T[], overrides: Record<string, ProviderOverride>): T[] {
    return providers.map((p) => {
        const o = overrides[p.type];
        if (!o) return p;
        return {
            ...p,
            defaults: {
                ...p.defaults,
                ...(o.visible !== undefined ? { visible: o.visible } : {}),
                ...(o.sortOrder !== undefined ? { sortOrder: o.sortOrder } : {}),
                ...(o.label ? { label: o.label } : {}),
                ...(o.desc ? { desc: o.desc } : {}),
                ...(o.icon ? { icon: o.icon } : {}),
            },
            ...(o.category ? { category: o.category } : {}),
        };
    });
}
