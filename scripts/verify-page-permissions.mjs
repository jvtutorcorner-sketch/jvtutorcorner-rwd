#!/usr/bin/env node
/**
 * canAccessPage DB 覆寫回歸測試（離線）
 * ====================================
 *
 * lib/auth/pagePermissions.ts 過去查 GSI RolePathIndex 的頂層 roleId，但
 * lib/pagePermissionsService.ts 寫入的 PageConfig 只有 { id (= path), path, permissions[] }，
 * 導致 /admin/settings/page-permissions 的設定在 server 端（app/admin/layout.tsx）永遠不生效。
 *
 * 本腳本以假的 DynamoDB（攔截 ddbDocClient.send，只支援 BatchGetCommand）驗證：
 *   - teacher 在 /admin/x 被 DB 覆寫拒絕
 *   - dept_admin 透過前綴 /admin/y 被 DB 覆寫允許（/admin/y/sub）
 *   - admin / system 不可被 DB 鎖住
 *   - 無 item 或 item 沒有該角色 → 退回內建預設矩陣
 *   - 最長前綴優先、DB 失敗退回預設
 *
 * 不連網路、不碰真實資料庫；請勿加 --env-file。
 *
 * 用法：
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-page-permissions.mjs
 *
 * 退出碼：0 = 全部通過；1 = 有失敗。
 */

import assert from 'node:assert/strict';

const TABLE = 'fake-page-permissions';
process.env.DYNAMODB_TABLE_PAGE_PERMISSIONS = TABLE;
// 確保就算 SDK 被誤呼叫也不會拿到真實憑證
delete process.env.AWS_ACCESS_KEY_ID;
delete process.env.AWS_SECRET_ACCESS_KEY;
delete process.env.AWS_SESSION_TOKEN;
process.env.AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';

const { ddbDocClient } = await import('../lib/dynamo.ts');
const { canAccessPage, clearPagePermissionCache } = await import('../lib/auth/pagePermissions.ts');

const perm = (roleId, pageVisible) => ({ roleId, roleName: roleId, menuVisible: false, dropdownVisible: false, pageVisible });

const fakeTable = new Map([
  ['/admin/x', { id: '/admin/x', path: '/admin/x', permissions: [perm('teacher', false), perm('dept_admin', false), perm('admin', false), perm('system', false)] }],
  ['/admin/y', { id: '/admin/y', path: '/admin/y', permissions: [perm('dept_admin', true)] }],
  // 最長前綴優先：/admin/y/locked 拒絕 dept_admin，但 /admin/y 允許
  ['/admin/y/locked', { id: '/admin/y/locked', path: '/admin/y/locked', permissions: [perm('dept_admin', false)] }],
  // item 存在但沒有 dept_admin 的 entry → 往較短前綴 / 預設
  ['/admin/learners/special', { id: '/admin/learners/special', path: '/admin/learners/special', permissions: [perm('teacher', true)] }],
  // pageVisible 未定義 → 視為可見（與 PageAccessSettings 語意一致）
  ['/admin/z', { id: '/admin/z', path: '/admin/z', permissions: [{ roleId: 'dept_admin', roleName: 'Dept Admin' }] }],
  // 預設允許的頁面，DB 可以收緊
  ['/admin/analytics', { id: '/admin/analytics', path: '/admin/analytics', permissions: [perm('dept_admin', false)] }],
  // 預設允許、DB 寫 true → 維持允許
  ['/admin/learners', { id: '/admin/learners', path: '/admin/learners', permissions: [perm('dept_admin', true)] }],
  // 「重新整理」會替所有角色寫 pageVisible:true；預設不允許的頁面不得因此放行
  ['/admin/settings', { id: '/admin/settings', path: '/admin/settings', permissions: [perm('dept_admin', true), perm('teacher', true)] }],
]);

let calls = 0;
let failNext = false;
ddbDocClient.send = async (command) => {
  calls++;
  const name = command?.constructor?.name;
  if (name !== 'BatchGetCommand') throw new Error(`unexpected command ${name}`);
  if (failNext) {
    failNext = false;
    throw new Error('simulated DynamoDB outage');
  }
  const req = command.input.RequestItems[TABLE];
  assert.ok(req, 'BatchGet must target the page-permissions table');
  const items = req.Keys.map((k) => fakeTable.get(k.id)).filter(Boolean);
  return { Responses: { [TABLE]: items }, UnprocessedKeys: {} };
};

