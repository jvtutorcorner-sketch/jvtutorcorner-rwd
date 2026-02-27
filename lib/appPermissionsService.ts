import { ddbDocClient } from './dynamo';
import { ScanCommand, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

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
    }
];

export async function getAppPermissionsFromDynamoDB(): Promise<AppConfig[]> {
    if (!APP_PERMISSIONS_TABLE) {
        return DEFAULT_APPS;
    }

    try {
        const scanRes = await ddbDocClient.send(new ScanCommand({
            TableName: APP_PERMISSIONS_TABLE
        }));

        const items = (scanRes.Items || []) as AppConfig[];
        console.log(`[appPermissionsService] Loaded ${items.length} app configs from DynamoDB`);

        if (items.length === 0) {
            console.log('[appPermissionsService] DynamoDB is empty, returning default apps');
            return DEFAULT_APPS; // We return defaults, client can save them later
        }

        // Sort by sortOrder field to maintain custom ordering
        const sorted = items.sort((a, b) => {
            const orderA = a.sortOrder ?? 999999;
            const orderB = b.sortOrder ?? 999999;
            return orderA - orderB;
        });

        return sorted;
    } catch (e) {
        console.error('[appPermissionsService] DynamoDB scan failed:', (e as any)?.message || e);
        // Fallback to defaults to prevent app crash
        return DEFAULT_APPS;
    }
}

export async function saveAppPermissionsToDynamoDB(appConfigs: AppConfig[]): Promise<boolean> {
    if (!APP_PERMISSIONS_TABLE) {
        console.log('[appPermissionsService] ⚠️  DynamoDB 未設定，跳過 DynamoDB 儲存');
        return false;
    }

    console.log(`[appPermissionsService] 嘗試儲存到 DynamoDB 表格: ${APP_PERMISSIONS_TABLE}`);

    try {
        // 1. Get current items to identify what needs to be deleted
        const currentItems = await getAppPermissionsFromDynamoDB();
        // Since getAppPermissionsFromDynamoDB returns defaults if empty/error, we need an actual scan to find deletes.
        // For apps, we might not delete often, but let's be safe.
        let actualCurrentItems: AppConfig[] = [];
        try {
            const scanRes = await ddbDocClient.send(new ScanCommand({ TableName: APP_PERMISSIONS_TABLE }));
            actualCurrentItems = (scanRes.Items || []) as AppConfig[];
        } catch (e) { }

        const currentPaths = new Set(actualCurrentItems.map(item => item.id));
        const incomingPaths = new Set(appConfigs.map(pc => pc.id));
        const pathsToDelete = Array.from(currentPaths).filter(id => !incomingPaths.has(id));

        // 2. Prepare items to write
        const timestamp = new Date().toISOString();
        const itemsToPut = appConfigs.map((pc, index) => ({
            ...pc,
            id: pc.id || pc.path,
            path: pc.id || pc.path, // ensure consistency
            sortOrder: index,
            updatedAt: timestamp
        }));

        // 3. Combine put and delete requests
        const putRequests = itemsToPut.map(item => ({ PutRequest: { Item: item } }));
        const deleteRequests = pathsToDelete.map(id => ({ DeleteRequest: { Key: { id: id } } }));

        const allRequests = [...putRequests, ...deleteRequests];

        // 4. Batch write in chunks of 25
        const BATCH_SIZE = 25;
        let totalProcessed = 0;

        for (let i = 0; i < allRequests.length; i += BATCH_SIZE) {
            const batch = allRequests.slice(i, i + BATCH_SIZE);
            const response = await ddbDocClient.send(new BatchWriteCommand({
                RequestItems: {
                    [APP_PERMISSIONS_TABLE]: batch
                }
            }));

            const unprocessed = response.UnprocessedItems?.[APP_PERMISSIONS_TABLE];
            if (unprocessed && unprocessed.length > 0) {
                console.error(`[appPermissionsService] ⚠️  有 ${unprocessed.length} 個操作未成功`);
                throw new Error(`Failed to process ${unprocessed.length} operations`);
            }
            totalProcessed += batch.length;
        }

        console.log(`[appPermissionsService] ✅ DynamoDB 同步完成：共執行 ${totalProcessed} 個操作`);
        return true;
    } catch (e) {
        console.error('[appPermissionsService] ❌ DynamoDB 同步失敗:', (e as any)?.message || e);
        return false;
    }
}

export default {
    getAppPermissionsFromDynamoDB,
    saveAppPermissionsToDynamoDB
};
