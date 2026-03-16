// scripts/verify-migration.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const ddbRegion = process.env.AWS_REGION || 'ap-northeast-1';
const client = new DynamoDBClient({ region: ddbRegion });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';

async function verify() {
    console.log(`Verifying data in table: ${TABLE}`);
    try {
        const res = await docClient.send(new ScanCommand({ TableName: TABLE }));
        console.log('Total items found:', res.Count);
        const simplified = res.Items?.map(item => ({
            integrationId: item.integrationId,
            userId: item.userId,
            type: item.type,
            name: item.name
        }));
        console.log('Items:', JSON.stringify(simplified, null, 2));
    } catch (e: any) {
        console.error('Verification failed:', e.message);
    }
}

verify();
