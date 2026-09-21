#!/usr/bin/env node
/**
 * 平台抽成 + escrow ledger legs 回歸測試
 * =====================================
 * 驗證 lib/pointsEscrow.ts settleEscrow 的抽成拆分:
 *   1. fee=0.30 release → 老師 +70、平台 +30、ledger 兩腿(escrow_release+platform_fee)和 = 100
 *   2. fee=0    release → 老師 +100、無平台腿、平台餘額不變(＝現況行為)
 *   3. refund → 學生 +100、無抽成(不論 fee)
 *   4. fee=0.30 下並發 release 同筆 → 恰一次(沿用 settlement 保證)、老師只入帳一次
 *
 * 安全:記憶體假 DynamoDB,不連 AWS。
 * 用法: node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-escrow-commission.mjs
 */

process.env.AWS_ACCESS_KEY_ID = 'verify-comm-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-comm-fake';
process.env.AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';
process.env.DYNAMODB_TABLE_POINTS_ESCROW = 'verify-escrow';
process.env.DYNAMODB_TABLE_USER_POINTS = 'verify-points';
process.env.DYNAMODB_TABLE_POINT_TRANSACTIONS = 'verify-point-tx';
process.env.PLATFORM_REVENUE_ACCOUNT_ID = 'platform-revenue';

