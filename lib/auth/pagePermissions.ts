/**
 * Page Permission Service
 *
 * 依角色檢查 admin 子路徑存取權限。支援兩層：
 *   1. 內建預設矩陣（DEFAULT_PAGE_PERMISSIONS）— 立即可用，無需 DB 設定。
 *   2. DynamoDB PagePermissionsTable 覆寫 — 由 admin 在 /admin/settings/page-permissions 設定，只能再收緊預設矩陣，不能放寬。
 *      資料格式與 lib/pagePermissionsService.ts 寫入的 PageConfig 相同：
 *        { id (= path), path, label, permissions: [{ roleId, roleName, menuVisible, dropdownVisible, pageVisible }] }
 *      讀取方式：以 path 的各層前綴（最長→最短）當 id 做 BatchGet，第一筆「permissions[] 內有該角色」
 *      的 item 決定結果：allowed = pageVisible !== false（與 PageAccessSettings / PermissionGuard 語意一致）。
 *      （舊版實作查 GSI RolePathIndex 的頂層 roleId，但寫入端從未寫入該欄位，覆寫永遠不生效。）
 *
 * admin / system 永遠允許（在查 DB 之前短路），避免被 DB 設定鎖在後台外。
 *
 * dept_admin 的範圍限制（限本部門）由 lib/auth/orgAccess.ts 的 requireOrgUnitAccess /
 * requireMemberScopeAccess / filterMembersForActor 在 API 層強制；
 * 此 service 只負責「頁面層級」的可見性（前端導航 + 進入頁面前檢查）。
 */

import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

/**
 * 與 lib/pagePermissionsService.ts 一致：未設定 DYNAMODB_TABLE_PAGE_PERMISSIONS 時不查 DB
 * （next.config.ts 會在 build 時補上預設表名 jvtutorcorner-page-permissions）。
 * 以函式延遲讀取，方便離線驗證腳本在 import 後設定環境變數。
 */
function getPagePermissionsTable(): string {
  return process.env.DYNAMODB_TABLE_PAGE_PERMISSIONS || '';
}

/** 永遠允許、不受 DB 覆寫影響的角色（防止把自己鎖在後台外）。 */
const NON_LOCKABLE_ROLES = new Set(['admin', 'system']);

/** DB 覆寫的短暫快取（每個 path id 一筆，含「不存在」），admin layout 每次導覽都會呼叫。 */
const DB_CACHE_TTL_MS = 30_000;
const dbItemCache = new Map<string, { item: StoredPageConfig | null; expiresAt: number }>();

// ==========================================
// 內建預設權限矩陣
// ==========================================
//
// key = role；value = 允許的 admin 子路徑前綴清單。
// 空陣列代表該角色對 admin 後台無任何頁面存取。
//
// 規則：這裡的預設是上限；DB（PageConfig.permissions[]，admin/system 除外）只能再拒絕，不能放寬。
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

/** lib/pagePermissionsService.ts 寫入的 item 形狀（只列出這裡用到的欄位）。 */
interface StoredPageConfig {
  id: string;
  path?: string;
  permissions?: Array<{ roleId?: string; pageVisible?: boolean }>;
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

  // 0. admin / system 不可被 DB 覆寫鎖住
  if (NON_LOCKABLE_ROLES.has(role)) {
    return { allowed: true, source: 'default' };
  }

