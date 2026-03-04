import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const region = process.env.AWS_REGION || 'ap-northeast-1';
const accessKey = process.env.AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
const apiKey = process.env.GEMINI_API_KEY;
const TABLE_NAME = 'jvtutorcorner-ai-models';

if (!apiKey) {
    console.error('❌ Missing GEMINI_API_KEY in .env.local');
    process.exit(1);
}

const client = new DynamoDBClient({
    region,
    credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
    },
});

const ddbDocClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
    },
});

async function fetchGoogleModels() {
    console.log('🔍 Fetching latest models from Google AI REST API...');
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Google API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const models = data.models || [];

        // Filter for generative models (those that support generateContent)
        const generativeModels = models
            .filter(m => m.supportedGenerationMethods.includes('generateContent'))
            .map(m => m.name.replace('models/', ''))
            .filter(name => !name.includes('vision') && !name.includes('embedding')); // Clean up some duplicates/specialized ones if needed

        return [...new Set(generativeModels)].sort(); // Deduplicate and sort
    } catch (error) {
        console.error('❌ Error fetching models from Google:', error);
        return null;
    }
}

async function syncModels() {
    const googleModels = await fetchGoogleModels();
    if (!googleModels || googleModels.length === 0) {
        console.error('❌ No models fetched from Google. Aborting sync.');
        return;
    }

    console.log(`✅ Fetched ${googleModels.length} models from Google:`);
    googleModels.forEach(m => console.log(`   - ${m}`));

    try {
        // 1. Get current models from DynamoDB
        console.log(`\n📚 Checking DynamoDB table: ${TABLE_NAME}...`);
        const getRes = await ddbDocClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { provider: 'GEMINI' }
        }));

        const currentEntry = getRes.Item;
        const currentModels = currentEntry?.models || [];

        console.log(`Current models in DB (${currentModels.length}):`, currentModels);

        // 2. Compare
        const addedModels = googleModels.filter(m => !currentModels.includes(m));
        const removedModels = currentModels.filter(m => !googleModels.includes(m));

        if (addedModels.length === 0 && removedModels.length === 0) {
            console.log('\n✨ DynamoDB is already up to date with Google models.');
            return;
        }

        if (addedModels.length > 0) console.log('\n➕ New models found:', addedModels);
        if (removedModels.length > 0) console.log('\n➖ Models to be removed:', removedModels);

        // 3. Update
        console.log('\n🚀 Updating DynamoDB with latest models from Google...');
        await ddbDocClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                provider: 'GEMINI',
                models: googleModels,
                updatedAt: new Date().toISOString()
            }
        }));

        console.log('🎉 Successfully synced Gemini models in DynamoDB!');

    } catch (error) {
        console.error('❌ Error syncing with DynamoDB:', error);
    }
}

syncModels();
