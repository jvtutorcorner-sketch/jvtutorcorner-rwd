/**
 * Organizational Units Service
 * 
 * Handles hierarchical organizational structure with parent/child relationships.
 * 
 * SECURITY PATTERN:
 * - Production (Amplify): Uses IAM role (no credentials in code)
 * - Local Dev: Only uses AWS_ACCESS_KEY_ID if explicitly set in environment
 * 
 * HIERARCHY RULES:
 * - Root units have parentId = null, level = 0, path = '/<unitId>'
 * - Child units have parentId set, level = parent.level + 1, path = '<parent.path>/<unitId>'
 * - Moving units updates all descendant paths (recursive)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  TransactWriteCommand,
  DeleteCommand
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import type { OrgUnit, CreateOrgUnitInput, UpdateOrgUnitInput } from './types/b2b';

// ==========================================
// DynamoDB Client Setup (Clean IAM Pattern)
// ==========================================

const REGION = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
export const ORG_UNITS_TABLE = process.env.DYNAMODB_TABLE_ORG_UNITS || 'jvtutorcorner-org-units';

/** Max items per TransactWriteCommand call when rewriting a moved subtree. */
const MOVE_TRANSACT_CHUNK_SIZE = 25;

/**
 * Initialize DynamoDB Client with secure credential handling
 */
function createDynamoClient(): DynamoDBDocumentClient {
  const clientConfig: any = { region: REGION };
  
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
  
  if (accessKeyId && secretAccessKey) {
    console.log('[OrgUnitService] Using explicit AWS credentials (local dev mode)');
    clientConfig.credentials = { accessKeyId, secretAccessKey };
  } else {
    console.log('[OrgUnitService] Using IAM role (production mode)');
  }
  
  const client = new DynamoDBClient(clientConfig);
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true }
  });
}

const ddbDocClient = createDynamoClient();

// ==========================================
// Helper Functions
// ==========================================

/**
 * Build hierarchical path for a unit
 */
function buildPath(parentPath: string | null, unitId: string): string {
  if (!parentPath) {
    return `/${unitId}`;
  }
  return `${parentPath}/${unitId}`;
}

/**
 * Calculate level from parent
 */
function calculateLevel(parentLevel: number | null): number {
  return parentLevel !== null ? parentLevel + 1 : 0;
}

// ==========================================
// CRUD Operations
// ==========================================

/**
 * Create a new organizational unit
 */
export async function createOrgUnit(input: CreateOrgUnitInput): Promise<OrgUnit> {
  const now = new Date().toISOString();
  const id = randomUUID();
  
  let parentPath: string | null = null;
  let parentLevel: number | null = null;
  
  // If there's a parent, fetch it to build the path
  if (input.parentId) {
    const parent = await getOrgUnitById(input.parentId);
    if (!parent) {
      throw new Error(`Parent unit not found: ${input.parentId}`);
    }
    if (parent.orgId !== input.orgId) {
      throw new Error('Parent unit must belong to the same organization');
    }
    parentPath = parent.path;
    parentLevel = parent.level;
  }
  
  const path = buildPath(parentPath, id);
  const level = calculateLevel(parentLevel);
  
  const orgUnit: OrgUnit = {
    id,
    orgId: input.orgId,
    name: input.name,
    parentId: input.parentId || null,
    path,
    level,
    managerId: input.managerId,
    description: input.description,
    status: 'active',
    createdAt: now,
    updatedAt: now
  };
  
  try {
    await ddbDocClient.send(new PutCommand({
      TableName: ORG_UNITS_TABLE,
      Item: orgUnit,
      ConditionExpression: 'attribute_not_exists(id)'
    }));
    
    console.log(`[OrgUnitService] ✅ Created org unit: ${id} (${input.name}) at path ${path}`);
    return orgUnit;
  } catch (error: any) {
    console.error('[OrgUnitService] ❌ Failed to create org unit:', error.message);
    throw new Error(`Failed to create org unit: ${error.message}`);
  }
}

/**
 * Get org unit by ID
 */
export async function getOrgUnitById(id: string): Promise<OrgUnit | null> {
  try {
    const result = await ddbDocClient.send(new GetCommand({
      TableName: ORG_UNITS_TABLE,
      Key: { id }
    }));
    
    return (result.Item as OrgUnit) || null;
  } catch (error: any) {
    console.error(`[OrgUnitService] ❌ Failed to get org unit ${id}:`, error.message);
    throw new Error(`Failed to get org unit: ${error.message}`);
  }
}

