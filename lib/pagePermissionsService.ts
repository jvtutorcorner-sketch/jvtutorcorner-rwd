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
        // Add updatedAt timestamp and sortOrder to each config
        const timestamp = new Date().toISOString();
        const itemsToWrite = pageConfigs.map((pc, index) => ({
            ...pc,
            id: pc.path, // Ensure id matches path for consistency
            sortOrder: index, // 🔑 Store the order position
            updatedAt: timestamp
        }));

        console.log('[pagePermissionsService] 📊 Items with sortOrder:', itemsToWrite.map(item => ({ path: item.path, sortOrder: item.sortOrder })));

        // DynamoDB BatchWrite has a limit of 25 items per request
        const BATCH_SIZE = 25;
        let totalWritten = 0;

        for (let i = 0; i < itemsToWrite.length; i += BATCH_SIZE) {
            const batch = itemsToWrite.slice(i, i + BATCH_SIZE);
            const putRequests = batch.map(item => ({
                PutRequest: { Item: item }
            }));

            console.log(`[pagePermissionsService] 正在寫入批次 ${Math.floor(i / BATCH_SIZE) + 1}，包含 ${batch.length} 個項目...`);

            const response = await ddbDocClient.send(new BatchWriteCommand({
                RequestItems: {
                    [PAGE_PERMISSIONS_TABLE]: putRequests
                }
            }));

            // Check for UnprocessedItems (items that failed to write)
            const unprocessed = response.UnprocessedItems?.[PAGE_PERMISSIONS_TABLE];
            if (unprocessed && unprocessed.length > 0) {
                console.error(`[pagePermissionsService] ⚠️  批次 ${Math.floor(i / BATCH_SIZE) + 1} 有 ${unprocessed.length} 個項目未成功寫入`);
                console.error('[pagePermissionsService] 未處理項目:', JSON.stringify(unprocessed, null, 2));
                throw new Error(`Failed to write ${unprocessed.length} items to DynamoDB`);
            }

            totalWritten += batch.length;
            console.log(`[pagePermissionsService] ✅ 成功儲存批次 ${Math.floor(i / BATCH_SIZE) + 1}：${batch.length} 個項目寫入 DynamoDB`);
        }

        console.log(`[pagePermissionsService] ✅ DynamoDB 儲存完成：共 ${totalWritten} 個頁面設定實際寫入`);

        // Verify written count matches expected count
        if (totalWritten !== pageConfigs.length) {
            throw new Error(`Expected to write ${pageConfigs.length} items but only wrote ${totalWritten}`);
        }

        // Verify data was actually written by reading back one item
        if (itemsToWrite.length > 0) {
            console.log('[pagePermissionsService] 🔍 驗證資料是否真的寫入 DynamoDB...');
            try {
                const testItem = itemsToWrite[0];
                const verifyResult = await ddbDocClient.send(new GetCommand({
                    TableName: PAGE_PERMISSIONS_TABLE,
                    Key: { id: testItem.id }
                }));

                if (!verifyResult.Item) {
                    console.error('[pagePermissionsService] ❌ 驗證失敗：資料未找到');
                    throw new Error('Verification failed: Written data not found in DynamoDB');
                }

                console.log('[pagePermissionsService] ✅ 驗證成功：資料確實存在於 DynamoDB');
            } catch (verifyError) {
                console.error('[pagePermissionsService] ❌ 驗證過程失敗:', verifyError);
                throw new Error(`Verification error: ${(verifyError as any)?.message || 'Unknown verification error'}`);
            }
        }

        return true;
    } catch (e) {
        console.error('[pagePermissionsService] ❌ DynamoDB 批次寫入失敗:', (e as any)?.message || e);
        console.error('[pagePermissionsService] 錯誤詳情:', e);
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
    console.log('========================================\n');

    // Check if DynamoDB is configured
    if (!PAGE_PERMISSIONS_TABLE) {
        console.error('[pagePermissionsService] ❌ DynamoDB 未設定！');
        console.error('[pagePermissionsService] 請確認環境變數 DYNAMODB_TABLE_PAGE_PERMISSIONS 已正確設定');
        return false;
    }

    // Save to DynamoDB
    console.log('[pagePermissionsService] 📦 儲存到 DynamoDB');
    const success = await savePagePermissionsToDynamoDB(pageConfigs);

    console.log('\n========================================');
    console.log('[pagePermissionsService] 📊 儲存結果:');
    console.log(`  - DynamoDB: ${success ? '✅ 成功' : '❌ 失敗'}`);
    console.log('========================================\n');

    return success;
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
