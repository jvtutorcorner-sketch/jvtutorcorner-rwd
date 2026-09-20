// lib/ai/skillsStore.ts
//
// AI 技能的 DB-backed store（server-only）。code 的 AI_SKILLS 當 seed，
// DynamoDB 覆蓋同 id、或新增自訂技能；deleted tombstone 用來隱藏 code 預設。
// id 不可變（AI_CHATROOM 的 linkedSkillId 依賴它）。60 秒 in-memory cache。

import 'server-only';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { AI_SKILLS, type AISkill } from '@/lib/ai-skills';

const TABLE = process.env.DYNAMODB_TABLE_AI_SKILLS || 'jvtutorcorner-ai-skills';

export interface SkillRecord extends AISkill {
    enabled: boolean;
    sortOrder: number;
    source: 'seed' | 'seed-override' | 'custom';
    updatedAt?: string;
    updatedBy?: string;
}

let cache: { data: SkillRecord[]; ts: number } | null = null;
const TTL = 60_000;

function seedMap(): Map<string, SkillRecord> {
    const m = new Map<string, SkillRecord>();
    AI_SKILLS.forEach((s, i) => m.set(s.id, { ...s, enabled: true, sortOrder: i * 10, source: 'seed' }));
    return m;
}

async function loadAll(): Promise<SkillRecord[]> {
    if (cache && Date.now() - cache.ts < TTL) return cache.data;
    const merged = seedMap();
    try {
        const res = await ddbDocClient.send(new ScanCommand({ TableName: TABLE }));
        for (const item of res.Items || []) {
            if (!item.id) continue;
            if (item.deleted) { merged.delete(item.id); continue; }
            const isSeed = AI_SKILLS.some((s) => s.id === item.id);
            merged.set(item.id, {
                id: item.id,
                label: item.label ?? merged.get(item.id)?.label ?? item.id,
                icon: item.icon ?? merged.get(item.id)?.icon ?? '🧩',
                desc: item.desc ?? merged.get(item.id)?.desc ?? '',
                prompt: item.prompt ?? merged.get(item.id)?.prompt ?? '',
                enabled: item.enabled !== false,
                sortOrder: item.sortOrder ?? merged.get(item.id)?.sortOrder ?? 999,
                source: isSeed ? 'seed-override' : 'custom',
                updatedAt: item.updatedAt,
                updatedBy: item.updatedBy,
            });
        }
    } catch (e: any) {
        // 表不存在或無憑證 → 回 code 預設
        if (e?.name !== 'ResourceNotFoundException') console.warn('[skillsStore] load failed:', e?.message || e);
    }
    const data = [...merged.values()].sort((a, b) => a.sortOrder - b.sortOrder);
    cache = { data, ts: Date.now() };
    return data;
}

function invalidate() { cache = null; }

export async function listSkills(opts: { includeDisabled?: boolean } = {}): Promise<SkillRecord[]> {
    const all = await loadAll();
    return opts.includeDisabled ? all : all.filter((s) => s.enabled);
}

export async function getSkill(id: string): Promise<SkillRecord | undefined> {
    return (await loadAll()).find((s) => s.id === id);
}

export interface SkillInput {
    id?: string; label: string; icon?: string; desc?: string; prompt: string; enabled?: boolean; sortOrder?: number;
}

function slugify(label: string): string {
    return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `skill-${Date.now()}`;
}

export async function upsertSkill(input: SkillInput, actor?: string): Promise<SkillRecord> {
    const id = input.id || `custom-${slugify(input.label)}`;
    const item = {
        id,
        label: input.label,
        icon: input.icon || '🧩',
        desc: input.desc || '',
        prompt: input.prompt,
        enabled: input.enabled !== false,
        sortOrder: input.sortOrder ?? 500,
        updatedAt: new Date().toISOString(),
        updatedBy: actor,
    };
    await ddbDocClient.send(new PutCommand({ TableName: TABLE, Item: item }));
    invalidate();
    return (await getSkill(id))!;
}

/** 刪除：自訂技能直接刪；seed 技能以 tombstone 隱藏 */
export async function deleteSkill(id: string, actor?: string): Promise<void> {
    const isSeed = AI_SKILLS.some((s) => s.id === id);
    if (isSeed) {
        await ddbDocClient.send(new PutCommand({ TableName: TABLE, Item: { id, deleted: true, updatedAt: new Date().toISOString(), updatedBy: actor } }));
    } else {
        await ddbDocClient.send(new DeleteCommand({ TableName: TABLE, Key: { id } }));
    }
    invalidate();
}

/** 還原 seed 技能為程式預設（刪除其 DB 覆寫） */
export async function resetSkill(id: string): Promise<void> {
    await ddbDocClient.send(new DeleteCommand({ TableName: TABLE, Key: { id } }));
    invalidate();
}
