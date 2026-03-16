const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);
const table = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';

async function debug() {
    try {
        const { Items } = await docClient.send(new ScanCommand({ TableName: table }));
        const lineApp = Items.find(i => i.type === 'LINE');
        if (lineApp) {
            console.log(`LINE Integration found:`);
            console.log(`ID: ${lineApp.integrationId}`);
            console.log(`Name: ${lineApp.name}`);
            console.log(`Status: ${lineApp.status}`);
        } else {
            console.log('No LINE integration found.');
        }
    } catch (err) {
        console.error('Error scanning table:', err);
    }
}

debug();
