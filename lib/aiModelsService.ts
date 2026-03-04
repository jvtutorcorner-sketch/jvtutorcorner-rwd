// lib/aiModelsService.ts
import { ddbDocClient } from './dynamo';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.DYNAMODB_TABLE_AI_MODELS || 'jvtutorcorner-ai-models';

export type AIModelSource = {
    provider: string; // PK: OPENAI, ANTHROPIC, GEMINI
    models: string[];
    updatedAt: string;
};

export async function getAIModels(): Promise<AIModelSource[]> {
    try {
        const res = await ddbDocClient.send(new ScanCommand({ TableName: TABLE }));
        return (res.Items || []) as AIModelSource[];
    } catch (error) {
        console.error('[AIModelsService] Error fetching AI models:', error);
        // Return empty list on failure to avoid giving false impression that models exist in DB
        return [];
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
