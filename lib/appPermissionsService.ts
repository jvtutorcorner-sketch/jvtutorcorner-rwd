import { ddbDocClient } from './dynamo';
import { ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const APP_PERMISSIONS_TABLE = process.env.DYNAMODB_TABLE_APP_PERMISSIONS || 'jvtutorcorner-app-permissions';

// TypeScript interfaces
export interface AppRolePermission {
    roleId: string;
    roleName: string;
    visible: boolean;
}

export interface AppConfig {
    id: string;        // Primary key (e.g. 'LINE', 'ECPAY', 'PAYPAL', 'STRIPE')
    path: string;      // Usually the same as id for apps
    label: string;     // Display label (e.g. 'LINE 官方帳號')
    permissions: AppRolePermission[];
    sortOrder?: number;
    updatedAt?: string;
}

// Fixed list of apps to initialize if empty
const DEFAULT_APPS: AppConfig[] = [
    {
        id: 'LINE',
        path: 'LINE',
        label: 'LINE 官方帳號',
        sortOrder: 0,
        permissions: [
            { roleId: 'admin', roleName: 'Admin', visible: true },
            { roleId: 'teacher', roleName: 'Teacher', visible: false },
            { roleId: 'student', roleName: 'Student', visible: false }
        ]
    },
    {
        id: 'PAYPAL',
        path: 'PAYPAL',
        label: 'PayPal 收款',
        sortOrder: 1,
        permissions: [
            { roleId: 'admin', roleName: 'Admin', visible: true },
            { roleId: 'teacher', roleName: 'Teacher', visible: true },
            { roleId: 'student', roleName: 'Student', visible: false }
        ]
    },
    {
        id: 'ECPAY',
        path: 'ECPAY',
        label: '綠界科技 ECPay',
        sortOrder: 2,
        permissions: [
            { roleId: 'admin', roleName: 'Admin', visible: true },
            { roleId: 'teacher', roleName: 'Teacher', visible: true },
            { roleId: 'student', roleName: 'Student', visible: false }
        ]
    },
    {
        id: 'STRIPE',
        path: 'STRIPE',
        label: 'Stripe 信用卡收款',
        sortOrder: 3,
        permissions: [
            { roleId: 'admin', roleName: 'Admin', visible: true },
            { roleId: 'teacher', roleName: 'Teacher', visible: true },
            { roleId: 'student', roleName: 'Student', visible: false }
        ]
    },
    {
        id: 'AI_ASSISTANT',
        path: 'AI_ASSISTANT',
        label: 'AI 客服小幫手',
        sortOrder: 4,
        permissions: [
            { roleId: 'admin', roleName: 'Admin', visible: true },
            { roleId: 'teacher', roleName: 'Teacher', visible: true },
            { roleId: 'student', roleName: 'Student', visible: true }
        ]
    },
    // --- Category Level Permissions for /apps Page ---
    {
        id: 'APP_CATEGORY_CHANNEL',
        path: 'APP_CATEGORY_CHANNEL',
        label: '分類: 通訊渠道 (主選單)',
        sortOrder: 5,
        permissions: [
            { roleId: 'admin', roleName: 'Admin', visible: true },
            { roleId: 'teacher', roleName: 'Teacher', visible: true },
            { roleId: 'student', roleName: 'Student', visible: false }
        ]
    },
    {
        id: 'APP_CATEGORY_PAYMENT',
        path: 'APP_CATEGORY_PAYMENT',
        label: '分類: 金流服務設定 (主選單)',
        sortOrder: 6,
        permissions: [
            { roleId: 'admin', roleName: 'Admin', visible: true },
            { roleId: 'teacher', roleName: 'Teacher', visible: true },
            { roleId: 'student', roleName: 'Student', visible: false }
        ]
    },
    {
        id: 'APP_CATEGORY_AUTOMATION',
        path: 'APP_CATEGORY_AUTOMATION',
        label: '分類: 自動化服務助理 (主選單)',
        sortOrder: 7,
        permissions: [
            { roleId: 'admin', roleName: 'Admin', visible: true },
            { roleId: 'teacher', roleName: 'Teacher', visible: true },
            { roleId: 'student', roleName: 'Student', visible: false }
        ]
    },
    {
        id: 'APP_CATEGORY_AI',
        path: 'APP_CATEGORY_AI',
        label: '分類: AI 工具串接 (主選單)',
        sortOrder: 8,
        permissions: [
            { roleId: 'admin', roleName: 'Admin', visible: true },
            { roleId: 'teacher', roleName: 'Teacher', visible: true },
            { roleId: 'student', roleName: 'Student', visible: false }
        ]
    },
    {
        id: 'APP_CATEGORY_AI_CHATROOM',
        path: 'APP_CATEGORY_AI_CHATROOM',
        label: '分類: AI 聊天室 (主選單)',
        sortOrder: 9,
        permissions: [
            { roleId: 'admin', roleName: 'Admin', visible: true },
            { roleId: 'teacher', roleName: 'Teacher', visible: true },
            { roleId: 'student', roleName: 'Student', visible: true }
        ]
    },
    {
        id: 'APP_CATEGORY_EMAIL',
        path: 'APP_CATEGORY_EMAIL',
        label: '分類: 郵件服務設定 (主選單)',
        sortOrder: 10,
        permissions: [
            { roleId: 'admin', roleName: 'Admin', visible: true },
            { roleId: 'teacher', roleName: 'Teacher', visible: false },
            { roleId: 'student', roleName: 'Student', visible: false }
        ]
    }
];

// Removed JSON fallback functions as we are now exclusively using DynamoDB

export async function getAppPermissionsFromDynamoDB(): Promise<AppConfig[]> {
    let items: AppConfig[] = [];

    // 1. Try DynamoDB
    if (APP_PERMISSIONS_TABLE) {
        try {
            console.log(`[appPermissionsService] Scanning DynamoDB Table: ${APP_PERMISSIONS_TABLE}`);
            const scanRes = await ddbDocClient.send(new ScanCommand({
                TableName: APP_PERMISSIONS_TABLE
            }));
            items = (scanRes.Items || []) as AppConfig[];
            console.log(`[appPermissionsService] Loaded ${items.length} app configs from DynamoDB`);
        } catch (e) {
            console.warn('[appPermissionsService] DynamoDB read failed, trying local JSON fallback:', (e as any)?.message || e);
        }
    }

    // 2. Fallback to Hardcoded Defaults if DynamoDB empty or failed
    if (items.length === 0) {
        console.log('[appPermissionsService] No data found in DynamoDB, using hardcoded defaults');
        items = [...DEFAULT_APPS];
    }


    // Ensure all default apps are present (merge logic)
    DEFAULT_APPS.forEach(def => {
        if (!items.find(i => i.id === def.id)) {
            items.push(def);
        }
    });

    // Sort and return
    return items.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
}

export async function saveAppPermissionsToDynamoDB(appConfigs: AppConfig[]): Promise<boolean> {
    const timestamp = new Date().toISOString();
    const itemsToSave = appConfigs.map((pc, index) => ({
        ...pc,
        id: pc.id || pc.path,
        path: pc.id || pc.path,
        sortOrder: index,
        updatedAt: timestamp
    }));

    // Removed writeAppPermissionsToJSON as we are now exclusively using DynamoDB

    if (!APP_PERMISSIONS_TABLE) {
        console.warn('[appPermissionsService] DYNAMODB_TABLE_APP_PERMISSIONS not set, local backup only.');
        return true;
    }

    try {
        console.log(`[appPermissionsService] Syncing to DynamoDB: ${APP_PERMISSIONS_TABLE}`);

        // Prepare Batch Write
        const putRequests = itemsToSave.map(item => ({ PutRequest: { Item: item } }));

        // Chunks of 25 for BatchWrite
        const BATCH_SIZE = 25;
        for (let i = 0; i < putRequests.length; i += BATCH_SIZE) {
            const batch = putRequests.slice(i, i + BATCH_SIZE);
            await ddbDocClient.send(new BatchWriteCommand({
                RequestItems: {
                    [APP_PERMISSIONS_TABLE]: batch
                }
            }));
        }

        console.log(`[appPermissionsService] successfully saved ${itemsToSave.length} items to DynamoDB.`);
        return true;
    } catch (e) {
        console.error('[appPermissionsService] DynamoDB save failed:', (e as any)?.message || e);
        // Even if DB fails, we already saved to JSON, so we return true if we want to allow the UI to proceed,
        // but strictly speaking, the save target failed. Let's return false to indicate DB specific failure.
        return false;
    }
}

export default {
    getAppPermissionsFromDynamoDB,
    saveAppPermissionsToDynamoDB
};
