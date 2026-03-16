import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const region = process.env.AWS_REGION || 'ap-northeast-1';
const accessKey = process.env.AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

const client = new DynamoDBClient({
    region,
    credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
    },
});

async function main() {
    const tableName = process.argv[2] || 'jvtutorcorner-ai-models';
    try {
        const response = await client.send(new DescribeTableCommand({ TableName: tableName }));
        console.log(JSON.stringify(response.Table.KeySchema, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