let failed = 0;
async function check(label, role, path, expected) {
  clearPagePermissionCache();
  const got = await canAccessPage(role, path);
  try {
    assert.equal(got.allowed, expected.allowed);
    if (expected.source) assert.equal(got.source, expected.source);
    if (expected.matchedPath) assert.equal(got.matchedPath, expected.matchedPath);
    console.log(`  ✅ ${label} -> ${JSON.stringify(got)}`);
  } catch {
    failed++;
    console.log(`  ❌ ${label} -> ${JSON.stringify(got)}  預期 ${JSON.stringify(expected)}`);
  }
}

console.log('canAccessPage DB override:');
await check('teacher 在 /admin/x：預設即拒絕', 'teacher', '/admin/x', { allowed: false, source: 'default' });
await check('dept_admin 在 /admin/y/sub：DB 寫 true 也不能放寬預設', 'dept_admin', '/admin/y/sub', { allowed: false, source: 'default' });
await check('dept_admin 在 /admin/z：pageVisible 未定義也不能放寬預設', 'dept_admin', '/admin/z', { allowed: false, source: 'default' });
await check('dept_admin 在 /admin/settings：「重新整理」寫入的 true 不放行', 'dept_admin', '/admin/settings', { allowed: false, source: 'default' });
await check('teacher 在 /admin/settings：「重新整理」寫入的 true 不放行', 'teacher', '/admin/settings', { allowed: false, source: 'default' });
await check('dept_admin 在 /admin/analytics/1：DB 收緊預設（最長前綴）', 'dept_admin', '/admin/analytics/1', { allowed: false, source: 'db', matchedPath: '/admin/analytics' });
await check('dept_admin 在 /admin/learners/1：DB 寫 true，維持預設允許', 'dept_admin', '/admin/learners/1', { allowed: true, source: 'default' });
await check('admin 不可被 DB 鎖住 (/admin/x)', 'admin', '/admin/x', { allowed: true });
await check('system 不可被 DB 鎖住 (/admin/x)', 'system', '/admin/x', { allowed: true });
await check('item 無該角色 → 預設：dept_admin /admin/learners/special', 'dept_admin', '/admin/learners/special', { allowed: true, source: 'default' });
await check('無 item → 預設：teacher /admin/finance 拒絕', 'teacher', '/admin/finance', { allowed: false, source: 'default' });
await check('query string 被忽略', 'dept_admin', '/admin/analytics?tab=1', { allowed: false, source: 'db' });

clearPagePermissionCache();
failNext = true;
{
  const got = await canAccessPage('dept_admin', '/admin/learners');
  try {
    assert.deepEqual(got, { allowed: true, source: 'default' });
    console.log(`  ✅ DB 失敗退回預設 -> ${JSON.stringify(got)}`);
  } catch {
    failed++;
    console.log(`  ❌ DB 失敗退回預設 -> ${JSON.stringify(got)}`);
  }
}

// 快取：同一路徑第二次不再呼叫 DB
clearPagePermissionCache();
calls = 0;
await canAccessPage('dept_admin', '/admin/analytics');
await canAccessPage('dept_admin', '/admin/analytics');
try {
  assert.equal(calls, 1);
  console.log('  ✅ 30 秒快取：相同前綴只查一次 DB');
} catch {
  failed++;
  console.log(`  ❌ 快取失效：DB 呼叫 ${calls} 次`);
}

// 未設定表名 → 不查 DB
clearPagePermissionCache();
delete process.env.DYNAMODB_TABLE_PAGE_PERMISSIONS;
calls = 0;
{
  const got = await canAccessPage('teacher', '/admin/x');
  try {
    assert.equal(calls, 0);
    assert.deepEqual(got, { allowed: false, source: 'default' });
    console.log('  ✅ 未設定 DYNAMODB_TABLE_PAGE_PERMISSIONS → 不查 DB，走預設');
  } catch {
    failed++;
    console.log(`  ❌ 未設定表名仍查 DB 或結果錯誤 (calls=${calls}, ${JSON.stringify(got)})`);
  }
}

if (failed > 0) {
  console.log(`\n${failed} 個案例失敗`);
  process.exit(1);
}
console.log('\n全部通過');
