#!/usr/bin/env node
/**
 * 點數暫存（escrow）結算並發回歸測試
 * =================================
 *
 * lib/pointsEscrow.ts 的 releaseEscrow / refundEscrow 原本是
 *   讀 escrow → 讀餘額 → Put 新餘額 → 條件式更新狀態
 * 兩個同時的呼叫者（admin 手動釋放、agora/session PATCH、LiveKit webhook、結算 cron）
 * 都會通過狀態檢查、都替老師加點，造成雙重入帳；而 blind Put 也會讓同一位老師
 * 的兩筆不同 escrow 同時入帳時互相覆蓋。
 *
 * 修正後改為單一 TransactWriteCommand：狀態 HOLDING→RELEASED|REFUNDED 的條件
 * 與餘額 ADD 一起原子提交。本腳本用「假的 DynamoDB」驗證：
 *   1. 50 個並發 release 同一筆 → 恰一次成功、老師只入帳一次
 *   2. release 與 refund 互搶同一筆 → 恰一方成功、只有一方入帳
 *   3. 同一位老師兩筆不同 escrow 並發 release → 兩筆都入帳（ADD 不互蓋）
 *   4. 非 HOLDING / 不存在 → ok:false、不入帳
 *   5. 對照組：以同一個假 DB 跑「修正前」演算法 → 必定重現雙重入帳，
 *      證明本測試確實抓得到這個 bug
 *
 * 安全性：不連網路、不碰任何真實資料表。ddbDocClient.send 在載入被測模組前
 * 就被替換成記憶體實作，未知指令一律 throw；AWS 憑證也只給假值。
 *
 * 用法：
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-escrow-settlement.mjs
 *
 * 退出碼：0 = 全部通過；1 = 有失敗。
 */

// 假憑證讓 useDynamoForEscrow / useDynamoForPoints 走 DynamoDB 分支（必須在 import 前設定）
process.env.AWS_ACCESS_KEY_ID = 'verify-escrow-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-escrow-fake';
process.env.AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';
process.env.DYNAMODB_TABLE_POINTS_ESCROW = 'verify-escrow-table';
process.env.DYNAMODB_TABLE_USER_POINTS = 'verify-points-table';
process.env.DYNAMODB_TABLE_POINT_TRANSACTIONS = 'verify-point-tx-table';

const ESCROW_TABLE = 'verify-escrow-table';
const POINTS_TABLE = 'verify-points-table';
const POINT_TX_TABLE = 'verify-point-tx-table';

// ── 假 DynamoDB ──────────────────────────────────────────────────────────────
const tables = new Map(); // tableName -> Map(keyJson -> item)
const keyOf = (key) => JSON.stringify(Object.entries(key).sort());
// Key-field extraction so a Put (whose input is a full item) resolves to the same
// key string as an Update (whose input is a key object).
const KEY_FIELDS = { [ESCROW_TABLE]: ['escrowId'], [POINTS_TABLE]: ['userId'], [POINT_TX_TABLE]: ['userId', 'sk'] };
const keyFromItem = (name, item) => keyOf(Object.fromEntries((KEY_FIELDS[name] ?? ['userId']).map((k) => [k, item[k]])));
const table = (name) => {
  if (!tables.has(name)) tables.set(name, new Map());
  return tables.get(name);
};
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(Math.floor(Math.random() * 4));
let sendCount = 0;

function resolveName(token, names = {}) {
  return token.startsWith('#') ? names[token] ?? (() => { throw new Error(`unknown name ${token}`); })() : token;
}
function resolveValue(token, values = {}) {
  if (!token.startsWith(':')) throw new Error(`fake ddb: expected value placeholder, got ${token}`);
  if (!(token in values)) throw new Error(`fake ddb: missing value ${token}`);
  return values[token];
}