const tables = new Map();
const table = (n) => { if (!tables.has(n)) tables.set(n, new Map()); return tables.get(n); };
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(Math.floor(Math.random() * 4));
const KEY_FIELDS = { 'verify-escrow': ['escrowId'], 'verify-points': ['userId'], 'verify-point-tx': ['userId', 'sk'] };
const keyOf = (name, item) => JSON.stringify(KEY_FIELDS[name].map((k) => [k, item[k]]));
const rName = (t, n = {}) => (t && t.startsWith('#') ? n[t] : t);
const rVal = (t, v = {}) => { if (!(t in v)) throw new Error(`missing ${t}`); return v[t]; };
function checkCondition(item, expr, names, values) {
  if (!expr) return true;
  return expr.split(/\bAND\b/).map((s) => s.trim()).every((p) => {
    let m;
    if ((m = p.match(/^attribute_not_exists\(\s*(#?\w+)\s*\)$/))) return item === undefined || item[rName(m[1], names)] === undefined;
    if ((m = p.match(/^attribute_exists\(\s*(#?\w+)\s*\)$/))) return item !== undefined && item[rName(m[1], names)] !== undefined;
    if ((m = p.match(/^(#?\w+)\s*=\s*(:\w+)$/))) return item !== undefined && item[rName(m[1], names)] === rVal(m[2], values);
    if ((m = p.match(/^(#?\w+)\s*>=\s*(:\w+)$/))) return item !== undefined && item[rName(m[1], names)] >= rVal(m[2], values);
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
      else if (kind === 'REMOVE') delete next[rName(part, names)];
    }
  }
  return next;
}
async function fakeSend(cmd) {
  const kind = cmd?.constructor?.name, input = cmd?.input ?? {};
  await jitter();
  if (kind === 'GetCommand') return { Item: clone(table(input.TableName).get(keyOf(input.TableName, input.Key))) };
  if (kind === 'QueryCommand') {
    const uid = input.ExpressionAttributeValues?.[':u'];
    return { Items: clone([...table(input.TableName).values()].filter((it) => it.userId === uid)) };
  }
  if (kind === 'PutCommand') {
    const t = table(input.TableName), k = keyOf(input.TableName, input.Item);
    if (!checkCondition(t.get(k), input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) { const e = new Error('cond'); e.name = 'ConditionalCheckFailedException'; throw e; }
    t.set(k, clone(input.Item)); return {};
  }
  if (kind === 'UpdateCommand') {
    const t = table(input.TableName), k = keyOf(input.TableName, input.Key), cur = t.get(k);
    if (!checkCondition(cur, input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) { const e = new Error('cond'); e.name = 'ConditionalCheckFailedException'; throw e; }
    const next = applyUpdate(cur, input.Key, input.UpdateExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues);
    t.set(k, next); return input.ReturnValues === 'UPDATED_NEW' ? { Attributes: clone(next) } : {};
  }
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
const escrow = await import('../lib/pointsEscrow.ts');
const storage = await import('../lib/pointsStorage.ts');
const ledger = await import('../lib/pointsLedger.ts');
const { releaseEscrow, refundEscrow } = escrow;
const { getUserPoints } = storage;
const { queryUserLedger } = ledger;

let failed = 0, passed = 0;
const check = (l, c, d = '') => { if (c) { passed++; console.log(`  ✅ ${l}`); } else { failed++; console.log(`  ❌ ${l}${d ? `  (${d})` : ''}`); } };
const seedEscrow = (id, teacherId, studentId, points) =>
  fakeSend({ constructor: { name: 'PutCommand' }, input: { TableName: 'verify-escrow', Item: { escrowId: id, orderId: 'o', enrollmentId: 'e', studentId, teacherId, points, status: 'HOLDING', createdAt: new Date().toISOString() } } });
const legs = async (uid) => (await queryUserLedger(uid));

console.log('[1] fee=0.30 release → 老師 70 / 平台 30');
{
  process.env.PLATFORM_FEE_RATE = '0.30';
  await seedEscrow('esc1', 'teacher1', 'student1', 100);
  const r = await releaseEscrow('esc1');
  check('release ok', r.ok === true);
  check('老師 +70', (await getUserPoints('teacher1')) === 70, `got ${await getUserPoints('teacher1')}`);
  check('平台 +30', (await getUserPoints('platform-revenue')) === 30, `got ${await getUserPoints('platform-revenue')}`);
  const tl = await legs('teacher1'); const pl = await legs('platform-revenue');
  check('老師 ledger 一腿 escrow_release=70', tl.length === 1 && tl[0].type === 'escrow_release' && tl[0].amount === 70);
  check('平台 ledger 一腿 platform_fee=30', pl.length === 1 && pl[0].type === 'platform_fee' && pl[0].amount === 30);
  check('兩腿和 = 100', tl[0].amount + pl[0].amount === 100);
}

console.log('\n[2] fee=0 release → 老師 100、無平台腿(現況行為)');
{
  process.env.PLATFORM_FEE_RATE = '0';
  await seedEscrow('esc2', 'teacher2', 'student2', 100);
  const r = await releaseEscrow('esc2');
  check('release ok', r.ok === true);
  check('老師 +100', (await getUserPoints('teacher2')) === 100, `got ${await getUserPoints('teacher2')}`);
  check('平台餘額不變(0)', (await getUserPoints('platform-revenue')) === 30, `got ${await getUserPoints('platform-revenue')}`);
  const pl = await legs('platform-revenue');
  check('無新增 platform_fee 腿(仍只有 [1] 的那筆)', pl.length === 1);
}

console.log('\n[3] refund → 學生 100、不抽成');
{
  process.env.PLATFORM_FEE_RATE = '0.30';
  await seedEscrow('esc3', 'teacher3', 'student3', 100);
  const r = await refundEscrow('esc3');
  check('refund ok', r.ok === true);
  check('學生 +100', (await getUserPoints('student3')) === 100, `got ${await getUserPoints('student3')}`);
  const sl = await legs('student3');
  check('學生 ledger 一腿 refund=100', sl.length === 1 && sl[0].type === 'refund' && sl[0].amount === 100);
}

console.log('\n[4] fee=0.30 並發 release 同筆 → 恰一次');
{
  process.env.PLATFORM_FEE_RATE = '0.30';
  await seedEscrow('esc4', 'teacher4', 'student4', 100);
  const rs = await Promise.all(Array.from({ length: 20 }, () => releaseEscrow('esc4')));
  check('恰 1 筆成功', rs.filter((r) => r.ok).length === 1, `got ${rs.filter((r) => r.ok).length}`);
  check('老師只入帳一次 = 70', (await getUserPoints('teacher4')) === 70, `got ${await getUserPoints('teacher4')}`);
}

console.log(`\n${failed === 0 ? '✅ 全部通過' : '❌ 有失敗'} — passed ${passed}, failed ${failed}`);
process.exit(failed === 0 ? 0 : 1);
