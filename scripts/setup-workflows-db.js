const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
require('dotenv').config({ path: '.env.local' });

// Setup dynamo client using standard environment variables if not specified
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1',
    credentials: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    } : undefined
});

async function setupWorkflowsTable() {
    try {
        const params = {
            TableName: 'jvtutorcorner-workflows',
            KeySchema: [
                { AttributeName: 'id', KeyType: 'HASH' }
            ],
            AttributeDefinitions: [
                { AttributeName: 'id', AttributeType: 'S' }
            ],
            BillingMode: 'PAY_PER_REQUEST',
        };

        const command = new CreateTableCommand(params);
        const result = await client.send(command);
        console.log('Workflows table created:', result.TableDescription.TableName);
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log('Workflows table already exists');
        } else {
            console.error('Error creating workflows table:', error);
        }
    }
}

setupWorkflowsTable();
