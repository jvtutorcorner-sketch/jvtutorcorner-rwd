import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function main() {
    const TableName = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
    console.log('Scanning table:', TableName);
    const res = await docClient.send(new ScanCommand({ TableName }));
    console.log(`Found ${res.Items?.length} items`);
    console.log(JSON.stringify(res.Items?.slice(0, 5), null, 2));
}

main().catch(console.error);
