#!/usr/bin/env node
/**
 * 點數帳本 + 原子扣點回歸測試
 * ============================
 * 驗證 lib/pointsStorage.ts 的 applyPointsDelta（餘額 ADD + point-transactions
 * ledger Put + 冪等 marker，全在一個 TransactWrite）:
 *   1. 50 個並發 deduct 同帳戶 → 恰好扣到餘額用盡、不雙花
 *   2. 透支被拒（餘額不變）
 *   3. 同 idempotencyKey 重放 → 只套用一次（duplicate:true）
 *   4. 由 point-transactions 累加 = user-points 餘額（可對帳）
 *   5. 對照組:用「修正前 read→Put」演算法並發 → 必定重現雙花，證明測試有效
 *
 * 安全:記憶體假 DynamoDB,ddbDocClient.send 在載入被測模組前被替換,
 * 未支援的指令一律 throw,不連任何 AWS。
 *
 * 用法: node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-points-ledger.mjs
 * 退出碼: 0 = 全過;1 = 有失敗。
 */

process.env.AWS_ACCESS_KEY_ID = 'verify-ledger-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-ledger-fake';
process.env.AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';
process.env.DYNAMODB_TABLE_USER_POINTS = 'verify-points';
process.env.DYNAMODB_TABLE_POINT_TRANSACTIONS = 'verify-point-tx';

// ── 假 DynamoDB(支援 Get/Query/Put/Update/TransactWrite、複合鍵、條件式)──────
const tables = new Map(); // name -> Map(keyJson -> item)
const table = (n) => { if (!tables.has(n)) tables.set(n, new Map()); return tables.get(n); };
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(Math.floor(Math.random() * 4));

const KEY_FIELDS = { 'verify-points': ['userId'], 'verify-point-tx': ['userId', 'sk'] };
const keyOf = (name, item) =>
  JSON.stringify(KEY_FIELDS[name].map((k) => [k, item[k]]));

