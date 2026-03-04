import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local in the root directory
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const TABLE = process.env.DYNAMODB_TABLE_AI_MODELS || 'jvtutorcorner-ai-models';
const region = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN || process.env.CI_AWS_SESSION_TOKEN;

// Initialize DynamoDB client
const client = new DynamoDBClient({
    region,
    credentials: accessKey && secretKey ? {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
        ...(sessionToken ? { sessionToken } : {})
    } : undefined,
});

const ddbDocClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
});

const AI_MODELS = [
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

async function initializeAIModels() {
    console.log('🤖 AI Models Initialization');
    console.log(`📊 Table: ${TABLE}`);
    console.log(`🌍 Region: ${region}`);
    console.log(`📅 Timestamp: ${new Date().toISOString()}`);
    console.log('');

    let successCount = 0;
    let failureCount = 0;

    for (const model of AI_MODELS) {
        try {
            console.log(`📝 Writing ${model.provider}...`);
            console.log(`   Models: ${model.models.join(', ')}`);

            await ddbDocClient.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: model,
                })
            );

            console.log(`✅ ${model.provider} written successfully`);
            successCount++;
        } catch (error) {
            console.error(`❌ Failed to write ${model.provider}:`, error?.message || error);
            failureCount++;
        }
    }

    console.log('');
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║              INITIALIZATION SUMMARY             ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`✅ Successful: ${successCount}/${AI_MODELS.length}`);
    console.log(`❌ Failed: ${failureCount}/${AI_MODELS.length}`);
    console.log('');

    if (failureCount === 0) {
        console.log('🎉 All AI models initialized successfully!');
        console.log('');
        console.log('📖 Next steps:');
        console.log('   1. Verify in AWS Console DynamoDB > Tables > jvtutorcorner-ai-models');
        console.log('   2. Try fetching: curl http://localhost:3000/api/admin/ai-models');
        console.log('');
    } else {
        console.error('⚠️  Some models failed to initialize. Please check logs above.');
        process.exit(1);
    }
}

(async () => {
    try {
        await initializeAIModels();
        process.exit(0);
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
})();

