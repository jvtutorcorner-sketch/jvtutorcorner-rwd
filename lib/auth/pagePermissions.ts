/**
 * Page Permission Service
 *
 * 依角色檢查 admin 子路徑存取權限。支援兩層：
 *   1. 內建預設矩陣（DEFAULT_PAGE_PERMISSIONS）— 立即可用，無需 DB 設定。
 *   2. DynamoDB PagePermissionsTable（GSI RolePathIndex）— 由 admin 在 /admin/roles 設定覆寫。
 *
 * dept_admin 的範圍限制（限本部門）由 lib/auth/orgAccess.ts 的 requireOrgUnitAccess /
 * requireMemberScopeAccess / filterMembersForActor 在 API 層強制；
 * 此 service 只負責「頁面層級」的可見性（前端導航 + 進入頁面前檢查）。
 */

import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

const PAGE_PERMISSIONS_TABLE =
  process.env.DYNAMODB_TABLE_PAGE_PERMISSIONS ||
  process.env.PAGE_PERMISSIONS_TABLE ||
  'jvtutorcorner-page-permissions';

// ==========================================
// 內建預設權限矩陣
// ==========================================
//
// key = role；value = 允許的 admin 子路徑前綴清單。
// 空陣列代表該角色對 admin 後台無任何頁面存取。
//
// 規則覆蓋優先序：DB (RolePathIndex) > 這裡的預設。
const DEFAULT_PAGE_PERMISSIONS: Record<string, string[]> = {
  // admin: 全部 admin 後台可見
  admin: ['*'],
  // dept_admin: 僅學員管理、學習路徑指派、本部門分析、本組織成員（API 層會再限 orgUnit）
  dept_admin: [
    '/admin/learners',
    '/admin/analytics',
    '/admin/learning-paths/assign',
    '/admin/organizations/*/members',
  ],
  // teacher / student: 無 admin 後台存取
  teacher: [],
  student: [],
  // system: 全部（cron/系統用）
  system: ['*'],
};

// ==========================================
// Types
// ==========================================

export interface PagePermissionRecord {
  permissionId: string;
  roleId: string;
  path: string;
  allowed: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CanAccessResult {
  allowed: boolean;
  source: 'default' | 'db';
  matchedPath?: string;
}

// ==========================================
// Core API
// ==========================================

/**
 * 檢查 role 是否可存取 path。
 *
 * @param role 角色 id（如 'admin' / 'dept_admin'）
 * @param path 完整路徑，如 '/admin/learners/123'
 * @returns { allowed, source }
 */
export async function canAccessPage(
  role: string,
  path: string
): Promise<CanAccessResult> {
  if (!role || !path) return { allowed: false, source: 'default' };

  // 1. 先查 DB 覆寫（最長前綴比對）
  try {
    const dbResult = await queryDbPermission(role, path);
    if (dbResult !== null) {
      return { allowed: dbResult.allowed, source: 'db', matchedPath: dbResult.path };
    }
  } catch (e: any) {
    // DB 查詢失敗不中斷流程，退回預設矩陣
    console.warn('[pagePermissions] DB lookup failed, fallback to default:', e?.message || e);
  }

  // 2. 退回內建預設矩陣
  const allowed = matchPathAgainstList(path, DEFAULT_PAGE_PERMISSIONS[role] || []);
  return { allowed, source: 'default' };
}

/**
 * 同步版本：只用內建預設矩陣判定（不查 DB），供 middleware 快速過濾。
 */
export function canAccessPageSync(role: string, path: string): boolean {
  if (!role || !path) return false;
  const allowed = matchPathAgainstList(path, DEFAULT_PAGE_PERMISSIONS[role] || []);
  return allowed;
}

/**
 * 取得內建預設權限矩陣（供 admin/roles UI 顯示與初始化用）。
 */
export function getDefaultPagePermissions(): Record<string, string[]> {
  return { ...DEFAULT_PAGE_PERMISSIONS };
}

// ==========================================
// Internal helpers
// ==========================================

/**
 * 將 path 與 allowed 清單比對。
 * - 清單元素 '*' 代表整個 /admin 皆允許（admin 全權）。
 * - 結尾或中段含 '*' 視為萬用：例如 '/admin/learners' 命中 '/admin/learners/123'；
 *   '/admin/organizations/<wildcard>/members' 命中 '/admin/organizations/orgA/members'。
 */
function matchPathAgainstList(path: string, allowed: string[]): boolean {
  for (const rule of allowed) {
    if (rule === '*') return true;
    if (rule === path) return true;
    // 處理中段萬用 /organizations/*/members
    if (rule.includes('*')) {
      const regex = new RegExp(
        '^' + rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '($|/)'
      );
      if (regex.test(path)) return true;
    } else if (path.startsWith(rule + '/') || path === rule) {
      return true;
    }
  }
  return false;
}

/**
 * 查詢 DB 中針對 (role, path) 的最長前綴覆寫紀錄。
 * 回傳 null 代表無覆寫。
 */
async function queryDbPermission(
  role: string,
  path: string
): Promise<{ allowed: boolean; path: string } | null> {
  // RolePathIndex GSI: HASH roleId, RANGE path
  // 查 roleId 下所有 path，找出最長前綴符合的一筆
  const res = await ddbDocClient.send(
    new QueryCommand({
      TableName: PAGE_PERMISSIONS_TABLE,
      IndexName: 'RolePathIndex',
      KeyConditionExpression: 'roleId = :role',
      ExpressionAttributeValues: { ':role': role },
    })
  );
  const items = (res.Items as PagePermissionRecord[]) || [];
  if (items.length === 0) return null;

  // 找最長前綴符合（含 * 萬用）
  let best: { allowed: boolean; path: string; len: number } | null = null;
  for (const item of items) {
    if (item.path === '*') {
      // 全權覆寫
      if (!best || item.path.length > best.len) {
        best = { allowed: item.allowed, path: item.path, len: item.path.length };
      }
      continue;
    }
    if (item.path === path || path.startsWith(item.path + '/') || path === item.path) {
      if (!best || item.path.length > best.len) {
        best = { allowed: item.allowed, path: item.path, len: item.path.length };
      }
    }
  }
  return best
    ? { allowed: best.allowed, path: best.path }
    : null;
}