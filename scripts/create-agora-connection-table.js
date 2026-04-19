// scripts/create-agora-connection-table.js
require('dotenv').config();
const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const TableName = 'jvtutorcorner-agora-connections';

async function createTable() {
    const params = {
        TableName,
        AttributeDefinitions: [
            { AttributeName: 'connectionId', AttributeType: 'S' },
            { AttributeName: 'userId', AttributeType: 'S' },
            { AttributeName: 'timestamp', AttributeType: 'N' },
        ],
        KeySchema: [
            { AttributeName: 'connectionId', KeyType: 'HASH' },
        ],
        // Add Global Secondary Indexes to query by userId
        GlobalSecondaryIndexes: [
            {
                IndexName: 'UserIdIndex',
                KeySchema: [
                    { AttributeName: 'userId', KeyType: 'HASH' },
                    { AttributeName: 'timestamp', KeyType: 'RANGE' },
                ],
                Projection: {
                    ProjectionType: 'ALL',
                },
            },
        ],
        BillingMode: 'PAY_PER_REQUEST',
    };

    try {
        console.log(`Creating table ${TableName}...`);
        const command = new CreateTableCommand(params);
        const result = await client.send(command);
        console.log('Success!', result.TableDescription.TableName);
    } catch (err) {
        if (err.name === 'ResourceInUseException') {
            console.log(`Table ${TableName} already exists.`);
        } else {
            console.error('Error creating table:', err);
        }
    }
}

createTable();