function rName(tok, names = {}) { return tok && tok.startsWith('#') ? names[tok] : tok; }
function rVal(tok, values = {}) {
  if (!(tok in values)) throw new Error(`fake ddb: missing value ${tok}`);
  return values[tok];
}
// 支援: attribute_exists(x) / attribute_not_exists(x) / x = :v / x >= :v / A AND B
function checkCondition(item, expr, names, values) {
  if (!expr) return true;
  const parts = expr.split(/\bAND\b/).map((s) => s.trim());
  return parts.every((p) => {
    let m;
    if ((m = p.match(/^attribute_not_exists\(\s*(#?\w+)\s*\)$/)))
      return item === undefined || item[rName(m[1], names)] === undefined;
    if ((m = p.match(/^attribute_exists\(\s*(#?\w+)\s*\)$/)))
      return item !== undefined && item[rName(m[1], names)] !== undefined;
    if ((m = p.match(/^(#?\w+)\s*=\s*(:\w+)$/)))
      return item !== undefined && item[rName(m[1], names)] === rVal(m[2], values);
    if ((m = p.match(/^(#?\w+)\s*>=\s*(:\w+)$/)))
      return item !== undefined && typeof item[rName(m[1], names)] === 'number' && item[rName(m[1], names)] >= rVal(m[2], values);
    throw new Error(`fake ddb: unsupported condition "${p}"`);
  });
}
function applyUpdate(item, key, expr, names, values) {
  const next = item ? clone(item) : clone(key);
  const clauses = expr.split(/\b(SET|ADD|REMOVE)\b/).map((t) => t.trim()).filter(Boolean);
  for (let i = 0; i < clauses.length; i += 2) {
    const kind = clauses[i];
    const body = clauses[i + 1] ?? '';
    for (const part of body.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (kind === 'SET') {
        const [lhs, rhs] = part.split('=').map((s) => s.trim());
        next[rName(lhs, names)] = clone(rVal(rhs, values));
      } else if (kind === 'ADD') {
        const [lhs, rhs] = part.split(/\s+/);
        const a = rName(lhs, names);
        next[a] = (typeof next[a] === 'number' ? next[a] : 0) + rVal(rhs, values);
      } else if (kind === 'REMOVE') {
        delete next[rName(part, names)];
      }
    }
  }
  return next;
}
async function fakeSend(cmd) {
  const kind = cmd?.constructor?.name;
  const input = cmd?.input ?? {};
  await jitter();
  if (kind === 'GetCommand') return { Item: clone(table(input.TableName).get(keyOf(input.TableName, input.Key))) };
  if (kind === 'QueryCommand') {
    const uid = input.ExpressionAttributeValues[':u'];
    const items = [...table(input.TableName).values()].filter((it) => it.userId === uid);
    return { Items: clone(items) };
  }
  if (kind === 'PutCommand') {
    const t = table(input.TableName), k = keyOf(input.TableName, input.Item);
    if (!checkCondition(t.get(k), input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) {
      const e = new Error('conditional failed'); e.name = 'ConditionalCheckFailedException'; throw e;
    }
    t.set(k, clone(input.Item)); return {};
  }
  if (kind === 'UpdateCommand') {
    const t = table(input.TableName), k = keyOf(input.TableName, input.Key);
    const cur = t.get(k);
    if (!checkCondition(cur, input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) {
      const e = new Error('conditional failed'); e.name = 'ConditionalCheckFailedException'; throw e;
    }
    const next = applyUpdate(cur, input.Key, input.UpdateExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues);
    t.set(k, next); return input.ReturnValues === 'UPDATED_NEW' ? { Attributes: clone(next) } : {};
  }
  if (kind === 'TransactWriteCommand') {
    const items = input.TransactItems ?? [];
    // 原子:先同步查全部條件,全過才同步套用(中間無 await)
    const reasons = items.map((e) => {
      const op = e.Update || e.Put; const isPut = !!e.Put;
      const name = op.TableName;
      const key = isPut ? op.Item : op.Key;
      const cur = table(name).get(keyOf(name, key));
      const ok = checkCondition(cur, op.ConditionExpression, op.ExpressionAttributeNames, op.ExpressionAttributeValues);
      return { Code: ok ? 'None' : 'ConditionalCheckFailed' };
    });
    if (reasons.some((r) => r.Code !== 'None')) {
      const e = new Error('cancelled'); e.name = 'TransactionCanceledException'; e.CancellationReasons = reasons; throw e;
    }
    for (const e of items) {
      if (e.Put) { const n = e.Put.TableName; table(n).set(keyOf(n, e.Put.Item), clone(e.Put.Item)); }
      else { const u = e.Update, n = u.TableName, k = keyOf(n, u.Key);
        table(n).set(k, applyUpdate(table(n).get(k), u.Key, u.UpdateExpression, u.ExpressionAttributeNames, u.ExpressionAttributeValues)); }
    }
    return {};
  }
  throw new Error(`fake ddb: unsupported ${kind}`);
}

const { ddbDocClient } = await import('../lib/dynamo.ts');
ddbDocClient.send = fakeSend;
const storage = await import('../lib/pointsStorage.ts');
const ledger = await import('../lib/pointsLedger.ts');
const { applyPointsDelta, getUserPoints, useDynamoForPoints } = storage;
const { reconstructBalance } = ledger;

let failed = 0, passed = 0;
const check = (label, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${detail ? `  (${detail})` : ''}`); }
};

console.log('前置:確認走 DynamoDB 分支');
check('useDynamoForPoints === true', useDynamoForPoints === true);

console.log('\n[1] 並發 deduct 不雙花');
{
  const u = 'u_ledger_1';
  await applyPointsDelta({ userId: u, amount: 100, type: 'purchase', refType: 'order', refId: 'o1', idempotencyKey: 'seed-1' });
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      applyPointsDelta({ userId: u, amount: -10, type: 'enroll_hold', refType: 'order', refId: `e${i}`, idempotencyKey: `deduct-${i}` })
    )
  );
  const ok = results.filter((r) => r.ok).length;
  const bal = await getUserPoints(u);
  const recon = await reconstructBalance(u);
  check('恰 10 筆成功(100/10)', ok === 10, `got ${ok}`);
  check('最終餘額 = 0', bal === 0, `got ${bal}`);
  check('帳本重建 = 餘額(可對帳)', recon === bal, `recon ${recon} vs bal ${bal}`);
}

console.log('\n[2] 透支被拒');
{
  const u = 'u_ledger_2';
  await applyPointsDelta({ userId: u, amount: 100, type: 'purchase', idempotencyKey: 'seed-2' });
  const r = await applyPointsDelta({ userId: u, amount: -200, type: 'enroll_hold', idempotencyKey: 'over-1' });
  check('deduct 200 於餘額 100 → ok:false', r.ok === false);
  check('餘額不變 = 100', (await getUserPoints(u)) === 100);
}

console.log('\n[3] 冪等重放');
{
  const u = 'u_ledger_3';
  await applyPointsDelta({ userId: u, amount: 50, type: 'purchase', idempotencyKey: 'seed-3' });
  const key = 'dup-key-1';
  const r1 = await applyPointsDelta({ userId: u, amount: -20, type: 'enroll_hold', idempotencyKey: key });
  const r2 = await applyPointsDelta({ userId: u, amount: -20, type: 'enroll_hold', idempotencyKey: key });
  check('第一次 ok、非重複', r1.ok === true && r1.duplicate === false);
  check('第二次 ok、duplicate:true', r2.ok === true && r2.duplicate === true);
  check('只扣一次 → 餘額 30', (await getUserPoints(u)) === 30, `got ${await getUserPoints(u)}`);
  check('帳本重建 = 餘額', (await reconstructBalance(u)) === 30);
}

console.log('\n[4] 對照組:修正前 read→Put 必定雙花(證明測試有效)');
{
  const u = 'u_ctrl';
  // 直接對假 user-points 表用舊演算法
  const T = 'verify-points';
  const { GetCommand, PutCommand } = await import('@aws-sdk/lib-dynamodb');
  await ddbDocClient.send(new PutCommand({ TableName: T, Item: { userId: u, balance: 100 } }));
  const oldDeduct = async (amount) => {
    const cur = (await ddbDocClient.send(new GetCommand({ TableName: T, Key: { userId: u } }))).Item?.balance ?? 0;
    if (cur < amount) return false;
    await ddbDocClient.send(new PutCommand({ TableName: T, Item: { userId: u, balance: cur - amount } }));
    return true;
  };
  await Promise.all(Array.from({ length: 50 }, () => oldDeduct(10)));
  const bal = (await ddbDocClient.send(new GetCommand({ TableName: T, Key: { userId: u } }))).Item?.balance ?? 0;
  // 正確序列化結果應為 0(10 次成功後其餘看到 0 被拒)。舊 read→Put 因 lost-update
  // 會落在非 0(這裡 80 = 大量扣點互相覆蓋,學生沒真的被扣),證明測試抓得到此類 bug。
  check('舊演算法並發後餘額 ≠ 0(重現 lost-update)', bal !== 0, `got ${bal}`);
}

console.log(`\n${failed === 0 ? '✅ 全部通過' : '❌ 有失敗'} — passed ${passed}, failed ${failed}`);
process.exit(failed === 0 ? 0 : 1);
