// lib/ai/agentsStore.ts
//
// Platform Agents 的 DB-backed store（server-only）。code 的 PLATFORM_AGENTS 當 seed，
// DynamoDB 覆蓋同 id 或新增自訂 agent；deleted tombstone 隱藏 code 預設。60 秒 cache。
// dispatch 提示由當前 agents 清單 runtime 組出（buildDispatchPrompt）。

import 'server-only';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { PLATFORM_AGENTS, buildDispatchPrompt, quickDispatch as quickDispatchWith, type PlatformAgent } from '@/lib/platform-agents';

const TABLE = process.env.DYNAMODB_TABLE_PLATFORM_AGENTS || 'jvtutorcorner-platform-agents';

export interface AgentRecord extends PlatformAgent {
    enabled: boolean;
    sortOrder: number;
    source: 'seed' | 'seed-override' | 'custom';
    updatedAt?: string;
    updatedBy?: string;
}

let cache: { data: AgentRecord[]; ts: number } | null = null;
const TTL = 60_000;

function seedMap(): Map<string, AgentRecord> {
    const m = new Map<string, AgentRecord>();
    PLATFORM_AGENTS.forEach((a, i) => m.set(a.id, { ...a, enabled: true, sortOrder: i * 10, source: 'seed' }));
    return m;
}

async function loadAll(): Promise<AgentRecord[]> {
    if (cache && Date.now() - cache.ts < TTL) return cache.data;
    const merged = seedMap();
    try {
        const res = await ddbDocClient.send(new ScanCommand({ TableName: TABLE }));
        for (const item of res.Items || []) {
            if (!item.id) continue;
            if (item.deleted) { merged.delete(item.id); continue; }
            const seed = merged.get(item.id);
            const isSeed = PLATFORM_AGENTS.some((a) => a.id === item.id);
            merged.set(item.id, {
                ...(seed || ({} as AgentRecord)),
                ...item,
                enabled: item.enabled !== false,
                sortOrder: item.sortOrder ?? seed?.sortOrder ?? 999,
                source: isSeed ? 'seed-override' : 'custom',
            } as AgentRecord);
        }
    } catch (e: any) {
        if (e?.name !== 'ResourceNotFoundException') console.warn('[agentsStore] load failed:', e?.message || e);
    }
    const data = [...merged.values()].sort((a, b) => a.sortOrder - b.sortOrder);
    cache = { data, ts: Date.now() };
    return data;
}

function invalidate() { cache = null; }

export async function listAgents(opts: { includeDisabled?: boolean } = {}): Promise<AgentRecord[]> {
    const all = await loadAll();
    return opts.includeDisabled ? all : all.filter((a) => a.enabled);
}

export async function getAgent(id: string): Promise<AgentRecord | undefined> {
    return (await loadAll()).find((a) => a.id === id);
}

export async function upsertAgent(input: Partial<AgentRecord> & { id?: string; name: string }, actor?: string): Promise<AgentRecord> {
    const id = input.id || `custom-${(input.name || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
    const existing = await getAgent(id);
    const item: any = {
        // 以既有（或空）為底，套用輸入，確保必要欄位有值
        icon: '🤖', color: 'gray', badge: 'bg-gray-100 text-gray-700', category: '一般',
        desc: '', longDesc: '', keywords: [], capabilities: [],
        askPrompt: '', planPrompt: '', executePrompt: '', singlePrompt: '', exampleQuestions: [],
        ...(existing || {}),
        ...input,
        id,
        enabled: input.enabled !== false,
        sortOrder: input.sortOrder ?? existing?.sortOrder ?? 500,
        updatedAt: new Date().toISOString(),
        updatedBy: actor,
    };
    delete item.source;
    await ddbDocClient.send(new PutCommand({ TableName: TABLE, Item: item }));
    invalidate();
    return (await getAgent(id))!;
}

export async function deleteAgent(id: string, actor?: string): Promise<void> {
    const isSeed = PLATFORM_AGENTS.some((a) => a.id === id);
    if (isSeed) {
        await ddbDocClient.send(new PutCommand({ TableName: TABLE, Item: { id, deleted: true, updatedAt: new Date().toISOString(), updatedBy: actor } }));
    } else {
        await ddbDocClient.send(new DeleteCommand({ TableName: TABLE, Key: { id } }));
    }
    invalidate();
}

export async function resetAgent(id: string): Promise<void> {
    await ddbDocClient.send(new DeleteCommand({ TableName: TABLE, Key: { id } }));
    invalidate();
}

/** 以當前（含 DB 覆寫）的啟用 agents 組出 dispatch system prompt */
export async function getDispatchPrompt(): Promise<string> {
    const agents = await listAgents();
    return buildDispatchPrompt(agents);
}

/** 以當前啟用 agents 做關鍵字快速分派 */
export async function quickDispatchDb(userInput: string): Promise<PlatformAgent[]> {
    const agents = await listAgents();
    return quickDispatchWith(userInput, agents);
}
