// lib/aiModelsService.ts
import { ddbDocClient } from './dynamo';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.DYNAMODB_TABLE_AI_MODELS || 'jvtutorcorner-ai-models';

export type AIModelSource = {
    provider: string; // PK: OPENAI, ANTHROPIC, GEMINI
    models: string[];
    updatedAt: string;
};

const INITIAL_AI_MODELS: AIModelSource[] = [
    {
        provider: 'OPENAI',
        models: ['gpt-5.2', 'gpt-5.2-pro', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'o3-deep-research', 'o1-pro'],
        updatedAt: new Date().toISOString(),
    },
    {
        provider: 'ANTHROPIC',
        models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-3-5-sonnet'],
        updatedAt: new Date().toISOString(),
    },
    {
        provider: 'GEMINI',
        models: ['gemini-3.1-pro-preview', 'gemini-3-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
        updatedAt: new Date().toISOString(),
    },
];

export async function getAIModels(): Promise<AIModelSource[]> {
    try {
        const res = await ddbDocClient.send(new ScanCommand({ TableName: TABLE }));
        const items = (res.Items || []) as AIModelSource[];

        if (items.length === 0) {
            console.log('[AIModelsService] Table empty, initializing with default values...');
            await initializeAIModels();
            return INITIAL_AI_MODELS;
        }

        return items;
    } catch (error) {
        console.error('[AIModelsService] Error fetching AI models:', error);
        // Fallback to initial values if DB fails
        return INITIAL_AI_MODELS;
    }
}

export async function initializeAIModels() {
    const now = new Date().toISOString();
    for (const item of INITIAL_AI_MODELS) {
        try {
            await ddbDocClient.send(new PutCommand({
                TableName: TABLE,
                Item: { ...item, updatedAt: now }
            }));
        } catch (e) {
            console.warn(`[AIModelsService] Failed to initialize ${item.provider}:`, e);
        }
    }
}

export async function updateAIModels(provider: string, models: string[]) {
    const now = new Date().toISOString();
    await ddbDocClient.send(new PutCommand({
        TableName: TABLE,
        Item: {
            provider: provider.toUpperCase(),
            models,
            updatedAt: now
        }
    }));
}