/**
 * List all org units for an organization (uses GSI)
 */
export async function listOrgUnitsByOrg(orgId: string): Promise<OrgUnit[]> {
  try {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: ORG_UNITS_TABLE,
      IndexName: 'byOrgId',
      KeyConditionExpression: 'orgId = :orgId',
      ExpressionAttributeValues: {
        ':orgId': orgId
      }
    }));
    
    const units = (result.Items as OrgUnit[]) || [];
    
    // Sort by path for hierarchical display
    units.sort((a, b) => a.path.localeCompare(b.path));
    
    return units;
  } catch (error: any) {
    console.error(`[OrgUnitService] ❌ Failed to list org units for org ${orgId}:`, error.message);
    throw new Error(`Failed to list org units: ${error.message}`);
  }
}

/**
 * Get direct children of a unit
 */
export async function getChildUnits(parentId: string): Promise<OrgUnit[]> {
  try {
    const parent = await getOrgUnitById(parentId);
    if (!parent) {
      throw new Error(`Parent unit not found: ${parentId}`);
    }
    
    // Query all units in the org and filter by parentId
    const allUnits = await listOrgUnitsByOrg(parent.orgId);
    return allUnits.filter(unit => unit.parentId === parentId);
  } catch (error: any) {
    console.error(`[OrgUnitService] ❌ Failed to get child units:`, error.message);
    throw new Error(`Failed to get child units: ${error.message}`);
  }
}

/**
 * Get all descendants of a unit (recursive)
 */
export async function getDescendantUnits(unitId: string): Promise<OrgUnit[]> {
  try {
    const unit = await getOrgUnitById(unitId);
    if (!unit) {
      throw new Error(`Unit not found: ${unitId}`);
    }
    
    // Get all units in the org
    const allUnits = await listOrgUnitsByOrg(unit.orgId);
    
    // Filter descendants by path prefix
    const pathPrefix = `${unit.path}/`;
    return allUnits.filter(u => u.path.startsWith(pathPrefix));
  } catch (error: any) {
    console.error(`[OrgUnitService] ❌ Failed to get descendant units:`, error.message);
    throw new Error(`Failed to get descendant units: ${error.message}`);
  }
}

/**
 * Update org unit
 */
export async function updateOrgUnit(
  id: string, 
  updates: UpdateOrgUnitInput
): Promise<OrgUnit> {
  const now = new Date().toISOString();
  
  // Build UpdateExpression dynamically
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};
  
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = now;
  
  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      updateExpressions.push(`#${key} = :${key}`);
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = value;
    }
  });
  
  try {
    const result = await ddbDocClient.send(new UpdateCommand({
      TableName: ORG_UNITS_TABLE,
      Key: { id },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }));
    
    console.log(`[OrgUnitService] ✅ Updated org unit: ${id}`);
    return result.Attributes as OrgUnit;
  } catch (error: any) {
    console.error(`[OrgUnitService] ❌ Failed to update org unit ${id}:`, error.message);
    throw new Error(`Failed to update org unit: ${error.message}`);
  }
}

/**
 * Move org unit to a new parent (updates path for unit and all descendants)
 * 
 * COMPLEX OPERATION:
 * 1. Get the unit and validate the new parent
 * 2. Calculate new path
 * 3. Get all descendants
 * 4. Update unit and all descendants in batches (respecting 25-item limit)
 */
