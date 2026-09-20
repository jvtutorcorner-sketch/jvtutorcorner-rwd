// lib/integrations/registry/index.ts
//
// Provider Registry 匯總與查詢工具。純資料 / 純函式，client 與 server 皆可 import。

import type { ProviderDefinition, IntegrationCategory, FieldDef } from './types';
import { PAYMENT_PROVIDERS } from './providers/payment';
import { CHANNEL_PROVIDERS } from './providers/channel';
import { EMAIL_PROVIDERS } from './providers/email';
import { AI_PROVIDERS } from './providers/ai';
import { AI_CONTAINER_PROVIDERS } from './providers/aiContainer';
import { DATABASE_PROVIDERS } from './providers/database';

export * from './types';

const ALL: ProviderDefinition[] = [
    ...PAYMENT_PROVIDERS,
    ...CHANNEL_PROVIDERS,
    ...EMAIL_PROVIDERS,
    ...AI_PROVIDERS,
    ...AI_CONTAINER_PROVIDERS,
    ...DATABASE_PROVIDERS,
];

export const PROVIDERS: Record<string, ProviderDefinition> = Object.fromEntries(
    ALL.map((p) => [p.type, p])
);

export const CATEGORIES: { id: IntegrationCategory; label: string; sortOrder: number }[] = [
    { id: 'channel', label: '通訊渠道', sortOrder: 10 },
    { id: 'payment', label: '金流服務', sortOrder: 20 },
    { id: 'email', label: '郵件服務', sortOrder: 30 },
    { id: 'ai', label: 'AI 模型服務', sortOrder: 40 },
    { id: 'ai-container', label: 'AI 應用', sortOrder: 50 },
    { id: 'database', label: '資料庫 / 知識庫', sortOrder: 60 },
];

/** 取得某 type 的 provider 定義（找不到回 undefined，呼叫端可用 UNKNOWN_PROVIDER 兜底） */
export function getProvider(type: string): ProviderDefinition | undefined {
    return PROVIDERS[String(type || '').toUpperCase()];
}

export function listProviders(): ProviderDefinition[] {
    return ALL.slice();
}

export function listProvidersByCategory(category: IntegrationCategory): ProviderDefinition[] {
    return ALL.filter((p) => p.category === category);
}

/** 某 type 的密鑰欄位 key 集合（供 mask / mergeSecrets 使用，較 regex 精準） */
export function secretKeysOf(type: string): string[] {
    const p = getProvider(type);
    if (!p) return [];
    return p.fields.filter((f) => f.secret).map((f) => f.key);
}

/** 某 type 的必填欄位 key */
export function requiredKeysOf(type: string): string[] {
    const p = getProvider(type);
    if (!p) return [];
    return p.fields.filter((f) => f.required).map((f) => f.key);
}

/**
 * 把歷史髒資料的 config key 正規化：套用該 provider 的 legacyKeyAliases。
 * 不改動值，只重新命名 key（新 key 已存在時不覆蓋）。
 */
export function normalizeLegacyConfig(type: string, config: Record<string, any> | undefined | null): Record<string, any> {
    if (!config || typeof config !== 'object') return {};
    const p = getProvider(type);
    const aliases = p?.legacyKeyAliases;
    if (!aliases) return { ...config };
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(config)) {
        const canonical = aliases[key] || key;
        if (!(canonical in out) || out[canonical] == null || out[canonical] === '') {
            out[canonical] = val;
        }
    }
    return out;
}

export interface ValidationResult {
    ok: boolean;
    errors: { key: string; message: string }[];
}

/**
 * 依 registry 驗證 config。
 * @param partial true 時（如編輯 / merge 場景）不強制必填欄位存在，只驗證有送的欄位。
 */
export function validateConfig(
    type: string,
    config: Record<string, any> | undefined | null,
    opts: { partial?: boolean } = {}
): ValidationResult {
    const p = getProvider(type);
    const errors: ValidationResult['errors'] = [];
    if (!p) {
        // 未知 type 不做欄位驗證（僅允許檢視 / 刪除），視為通過
        return { ok: true, errors };
    }
    const cfg = config || {};
    if (!opts.partial) {
        for (const f of p.fields) {
            if (!f.required) continue;
            const v = f.path ? getPath(cfg, f.path) : cfg[f.key];
            if (v == null || v === '') {
                errors.push({ key: f.key, message: `${f.label} 為必填` });
            }
        }
    }
    return { ok: errors.length === 0, errors };
}

function getPath(obj: any, path: string): any {
    return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

/** 未知 type 的兜底定義：把 config 的每個 key 當成文字欄位，名字像密鑰的標記為 secret */
export function unknownProvider(type: string): ProviderDefinition {
    return {
        type: String(type || 'UNKNOWN').toUpperCase(),
        category: 'channel',
        defaults: { label: type || '未知整合', desc: '未在系統目錄中的歷史整合，可檢視或刪除', icon: '❓', badge: 'bg-gray-100 text-gray-600', sortOrder: 999, visible: false },
        capabilities: { testConnection: false, multiInstance: true },
        deprecated: true,
        fields: [],
    };
}

/** 依實際 config 動態補出未知欄位（供 SchemaForm 顯示 registry 未涵蓋的舊 key） */
export function extraFieldsFor(type: string, config: Record<string, any> | undefined | null): FieldDef[] {
    const p = getProvider(type);
    const known = new Set((p?.fields || []).map((f) => f.key));
    const out: FieldDef[] = [];
    for (const key of Object.keys(config || {})) {
        if (known.has(key) || key === 'customScript') continue;
        const secret = /(secret|token|password|passwd|apikey|key|pass)/i.test(key);
        out.push({ key, label: key, type: secret ? 'password' : 'text', secret });
    }
    return out;
}
