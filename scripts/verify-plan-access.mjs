#!/usr/bin/env node
/**
 * 伺服端方案權益 hasPlanAccess 純函式測試。
 * 用法: node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-plan-access.mjs
 */
const { hasPlanAccess, PLAN_LEVELS } = await import('../lib/planAccess.ts');

let failed = 0, passed = 0;
const check = (l, c, d = '') => { if (c) { passed++; console.log(`  ✅ ${l}`); } else { failed++; console.log(`  ❌ ${l}${d ? `  (${d})` : ''}`); } };

check('PLAN_LEVELS 排序 viewer<basic<pro<elite',
  PLAN_LEVELS.viewer < PLAN_LEVELS.basic && PLAN_LEVELS.basic < PLAN_LEVELS.pro && PLAN_LEVELS.pro < PLAN_LEVELS.elite);
check('elite 可上 pro 課', hasPlanAccess('elite', 'pro') === true);
check('pro 可上 pro 課', hasPlanAccess('pro', 'pro') === true);
check('basic 不可上 pro 課', hasPlanAccess('basic', 'pro') === false);
check('viewer 不可上 basic 課', hasPlanAccess('viewer', 'basic') === false);
check('無 requiredPlan → 一律可(未設門檻)', hasPlanAccess('viewer', '') === true);
check('未知 user plan 視為最低', hasPlanAccess('gibberish', 'basic') === false);
check('未知 requiredPlan 視為 basic(級 1)', hasPlanAccess('viewer', 'gold') === false);
check('null/undefined user 視為 viewer', hasPlanAccess(undefined, 'basic') === false);

console.log(`\n${failed === 0 ? '✅ 全部通過' : '❌ 有失敗'} — passed ${passed}, failed ${failed}`);
process.exit(failed === 0 ? 0 : 1);
