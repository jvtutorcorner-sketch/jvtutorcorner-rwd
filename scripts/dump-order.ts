import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function main() {
    const TableName = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
    const orderId = '9799d27a-f8fc-4805-842b-7471444fe7e6';
    console.log(`Fetching order ${orderId} from table: ${TableName}`);
    const res = await docClient.send(new GetCommand({ TableName, Key: { orderId } }));
    console.log("Order Data:", JSON.stringify(res.Item, null, 2));
}

main().catch(console.error);
