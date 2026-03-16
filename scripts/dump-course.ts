import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function main() {
    const TableName = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
    const courseId = '260f6560-329b-4892-b237-e4f0288f20a3';
    console.log(`Fetching course ${courseId} from table: ${TableName}`);
    const res = await docClient.send(new GetCommand({ TableName, Key: { id: courseId } }));
    console.log("Course Data:", JSON.stringify(res.Item, null, 2));
}

main().catch(console.error);
