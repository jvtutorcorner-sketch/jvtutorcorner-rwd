import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function main() {
    const TableName = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';
    const profileId = '2bc2c0a2-a3d2-4938-9891-dfb23dd85fb9';
    console.log(`Fetching profile ${profileId} from table: ${TableName}`);
    const res = await docClient.send(new GetCommand({ TableName, Key: { id: profileId } }));
    console.log("Profile Data:", JSON.stringify(res.Item, null, 2));
}

main().catch(console.error);