export async function moveOrgUnit(unitId: string, newParentId: string | null): Promise<OrgUnit> {
  try {
    // 1. Get the unit being moved
    const unit = await getOrgUnitById(unitId);
    if (!unit) {
      throw new Error(`Unit not found: ${unitId}`);
    }
    
    // Prevent moving to self or current parent
    if (newParentId === unitId) {
      throw new Error('Cannot move unit to itself');
    }
    if (newParentId === unit.parentId) {
      console.log(`[OrgUnitService] Unit ${unitId} already under parent ${newParentId}, no-op`);
      return unit;
    }
    
    // 2. Validate new parent (if not null)
    let newParentPath: string | null = null;
    let newParentLevel: number | null = null;
    
    if (newParentId) {
      const newParent = await getOrgUnitById(newParentId);
      if (!newParent) {
        throw new Error(`New parent unit not found: ${newParentId}`);
      }
      if (newParent.orgId !== unit.orgId) {
        throw new Error('Cannot move unit to a different organization');
      }
      // Prevent moving to own descendant (circular reference)
      if (newParent.path.startsWith(`${unit.path}/`)) {
        throw new Error('Cannot move unit to its own descendant');
      }
      newParentPath = newParent.path;
      newParentLevel = newParent.level;
    }
    
    // 3. Calculate new path and level
    const oldPath = unit.path;
    const newPath = buildPath(newParentPath, unitId);
    const newLevel = calculateLevel(newParentLevel);
    const levelDelta = newLevel - unit.level;
    const now = new Date().toISOString();

    // 4. Get all descendants
    const descendants = await getDescendantUnits(unitId);

    console.log(`[OrgUnitService] Moving unit ${unitId} from ${oldPath} to ${newPath} (${descendants.length} descendants)`);

    // 5. Build one TransactWriteCommand item per affected unit (the moved unit + every
    // descendant). Each item carries a ConditionExpression pinning it to its known
    // current path (optimistic concurrency) so a concurrent move can't interleave.
    // Prefix-slice rather than String.replace(oldPath, newPath) — replace() matches the
    // first occurrence anywhere in the string, which could clobber a non-prefix match if a
    // descendant path happens to contain oldPath elsewhere (unlikely with UUID segments,
    // but slicing is the only actually-correct way to rewrite a path prefix).
    type MoveItem = { id: string; path: string; level: number; expectedOldPath: string; isRoot: boolean };
    const items: MoveItem[] = [
      { id: unitId, path: newPath, level: newLevel, expectedOldPath: oldPath, isRoot: true },
      ...descendants.map((d) => ({
        id: d.id,
        path: newPath + d.path.slice(oldPath.length),
        level: d.level + levelDelta,
        expectedOldPath: d.path,
        isRoot: false
      }))
    ];

    for (let i = 0; i < items.length; i += MOVE_TRANSACT_CHUNK_SIZE) {
      const chunk = items.slice(i, i + MOVE_TRANSACT_CHUNK_SIZE);
      try {
        await ddbDocClient.send(new TransactWriteCommand({
          TransactItems: chunk.map((item) => ({
            Update: {
              // ExpressionAttributeNames/Values shapes differ between the root item and
              // descendants (root also sets #parentId); cast at the call site rather than
              // widen every branch to a lowest-common-denominator Record type.
              TableName: ORG_UNITS_TABLE,
              Key: { id: item.id },
              UpdateExpression: item.isRoot
                ? 'SET #path = :newPath, #level = :newLevel, #parentId = :newParentId, #updatedAt = :now'
                : 'SET #path = :newPath, #level = :newLevel, #updatedAt = :now',
              ConditionExpression: 'attribute_exists(id) AND #path = :expectedOldPath',
              ExpressionAttributeNames: item.isRoot
                ? { '#path': 'path', '#level': 'level', '#parentId': 'parentId', '#updatedAt': 'updatedAt' }
                : { '#path': 'path', '#level': 'level', '#updatedAt': 'updatedAt' },
              ExpressionAttributeValues: item.isRoot
                ? {
                    ':newPath': item.path,
                    ':newLevel': item.level,
                    ':newParentId': newParentId,
                    ':now': now,
                    ':expectedOldPath': item.expectedOldPath
                  }
                : {
                    ':newPath': item.path,
                    ':newLevel': item.level,
                    ':now': now,
                    ':expectedOldPath': item.expectedOldPath
                  }
            }
          })) as any
        }));
      } catch (chunkError: any) {
        const affectedIds = chunk.map((c) => c.id).join(', ');
        console.error(
          `[OrgUnitService] ❌ moveOrgUnit failed at chunk ${Math.floor(i / MOVE_TRANSACT_CHUNK_SIZE)} (units: ${affectedIds}):`,
          chunkError.message
        );
        throw new Error(
          `Failed to move org unit: chunk ${Math.floor(i / MOVE_TRANSACT_CHUNK_SIZE)} of ${Math.ceil(items.length / MOVE_TRANSACT_CHUNK_SIZE)} failed (${chunk.length} units: ${affectedIds}). ` +
          `Units before this chunk were already updated — run repairOrgUnitPaths('${unit.orgId}') to reconcile. Original error: ${chunkError.message}`
        );
      }
    }

    console.log(`[OrgUnitService] ✅ Successfully moved unit ${unitId} to new parent ${newParentId} (${descendants.length} descendants updated)`);
    const movedUnit = await getOrgUnitById(unitId);
    return movedUnit as OrgUnit;
  } catch (error: any) {
    console.error(`[OrgUnitService] ❌ Failed to move org unit:`, error.message);
    throw new Error(`Failed to move org unit: ${error.message}`);
  }
}

