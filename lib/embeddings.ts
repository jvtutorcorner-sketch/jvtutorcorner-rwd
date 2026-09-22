import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';
import { recordUsage } from '@/lib/ai/gateway/ledger';
import { embeddingUsageToMusd, estimateTokens } from '@/lib/ai/gateway/pricing';

const apiKey = process.env.GEMINI_API_KEY;
const EMBED_MODEL = 'gemini-embedding-2-preview';

// Embeddings are a distinct metering unit; the SDK doesn't return token counts,
// so estimate input tokens from text length and price at the embedding rate.
async function meterEmbedding(texts: string[]) {
    const tokens = texts.reduce((n, t) => n + estimateTokens(t), 0);
    try {
        await recordUsage({
            requestId: randomUUID(), costCenter: 'ai',
            actualCostMusd: embeddingUsageToMusd(EMBED_MODEL, tokens),
            feature: 'embedding', model: EMBED_MODEL, provider: 'GEMINI',
            inputTokens: tokens, outputTokens: 0, status: 'ok',
        });
    } catch (e) { console.warn('[Embeddings] metering failed (non-fatal)', e); }
}

export async function getEmbedding(text: string): Promise<number[]> {
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is missing');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: EMBED_MODEL });

    try {
        const result = await model.embedContent(text);
        await meterEmbedding([text]);
        return result.embedding.values;
    } catch (error) {
        console.error('[Embeddings] Failed to generate embedding:', error);
        throw error;
    }
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is missing');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: EMBED_MODEL });

    try {
        const batchResult = await model.batchEmbedContents({
            requests: texts.map((t) => ({
                content: { role: 'user', parts: [{ text: t }] },
            })),
        });
        await meterEmbedding(texts);
        return batchResult.embeddings.map((e) => e.values);
    } catch (error) {
        console.error('[Embeddings] Failed to generate batch embeddings:', error);
        throw error;
    }
}
