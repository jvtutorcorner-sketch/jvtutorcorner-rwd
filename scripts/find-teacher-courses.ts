import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function main() {
    const TableName = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
    const res = await docClient.send(new ScanCommand({
        TableName,
        FilterExpression: 'teacherId = :tid OR teacherName = :tname',
        ExpressionAttributeValues: {
            ':tid': '2bc2c0a2-a3d2-4938-9891-dfb23dd85fb9',
            ':tname': '許'
        }
    }));
    console.log(`Found ${res.Items?.length} courses for teacher.`);
    console.log("Courses:", JSON.stringify(res.Items?.map(i => ({ id: i.id, teacherId: i.teacherId, teacherName: i.teacherName })), null, 2));
}

main().catch(console.error);
