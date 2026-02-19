/**
 * Standalone script to register payment pages in the permissions system.
 * Handles both DynamoDB and local JSON fallback.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const TABLE_NAME = process.env.DYNAMODB_TABLE_PAGE_PERMISSIONS;
const DATA_DIR = '.local_data';
const SETTINGS_FILE = path.join(DATA_DIR, 'admin_settings.json');

const NEW_PAGES = [
    { path: '/paypal/checkout', label: 'PayPal 結帳' },
    { path: '/ecpay/checkout', label: '綠界金流測試 (Checkout)' },
    { path: '/ecpay/success', label: '綠界支付成功' }
];

const DEFAULT_ROLES = [
    { id: 'admin', name: 'Admin' },
    { id: 'teacher', name: 'Teacher' },
    { id: 'student', name: 'Student' }
];

async function run() {
    console.log('🚀 Starting registration of payment pages...');

    if (TABLE_NAME) {
        console.log(`📡 Using DynamoDB table: ${TABLE_NAME}`);
        await updateDynamoDB();
    } else {
        console.log('📂 DynamoDB not configured, using local JSON fallback.');
        await updateLocalJSON();
    }
}

async function updateDynamoDB() {
    const ddbClient = new DynamoDBClient({ region: REGION });
    const docClient = DynamoDBDocumentClient.from(ddbClient);

    try {
        // 1. Get current configs
        const scanRes = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
        const currentConfigs = scanRes.Items || [];

        const toAdd = NEW_PAGES.filter(p => !currentConfigs.find(c => c.path === p.path));

        if (toAdd.length === 0) {
            console.log('✅ All pages already exist in DynamoDB.');
            return;
        }

        // 2. Prepare items
        const timestamp = new Date().toISOString();
        const startOrder = currentConfigs.length;

        const putRequests = toAdd.map((page, index) => ({
            PutRequest: {
                Item: {
                    id: page.path,
                    path: page.path,
                    label: page.label,
                    permissions: DEFAULT_ROLES.map(r => ({
                        roleId: r.id,
                        roleName: r.name,
                        menuVisible: false,
                        dropdownVisible: false,
                        pageVisible: true
                    })),
                    sortOrder: startOrder + index,
                    updatedAt: timestamp
                }
            }
        }));

        // 3. Batch write
        await docClient.send(new BatchWriteCommand({
            RequestItems: {
                [TABLE_NAME]: putRequests
            }
        }));

        console.log(`✅ Successfully added ${toAdd.length} pages to DynamoDB.`);
    } catch (error) {
        console.error('❌ DynamoDB Error:', error.message);
    }
}

async function updateLocalJSON() {
    try {
        if (!await fs.access(SETTINGS_FILE).then(() => true).catch(() => false)) {
            console.log('⚠️ admin_settings.json not found, skipping local update.');
            return;
        }

        const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
        const data = JSON.parse(raw);

        if (!data.pageConfigs) data.pageConfigs = [];

        const toAdd = NEW_PAGES.filter(p => !data.pageConfigs.find(c => c.path === p.path));

        if (toAdd.length === 0) {
            console.log('✅ All pages already exist in local JSON.');
            return;
        }

        toAdd.forEach(page => {
            data.pageConfigs.push({
                id: page.path,
                path: page.path,
                label: page.label,
                permissions: DEFAULT_ROLES.map(r => ({
                    roleId: r.id,
                    roleName: r.name,
                    menuVisible: false,
                    dropdownVisible: false,
                    pageVisible: true
                }))
            });
        });

        await fs.writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log(`✅ Successfully added ${toAdd.length} pages to local JSON.`);
    } catch (error) {
        console.error('❌ Local JSON Error:', error.message);
    }
}

run();
