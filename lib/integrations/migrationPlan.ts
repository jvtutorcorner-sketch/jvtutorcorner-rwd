// lib/integrations/migrationPlan.ts
//
// 舊表 → 新表遷移的「純函式」計畫。無 I/O、無環境相依，方便離線單元測試。
// 遷移腳本（scripts/migrate-integrations.mjs）呼叫 planMigration 產出寫入計畫，
// 由腳本負責實際 DynamoDB 讀寫。

import { normalizeLegacyConfig, getProvider } from './registry';

export interface LegacyItem {
    integrationId?: string;
    userId?: string;
    type?: string;
    name?: string;
    config?: Record<string, any>;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface PlannedRecord {
    integrationId: string;
    type: string;
    category?: string;
    name: string;
    config: Record<string, any>;
    status: 'ACTIVE' | 'INACTIVE';
    isDefault: boolean;
    customScript?: string;
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
    legacy: { userId?: string; type?: string };
    schemaVersion: 2;
}

export interface MigrationPlan {
    records: PlannedRecord[];
    skipped: { reason: string; item: LegacyItem }[];
    warnings: string[];
    /** 每個 type 被選為 default 的 integrationId，供人工確認 */
    defaultsByType: Record<string, string>;
    idsRegenerated: string[];   // 因缺 id 或撞號而重新產生的（LINE webhook 需重設）
}

function cleanConfig(config: Record<string, any> | undefined): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(config || {})) {
        if (v == null) continue;
        if (typeof v === 'string') {
            const trimmed = v.trim();
            if (trimmed === '') continue;
            out[k] = trimmed;
        } else {
            out[k] = v;
        }
    }
    // models：字串 → 陣列
    if (typeof out.models === 'string') {
        out.models = out.models.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    return out;
}

/**
 * @param genId 產生新 UUID 的函式（由呼叫端注入 randomUUID，保持本檔純淨）
 */
export function planMigration(items: LegacyItem[], genId: () => string): MigrationPlan {
    const skipped: MigrationPlan['skipped'] = [];
    const warnings: string[] = [];
    const idsRegenerated: string[] = [];

    // 1. 過濾非整合資料（無 type，如 make-settings）
    const valid = items.filter((it) => {
        if (!it.type) {
            skipped.push({ reason: '缺少 type（可能是 make-settings 等非整合資料）', item: it });
            return false;
        }
        return true;
    });

    // 2. 建立紀錄、正規化、指派 id
    const seenIds = new Set<string>();
    const records: PlannedRecord[] = valid.map((it) => {
        const type = String(it.type).toUpperCase();
        const normalized = cleanConfig(normalizeLegacyConfig(type, it.config));
        const customScript = normalized.customScript;
        delete normalized.customScript;

        let id = it.integrationId;
        if (!id) {
            id = genId();
            idsRegenerated.push(id);
            warnings.push(`type=${type} userId=${it.userId ?? '?'} 缺少 integrationId，已產生新 id（若為 LINE 需重設 webhook URL）`);
        } else if (seenIds.has(id)) {
            const oldId = id;
            id = genId();
            idsRegenerated.push(id);
            warnings.push(`integrationId=${oldId} 重複，第二筆改用新 id ${id}`);
        }
        seenIds.add(id);

        return {
            integrationId: id,
            type,
            category: getProvider(type)?.category,
            name: it.name || getProvider(type)?.defaults.label || type,
            config: normalized,
            status: (String(it.status).toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE') as 'ACTIVE' | 'INACTIVE',
            isDefault: false,
            ...(customScript ? { customScript } : {}),
            createdAt: it.createdAt || new Date(0).toISOString(),
            updatedAt: it.updatedAt || it.createdAt || new Date(0).toISOString(),
            createdBy: it.userId,
            legacy: { userId: it.userId, type: it.type },
            schemaVersion: 2 as const,
        };
    });

    // 3. 每個 type：最早的 ACTIVE 設為 default
    const defaultsByType: Record<string, string> = {};
    const byType = new Map<string, PlannedRecord[]>();
    for (const r of records) {
        if (!byType.has(r.type)) byType.set(r.type, []);
        byType.get(r.type)!.push(r);
    }
    for (const [type, group] of byType.entries()) {
        const activeSorted = group
            .filter((r) => r.status === 'ACTIVE')
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const chosen = activeSorted[0];
        if (chosen) {
            chosen.isDefault = true;
            defaultsByType[type] = chosen.integrationId;
            if (activeSorted.length > 1) {
                warnings.push(`type=${type} 有 ${activeSorted.length} 筆 ACTIVE，預設選最早建立的 ${chosen.integrationId}，請人工確認`);
            }
        }
    }

    return { records, skipped, warnings, defaultsByType, idsRegenerated };
}
