#!/usr/bin/env node
/**
 * lib/ai/limits.ts checkFeatureLimits — offline test (fake DDB; no AWS).
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-ai-limits.mjs
 *
 * Reads the FEATURE#f#LESSON#sid (perLesson) and FEATURE#f#USER#uid#yyyymmdd
 * (daily) request counters from cost-rollups and denies once used >= limit.
 * Any lookup error → allow (never break AI).
 */
process.env.AWS_ACCESS_KEY_ID = 'verify-limits-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-limits-fake';
process.env.AWS_REGION = 'ap-northeast-1';

const rollups = new Map(); // scopeKey -> { requests }
let throwOnGet = false;
const { ddbDocClient } = await import('../lib/dynamo.ts');
ddbDocClient.send = async (cmd) => {
  const n = cmd?.constructor?.name;
  const inp = cmd?.input || {};
  if (n === 'GetCommand') {
    if (throwOnGet) throw new Error('ddb down');
    if ((inp.TableName || '').includes('cost-rollups')) return { Item: rollups.get(inp.Key.scopeKey) };
  }
  return { Item: undefined };
};

const { checkFeatureLimits } = await import('../lib/ai/limits.ts');
const { currentYyyymmdd } = await import('../lib/ai/budget.ts');
const DAY = currentYyyymmdd();

let failed = 0, passed = 0;
const check = (l, c, d = '') => { if (c) { passed++; console.log(`  ✅ ${l}`); } else { failed++; console.log(`  ❌ ${l}${d ? `  (${d})` : ''}`); } };
const ent = (limits) => ({ featureId: 'tutor', enabled: true, reason: 'ok', locked: false, limits });

console.log('[1] no limits → allow');
check('無 limits → allow', (await checkFeatureLimits(ent({}), { feature: 'tutor', sessionId: 's1', userId: 'u1' })).allowed === true);

console.log('\n[2] perLesson limit');
rollups.clear();
rollups.set('FEATURE#tutor#LESSON#s1', { requests: 4 });
check('used 4 < 5 → allow', (await checkFeatureLimits(ent({ perLesson: 5 }), { feature: 'tutor', sessionId: 's1', userId: 'u1' })).allowed === true);
rollups.set('FEATURE#tutor#LESSON#s1', { requests: 5 });
{
  const r = await checkFeatureLimits(ent({ perLesson: 5 }), { feature: 'tutor', sessionId: 's1', userId: 'u1' });
  check('used 5 >= 5 → deny per_lesson_limit', r.allowed === false && r.reason === 'per_lesson_limit' && r.limit === 5, JSON.stringify(r));
}

console.log('\n[3] daily limit (per user)');
rollups.clear();
rollups.set(`FEATURE#tutor#USER#u1#${DAY}`, { requests: 10 });
{
  const r = await checkFeatureLimits(ent({ daily: 10 }), { feature: 'tutor', sessionId: 's1', userId: 'u1' });
  check('used 10 >= 10 → deny daily_limit', r.allowed === false && r.reason === 'daily_limit', JSON.stringify(r));
}
check('另一使用者不受影響 → allow',
  (await checkFeatureLimits(ent({ daily: 10 }), { feature: 'tutor', sessionId: 's1', userId: 'u2' })).allowed === true);

console.log('\n[4] perLesson checked before daily');
rollups.clear();
rollups.set('FEATURE#tutor#LESSON#s1', { requests: 5 });
rollups.set(`FEATURE#tutor#USER#u1#${DAY}`, { requests: 0 });
{
  const r = await checkFeatureLimits(ent({ perLesson: 5, daily: 10 }), { feature: 'tutor', sessionId: 's1', userId: 'u1' });
  check('perLesson 先觸發', r.allowed === false && r.reason === 'per_lesson_limit');
}

console.log('\n[5] lookup error → allow (never break AI)');
throwOnGet = true;
check('GetCommand 拋錯 → allow', (await checkFeatureLimits(ent({ perLesson: 1 }), { feature: 'tutor', sessionId: 's1', userId: 'u1' })).allowed === true);
throwOnGet = false;

console.log('');
if (failed === 0) console.log(`✅ ai-limits 全數通過(${passed} 項)`);
else console.log(`❌ ai-limits 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
