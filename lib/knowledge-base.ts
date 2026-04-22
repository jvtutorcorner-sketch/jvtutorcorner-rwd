import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import { qdrantClient, ensureCollection } from './qdrant';
import { getEmbedding } from './embeddings';

const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'knowledge_base';
const VECTOR_SIZE = 768; // Gemini embedding-2-preview size. Adjust if using different model.

export interface KnowledgeMetadata {
    id?: string;
    title: string;
    category: string;
    tags: string[];
    language: string;
    version: string;
    updated_at: string;
    source?: string;
    [key: string]: any;
}

export interface KnowledgeItem {
    metadata: KnowledgeMetadata;
    content: string;
}

/**
 * Parses a knowledge base markdown file with YAML frontmatter
 */
export function parseKnowledgeFile(filePath: string): KnowledgeItem {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

    if (!match) {
        throw new Error(`Invalid knowledge file format: ${filePath}. Missing YAML frontmatter.`);
    }

    const frontmatter = yaml.load(match[1]) as KnowledgeMetadata;
    const content = match[2].trim();

    return {
        metadata: {
            ...frontmatter,
            source: path.basename(filePath),
            updated_at: frontmatter.updated_at || new Date().toISOString(),
        },
        content,
    };
}

/**
 * Syncs a single knowledge item to Qdrant
 */
export async function syncKnowledgeItem(item: KnowledgeItem) {
    await ensureCollection(COLLECTION_NAME, VECTOR_SIZE);

    const id = item.metadata.id || uuidv4();
    console.log(`[KB] Syncing item: ${item.metadata.title} (${id})`);

    // Generate embedding for the content
    // We include title and tags in the embedding context for better retrieval
    const textToEmbed = `Title: ${item.metadata.title}\nCategory: ${item.metadata.category}\nTags: ${item.metadata.tags.join(', ')}\n\nContent:\n${item.content}`;
    const vector = await getEmbedding(textToEmbed);

    await qdrantClient.upsert(COLLECTION_NAME, {
        wait: true,
        points: [
            {
                id: id,
                vector: vector,
                payload: {
                    ...item.metadata,
                    content: item.content,
                },
            },
        ],
    });

    return id;
}

/**
 * Searches the knowledge base
 */
export async function searchKnowledge(query: string, limit: number = 5) {
    const vector = await getEmbedding(query);

    const results = await qdrantClient.search(COLLECTION_NAME, {
        vector: vector,
        limit: limit,
        with_payload: true,
    });

    return results.map((r) => ({
        score: r.score,
        metadata: r.payload as unknown as KnowledgeMetadata,
        content: r.payload?.content as string,
    }));
}
