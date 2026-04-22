import { QdrantClient } from '@qdrant/js-client-rest';

const url = process.env.QDRANT_URL || 'http://localhost:6333';
const apiKey = process.env.QDRANT_API_KEY;

export const qdrantClient = new QdrantClient({
    url,
    apiKey,
});

export async function ensureCollection(collectionName: string, vectorSize: number) {
    try {
        const collections = await qdrantClient.getCollections();
        const exists = collections.collections.some((c) => c.name === collectionName);

        if (!exists) {
            console.log(`[Qdrant] Creating collection: ${collectionName}`);
            await qdrantClient.createCollection(collectionName, {
                vectors: {
                    size: vectorSize,
                    distance: 'Cosine',
                },
            });
        }
    } catch (error) {
        console.error('[Qdrant] Failed to ensure collection:', error);
        throw error;
    }
}
