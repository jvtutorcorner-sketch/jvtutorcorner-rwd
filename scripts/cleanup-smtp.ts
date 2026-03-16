// scripts/cleanup-smtp.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const ddbRegion = process.env.AWS_REGION || 'ap-northeast-1';
const client = new DynamoDBClient({ region: ddbRegion });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';

async function cleanup() {
    console.log(`Scanning for SMTP integrations in ${TABLE}...`);
    try {
        const scanRes = await docClient.send(new ScanCommand({
            TableName: TABLE,
            FilterExpression: '#type = :type',
            ExpressionAttributeNames: { '#type': 'type' },
            ExpressionAttributeValues: { ':type': 'SMTP' }
        }));

        const items = scanRes.Items || [];
        console.log(`Found ${items.length} SMTP items to delete.`);

        for (const item of items) {
            console.log(`Deleting SMTP integration for user: ${item.userId}...`);
            await docClient.send(new DeleteCommand({
                TableName: TABLE,
                Key: {
                    userId: item.userId,
                    type: 'SMTP'
                }
            }));
            console.log(`Deleted: ${item.userId} - SMTP`);
        }
        console.log('Cleanup completed successfully.');
    } catch (e: any) {
        console.error(`Cleanup failed: ${e.message}`);
    }
}

cleanup();
