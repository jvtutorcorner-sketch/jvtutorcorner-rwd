import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

// 1. 確保有表名 (若無則警告)
const ROLES_TABLE = process.env.DYNAMODB_TABLE_ROLES || 'jvtutorcorner-roles';

// 2. 初始化 Client (修正憑證邏輯)
const region = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
const clientConfig: any = { region };

// 只有在真的有 Access Key 時才設定 credentials (通常是本機開發)
// 在 Amplify 線上環境，這兩個變數應該是不存在的，這樣 SDK 就會自動去抓 IAM Role
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;

if (accessKeyId && secretAccessKey) {
    clientConfig.credentials = { accessKeyId, secretAccessKey };
}

const client = new DynamoDBClient(clientConfig);
const ddbDocClient = DynamoDBDocumentClient.from(client);

export type Role = {
    id: string;
    name: string;
    description?: string;
    isActive?: boolean; // 改為可選，容錯性更高
    order?: number;
};

/**
 * Get all roles from DynamoDB
 */
async function getRolesFromDynamoDB(): Promise<Role[]> {
    if (!ROLES_TABLE) {
        console.warn('[rolesService] DYNAMODB_TABLE_ROLES not configured in env');
        return [];
    }

    try {
        console.log(`[rolesService] Reading roles from DynamoDB table: ${ROLES_TABLE}`);
        const scanRes = await ddbDocClient.send(new ScanCommand({
            TableName: ROLES_TABLE
        }));

        const items = (scanRes.Items || []) as Role[];
        // Sort by order field
        items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        console.log(`[rolesService] ✅ Loaded ${items.length} roles from DynamoDB`);
        return items;
    } catch (e: any) {
        console.error('[rolesService] ❌ DynamoDB scan failed:', e.message);
        // 如果錯誤是 ResourceNotFoundException，代表表格還沒建立，回傳空陣列
        if (e.name === 'ResourceNotFoundException') {
            console.warn('[rolesService] Table not found, returning empty list');
            return [];
        }
        return [];
    }
}

/**
 * Write roles to DynamoDB
 */
async function writeRolesToDynamoDB(roles: Role[]): Promise<boolean> {
    if (!ROLES_TABLE) {
        console.error('[rolesService] ❌ DYNAMODB_TABLE_ROLES not configured');
        return false;
    }

    console.log(`[rolesService] Writing ${roles.length} roles to DynamoDB table: ${ROLES_TABLE}`);

    try {
        const timestamp = new Date().toISOString();
        const itemsToWrite = roles.map((role, index) => ({
            ...role,
            id: role.id, // 確保 id 存在
            name: role.name,
            order: role.order ?? index,
            updatedAt: timestamp
        }));

        if (itemsToWrite.length === 0) return true;

        // DynamoDB BatchWrite 限制一次最多 25 筆
        // 這裡做一個簡單的切分 (Chunking) 以防角色太多報錯
        const chunkSize = 25;
        for (let i = 0; i < itemsToWrite.length; i += chunkSize) {
            const chunk = itemsToWrite.slice(i, i + chunkSize);
            const putRequests = chunk.map(item => ({
                PutRequest: { Item: item }
            }));

            await ddbDocClient.send(new BatchWriteCommand({
                RequestItems: {
                    [ROLES_TABLE]: putRequests
                }
            }));
            console.log(`[rolesService] Batch wrote items ${i + 1} to ${i + chunk.length}`);
        }

        console.log(`[rolesService] ✅ Successfully wrote all roles to DynamoDB`);
        return true;
    } catch (e: any) {
        console.error('[rolesService] ❌ Failed to write roles to DynamoDB:', e.message);
        return false;
    }
}

/**
 * Main function to get roles with automatic migration from JSON if needed
 */
