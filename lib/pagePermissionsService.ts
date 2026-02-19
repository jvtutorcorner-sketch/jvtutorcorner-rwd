// lib/pagePermissionsService.ts
import { ddbDocClient } from './dynamo';
import { ScanCommand, PutCommand, GetCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import fs from 'fs/promises';
import resolveDataFile from './localData';

const PAGE_PERMISSIONS_TABLE = process.env.DYNAMODB_TABLE_PAGE_PERMISSIONS || '';

// TypeScript interfaces
export interface PagePermission {
    roleId: string;
    roleName: string;
    menuVisible: boolean;
    dropdownVisible: boolean;
    pageVisible: boolean;
}

export interface PageConfig {
    id: string;        // Primary key (same as path)
    path: string;      // Route path
    label: string;     // Display label
    permissions: PagePermission[];
    updatedAt?: string;
}

// Read page permissions from local JSON file
async function readPagePermissionsFromJSON(): Promise<PageConfig[]> {
    try {
        const SETTINGS_FILE = await resolveDataFile('admin_settings.json');
        const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
        const data = JSON.parse(raw);
        return data.pageConfigs || [];
    } catch (e) {
        console.warn('[pagePermissionsService] Failed to read from JSON file:', (e as any)?.message || e);
        return [];
    }
}

// Write page permissions to local JSON file (for backward compatibility)
async function writePagePermissionsToJSON(pageConfigs: PageConfig[]): Promise<void> {
    try {
        console.log('[pagePermissionsService] 嘗試儲存到 Local JSON 檔案...');
        const SETTINGS_FILE = await resolveDataFile('admin_settings.json');
        const raw = await fs.readFile(SETTINGS_FILE, 'utf8').catch(() => '{}');
        const data = JSON.parse(raw || '{}');
        data.pageConfigs = pageConfigs;
        data.updatedAt = new Date().toISOString();
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log(`[pagePermissionsService] ✅ 成功儲存到 Local JSON: ${SETTINGS_FILE}`);
        console.log(`[pagePermissionsService] 儲存了 ${pageConfigs.length} 個頁面設定`);
    } catch (e) {
        console.error('[pagePermissionsService] ❌ Local JSON 儲存失敗:', (e as any)?.message || e);
        throw e;
    }
}

// Get all page permissions from DynamoDB
async function getPagePermissionsFromDynamoDB(): Promise<PageConfig[]> {
    if (!PAGE_PERMISSIONS_TABLE) {
        return [];
    }

    try {
        const scanRes = await ddbDocClient.send(new ScanCommand({
            TableName: PAGE_PERMISSIONS_TABLE
        }));

        const items = (scanRes.Items || []) as PageConfig[];
        console.log(`[pagePermissionsService] Loaded ${items.length} page configs from DynamoDB`);

        // Sort by sortOrder field to maintain custom ordering
        const sorted = items.sort((a: any, b: any) => {
            const orderA = a.sortOrder ?? 999999;
            const orderB = b.sortOrder ?? 999999;
            return orderA - orderB;
        });

        console.log('[pagePermissionsService] 📊 Sorted order:', sorted.map((item: any) => ({ path: item.path, sortOrder: item.sortOrder })));

        return sorted;
    } catch (e) {
        console.error('[pagePermissionsService] DynamoDB scan failed:', (e as any)?.message || e);
        return [];
    }
}

// Save page permissions to DynamoDB (batch write)
async function savePagePermissionsToDynamoDB(pageConfigs: PageConfig[]): Promise<boolean> {
    if (!PAGE_PERMISSIONS_TABLE) {
        console.log('[pagePermissionsService] ⚠️  DynamoDB 未設定，跳過 DynamoDB 儲存');
        return false;
    }

    console.log(`[pagePermissionsService] 嘗試儲存到 DynamoDB 表格: ${PAGE_PERMISSIONS_TABLE}`);
    console.log(`[pagePermissionsService] 準備寫入 ${pageConfigs.length} 個頁面設定`);

    try {
        // 1. Get current items to identify what needs to be deleted
        const currentItems = await getPagePermissionsFromDynamoDB();
        const currentPaths = new Set(currentItems.map(item => item.path));
        const incomingPaths = new Set(pageConfigs.map(pc => pc.path));

        const pathsToDelete = Array.from(currentPaths).filter(path => !incomingPaths.has(path));
        console.log(`[pagePermissionsService] Identifying items to delete: ${pathsToDelete.length} items`);

        // 2. Prepare items to write
        const timestamp = new Date().toISOString();
        const itemsToPut = pageConfigs.map((pc, index) => {
            if (!pc.path || !pc.id) {
                console.warn(`[pagePermissionsService] ⚠️  警告: 頁面缺少必要欄位 - path: ${pc.path}, id: ${pc.id}`);
            }
            return {
                ...pc,
                id: pc.path, // Ensure id matches path for consistency
                sortOrder: index, // 🔑 Store the order position
                updatedAt: timestamp
            };
        });

        // 3. Combine put and delete requests
        const putRequests = itemsToPut.map(item => ({
            PutRequest: { Item: item }
        }));
        const deleteRequests = pathsToDelete.map(path => ({
            DeleteRequest: { Key: { id: path } }
        }));

        const allRequests = [...putRequests, ...deleteRequests];
        console.log(`[pagePermissionsService] Total operations: ${allRequests.length} (Puts: ${putRequests.length}, Deletes: ${deleteRequests.length})`);

        // 4. Batch write in chunks of 25
        const BATCH_SIZE = 25;
        let totalProcessed = 0;

        for (let i = 0; i < allRequests.length; i += BATCH_SIZE) {
            const batch = allRequests.slice(i, i + BATCH_SIZE);
            console.log(`[pagePermissionsService] 正在執行批次 ${Math.floor(i / BATCH_SIZE) + 1}，包含 ${batch.length} 個操作...`);

            try {
                const response = await ddbDocClient.send(new BatchWriteCommand({
                    RequestItems: {
                        [PAGE_PERMISSIONS_TABLE]: batch
                    }
                }));

                const unprocessed = response.UnprocessedItems?.[PAGE_PERMISSIONS_TABLE];
                if (unprocessed && unprocessed.length > 0) {
                    console.error(`[pagePermissionsService] ⚠️  批次 ${Math.floor(i / BATCH_SIZE) + 1} 有 ${unprocessed.length} 個操作未成功`);
                    throw new Error(`Failed to process ${unprocessed.length} operations in batch ${Math.floor(i / BATCH_SIZE) + 1}`);
                }

                totalProcessed += batch.length;
            } catch (batchError) {
                console.error(`[pagePermissionsService] ❌ 批次 ${Math.floor(i / BATCH_SIZE) + 1} 失敗:`, (batchError as any)?.message || batchError);
                throw batchError;
            }
        }

        console.log(`[pagePermissionsService] ✅ DynamoDB 同步完成：共執行 ${totalProcessed} 個操作`);
        return true;
    } catch (e) {
        console.error('[pagePermissionsService] ❌ DynamoDB 同步失敗:', (e as any)?.message || e);
        return false;
    }
}

// Migrate data from JSON to DynamoDB (runs automatically on first read if DynamoDB is empty)
async function migrateJSONToDynamoDB(): Promise<void> {
    console.log('[pagePermissionsService] Starting automatic migration from JSON to DynamoDB');

    const jsonData = await readPagePermissionsFromJSON();
    if (jsonData.length === 0) {
        console.log('[pagePermissionsService] No data in JSON file to migrate');
        return;
    }

    const success = await savePagePermissionsToDynamoDB(jsonData);
    if (success) {
        console.log(`[pagePermissionsService] Successfully migrated ${jsonData.length} page configs to DynamoDB`);
    } else {
        console.warn('[pagePermissionsService] Migration to DynamoDB failed');
    }
}

// Main function: Get page permissions with fallback logic
export async function getPagePermissions(): Promise<PageConfig[]> {
    // 1) Try DynamoDB if configured
    if (PAGE_PERMISSIONS_TABLE) {
        try {
            const dynamoData = await getPagePermissionsFromDynamoDB();

            // If DynamoDB is empty, attempt automatic migration
            if (dynamoData.length === 0) {
                console.log('[pagePermissionsService] DynamoDB is empty, attempting migration from JSON');
                await migrateJSONToDynamoDB();

                // Try reading from DynamoDB again after migration
                const migratedData = await getPagePermissionsFromDynamoDB();
                if (migratedData.length > 0) {
                    return migratedData;
                }
            } else {
                return dynamoData;
            }
        } catch (e) {
            console.warn('[pagePermissionsService] DynamoDB read failed, falling back to JSON:', (e as any)?.message || e);
        }
    }

    // 2) Fallback to local JSON file
    console.log('[pagePermissionsService] Using local JSON file');
    const jsonData = await readPagePermissionsFromJSON();
    if (jsonData.length > 0) {
        return jsonData;
    }

    // 3) Fallback to defaults (empty array - caller should handle defaults)
    console.log('[pagePermissionsService] No data found, returning empty array');
    return [];
}

// Save page permissions (writes to DynamoDB only)
export async function savePagePermissions(pageConfigs: PageConfig[]): Promise<boolean> {
    console.log('\n========================================');
    console.log('[pagePermissionsService] 🚀 開始儲存頁面權限設定到 DynamoDB');
    console.log(`[pagePermissionsService] 要儲存的頁面數量: ${pageConfigs.length}`);
    console.log('[pagePermissionsService] 環境變數檢查:');
    console.log(`  - DYNAMODB_TABLE_PAGE_PERMISSIONS: ${PAGE_PERMISSIONS_TABLE ? '✅ 已設定' : '❌ 未設定'}`);
    console.log('========================================\n');

    // Check if DynamoDB is configured
    if (!PAGE_PERMISSIONS_TABLE) {
        console.error('[pagePermissionsService] ❌ DynamoDB 未設定！');
        console.error('[pagePermissionsService] 請確認環境變數 DYNAMODB_TABLE_PAGE_PERMISSIONS 已正確設定');
        console.error('[pagePermissionsService] 當前值:', PAGE_PERMISSIONS_TABLE);
        return false;
    }

    // Validate pageConfigs
    if (!Array.isArray(pageConfigs) || pageConfigs.length === 0) {
        console.warn('[pagePermissionsService] ⚠️  pageConfigs 為空或無效');
        return false;
    }

    // Save to DynamoDB
    console.log('[pagePermissionsService] 📦 儲存到 DynamoDB');
    try {
        const success = await savePagePermissionsToDynamoDB(pageConfigs);

        console.log('\n========================================');
        console.log('[pagePermissionsService] 📊 儲存結果:');
        console.log(`  - DynamoDB: ${success ? '✅ 成功' : '❌ 失敗'}`);
        console.log('========================================\n');

        return success;
    } catch (e) {
        console.error('[pagePermissionsService] ❌ savePagePermissions 異常:');
        console.error('[pagePermissionsService] 錯誤訊息:', (e as any)?.message || e);
        console.error('[pagePermissionsService] 錯誤堆疊:', e);
        return false;
    }
}

// Get permissions for a specific page
export async function getPageConfig(path: string): Promise<PageConfig | null> {
    const allConfigs = await getPagePermissions();
    return allConfigs.find(pc => pc.path === path) || null;
}

export default {
    getPagePermissions,
    savePagePermissions,
    getPageConfig
};
