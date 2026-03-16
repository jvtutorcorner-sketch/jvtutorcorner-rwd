// scripts/find-profile-id.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const ddbRegion = process.env.AWS_REGION || 'ap-northeast-1';
const client = new DynamoDBClient({ region: ddbRegion });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE = 'jvtutorcorner-profiles';

async function find() {
    const email = process.env.QA_TEACHER_EMAIL || 'lin@test.com';
    console.log(`Searching for profile with email: ${email}`);
    try {
        const res = await docClient.send(new ScanCommand({
            TableName: TABLE,
            FilterExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': email }
        }));
        console.log('Results found:', res.Count);
        console.log('Items:', JSON.stringify(res.Items, null, 2));
    } catch (e: any) {
        console.error('Search failed:', e.message);
    }
}

find();
