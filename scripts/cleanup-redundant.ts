// scripts/cleanup-redundant.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const ddbRegion = process.env.AWS_REGION || 'ap-northeast-1';
const client = new DynamoDBClient({ region: ddbRegion });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';

const TO_DELETE = [
    { integrationId: "be7a9522-c3c5-4702-a059-f8415097ea62", userId: "t1" },
    { integrationId: "2d6684af-30d9-4efc-9f1a-9770f38e797d", userId: "t1" },
    { integrationId: "69bdfc73-16e5-42bd-a068-9f7f2e231049", userId: "t1" },
    { integrationId: "604558a5-0953-4f5e-896f-0e0460a79bef", userId: "lin@test.com" },
    { integrationId: "135fcc43-4710-4bf9-b089-fcba93f62660", userId: "lin@test.com" },
    { integrationId: "a0359a23-d2be-40bf-b1c2-5c6561006ada", userId: "lin@test.com" }
];

async function cleanup() {
    console.log(`Cleaning up ${TO_DELETE.length} redundant items from ${TABLE}...`);
    for (const key of TO_DELETE) {
        try {
            await docClient.send(new DeleteCommand({
                TableName: TABLE,
                Key: key
            }));
            console.log(`Deleted: ${key.integrationId} (${key.userId})`);
        } catch (e: any) {
            console.error(`Failed to delete ${key.integrationId}: ${e.message}`);
        }
    }
    console.log('Cleanup completed.');
}

cleanup();
