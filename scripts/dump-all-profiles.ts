import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function main() {
    const TableName = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';
    console.log(`Scanning all profiles in table: ${TableName}`);
    const res = await docClient.send(new ScanCommand({ TableName }));
    console.log("Profiles Data:", JSON.stringify(res.Items, null, 2));
}

main().catch(console.error);
