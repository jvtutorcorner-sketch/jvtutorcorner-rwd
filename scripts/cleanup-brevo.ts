
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-northeast-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  }
});

const ddb = DynamoDBDocumentClient.from(client);
const table = "jvtutorcorner-app-integrations";

async function cleanupBrevo() {
    console.log('--- Cleaning up BREVO integrations ---');
    try {
        const { Items } = await ddb.send(new ScanCommand({
            TableName: table,
            FilterExpression: '#tp = :tp',
            ExpressionAttributeNames: { '#tp': 'type' },
            ExpressionAttributeValues: { ':tp': 'BREVO' },
        }));

        if (!Items || Items.length === 0) {
            console.log('No BREVO integrations found.');
            return;
        }

        console.log(`Found ${Items.length} BREVO integrations. Deleting...`);

        for (const item of Items) {
            await ddb.send(new DeleteCommand({
                TableName: table,
                Key: {
                    userId: item.userId,
                    integrationId: item.integrationId,
                }
            }));
            console.log(`Deleted: ${item.name} (${item.integrationId})`);
        }

        console.log('Cleanup complete.');
    } catch (err: any) {
        console.error('Error during cleanup:', err.message);
    }
}

cleanupBrevo();