  const defaultAllowed = matchPathAgainstList(path.split(/[?#]/)[0], DEFAULT_PAGE_PERMISSIONS[role] || []);

  // 1. DB 覆寫（最長前綴比對）只能「收緊」，不能放寬預設矩陣。
  //    /api/admin/settings 的「重新整理」會替每個角色、每個頁面寫入 pageVisible: true，
  //    若允許 DB 放寬，dept_admin / teacher 就會因此進入 /admin/settings 等頁面。
  //    預設就不允許的頁面，DB 寫什麼都維持拒絕。
  if (!defaultAllowed) {
    return { allowed: false, source: 'default' };
  }
  try {
    const dbResult = await queryDbPermission(role, path);
    if (dbResult !== null && !dbResult.allowed) {
      return { allowed: false, source: 'db', matchedPath: dbResult.path };
    }
  } catch (e: any) {
    // DB 查詢失敗不中斷流程，退回預設矩陣
    console.warn('[pagePermissions] DB lookup failed, fallback to default:', e?.message || e);
  }

  // 2. 內建預設矩陣允許，且 DB 沒有收緊
  return { allowed: true, source: 'default' };
}

/** 清除 DB 覆寫快取（供驗證腳本 / 設定儲存後使用）。 */
export function clearPagePermissionCache(): void {
  dbItemCache.clear();
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
 * 將 path 拆成由長到短的前綴清單（不含 '/'）。
 * '/admin/learners/123?x=1' → ['/admin/learners/123', '/admin/learners', '/admin']
 */
function pathPrefixesLongestFirst(path: string): string[] {
  const clean = path.split(/[?#]/)[0];
  const parts = clean.split('/').filter(Boolean);
  const out: string[] = [];
  for (let i = parts.length; i >= 1; i--) {
    out.push('/' + parts.slice(0, i).join('/'));
  }
  return out;
}

/** 以 id 批次讀取 PageConfig（含快取；不存在的 id 也快取為 null）。 */
async function loadPageConfigs(table: string, ids: string[]): Promise<Map<string, StoredPageConfig | null>> {
  const now = Date.now();
  const result = new Map<string, StoredPageConfig | null>();
  const missing: string[] = [];
  for (const id of ids) {
    const cached = dbItemCache.get(id);
    if (cached && cached.expiresAt > now) {
      result.set(id, cached.item);
    } else {
      missing.push(id);
    }
  }
  if (missing.length === 0) return result;

  // 前綴數量遠小於 BatchGet 上限 100；UnprocessedKeys 最多重試 3 次
  const found = new Map<string, StoredPageConfig>();
  let keys: Record<string, any>[] = missing.map((id) => ({ id }));
  for (let attempt = 0; attempt < 3 && keys.length > 0; attempt++) {
    const res = await ddbDocClient.send(
      new BatchGetCommand({
        RequestItems: { [table]: { Keys: keys, ProjectionExpression: 'id, #p, #perms', ExpressionAttributeNames: { '#p': 'path', '#perms': 'permissions' } } },
      })
    );
    for (const item of (res.Responses?.[table] as StoredPageConfig[]) || []) {
      if (item?.id) found.set(item.id, item);
    }
    keys = (res.UnprocessedKeys?.[table]?.Keys as Record<string, any>[]) || [];
  }
  if (keys.length > 0) {
    // 仍有未處理的 key：不快取、不猜測，交由呼叫端退回預設
    throw new Error(`BatchGet left ${keys.length} unprocessed keys`);
  }

  const expiresAt = Date.now() + DB_CACHE_TTL_MS;
  for (const id of missing) {
    const item = found.get(id) || null;
    dbItemCache.set(id, { item, expiresAt });
    result.set(id, item);
  }
  return result;
}

/**
 * 查詢 DB 中針對 (role, path) 的最長前綴覆寫紀錄。
 * 回傳 null 代表無覆寫（沒有 item，或 item 的 permissions[] 裡沒有這個角色）。
 */
async function queryDbPermission(
  role: string,
  path: string
): Promise<{ allowed: boolean; path: string } | null> {
  const table = getPagePermissionsTable();
  if (!table) return null;

  const prefixes = pathPrefixesLongestFirst(path);
  if (prefixes.length === 0) return null;

  const items = await loadPageConfigs(table, prefixes);
  const roleKey = role.toLowerCase();
  for (const prefix of prefixes) {
    const item = items.get(prefix);
    if (!item) continue;
    const perm = (item.permissions || []).find(
      (p) => String(p?.roleId || '').toLowerCase() === roleKey
    );
    if (!perm) continue;
    return { allowed: perm.pageVisible !== false, path: item.path || item.id };
  }
  return null;
}
