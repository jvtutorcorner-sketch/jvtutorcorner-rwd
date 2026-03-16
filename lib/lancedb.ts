import * as lancedb from '@lancedb/lancedb';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'lancedb');

export interface MemoryEntry {
    vector: number[];
    text: string;
    metadata: Record<string, any>;
}

let dbInstance: lancedb.Connection | null = null;

export async function getDb() {
    if (dbInstance) return dbInstance;
    
    try {
        dbInstance = await lancedb.connect(DB_PATH);
        console.log(`[LanceDB] Connected to ${DB_PATH}`);
        return dbInstance;
    } catch (error) {
        console.error('[LanceDB] Connection failed:', error);
        throw error;
    }
}

export async function getOrCreateTable(tableName: string) {
    const db = await getDb();
    const tableNames = await db.tableNames();

    if (tableNames.includes(tableName)) {
        return await db.openTable(tableName);
    }

    console.log(`[LanceDB] Table "${tableName}" not found. It will be created upon first insertion.`);
    return null;
}

export async function addMemory(tableName: string, entries: Omit<MemoryEntry, 'vector'>[]) {
    const db = await getDb();
    const { getEmbedding } = await import('./embeddings');

    const dataWithVectors = await Promise.all(
        entries.map(async (entry) => ({
            ...entry,
            vector: await getEmbedding(entry.text),
            timestamp: new Date().toISOString(),
        }))
    );

    const tableNames = await db.tableNames();
    if (tableNames.includes(tableName)) {
        const table = await db.openTable(tableName);
        await table.add(dataWithVectors);
    } else {
        await db.createTable(tableName, dataWithVectors);
    }
}

export async function searchMemory(tableName: string, query: string, limit: number = 5) {
    const db = await getDb();
    const tableNames = await db.tableNames();

    if (!tableNames.includes(tableName)) {
        return [];
    }

    const { getEmbedding } = await import('./embeddings');
    const queryVector = await getEmbedding(query);
    const table = await db.openTable(tableName);

    const results = await table
        .vectorSearch(queryVector)
        .limit(limit)
        .toArray();

    return results;
}
