// scripts/describe-table.ts
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const ddbRegion = process.env.AWS_REGION || 'ap-northeast-1';
const client = new DynamoDBClient({ region: ddbRegion });
const TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';

async function describe() {
    console.log(`Describing table: ${TABLE}`);
    try {
        const res = await client.send(new DescribeTableCommand({ TableName: TABLE }));
        console.log('KeySchema:', JSON.stringify(res.Table?.KeySchema, null, 2));
        console.log('AttributeDefinitions:', JSON.stringify(res.Table?.AttributeDefinitions, null, 2));
    } catch (e: any) {
        console.error('Describe failed:', e.message);
    }
}

describe();
