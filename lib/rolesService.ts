import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const ROLES_TABLE = process.env.DYNAMODB_TABLE_ROLES || '';

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
});

const ddbDocClient = DynamoDBDocumentClient.from(client);

export type Role = {
    id: string;
    name: string;
    description?: string;
    isActive: boolean;
    order?: number;
};

/**
 * Get all roles from DynamoDB
 */
async function getRolesFromDynamoDB(): Promise<Role[]> {
    if (!ROLES_TABLE) {
        console.warn('[rolesService] DYNAMODB_TABLE_ROLES not configured');
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
    } catch (e) {
        console.error('[rolesService] ❌ DynamoDB scan failed:', (e as any)?.message || e);
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

    console.log(`[rolesService] Writing ${roles.length} roles to DynamoDB`);

    try {
        const timestamp = new Date().toISOString();
        const itemsToWrite = roles.map((role, index) => ({
            ...role,
            order: role.order ?? index,
            updatedAt: timestamp
        }));

        // Use BatchWrite for efficiency
        const putRequests = itemsToWrite.map(item => ({
            PutRequest: { Item: item }
        }));

        if (putRequests.length === 0) {
            console.log('[rolesService] No roles to write');
            return true;
        }

        const response = await ddbDocClient.send(new BatchWriteCommand({
            RequestItems: {
                [ROLES_TABLE]: putRequests
            }
        }));

        // Check for UnprocessedItems
        const unprocessed = response.UnprocessedItems?.[ROLES_TABLE];
        if (unprocessed && unprocessed.length > 0) {
            console.error(`[rolesService] ⚠️  ${unprocessed.length} items failed to write`);
            return false;
        }

        console.log(`[rolesService] ✅ Successfully wrote ${roles.length} roles to DynamoDB`);
        return true;
    } catch (e) {
        console.error('[rolesService] ❌ Failed to write roles to DynamoDB:', (e as any)?.message || e);
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

    // Auto-migrate default roles to DynamoDB
    if (ROLES_TABLE) {
        console.log('[rolesService] Migrating default roles to DynamoDB...');
        await writeRolesToDynamoDB(defaultRoles);
    }

    return defaultRoles;
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

    const result = await writeRolesToDynamoDB(roles);

    if (result) {
        console.log('[rolesService] ✅ Roles saved successfully');
    } else {
        console.error('[rolesService] ❌ Failed to save roles');
    }

    return result;
}
