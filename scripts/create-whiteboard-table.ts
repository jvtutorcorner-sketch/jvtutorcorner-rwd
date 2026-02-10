
import fs from 'fs';
import path from 'path';
import { DynamoDBClient, CreateTableCommand, ListTablesCommand, DeleteTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";

// Load env
const envLocal = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envLocal)) {
    const envConfig = fs.readFileSync(envLocal, 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const TABLE_NAME = process.env.WHITEBOARD_TABLE || 'jvtutorcorner-whiteboard';

const client = new DynamoDBClient({
    region: REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
});

async function waitForTable(tableName: string) {
    console.log(`Waiting for table '${tableName}' to disappear...`);
    let exists = true;
    while (exists) {
        try {
            await client.send(new DescribeTableCommand({ TableName: tableName }));
            await new Promise(r => setTimeout(r, 2000));
        } catch (e: any) {
            if (e.name === 'ResourceNotFoundException') {
                exists = false;
            }
        }
    }
    console.log(`Table '${tableName}' is gone.`);
}

async function fixTable() {
    console.log(`Checking table '${TABLE_NAME}' in ${REGION}...`);
    
    try {
        const list = await client.send(new ListTablesCommand({}));
        if (list.TableNames?.includes(TABLE_NAME)) {
            console.log(`⚠️ Table '${TABLE_NAME}' exists but might have wrong schema.`);
            console.log(`Deleting table '${TABLE_NAME}'...`);
            await client.send(new DeleteTableCommand({ TableName: TABLE_NAME }));
            await waitForTable(TABLE_NAME);
        }

        console.log(`Creating table '${TABLE_NAME}' with PK 'id' (String)...`);
        const command = new CreateTableCommand({
            TableName: TABLE_NAME,
            KeySchema: [
                { AttributeName: "id", KeyType: "HASH" } // CORRECTED: id instead of uuid
            ],
            AttributeDefinitions: [
                { AttributeName: "id", AttributeType: "S" }
            ],
            BillingMode: "PAY_PER_REQUEST"
        });

        const response = await client.send(command);
        console.log("✅ Table creation initiated:", response.TableDescription?.TableStatus);
        console.log("It may take a few seconds to become ACTIVE.");
        
    } catch (err) {
        console.error("❌ Error fixing table:", err);
    }
}

fixTable();
