import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;

export async function getEmbedding(text: string): Promise<number[]> {
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is missing');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-2-preview' });

    try {
        const result = await model.embedContent(text);
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
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-2-preview' });

    try {
        const batchResult = await model.batchEmbedContents({
            requests: texts.map((t) => ({
                content: { role: 'user', parts: [{ text: t }] },
            })),
        });
        return batchResult.embeddings.map((e) => e.values);
    } catch (error) {
        console.error('[Embeddings] Failed to generate batch embeddings:', error);
        throw error;
    }
}