/**
 * Recompute path/level for every unit in an organization from its parentId chain and
 * rewrite any that drifted. Idempotent — safe to run repeatedly. Intended as a manual
 * backstop for the (rare) case where a multi-chunk moveOrgUnit partially fails.
 */
export async function repairOrgUnitPaths(orgId: string): Promise<{ repaired: number; total: number }> {
  const units = await listOrgUnitsByOrg(orgId);
  const byId = new Map(units.map((u) => [u.id, u]));
  const now = new Date().toISOString();

  function computePath(unit: OrgUnit, seen: Set<string>): { path: string; level: number } {
    if (seen.has(unit.id)) {
      throw new Error(`Cycle detected in org unit hierarchy at unit ${unit.id}`);
    }
    if (!unit.parentId || !byId.has(unit.parentId)) {
      return { path: `/${unit.id}`, level: 0 };
    }
    const parent = computePath(byId.get(unit.parentId)!, new Set(seen).add(unit.id));
    return { path: `${parent.path}/${unit.id}`, level: parent.level + 1 };
  }

  let repaired = 0;
  for (const unit of units) {
    const { path, level } = computePath(unit, new Set());
    if (unit.path !== path || unit.level !== level) {
      await ddbDocClient.send(new UpdateCommand({
        TableName: ORG_UNITS_TABLE,
        Key: { id: unit.id },
        UpdateExpression: 'SET #path = :path, #level = :level, #updatedAt = :now',
        ExpressionAttributeNames: { '#path': 'path', '#level': 'level', '#updatedAt': 'updatedAt' },
        ExpressionAttributeValues: { ':path': path, ':level': level, ':now': now }
      }));
      repaired++;
    }
  }
  console.log(`[OrgUnitService] repairOrgUnitPaths(${orgId}): repaired ${repaired}/${units.length} units`);
  return { repaired, total: units.length };
}

/**
 * Delete org unit (soft delete by setting status to 'archived')
 * Hard delete only if no children exist
 */
export async function deleteOrgUnit(id: string, hardDelete: boolean = false): Promise<void> {
  try {
    // Check for children
    const children = await getChildUnits(id);
    if (children.length > 0 && hardDelete) {
      throw new Error(`Cannot hard delete unit with ${children.length} children. Delete children first or use soft delete.`);
    }
    
    if (hardDelete) {
      await ddbDocClient.send(new DeleteCommand({
        TableName: ORG_UNITS_TABLE,
        Key: { id }
      }));
      console.log(`[OrgUnitService] ✅ Hard deleted org unit: ${id}`);
    } else {
      // Soft delete
      await updateOrgUnit(id, { status: 'archived' });
      console.log(`[OrgUnitService] ✅ Soft deleted (archived) org unit: ${id}`);
    }
  } catch (error: any) {
    console.error(`[OrgUnitService] ❌ Failed to delete org unit ${id}:`, error.message);
    throw new Error(`Failed to delete org unit: ${error.message}`);
  }
}

/**
 * Build tree structure from flat list of org units
 * Returns root units with children nested
 */
export function buildOrgTree(units: OrgUnit[]): OrgUnit[] {
  const unitMap = new Map<string, OrgUnit & { children: OrgUnit[] }>();
  const roots: (OrgUnit & { children: OrgUnit[] })[] = [];
  
  // First pass: create map with children arrays
  units.forEach(unit => {
    unitMap.set(unit.id, { ...unit, children: [] });
  });
  
  // Second pass: build hierarchy
  units.forEach(unit => {
    const node = unitMap.get(unit.id)!;
    if (unit.parentId && unitMap.has(unit.parentId)) {
      const parent = unitMap.get(unit.parentId)!;
      parent.children.push(node);
    } else {
      // Root unit
      roots.push(node);
    }
  });
  
  // Sort roots by path
  roots.sort((a, b) => a.path.localeCompare(b.path));
  
  return roots;
}

// ==========================================
// Exports
// ==========================================

export default {
  createOrgUnit,
  getOrgUnitById,
  listOrgUnitsByOrg,
  getChildUnits,
  getDescendantUnits,
  updateOrgUnit,
  moveOrgUnit,
  deleteOrgUnit,
  buildOrgTree,
  repairOrgUnitPaths
};
