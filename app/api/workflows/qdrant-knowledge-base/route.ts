import { NextRequest, NextResponse } from 'next/server';
import { qdrantClient, ensureCollection } from '@/lib/qdrant';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';

/**
 * Qdrant 知識庫操作 API
 * 用於將文檔存入 Qdrant 並生成向量嵌入
 */
export async function POST(req: NextRequest) {
    try {
        const { collectionName, vectorSize, documents } = await req.json();

        if (!collectionName) {
            return NextResponse.json({ ok: false, error: 'Collection name is required' }, { status: 400 });
        }

        if (!documents) {
            return NextResponse.json({ ok: false, error: 'Documents are required' }, { status: 400 });
        }

        const vSize = vectorSize || 1536;

        // Ensure collection exists
        await ensureCollection(collectionName, vSize);

        // Parse documents
        let docList: Array<{ id: string; text: string; metadata?: Record<string, any> }> = [];
        try {
            if (typeof documents === 'string') {
                // Try to parse as JSON
                docList = JSON.parse(documents);
            } else {
                docList = documents;
            }
        } catch (e) {
            // If not JSON, treat as single text document
            docList = [
                {
                    id: `doc-${Date.now()}`,
                    text: documents,
                    metadata: { type: 'text' }
                }
            ];
        }

        if (!Array.isArray(docList) || docList.length === 0) {
            return NextResponse.json({ ok: false, error: 'Documents must be a non-empty array or valid text' }, { status: 400 });
        }

        console.log(`[qdrant-knowledge-base] Processing ${docList.length} documents for collection: ${collectionName}`);

        // Generate embeddings using Google Generative AI
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');
        const model = genAI.getGenerativeModel({ model: 'embedding-001' });

        const points: Array<{
            id: number;
            vector: number[];
            payload: Record<string, any>;
        }> = [];

        for (let i = 0; i < docList.length; i++) {
            const doc = docList[i];
            const text = doc.text || String(doc);

            try {
                // Generate embedding
                const embeddingResult = await model.embedContent(text);
                
                const embedding = embeddingResult.embedding?.values;

                if (!embedding || embedding.length === 0) {
                    console.warn(`[qdrant-knowledge-base] Failed to generate embedding for doc ${doc.id}`);
                    continue;
                }

                points.push({
                    id: i + 1,
                    vector: embedding,
                    payload: {
                        id: doc.id || `doc-${i}`,
                        text,
                        metadata: doc.metadata || {},
                        timestamp: new Date().toISOString(),
                    }
                });
            } catch (embedError: any) {
                console.error(`[qdrant-knowledge-base] Embedding error for doc ${doc.id}:`, embedError.message);
                // Continue with next document on embedding failure
            }
        }

        if (points.length === 0) {
            return NextResponse.json({ ok: false, error: 'Failed to generate embeddings for any documents' }, { status: 500 });
        }

        // Upsert points to Qdrant
        await qdrantClient.upsert(collectionName, {
            points: points,
        });

        console.log(`[qdrant-knowledge-base] Successfully stored ${points.length} vectors in collection: ${collectionName}`);

        return NextResponse.json({
            ok: true,
            data: {
                collectionName,
                vectorSize: vSize,
                documentsProcessed: docList.length,
                pointsStored: points.length,
                timestamp: new Date().toISOString(),
                status: 'stored',
            },
        });
    } catch (error: any) {
        console.error('[qdrant-knowledge-base] error:', error);
        return NextResponse.json({
            ok: false,
            error: error?.message || 'Qdrant knowledge base operation failed',
        }, { status: 500 });
    }
}

/**
 * GET - 查詢知識庫
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const collectionName = searchParams.get('collection');
        const query = searchParams.get('query');
        const limit = parseInt(searchParams.get('limit') || '10');

        if (!collectionName || !query) {
            return NextResponse.json({ ok: false, error: 'Collection name and query are required' }, { status: 400 });
        }

        // Generate embedding for query
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');
        const model = genAI.getGenerativeModel({ model: 'embedding-001' });

        const embeddingResult = await model.embedContent(query);

        const queryVector = embeddingResult.embedding?.values;

        if (!queryVector) {
            return NextResponse.json({ ok: false, error: 'Failed to generate query embedding' }, { status: 500 });
        }

        // Search in Qdrant
        const results = await qdrantClient.search(collectionName, {
            vector: queryVector,
            limit,
        });

        console.log(`[qdrant-knowledge-base] Search in ${collectionName}: found ${results.length} results`);

        return NextResponse.json({
            ok: true,
            data: {
                collectionName,
                query,
                results: results.map((r: any) => ({
                    id: r.payload?.id,
                    text: r.payload?.text,
                    score: r.score,
                    metadata: r.payload?.metadata,
                })),
            },
        });
    } catch (error: any) {
        console.error('[qdrant-knowledge-base] search error:', error);
        return NextResponse.json({
            ok: false,
            error: error?.message || 'Qdrant search failed',
        }, { status: 500 });
    }
}
