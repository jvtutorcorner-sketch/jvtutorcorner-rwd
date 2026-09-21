#!/usr/bin/env node
/**
 * AI/RTC 用量帳本 + cost-rollups 回歸測試
 * ======================================
 * 驗證 lib/ai/gateway/ledger.ts recordUsage(單一 TransactWrite:usage ledger Put
 * + 各 scope rollup ADD):
 *   1. 多筆 usage → LESSON scope rollup 累加正確、requests 計數正確
 *   2. micro-USD 以整數累加(無浮點漂移)
 *   3. 同 requestId 重放 → duplicate:true、rollup 不重複累加
 *   4. costCenter 分流:ai_musd / platform_musd 各自正確、total = 兩者和
 *
 * 安全:記憶體假 DynamoDB,不連 AWS。
 * 用法: node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-cost-ledger.mjs
 */

process.env.AWS_ACCESS_KEY_ID = 'verify-cost-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-cost-fake';
process.env.AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';
process.env.DYNAMODB_TABLE_AI_USAGE_LEDGER = 'verify-ai-usage';
process.env.DYNAMODB_TABLE_COST_ROLLUPS = 'verify-cost-rollups';

const tables = new Map();
const table = (n) => { if (!tables.has(n)) tables.set(n, new Map()); return tables.get(n); };
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(Math.floor(Math.random() * 3));
const KEY_FIELDS = { 'verify-ai-usage': ['pk', 'sk'], 'verify-cost-rollups': ['scopeKey'] };
const keyOf = (name, item) => JSON.stringify(KEY_FIELDS[name].map((k) => [k, item[k]]));
const rName = (t, n = {}) => (t && t.startsWith('#') ? n[t] : t);
const rVal = (t, v = {}) => { if (!(t in v)) throw new Error(`missing ${t}`); return v[t]; };
function checkCondition(item, expr, names, values) {
  if (!expr) return true;
  return expr.split(/\bAND\b/).map((s) => s.trim()).every((p) => {
    let m;
    if ((m = p.match(/^attribute_not_exists\(\s*(#?\w+)\s*\)$/))) return item === undefined || item[rName(m[1], names)] === undefined;
    if ((m = p.match(/^attribute_exists\(\s*(#?\w+)\s*\)$/))) return item !== undefined && item[rName(m[1], names)] !== undefined;
    throw new Error(`unsupported condition ${p}`);
  });
}
function applyUpdate(item, key, expr, names, values) {
  const next = item ? clone(item) : clone(key);
  const clauses = expr.split(/\b(SET|ADD|REMOVE)\b/).map((t) => t.trim()).filter(Boolean);
  for (let i = 0; i < clauses.length; i += 2) {
    const kind = clauses[i], body = clauses[i + 1] ?? '';
    for (const part of body.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (kind === 'SET') { const [l, r] = part.split('=').map((s) => s.trim()); next[rName(l, names)] = clone(rVal(r, values)); }
      else if (kind === 'ADD') { const [l, r] = part.split(/\s+/); const a = rName(l, names); next[a] = (typeof next[a] === 'number' ? next[a] : 0) + rVal(r, values); }
    }
  }
  return next;
}
async function fakeSend(cmd) {
  const kind = cmd?.constructor?.name, input = cmd?.input ?? {};
  await jitter();
  if (kind === 'GetCommand') return { Item: clone(table(input.TableName).get(keyOf(input.TableName, input.Key))) };
  if (kind === 'TransactWriteCommand') {
    const items = input.TransactItems ?? [];
    const reasons = items.map((e) => {
      const op = e.Update || e.Put; const key = e.Put ? op.Item : op.Key;
      const ok = checkCondition(table(op.TableName).get(keyOf(op.TableName, key)), op.ConditionExpression, op.ExpressionAttributeNames, op.ExpressionAttributeValues);
      return { Code: ok ? 'None' : 'ConditionalCheckFailed' };
    });
    if (reasons.some((r) => r.Code !== 'None')) { const e = new Error('cancelled'); e.name = 'TransactionCanceledException'; e.CancellationReasons = reasons; throw e; }
    for (const e of items) {
      if (e.Put) { const n = e.Put.TableName; table(n).set(keyOf(n, e.Put.Item), clone(e.Put.Item)); }
      else { const u = e.Update, n = u.TableName, k = keyOf(n, u.Key); table(n).set(k, applyUpdate(table(n).get(k), u.Key, u.UpdateExpression, u.ExpressionAttributeNames, u.ExpressionAttributeValues)); }
    }
    return {};
  }
  throw new Error(`unsupported ${kind}`);
}

const { ddbDocClient } = await import('../lib/dynamo.ts');
ddbDocClient.send = fakeSend;
const mod = await import('../lib/ai/gateway/ledger.ts');
const { recordUsage, getRollup } = mod;

let failed = 0, passed = 0;
const check = (l, c, d = '') => { if (c) { passed++; console.log(`  ✅ ${l}`); } else { failed++; console.log(`  ❌ ${l}${d ? `  (${d})` : ''}`); } };
const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');

console.log('[1] 多筆 usage → LESSON rollup 累加 + [2] micro-USD 整數');
{
  await recordUsage({ requestId: 'r1', costCenter: 'ai', actualCostMusd: 1200, feature: 'l1', sessionId: 's1' });
  await recordUsage({ requestId: 'r2', costCenter: 'ai', actualCostMusd: 800, feature: 'l2', sessionId: 's1' });
  await recordUsage({ requestId: 'r3', costCenter: 'ai', actualCostMusd: 55, feature: 'tutor', sessionId: 's1' });
  const roll = await getRollup('LESSON#s1');
  check('LESSON#s1 total_musd = 2055', roll?.total_musd === 2055, `got ${roll?.total_musd}`);
  check('requests = 3', roll?.requests === 3, `got ${roll?.requests}`);
  check('值為整數 micro-USD', Number.isInteger(roll?.total_musd));
}

console.log('\n[3] 同 requestId 重放 → 不重複累加');
{
  const before = (await getRollup('LESSON#s1'))?.total_musd;
  const r = await recordUsage({ requestId: 'r1', costCenter: 'ai', actualCostMusd: 1200, feature: 'l1', sessionId: 's1' });
  const after = (await getRollup('LESSON#s1'))?.total_musd;
  check('duplicate:true', r.duplicate === true);
  check('rollup 不變', before === after, `${before} vs ${after}`);
}

console.log('\n[4] costCenter 分流(ai vs platform)');
{
  await recordUsage({ requestId: 'r4', costCenter: 'platform', actualCostMusd: 500, feature: 'rtc', sessionId: 's2' });
  await recordUsage({ requestId: 'r5', costCenter: 'ai', actualCostMusd: 300, feature: 'l3', sessionId: 's2' });
  const roll = await getRollup('LESSON#s2');
  check('platform_musd = 500', roll?.platform_musd === 500, `got ${roll?.platform_musd}`);
  check('ai_musd = 300', roll?.ai_musd === 300, `got ${roll?.ai_musd}`);
  check('total = 800 = 兩者和', roll?.total_musd === 800 && roll?.total_musd === roll?.ai_musd + roll?.platform_musd);
}

console.log('\n[5] GLOBAL rollup 跨 session 累加');
{
  const g = await getRollup(`GLOBAL#${yyyymm}`);
  check('GLOBAL requests = 5(r1..r5,去重後)', g?.requests === 5, `got ${g?.requests}`);
  check('GLOBAL total = 2855', g?.total_musd === 2855, `got ${g?.total_musd}`);
}

console.log(`\n${failed === 0 ? '✅ 全部通過' : '❌ 有失敗'} — passed ${passed}, failed ${failed}`);
process.exit(failed === 0 ? 0 : 1);
