// lib/integrations/store.ts
//
// 整合連線的資料存取層（server-only）。所有讀取整合設定的 consumer 都應改用這裡，
// 不要再各自 Scan 舊表。特色：
//   - 新表 `jvtutorcorner-integrations`，PK integrationId、GSI byType(type, createdAt)，支援同 type 多組連線 + isDefault。
//   - 讀取時若新表不存在或查無資料，且 INTEGRATIONS_LEGACY_FALLBACK 開啟，退回舊表（userId+type）並正規化 key。
//   - 寫入只寫新表；密鑰以 mergeSecrets 合併（遮罩 / 空值 = 不變更）。
//   - toPublicView 遮罩密鑰並附 secretsSet，供 API 回傳。
//
// 注意：本檔僅在 server 端使用（import 了 lib/dynamo）。

import 'server-only';
import { ddbDocClient } from '@/lib/dynamo';
import {
    GetCommand, PutCommand, DeleteCommand, ScanCommand, QueryCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { getProvider, secretKeysOf, normalizeLegacyConfig } from './registry';
import { mergeSecrets, maskConfig } from './mask';

const NEW_TABLE = process.env.DYNAMODB_TABLE_INTEGRATIONS || 'jvtutorcorner-integrations';
const OLD_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';
const BY_TYPE_INDEX = 'byType';
const FALLBACK_ENABLED = (process.env.INTEGRATIONS_LEGACY_FALLBACK ?? '1') !== '0';

export type IntegrationStatus = 'ACTIVE' | 'INACTIVE';

export interface IntegrationRecord {
    integrationId: string;
    type: string;
    category?: string;
    name: string;
    config: Record<string, any>;
    status: IntegrationStatus;
    isDefault?: boolean;
    customScript?: string;
    scriptEnabled?: boolean;
    lastTestedAt?: string;
    lastTestStatus?: 'OK' | 'FAIL';
    lastTestMessage?: string;
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
    updatedBy?: string;
    legacy?: { userId?: string; type?: string };
    schemaVersion?: number;
}

export interface PublicIntegrationView extends Omit<IntegrationRecord, 'config'> {
    config: Record<string, any>;   // 密鑰已遮罩
    secretsSet: string[];          // 目前已設定的密鑰欄位 key
}

function isResourceNotFound(e: any): boolean {
    return e?.name === 'ResourceNotFoundException' || e?.__type?.includes?.('ResourceNotFoundException');
}

/** 舊表資料列 → 新表紀錄形狀（不寫入，只供讀取 fallback 使用） */
function fromLegacy(item: any): IntegrationRecord {
    const type = String(item.type || '').toUpperCase();
    return {
        integrationId: item.integrationId || `legacy-${item.userId}-${type}`,
        type,
        category: getProvider(type)?.category,
        name: item.name || type,
        config: normalizeLegacyConfig(type, item.config),
        status: (item.status as IntegrationStatus) || 'ACTIVE',
        isDefault: false,
        customScript: item.config?.customScript,
        createdAt: item.createdAt || new Date(0).toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date(0).toISOString(),
        legacy: { userId: item.userId, type: item.type },
        schemaVersion: 1,
    };
}

async function scanLegacyByType(type?: string): Promise<IntegrationRecord[]> {
    if (!FALLBACK_ENABLED) return [];
    try {
        const input: any = { TableName: OLD_TABLE };
        if (type) {
            input.FilterExpression = '#t = :t';
            input.ExpressionAttributeNames = { '#t': 'type' };
            input.ExpressionAttributeValues = { ':t': type.toUpperCase() };
        }
        const res = await ddbDocClient.send(new ScanCommand(input));
        return (res.Items || []).filter((i: any) => i.type).map(fromLegacy);
    } catch (e: any) {
        console.warn('[integrations/store] legacy scan failed:', e?.message || e);
        return [];
    }
}

// ─────────────────────────────────────────────
// 讀取
// ─────────────────────────────────────────────

export async function listIntegrations(opts: { type?: string; category?: string; status?: IntegrationStatus } = {}): Promise<IntegrationRecord[]> {
    let items: IntegrationRecord[] = [];
    try {
        if (opts.type) {
            const res = await ddbDocClient.send(new QueryCommand({
                TableName: NEW_TABLE,
                IndexName: BY_TYPE_INDEX,
                KeyConditionExpression: '#t = :t',
                ExpressionAttributeNames: { '#t': 'type' },
                ExpressionAttributeValues: { ':t': opts.type.toUpperCase() },
            }));
            items = (res.Items || []) as IntegrationRecord[];
        } else {
            const res = await ddbDocClient.send(new ScanCommand({ TableName: NEW_TABLE }));
            items = (res.Items || []) as IntegrationRecord[];
        }
    } catch (e: any) {
        if (isResourceNotFound(e)) {
            items = await scanLegacyByType(opts.type);
        } else {
            throw e;
        }
    }

    // 新表查無資料 → 退回舊表（過渡期保險）
    if (items.length === 0 && FALLBACK_ENABLED) {
        const legacy = await scanLegacyByType(opts.type);
        if (legacy.length > 0) items = legacy;
    }

    if (opts.category) items = items.filter((i) => (i.category || getProvider(i.type)?.category) === opts.category);
    if (opts.status) items = items.filter((i) => i.status === opts.status);
    return items;
}

export async function getIntegration(integrationId: string): Promise<IntegrationRecord | null> {
    try {
        const res = await ddbDocClient.send(new GetCommand({ TableName: NEW_TABLE, Key: { integrationId } }));
        if (res.Item) return res.Item as IntegrationRecord;
    } catch (e: any) {
        if (!isResourceNotFound(e)) throw e;
    }
    // fallback：舊表以 integrationId scan
    if (FALLBACK_ENABLED) {
        try {
            const res = await ddbDocClient.send(new ScanCommand({
                TableName: OLD_TABLE,
                FilterExpression: 'integrationId = :id',
                ExpressionAttributeValues: { ':id': integrationId },
            }));
            if (res.Items && res.Items[0]) return fromLegacy(res.Items[0]);
        } catch (e: any) {
            console.warn('[integrations/store] legacy getIntegration failed:', e?.message || e);
        }
    }
    return null;
}

/** 某 type 的 ACTIVE 連線，依 isDefault desc、createdAt asc 排序 */
export async function getActiveByType(type: string): Promise<IntegrationRecord[]> {
    const items = await listIntegrations({ type, status: 'ACTIVE' });
    return items.sort((a, b) => {
        if (!!b.isDefault !== !!a.isDefault) return b.isDefault ? 1 : -1;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
}

export async function getDefault(type: string): Promise<IntegrationRecord | null> {
    const active = await getActiveByType(type);
    return active[0] || null;
}

/** 依偏好順序取第一個可用的 ACTIVE 連線（取代 llmClient 的 provider 迴圈） */
export async function getFirstActiveOf(types: string[]): Promise<IntegrationRecord | null> {
    for (const t of types) {
        const d = await getDefault(t);
        if (d) return d;
    }
    return null;
}

// ─────────────────────────────────────────────
// 寫入
// ─────────────────────────────────────────────

export interface CreateInput {
    type: string;
    name?: string;
    config: Record<string, any>;
    status?: IntegrationStatus;
    customScript?: string;
    scriptEnabled?: boolean;
    isDefault?: boolean;
}

export async function createIntegration(input: CreateInput, actor?: string): Promise<IntegrationRecord> {
    const type = String(input.type).toUpperCase();
    const now = new Date().toISOString();
    // 該 type 目前是否已有任何連線 → 第一筆自動設為 default
    const existing = await listIntegrations({ type });
    const isFirst = existing.length === 0;
    const record: IntegrationRecord = {
        integrationId: randomUUID(),
        type,
        category: getProvider(type)?.category,
        name: (input.name || getProvider(type)?.defaults.label || type).trim(),
        config: mergeSecrets(input.config, {}, secretKeysOf(type)),
        status: input.status || 'ACTIVE',
        isDefault: input.isDefault ?? isFirst,
        ...(input.customScript ? { customScript: input.customScript } : {}),
        ...(input.scriptEnabled != null ? { scriptEnabled: input.scriptEnabled } : {}),
        createdAt: now,
        updatedAt: now,
        createdBy: actor,
        updatedBy: actor,
        schemaVersion: 2,
    };
    await ddbDocClient.send(new PutCommand({ TableName: NEW_TABLE, Item: record }));
    // 若指定為 default，取消同 type 其他 default
    if (record.isDefault) await unsetOtherDefaults(type, record.integrationId);
    return record;
}

export interface UpdatePatch {
    name?: string;
    config?: Record<string, any>;
    status?: IntegrationStatus;
    customScript?: string | null;
    scriptEnabled?: boolean;
}

export async function updateIntegration(integrationId: string, patch: UpdatePatch, actor?: string): Promise<IntegrationRecord | null> {
    const existing = await getIntegration(integrationId);
    if (!existing) return null;
    const type = existing.type;
    const now = new Date().toISOString();
    const merged: IntegrationRecord = {
        ...existing,
        name: patch.name ?? existing.name,
        config: patch.config ? mergeSecrets(patch.config, existing.config, secretKeysOf(type)) : existing.config,
        status: patch.status ?? existing.status,
        updatedAt: now,
        updatedBy: actor,
    };
    if (patch.customScript === null) delete merged.customScript;
    else if (patch.customScript != null) merged.customScript = patch.customScript;
    if (patch.scriptEnabled != null) merged.scriptEnabled = patch.scriptEnabled;

    // Upsert（不加 attribute_exists 條件）：existing 可能是從舊表 fallback 讀來的，
    // 尚未存在於新表；此時等於在編輯當下把該筆搬進新表，避免條件式寫入失敗。
    if (merged.schemaVersion == null) merged.schemaVersion = 2;
    if (!merged.category) merged.category = getProvider(type)?.category;
    await ddbDocClient.send(new PutCommand({ TableName: NEW_TABLE, Item: merged }));
    return merged;
}

export async function setStatus(integrationId: string, status: IntegrationStatus, actor?: string): Promise<IntegrationRecord | null> {
    return updateIntegration(integrationId, { status }, actor);
}

async function unsetOtherDefaults(type: string, keepId: string): Promise<void> {
    const items = await listIntegrations({ type });
    await Promise.all(items
        .filter((i) => i.integrationId !== keepId && i.isDefault)
        .map((i) => ddbDocClient.send(new UpdateCommand({
            TableName: NEW_TABLE,
            Key: { integrationId: i.integrationId },
            UpdateExpression: 'SET isDefault = :f, updatedAt = :u',
            ExpressionAttributeValues: { ':f': false, ':u': new Date().toISOString() },
        })).catch(() => undefined))
    );
}

export async function setDefault(integrationId: string, actor?: string): Promise<IntegrationRecord | null> {
    const target = await getIntegration(integrationId);
    if (!target) return null;
    await ddbDocClient.send(new UpdateCommand({
        TableName: NEW_TABLE,
        Key: { integrationId },
        UpdateExpression: 'SET isDefault = :t, updatedAt = :u, updatedBy = :by',
        ExpressionAttributeValues: { ':t': true, ':u': new Date().toISOString(), ':by': actor ?? null },
    }));
    await unsetOtherDefaults(target.type, integrationId);
    return { ...target, isDefault: true };
}

export async function deleteIntegration(integrationId: string): Promise<{ deleted: boolean; type?: string }> {
    const existing = await getIntegration(integrationId);
    if (!existing) return { deleted: false };
    await ddbDocClient.send(new DeleteCommand({ TableName: NEW_TABLE, Key: { integrationId } }));
    // 若刪除的是 default，把 default 交給同 type 最舊的 ACTIVE
    if (existing.isDefault) {
        const remaining = await getActiveByType(existing.type);
        if (remaining[0]) await setDefault(remaining[0].integrationId);
    }
    return { deleted: true, type: existing.type };
}

export async function recordTestResult(integrationId: string, result: { ok: boolean; message?: string }): Promise<void> {
    try {
        await ddbDocClient.send(new UpdateCommand({
            TableName: NEW_TABLE,
            Key: { integrationId },
            UpdateExpression: 'SET lastTestedAt = :at, lastTestStatus = :st, lastTestMessage = :msg',
            ExpressionAttributeValues: {
                ':at': new Date().toISOString(),
                ':st': result.ok ? 'OK' : 'FAIL',
                ':msg': (result.message || '').slice(0, 500),
            },
            ConditionExpression: 'attribute_exists(integrationId)',
        }));
    } catch (e: any) {
        // 舊表紀錄或不存在時忽略
        if (!isResourceNotFound(e) && e?.name !== 'ConditionalCheckFailedException') {
            console.warn('[integrations/store] recordTestResult failed:', e?.message || e);
        }
    }
}

// ─────────────────────────────────────────────
// 對外呈現
// ─────────────────────────────────────────────

/** 遮罩密鑰，附上目前已設定的密鑰欄位清單 */
export function toPublicView(record: IntegrationRecord): PublicIntegrationView {
    const secretKeys = secretKeysOf(record.type);
    const secretsSet = secretKeys.filter((k) => record.config?.[k] != null && record.config[k] !== '');
    return {
        ...record,
        config: maskConfig(record.config, secretKeys.length ? secretKeys : undefined),
        secretsSet,
    };
}

/** 非 admin 的精簡檢視：不含任何 config */
export function toSummaryView(record: IntegrationRecord) {
    return {
        integrationId: record.integrationId,
        type: record.type,
        category: record.category || getProvider(record.type)?.category,
        name: record.name,
        status: record.status,
        isDefault: !!record.isDefault,
    };
}