function checkCondition(item, expr, names, values) {
  if (!expr) return true;
  const m = expr.match(/^\s*(#?\w+)\s*=\s*(:\w+)\s*$/);
  if (!m) throw new Error(`fake ddb: unsupported ConditionExpression "${expr}"`);
  const attr = resolveName(m[1], names);
  return item !== undefined && item[attr] === resolveValue(m[2], values);
}

function applyUpdate(item, expr, names, values) {
  const next = item ? clone(item) : {};
  const clauses = expr.split(/\b(SET|ADD|REMOVE)\b/).map((t) => t.trim()).filter(Boolean);
  for (let i = 0; i < clauses.length; i += 2) {
    const kind = clauses[i];
    const body = clauses[i + 1] ?? '';
    for (const part of body.split(',').map((t) => t.trim()).filter(Boolean)) {
      if (kind === 'SET') {
        const [lhs, rhs] = part.split('=').map((t) => t.trim());
        next[resolveName(lhs, names)] = clone(resolveValue(rhs, values));
      } else if (kind === 'ADD') {
        const [lhs, rhs] = part.split(/\s+/);
        const attr = resolveName(lhs, names);
        const delta = resolveValue(rhs, values);
        next[attr] = (typeof next[attr] === 'number' ? next[attr] : 0) + delta;
      } else if (kind === 'REMOVE') {
        delete next[resolveName(part, names)];
      } else {
        throw new Error(`fake ddb: unsupported clause ${kind}`);
      }
    }
  }
  return next;
}

async function fakeSend(cmd) {
  sendCount++;
  const kind = cmd?.constructor?.name;
  const input = cmd?.input ?? {};
  await jitter();

  if (kind === 'GetCommand') {
    const item = table(input.TableName).get(keyOf(input.Key));
    return { Item: clone(item) };
  }

  if (kind === 'PutCommand') {
    table(input.TableName).set(keyFromItem(input.TableName, input.Item), clone(input.Item));
    return {};
  }

  if (kind === 'UpdateCommand') {
    const t = table(input.TableName);
    const k = keyOf(input.Key);
    const current = t.get(k);
    if (!checkCondition(current, input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) {
      const err = new Error('The conditional request failed');
      err.name = 'ConditionalCheckFailedException';
      throw err;
    }
    const next = applyUpdate(current ?? clone(input.Key), input.UpdateExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues);
    t.set(k, next);
    return input.ReturnValues === 'UPDATED_NEW' ? { Attributes: clone(next) } : {};
  }

  if (kind === 'TransactWriteCommand') {
    const items = input.TransactItems ?? [];
    // 原子性：先同步檢查全部條件，再同步套用全部更新（中間沒有 await）
    const reasons = items.map((entry) => {
      const op = entry.Update || entry.Put;
      if (!op) throw new Error('fake ddb: only Update/Put supported inside TransactWrite');
      const k = entry.Put ? keyFromItem(op.TableName, op.Item) : keyOf(op.Key);
      const current = table(op.TableName).get(k);
      const ok = checkCondition(current, op.ConditionExpression, op.ExpressionAttributeNames, op.ExpressionAttributeValues);
      return { Code: ok ? 'None' : 'ConditionalCheckFailed' };
    });
    if (reasons.some((r) => r.Code !== 'None')) {
      const err = new Error('Transaction cancelled');
      err.name = 'TransactionCanceledException';
      err.CancellationReasons = reasons;
      throw err;
    }
    for (const entry of items) {
      if (entry.Put) {
        table(entry.Put.TableName).set(keyFromItem(entry.Put.TableName, entry.Put.Item), clone(entry.Put.Item));
        continue;
      }
      const u = entry.Update;
      const t = table(u.TableName);
      const k = keyOf(u.Key);
      t.set(k, applyUpdate(t.get(k) ?? clone(u.Key), u.UpdateExpression, u.ExpressionAttributeNames, u.ExpressionAttributeValues));
    }
    return {};
  }

  throw new Error(`fake ddb: refusing unsupported command ${kind} (nothing may reach AWS)`);
}

// 先替換 client，再載入被測模組
const { ddbDocClient } = await import('../lib/dynamo.ts');
ddbDocClient.send = fakeSend;

const escrowMod = await import('../lib/pointsEscrow.ts');
const storageMod = await import('../lib/pointsStorage.ts');
const { releaseEscrow, refundEscrow, useDynamoForEscrow, ESCROW_TABLE: MOD_ESCROW_TABLE } = escrowMod;
const { useDynamoForPoints, POINTS_TABLE: MOD_POINTS_TABLE } = storageMod;

// ── 小工具 ─────────────────────────────────────────────────────────────────
let failed = 0;
let passed = 0;
function check(label, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? `  (${detail})` : ''}`);
  }
}

function resetTables() {
  tables.clear();
}
function seedEscrow({ escrowId, teacherId = 't_1', studentId = 's_1', points = 30, status = 'HOLDING' }) {
  table(ESCROW_TABLE).set(keyOf({ escrowId }), {
    escrowId, orderId: `o_${escrowId}`, enrollmentId: `e_${escrowId}`, studentId, teacherId,
    courseId: 'c_1', courseTitle: 'verify', points, status,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  });
}
function seedBalance(userId, balance) {
  table(POINTS_TABLE).set(keyOf({ userId }), { userId, balance, updatedAt: '2026-01-01T00:00:00.000Z' });
}
const balance = (userId) => table(POINTS_TABLE).get(keyOf({ userId }))?.balance ?? 0;
const status = (escrowId) => table(ESCROW_TABLE).get(keyOf({ escrowId }))?.status;

// ── 前置檢查 ────────────────────────────────────────────────────────────────
console.log('\n[setup]');
check('被測模組走 DynamoDB 分支（escrow）', useDynamoForEscrow === true);
check('被測模組走 DynamoDB 分支（points）', useDynamoForPoints === true);
check('被測模組使用驗證用假表名（escrow）', MOD_ESCROW_TABLE === ESCROW_TABLE, MOD_ESCROW_TABLE);
check('被測模組使用驗證用假表名（points）', MOD_POINTS_TABLE === POINTS_TABLE, MOD_POINTS_TABLE);
if (failed) {
  console.log('\n❌ 前置條件不成立，停止（避免對非預期環境執行）');
  process.exit(1);
}

// ── 1. 50 個並發 release 同一筆 ────────────────────────────────────────────
console.log('\n[1] 50 個並發 releaseEscrow 同一筆');
resetTables();
seedEscrow({ escrowId: 'esc_1', teacherId: 't_1', points: 30 });
seedBalance('t_1', 100);
const before1 = sendCount;
const r1 = await Promise.all(Array.from({ length: 50 }, () => releaseEscrow('esc_1')));
const ok1 = r1.filter((r) => r.ok).length;
check('恰一次成功', ok1 === 1, `ok=${ok1}`);
check('其餘 49 次回 already RELEASED', r1.filter((r) => !r.ok && /already RELEASED/.test(r.error)).length === 49);
check('老師只入帳一次（100 + 30 = 130）', balance('t_1') === 130, `balance=${balance('t_1')}`);
check('escrow 狀態為 RELEASED', status('esc_1') === 'RELEASED');
check('確實走過假 DynamoDB', sendCount > before1);

// ── 2. release 與 refund 互搶 ──────────────────────────────────────────────
console.log('\n[2] release 與 refund 各 20 個並發互搶同一筆');
resetTables();
seedEscrow({ escrowId: 'esc_2', teacherId: 't_2', studentId: 's_2', points: 40 });
seedBalance('t_2', 0);
seedBalance('s_2', 0);
const r2 = await Promise.all([
  ...Array.from({ length: 20 }, () => releaseEscrow('esc_2')),
  ...Array.from({ length: 20 }, () => refundEscrow('esc_2')),
]);
const ok2 = r2.filter((r) => r.ok).length;
const finalStatus2 = status('esc_2');
check('恰一方成功', ok2 === 1, `ok=${ok2}`);
check(
  '只有勝出的一方入帳、點數守恆（總和 = 40）',
  balance('t_2') + balance('s_2') === 40 &&
    ((finalStatus2 === 'RELEASED' && balance('t_2') === 40) || (finalStatus2 === 'REFUNDED' && balance('s_2') === 40)),
  `status=${finalStatus2} teacher=${balance('t_2')} student=${balance('s_2')}`
);

// ── 3. 同一位老師兩筆不同 escrow 並發 ──────────────────────────────────────
console.log('\n[3] 同一位老師兩筆不同 escrow 並發 release（ADD 不互蓋）');
resetTables();
seedEscrow({ escrowId: 'esc_3a', teacherId: 't_3', points: 25 });
seedEscrow({ escrowId: 'esc_3b', teacherId: 't_3', points: 35 });
seedBalance('t_3', 10);
const r3 = await Promise.all([releaseEscrow('esc_3a'), releaseEscrow('esc_3b')]);
check('兩筆都成功', r3.every((r) => r.ok));
check('兩筆都入帳（10 + 25 + 35 = 70）', balance('t_3') === 70, `balance=${balance('t_3')}`);

// ── 4. 非 HOLDING / 不存在 ─────────────────────────────────────────────────
console.log('\n[4] 非 HOLDING 與不存在');
resetTables();
seedEscrow({ escrowId: 'esc_4', teacherId: 't_4', points: 50, status: 'REFUNDED' });
seedBalance('t_4', 5);
const r4a = await releaseEscrow('esc_4');
check('已 REFUNDED 的 release 回 ok:false', !r4a.ok && /already REFUNDED/.test(r4a.error));
check('未入帳', balance('t_4') === 5);
const r4b = await releaseEscrow('esc_missing');
check('不存在回 not found', !r4b.ok && /not found/.test(r4b.error));
seedEscrow({ escrowId: 'esc_4c', teacherId: '', points: 10 });
const r4c = await releaseEscrow('esc_4c');
check('缺 teacherId 回 ok:false', !r4c.ok && /no teacherId/.test(r4c.error));

// ── 4b. SDK 重試：交易其實已提交，但呼叫端收到條件失敗 ─────────────────────
console.log('\n[4b] SDK 重試已提交的交易（應回報成功、只入帳一次）');
resetTables();
seedEscrow({ escrowId: 'esc_retry', teacherId: 't_r', points: 20 });
seedBalance('t_r', 0);
{
  const realSend = ddbDocClient.send;
  let armed = true;
  ddbDocClient.send = async (cmd) => {
    if (armed && cmd?.constructor?.name === 'TransactWriteCommand') {
      armed = false;
      await fakeSend(cmd); // 第一次嘗試成功提交
      const err = new Error('Transaction cancelled (retry saw committed state)');
      err.name = 'TransactionCanceledException';
      err.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }];
      throw err; // SDK 重試時因狀態已非 HOLDING 而被取消
    }
    return fakeSend(cmd);
  };
  const rr = await releaseEscrow('esc_retry');
  ddbDocClient.send = realSend;
  check('回報成功（以唯一 token 辨認是自己提交的）', rr.ok === true, JSON.stringify(rr));
  check('只入帳一次（0 + 20 = 20）', balance('t_r') === 20, `balance=${balance('t_r')}`);
}
{
  // 對手搶先提交：同樣收到條件失敗，但 token 不是自己的 → 必須回報失敗
  resetTables();
  seedEscrow({ escrowId: 'esc_rival', teacherId: 't_v', points: 20 });
  seedBalance('t_v', 0);
  const realSend = ddbDocClient.send;
  let armed = true;
  ddbDocClient.send = async (cmd) => {
    if (armed && cmd?.constructor?.name === 'TransactWriteCommand') {
      armed = false;
      const rival = JSON.parse(JSON.stringify(cmd.input));
      rival.TransactItems[0].Update.ExpressionAttributeValues[':tok'] = 'rival-token';
      await fakeSend({ constructor: { name: 'TransactWriteCommand' }, input: rival });
      return fakeSend(cmd); // 自己的提交會因狀態已非 HOLDING 被取消
    }
    return fakeSend(cmd);
  };
  const rv = await releaseEscrow('esc_rival');
  ddbDocClient.send = realSend;
  check('對手已提交時回報 already RELEASED', !rv.ok && /already RELEASED/.test(rv.error), JSON.stringify(rv));
  check('只入帳一次（對手那次）', balance('t_v') === 20, `balance=${balance('t_v')}`);
}

// ── 5. 對照組：修正前演算法必定雙重入帳 ────────────────────────────────────
console.log('\n[5] 對照組：修正前的「讀→Put→條件更新」演算法');
const { GetCommand, PutCommand, UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
let legacyCredits = 0;
async function legacyRelease(escrowId) {
  const rec = (await fakeSend(new GetCommand({ TableName: ESCROW_TABLE, Key: { escrowId } }))).Item;
  if (!rec || rec.status !== 'HOLDING') return { ok: false };
  const cur = (await fakeSend(new GetCommand({ TableName: POINTS_TABLE, Key: { userId: rec.teacherId } }))).Item?.balance ?? 0;
  legacyCredits++;
  await fakeSend(new PutCommand({ TableName: POINTS_TABLE, Item: { userId: rec.teacherId, balance: cur + rec.points } }));
  try {
    await fakeSend(new UpdateCommand({
      TableName: ESCROW_TABLE, Key: { escrowId },
      UpdateExpression: 'SET #status = :s', ConditionExpression: '#status = :holding',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':s': 'RELEASED', ':holding': 'HOLDING' },
    }));
  } catch {
    return { ok: false, threw: true };
  }
  return { ok: true };
}
// 判斷依據是「入帳動作執行了幾次」而不是最後餘額：並發呼叫者多半讀到同一個舊餘額、
// 寫回同一個值，重複入帳會被後寫覆蓋而「碰巧」讓餘額看起來正確，用餘額判斷會時抓時不抓。
let legacyReproduced = false;
let legacyBalanceWrong = false;
for (let attempt = 0; attempt < 20 && !legacyReproduced; attempt++) {
  resetTables();
  legacyCredits = 0;
  seedEscrow({ escrowId: 'esc_5', teacherId: 't_5', points: 30 });
  seedBalance('t_5', 100);
  await Promise.all(Array.from({ length: 10 }, () => legacyRelease('esc_5')));
  if (legacyCredits > 1) legacyReproduced = true;
  if (balance('t_5') !== 130) legacyBalanceWrong = true;
}
check('假 DB 能重現修正前的重複入帳（同一筆 escrow 被入帳多次，證明測試有鑑別力）', legacyReproduced, `credits=${legacyCredits}`);
console.log(`  ℹ️ 舊演算法本輪最後餘額${legacyBalanceWrong ? '也出現錯誤值' : '碰巧正確（重複入帳被覆蓋掩蓋）'}`);

// 同一位老師兩筆不同 escrow：舊演算法的 blind Put 會讓其中一筆入帳被覆蓋
let legacyLostCredit = false;
for (let attempt = 0; attempt < 20 && !legacyLostCredit; attempt++) {
  resetTables();
  seedEscrow({ escrowId: 'esc_6a', teacherId: 't_6', points: 25 });
  seedEscrow({ escrowId: 'esc_6b', teacherId: 't_6', points: 35 });
  seedBalance('t_6', 10);
  await Promise.all([legacyRelease('esc_6a'), legacyRelease('esc_6b')]);
  if (balance('t_6') !== 70) legacyLostCredit = true;
}
check('假 DB 能重現修正前的入帳互蓋（兩筆不同 escrow，最終餘額 ≠ 70）', legacyLostCredit);

console.log('');
if (failed === 0) {
  console.log(`✅ escrow 結算並發回歸測試全數通過（${passed} 項）`);
  process.exit(0);
}
console.log(`❌ escrow 結算並發回歸測試有 ${failed} 項失敗（通過 ${passed} 項）`);
process.exit(1);
