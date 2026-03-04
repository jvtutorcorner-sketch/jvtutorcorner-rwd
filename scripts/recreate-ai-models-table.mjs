import { DynamoDBClient, DeleteTableCommand, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const region = process.env.AWS_REGION || 'ap-northeast-1';
const accessKey = process.env.AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

const client = new DynamoDBClient({
    region,
    credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
    },
});

async function waitForTableDeletion(tableName) {
    console.log(`⏳ Waiting for table ${tableName} to be deleted...`);
    while (true) {
        try {
            await client.send(new DescribeTableCommand({ TableName: tableName }));
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            if (error.name === 'ResourceNotFoundException') {
                console.log(`✅ Table ${tableName} deleted.`);
                return;
            }
            throw error;
        }
    }
}

async function waitForTableActive(tableName) {
    console.log(`⏳ Waiting for table ${tableName} to be ACTIVE...`);
    while (true) {
        try {
            const response = await client.send(new DescribeTableCommand({ TableName: tableName }));
            if (response.Table.TableStatus === 'ACTIVE') {
                console.log(`✅ Table ${tableName} is now ACTIVE.`);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            throw error;
        }
    }
}

async function main() {
    const tableName = 'jvtutorcorner-ai-models';

    try {
        console.log(`🗑️ Deleting table ${tableName}...`);
        await client.send(new DeleteTableCommand({ TableName: tableName }));
        await waitForTableDeletion(tableName);
    } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
            console.log(`ℹ️ Table ${tableName} does not exist, skipping deletion.`);
        } else {
            console.error('❌ Failed to delete table:', error.message);
            process.exit(1);
        }
    }

    try {
        console.log(`🏗️ Creating table ${tableName} with provider as PK...`);
        await client.send(new CreateTableCommand({
            TableName: tableName,
            AttributeDefinitions: [
                { AttributeName: 'provider', AttributeType: 'S' }
            ],
            KeySchema: [
                { AttributeName: 'provider', KeyType: 'HASH' }
            ],
            BillingMode: 'PAY_PER_REQUEST'
        }));
        await waitForTableActive(tableName);
        console.log('🎉 Table recreated successfully!');
    } catch (error) {
        console.error('❌ Failed to create table:', error.message);
        process.exit(1);
    }
}

main();
