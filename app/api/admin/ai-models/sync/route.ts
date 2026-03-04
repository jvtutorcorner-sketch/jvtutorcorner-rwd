import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.DYNAMODB_TABLE_AI_MODELS || 'jvtutorcorner-ai-models';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { provider, apiKey } = body;

        if (!provider || !apiKey) {
            return NextResponse.json(
                { ok: false, error: 'Provider and apiKey are required for syncing.' },
                { status: 400 }
            );
        }

        if (provider !== 'OPENAI' && provider !== 'ANTHROPIC' && provider !== 'GEMINI') {
            return NextResponse.json(
                { ok: false, error: 'Unsupported provider for dynamic sync yet.' },
                { status: 400 }
            );
        }

        let fetchedModels: string[] = [];

        // 1. Fetch models from the Provider's API
        if (provider === 'GEMINI') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const response = await fetch(url);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Google API error: ${response.status} ${errorText}`);
            }

            const data = await response.json();
            const models = data.models || [];

            // Filter for generative models (those that support generateContent)
            fetchedModels = models
                .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
                .map((m: any) => m.name.replace('models/', ''))
                .filter((name: string) => !name.includes('vision') && !name.includes('embedding'));

            fetchedModels = [...new Set(fetchedModels)].sort();
        } else if (provider === 'OPENAI') {
            // Placeholder for OpenAI sync logic. Could use: https://api.openai.com/v1/models
            throw new Error('OpenAI sync not implemented yet.');
        } else if (provider === 'ANTHROPIC') {
            // Placeholder for Anthropic sync logic. 
            throw new Error('Anthropic sync not implemented yet.');
        }

        // 2. Fetch current models from DynamoDB
        const getRes = await ddbDocClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { provider: provider }
        }));

        const currentEntry = getRes.Item;
        const currentModels: string[] = currentEntry?.models || [];

        // 3. Compare and generate preview
        const addedModels = fetchedModels.filter(m => !currentModels.includes(m));
        const removedModels = currentModels.filter(m => !fetchedModels.includes(m));
        const unchangedModels = currentModels.filter(m => fetchedModels.includes(m));

        const preview = {
            fetchedCount: fetchedModels.length,
            currentCount: currentModels.length,
            added: addedModels,
            removed: removedModels,
            unchanged: unchangedModels,
            allLatestModels: fetchedModels, // Send the full list so UI can use it to update
        };

        return NextResponse.json({ ok: true, preview });

    } catch (error: any) {
        console.error(`[AI Models Sync API] POST error:`, error);
        return NextResponse.json(
            { ok: false, error: error.message || 'Failed to sync AI models.' },
            { status: 500 }
        );
    }
}