export async function getRoles(): Promise<Role[]> {
    // Try DynamoDB first
    const rolesFromDB = await getRolesFromDynamoDB();

    if (rolesFromDB.length > 0) {
        return rolesFromDB;
    }

    // If DynamoDB is empty, return default roles
    console.log('[rolesService] No roles in DynamoDB, returning defaults');
    const defaultRoles: Role[] = [
        { id: 'admin', name: 'Admin', description: '管理者', isActive: true, order: 0 },
        { id: 'teacher', name: 'Teacher', description: '教師', isActive: true, order: 1 },
        { id: 'student', name: 'Student', description: '學生', isActive: true, order: 2 }
    ];

    // Auto-migrate default roles to DynamoDB (只有在有表名設定時才做)
    if (ROLES_TABLE) {
        console.log('[rolesService] Migrating default roles to DynamoDB...');
        // 非同步寫入，不卡住回傳
        writeRolesToDynamoDB(defaultRoles).catch(err => 
            console.error('[rolesService] Auto-migration failed:', err)
        );
    }

    return defaultRoles;
}

/**
 * Delete roles from DynamoDB that are not in the provided list
 */
async function deleteRemovedRoles(roles: Role[]): Promise<boolean> {
    if (!ROLES_TABLE) {
        console.log('[rolesService] ⚠️  DYNAMODB_TABLE_ROLES not configured, skipping cleanup');
        return true;
    }

    try {
        // Get all existing roles from DynamoDB
        const existingRoles = await getRolesFromDynamoDB();
        
        // Find roles that are in DynamoDB but not in the new list
        const roleIdsToKeep = new Set(roles.map(r => r.id));
        const rolesToDelete = existingRoles.filter(r => !roleIdsToKeep.has(r.id));

        if (rolesToDelete.length === 0) {
            console.log('[rolesService] ℹ️  No roles to delete');
            return true;
        }

        console.log(`[rolesService] 🗑️  Deleting ${rolesToDelete.length} roles from DynamoDB`);

        // Delete roles in batches (BatchWriteCommand supports both PutRequest and DeleteRequest)
        const chunkSize = 25;
        for (let i = 0; i < rolesToDelete.length; i += chunkSize) {
            const chunk = rolesToDelete.slice(i, i + chunkSize);
            const deleteRequests = chunk.map(role => ({
                DeleteRequest: { Key: { id: role.id } }
            }));

            console.log(`[rolesService] 刪除批次 ${Math.floor(i / chunkSize) + 1}，包含 ${chunk.length} 個角色...`);

            await ddbDocClient.send(new BatchWriteCommand({
                RequestItems: {
                    [ROLES_TABLE]: deleteRequests
                }
            }));

            console.log(`[rolesService] ✅ 成功刪除批次 ${Math.floor(i / chunkSize) + 1} (${chunk.map(r => r.id).join(', ')})`);
        }

        console.log(`[rolesService] ✅ 成功刪除 ${rolesToDelete.length} 個已移除的角色`);
        return true;
    } catch (e: any) {
        console.error('[rolesService] ❌ Failed to delete removed roles:', e.message);
        return false;
    }
}

/**
 * Save roles to DynamoDB
 */
export async function saveRoles(roles: Role[]): Promise<boolean> {
    console.log(`[rolesService] 💾 Saving ${roles.length} roles...`);

    // Validate roles
    for (const role of roles) {
        if (!role.id || !role.name) {
            console.error('[rolesService] ❌ Invalid role: missing id or name', role);
            return false;
        }
    }

    // First, delete roles that were removed
    console.log('[rolesService] 🔄 Cleaning up removed roles...');
    const deleteResult = await deleteRemovedRoles(roles);
    if (!deleteResult) {
        console.error('[rolesService] ⚠️  Failed to delete removed roles, but continuing with save...');
        // Don't fail, continue with the save
    }

    // Then, write the new roles
    const result = await writeRolesToDynamoDB(roles);

    if (result) {
        console.log('[rolesService] ✅ Roles saved successfully');
    } else {
        console.error('[rolesService] ❌ Failed to save roles');
    }

    return result;
}