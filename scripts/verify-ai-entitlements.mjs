#!/usr/bin/env node
/**
 * 7 層 AI 權益解析純函式測試(resolve):三態 on/off/inherit、locked 終局、
 * 下層覆寫上層、plan gate、成本參數最嚴格、非成本最近層、requiredPlan 取最高。
 * 用法: node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-ai-entitlements.mjs
 */
const { resolve, scopeChain } = await import('../lib/ai/entitlements.ts');

let failed = 0, passed = 0;
const check = (l, c, d = '') => { if (c) { passed++; console.log(`  ✅ ${l}`); } else { failed++; console.log(`  ❌ ${l}${d ? `  (${d})` : ''}`); } };

const seedOff = { defaultEnabled: false };
const seedOn = { defaultEnabled: true };
const ctx = { orgId: 'o1', planId: 'pro', teacherId: 't1', courseId: 'c1', sessionId: 's1', userId: 'u1' };
const chain = scopeChain(ctx);

check('scopeChain 順序 GLOBAL→…→USER',
  JSON.stringify(chain) === JSON.stringify(['GLOBAL', 'TENANT#o1', 'PLAN#pro', 'TEACHER#t1', 'COURSE#c1', 'LESSON#s1', 'USER#u1']));

check('default-off seed → disabled/default-off',
  (() => { const r = resolve('f', [], chain, seedOff, 'pro'); return r.enabled === false && r.reason === 'default-off'; })());

check('GLOBAL on → enabled',
  resolve('f', [{ featureId: 'f', scope: 'GLOBAL', enabled: 'on' }], chain, seedOff, 'pro').enabled === true);

check('GLOBAL on + USER off → 下層覆寫 → disabled',
  resolve('f', [{ featureId: 'f', scope: 'GLOBAL', enabled: 'on' }, { featureId: 'f', scope: 'USER#u1', enabled: 'off' }], chain, seedOff, 'pro').enabled === false);

check('GLOBAL off + COURSE on → 下層覆寫 → enabled',
  resolve('f', [{ featureId: 'f', scope: 'GLOBAL', enabled: 'off' }, { featureId: 'f', scope: 'COURSE#c1', enabled: 'on' }], chain, seedOff, 'pro').enabled === true);

check('TENANT locked:off → 終局 off,USER on 也無效',
  (() => { const r = resolve('f', [{ featureId: 'f', scope: 'TENANT#o1', enabled: 'off', locked: true }, { featureId: 'f', scope: 'USER#u1', enabled: 'on' }], chain, seedOn, 'pro'); return r.enabled === false && r.reason === 'locked' && r.locked === true; })());

check('plan gate:requiredPlan pro、plan basic → off/plan',
  (() => { const r = resolve('f', [{ featureId: 'f', scope: 'GLOBAL', enabled: 'on', requiredPlan: 'pro' }], chain, seedOff, 'basic'); return r.enabled === false && r.reason === 'plan'; })());

check('plan gate:requiredPlan pro、plan elite → on',
  resolve('f', [{ featureId: 'f', scope: 'GLOBAL', enabled: 'on', requiredPlan: 'pro' }], chain, seedOff, 'elite').enabled === true);

check('成本參數 perLessonLimit 取最嚴格(10 與 5 → 5)',
  resolve('f', [{ featureId: 'f', scope: 'GLOBAL', enabled: 'on', perLessonLimit: 10 }, { featureId: 'f', scope: 'COURSE#c1', perLessonLimit: 5 }], chain, seedOff, 'pro').limits.perLesson === 5);

check('非成本 pointCost 取最近層(GLOBAL 3、USER 1 → 1)',
  resolve('f', [{ featureId: 'f', scope: 'GLOBAL', enabled: 'on', pointCost: 3 }, { featureId: 'f', scope: 'USER#u1', pointCost: 1 }], chain, seedOff, 'pro').pointCost === 1);

check('requiredPlan 取最高(seed basic + COURSE pro → pro)',
  (() => { const r = resolve('f', [{ featureId: 'f', scope: 'COURSE#c1', enabled: 'on', requiredPlan: 'pro' }], chain, { defaultEnabled: false, requiredPlan: 'basic' }, 'elite'); return r.requiredPlan === 'pro'; })());

check('maxCostPerRequest 取最嚴格',
  resolve('f', [{ featureId: 'f', scope: 'GLOBAL', enabled: 'on', maxCostPerRequestMusd: 8000 }, { featureId: 'f', scope: 'USER#u1', maxCostPerRequestMusd: 3000 }], chain, seedOff, 'pro').maxCostPerRequestMusd === 3000);

console.log(`\n${failed === 0 ? '✅ 全部通過' : '❌ 有失敗'} — passed ${passed}, failed ${failed}`);
process.exit(failed === 0 ? 0 : 1);
