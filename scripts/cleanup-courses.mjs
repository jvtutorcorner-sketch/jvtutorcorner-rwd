import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

const clientConfig = { region: REGION };
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
if (accessKeyId && secretAccessKey) {
    clientConfig.credentials = { accessKeyId, secretAccessKey };
}

const client = new DynamoDBClient(clientConfig);
const docClient = DynamoDBDocumentClient.from(client);

async function cleanupCourses() {
    console.log(`Starting cleanup on table: ${COURSES_TABLE}`);

    let deletedCount = 0;
    let lastEvaluatedKey = undefined;

    do {
        const scanCmd = new ScanCommand({
            TableName: COURSES_TABLE,
            ExclusiveStartKey: lastEvaluatedKey,
        });

        const response = await docClient.send(scanCmd);
        const items = response.Items || [];

        for (const item of items) {
            if (typeof item.id === 'string' && (item.id.startsWith('classroom_') || item.id.startsWith('session_'))) {
                console.log(`Deleting invalid course record: ${item.id}`);
                const deleteCmd = new DeleteCommand({
                    TableName: COURSES_TABLE,
                    Key: { id: item.id }
                });
                await docClient.send(deleteCmd);
                deletedCount++;
            }
        }

        lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`Cleanup complete. Deleted ${deletedCount} invalid records.`);
}

cleanupCourses().catch(console.error);
