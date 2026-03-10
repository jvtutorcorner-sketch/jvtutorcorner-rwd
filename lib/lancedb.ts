import * as lancedb from '@lancedb/lancedb';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'lancedb');

export interface MemoryEntry {
    vector: number[];
    text: string;
    metadata: Record<string, any>;
}

export async function getDb() {
    return await lancedb.connect(DB_PATH);
}

export async function getOrCreateTable(tableName: string) {
    const db = await getDb();
    const tableNames = await db.tableNames();

    if (tableNames.includes(tableName)) {
        return await db.openTable(tableName);
    }

    // Create an empty table with a schema
    // Note: LanceDB can infer schema from the first insertion, 
    // but we can also create it explicitly.
    // For now, let's just use a dummy entry to force schema creation if it doesn't exist.
    // However, it's better to use `createTable` with an initial set of data.
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
