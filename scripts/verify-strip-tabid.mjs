#!/usr/bin/env node
/**
 * stripTabId 回歸測試
 * ===================
 *
 * lib/accessControl.ts 的 stripTabId 曾把 canonical id `u_1776606536043`
 * 截斷成 `u`（回傳最後一個底線之前的字串），導致 verifyCourseAccess 用錯的
 * userId 去查 byUserId GSI，把已 PAID 報名的學生誤判為「No active enrollment
 * found」，在 /api/agora/token、/api/agora/session、/api/whiteboard/room 回 403。
 *
 * 本腳本只驗證這個純函式，不連網路、不碰資料庫。
 *
 * 用法：
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-strip-tabid.mjs
 *
 * 退出碼：0 = 全部通過；1 = 有失敗。
 */

import assert from 'node:assert/strict';
import { stripTabId } from '../lib/accessControl.ts';

const cases = [
  // [input, expected, why]
  // ── 回歸案例：canonical id 含底線但沒有 tab 後綴，絕不能被截斷 ──
  ['u_1776606536043', 'u_1776606536043', 'canonical u_<digits> 保持原樣（先前被截成 "u"）'],
  ['u_177', 'u_177', 'canonical 短 id 保持原樣'],
  ['u_177_tabXYZ', 'u_177_tabXYZ', 'base 非 email/role，整串保留'],

  // ── slug 型 canonical id（無底線）──
  ['pro-demo', 'pro-demo', 'slug 無底線，保持原樣'],
  ['teacher-demo2', 'teacher-demo2', 'slug 無底線，保持原樣'],

  // ── email cursor id：帶 tab 要剝、不帶 tab 要保留 ──
  ['group-0-student@test.com_abc12345', 'group-0-student@test.com', 'email + tab → 剝掉 tab'],
  ['group-0-student@test.com', 'group-0-student@test.com', 'email 無 tab → 保持原樣'],
  ['foo_bar@domain.com_abc12345', 'foo_bar@domain.com', 'local part 含底線的 email + tab → 只剝 tab'],
  ['foo_bar@domain.com', 'foo_bar@domain.com', 'local part 含底線的 email 無 tab → 保持原樣'],
  ['user@domain.com', 'user@domain.com', '純 email → 保持原樣'],

  // ── bare-role cursor id（無 email 時的 fallback）：帶 tab 要剝 ──
  ['teacher_abc12345', 'teacher', 'teacher + tab → 剝成 teacher'],
  ['student_a1b2c3d4', 'student', 'student + tab → 剝成 student'],
  ['teacher', 'teacher', 'bare role 無 tab → 保持原樣'],

  // ── 邊界 ──
  ['', '', '空字串'],
  ['_abc123', '_abc123', '開頭底線非 tab 分隔，保持原樣'],
];

let failed = 0;
for (const [input, expected, why] of cases) {
  try {
    const got = stripTabId(input);
    assert.equal(got, expected);
    console.log(`  ✅ ${JSON.stringify(input)} -> ${JSON.stringify(got)}  (${why})`);
  } catch {
    failed++;
    console.log(`  ❌ ${JSON.stringify(input)} -> ${JSON.stringify(stripTabId(input))}  預期 ${JSON.stringify(expected)}  (${why})`);
  }
}

console.log('');
if (failed === 0) {
  console.log(`✅ stripTabId 回歸測試全數通過（${cases.length} 例）`);
  process.exit(0);
} else {
  console.log(`❌ stripTabId 回歸測試有 ${failed}/${cases.length} 例失敗`);
  process.exit(1);
}
