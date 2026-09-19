#!/usr/bin/env node
/**
 * 企業 CSV 批次註冊 + 單筆 B2B 註冊原子性回歸測試（離線）
 * =====================================================
 *
 * 驗證：
 *   1. 席次不足 → 什麼都不寫（profile / license / usedSeats 都不變）
 *   2. 列驗證失敗（網域不符、批次內重複、已註冊）→ 回傳每列錯誤，什麼都不寫
 *   3. ≤ 49 筆 = 單一 TransactWrite，全部建立、密碼為 scrypt、isB2B/licenseId 正確
 *   4. > 49 筆自動分段交易
 *   5. 分段中途失敗（其他人搶走席次）→ 補償後 profile/license 全刪、usedSeats 復原
 *   6. 補償本身部分失敗 → 回報 leftBehind，其餘照樣復原
 *   7. 交易結果未知（逾時但其實已提交）→ 探測後一併補償
 *   8. assignMemberWithLicense 交易已提交、後續讀取失敗 → 不 throw，profile 保留席次
 *   9. 單筆 B2B 註冊（profile + license + 席次同一交易）席次滿 → 不留 profile
 *  10. parseCsv：引號、逗號、跳脫引號、欄位內換行、CRLF、BOM、空行
 *
 * 安全性：不連網路、不寄信。DynamoDBDocumentClient.prototype.send 在載入被測模組前
 * 就被替換成記憶體實作，未知指令一律 throw；AWS 憑證只給假值。
 *
 * 用法：
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-register-batch.mjs
 */

process.env.AWS_ACCESS_KEY_ID = 'verify-register-batch-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-register-batch-fake';
process.env.AWS_REGION = 'ap-northeast-1';
process.env.DYNAMODB_TABLE_PROFILES = 'verify-profiles';
process.env.DYNAMODB_TABLE_ORGANIZATIONS = 'verify-orgs';
process.env.DYNAMODB_TABLE_LICENSES = 'verify-licenses';
process.env.DYNAMODB_TABLE_ORG_UNITS = 'verify-org-units';
delete process.env.PROFILES_API_URL;
delete process.env.PROFILES_ENDPOINT;
delete process.env.PROFILES_LAMBDA_NAME;
delete process.env.PROFILES_FUNCTION_NAME;
// Make sure nothing can mail out even if a code path unexpectedly tries.
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

// ── 假 DynamoDB ──────────────────────────────────────────────────────────────
const tables = new Map(); // tableName -> Map(id -> item)
const table = (name) => {
  if (!tables.has(name)) tables.set(name, new Map());
  return tables.get(name);
};
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const stripUndefined = (o) => JSON.parse(JSON.stringify(o));
let transactCount = 0;
const hooks = { beforeTransact: null, afterTransact: null, beforeGet: null };

function tokenize(expr) {
  const re = /\s*(attribute_not_exists|attribute_exists|AND|OR|NOT|<=|>=|<>|=|<|>|\(|\)|[#:]?[A-Za-z_][\w]*)\s*/gy;
  const out = [];
  let m;
  let pos = 0;
  while (pos < expr.length) {
    re.lastIndex = pos;
    m = re.exec(expr);
    if (!m) throw new Error(`fake ddb: cannot tokenize "${expr}" at ${pos}`);
    out.push(m[1]);
    pos = re.lastIndex;
  }
  return out;
}

function evalCondition(item, expr, names = {}, values = {}) {
  if (!expr) return true;
  const toks = tokenize(expr);
  let i = 0;
  const attrName = (t) => (t.startsWith('#') ? names[t] : t);
  const operand = (t) => {
    if (t.startsWith(':')) {
      if (!(t in values)) throw new Error(`fake ddb: missing value ${t}`);
      return values[t];
    }
    return item ? item[attrName(t)] : undefined;
  };
  const parsePrimary = () => {
    const t = toks[i++];
    if (t === '(') {
      const v = parseOr();
      if (toks[i++] !== ')') throw new Error('fake ddb: expected )');
      return v;
    }
    if (t === 'NOT') return !parsePrimary();
    if (t === 'attribute_exists' || t === 'attribute_not_exists') {
      if (toks[i++] !== '(') throw new Error('fake ddb: expected (');
      const name = attrName(toks[i++]);
      if (toks[i++] !== ')') throw new Error('fake ddb: expected )');
      const exists = item !== undefined && item[name] !== undefined;
      return t === 'attribute_exists' ? exists : !exists;
    }
    const left = operand(t);
    const op = toks[i++];
    const right = operand(toks[i++]);
    switch (op) {
      case '=': return left !== undefined && left === right;
      case '<>': return left !== right;
      case '<': return left !== undefined && left < right;
      case '<=': return left !== undefined && left <= right;
      case '>': return left !== undefined && left > right;
      case '>=': return left !== undefined && left >= right;
      default: throw new Error(`fake ddb: unsupported operator ${op}`);
    }
  };
  const parseAnd = () => {
    let v = parsePrimary();
    while (toks[i] === 'AND') { i++; const r = parsePrimary(); v = v && r; }
    return v;
  };
  const parseOr = () => {
    let v = parseAnd();
    while (toks[i] === 'OR') { i++; const r = parseAnd(); v = v || r; }
    return v;
  };
  const result = parseOr();
  if (i !== toks.length) throw new Error(`fake ddb: trailing tokens in "${expr}"`);
  return result;
}

function applyUpdate(item, expr, names = {}, values = {}) {
  const next = clone(item);
  const clauses = expr.split(/\b(SET|REMOVE|ADD)\b/).map((t) => t.trim()).filter(Boolean);
  for (let c = 0; c < clauses.length; c += 2) {
    const kind = clauses[c];
    for (const part of (clauses[c + 1] || '').split(',').map((t) => t.trim()).filter(Boolean)) {
      const name = (t) => (t.startsWith('#') ? names[t] : t);
      if (kind === 'REMOVE') { delete next[name(part)]; continue; }
      if (kind !== 'SET') throw new Error(`fake ddb: unsupported ${kind}`);
      const [lhs, rhs] = part.split('=').map((t) => t.trim());
      const arith = rhs.match(/^(\w+)\s*([+-])\s*(:\w+)$/);
      if (arith) {
        const base = next[arith[1]] ?? 0;
        next[name(lhs)] = arith[2] === '+' ? base + values[arith[3]] : base - values[arith[3]];
      } else {
        next[name(lhs)] = clone(values[rhs]);
      }
    }
  }
  return next;
}

const conditionalError = () => Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' });

async function fakeSend(cmd) {
  const kind = cmd?.constructor?.name;
  const input = cmd?.input ?? {};
  await new Promise((r) => setImmediate(r));

  if (kind === 'GetCommand') {
    if (hooks.beforeGet) hooks.beforeGet(input);
    return { Item: clone(table(input.TableName).get(input.Key.id)) };
  }
  if (kind === 'QueryCommand') {
    const m = input.KeyConditionExpression.match(/^(\w+)\s*=\s*(:\w+)$/);
    if (!m) throw new Error(`fake ddb: unsupported query ${input.KeyConditionExpression}`);
    const items = [...table(input.TableName).values()].filter((it) => it[m[1]] === input.ExpressionAttributeValues[m[2]]);
    const limited = input.Limit ? items.slice(0, input.Limit) : items;
    return { Items: clone(limited), Count: limited.length };
  }
  if (kind === 'PutCommand') {
    const t = table(input.TableName);
    if (!evalCondition(t.get(input.Item.id), input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) throw conditionalError();
    t.set(input.Item.id, stripUndefined(input.Item));
    return {};
  }
  if (kind === 'UpdateCommand') {
    const t = table(input.TableName);
    const cur = t.get(input.Key.id);
    if (!evalCondition(cur, input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) throw conditionalError();
    const next = applyUpdate(cur ?? clone(input.Key), input.UpdateExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues);
    t.set(input.Key.id, next);
    return { Attributes: clone(next) };
  }
  if (kind === 'DeleteCommand') {
    const t = table(input.TableName);
    if (!evalCondition(t.get(input.Key.id), input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) throw conditionalError();
    t.delete(input.Key.id);
    return {};
  }
  if (kind === 'TransactWriteCommand') {
    transactCount++;
    const items = input.TransactItems ?? [];
    if (items.length > 100) throw Object.assign(new Error('Member must have length less than or equal to 100'), { name: 'ValidationException' });
    if (hooks.beforeTransact) hooks.beforeTransact(input);
    const seen = new Set();
    const reasons = items.map((entry) => {
      const [op, body] = Object.entries(entry)[0];
      const id = op === 'Put' ? body.Item.id : body.Key.id;
      const key = `${body.TableName}/${id}`;
      if (seen.has(key)) throw Object.assign(new Error('Transaction request cannot include multiple operations on one item'), { name: 'ValidationException' });
      seen.add(key);
      const ok = evalCondition(table(body.TableName).get(id), body.ConditionExpression, body.ExpressionAttributeNames, body.ExpressionAttributeValues);
      return { Code: ok ? 'None' : 'ConditionalCheckFailed' };
    });
    if (reasons.some((r) => r.Code !== 'None')) {
      throw Object.assign(new Error('Transaction cancelled'), { name: 'TransactionCanceledException', CancellationReasons: reasons });
    }
    for (const entry of items) {
      const [op, body] = Object.entries(entry)[0];
      const t = table(body.TableName);
      if (op === 'Put') t.set(body.Item.id, stripUndefined(body.Item));
      else if (op === 'Delete') t.delete(body.Key.id);
      else if (op === 'Update') t.set(body.Key.id, applyUpdate(t.get(body.Key.id) ?? clone(body.Key), body.UpdateExpression, body.ExpressionAttributeNames, body.ExpressionAttributeValues));
      else throw new Error(`fake ddb: unsupported transact op ${op}`);
    }
    if (hooks.afterTransact) hooks.afterTransact(input);
    return {};
  }
  throw new Error(`fake ddb: refusing unsupported command ${kind} (nothing may reach AWS)`);
}

const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
DynamoDBDocumentClient.prototype.send = fakeSend;

const { registerMembersBatch, buildNewProfileRecord, pickProfileFields } = await import('../lib/registerProfile.ts');
const { createNewMembersWithLicenses, assignMemberWithLicense, MAX_NEW_MEMBERS_PER_TRANSACTION } = await import('../lib/orgMembershipService.ts');
const { parseCsv } = await import('../lib/registerProfileCsv.ts');
const { PROFILES_TABLE } = await import('../lib/profilesService.ts');
const { ORGANIZATIONS_TABLE } = await import('../lib/organizationService.ts');
const { LICENSES_TABLE } = await import('../lib/licenseService.ts');

// ── 小工具 ─────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function check(label, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${detail ? `  (${detail})` : ''}`); }
}
const DOMAIN = 'acme.test';
function reset({ maxSeats = 10, usedSeats = 0 } = {}) {
  tables.clear();
  transactCount = 0;
  hooks.beforeTransact = hooks.afterTransact = hooks.beforeGet = null;
  table(ORGANIZATIONS_TABLE).set('org_1', { id: 'org_1', name: 'Acme', domain: DOMAIN, status: 'active', maxSeats, usedSeats });
}
const org = () => table(ORGANIZATIONS_TABLE).get('org_1');
const profiles = () => [...table(PROFILES_TABLE).values()];
const licenses = () => [...table(LICENSES_TABLE).values()];
const row = (n, over = {}) => ({
  email: `user${n}@${DOMAIN}`, password: `pw-${n}`, firstName: 'F', lastName: `L${n}`,
  role: 'student', birthdate: '2000-01-01', gender: 'male', country: 'TW', ...over,
});
const rows = (count, from = 1) => Array.from({ length: count }, (_, i) => row(from + i));

console.log('\n[setup]');
check('被測模組使用假表名', PROFILES_TABLE === 'verify-profiles' && ORGANIZATIONS_TABLE === 'verify-orgs' && LICENSES_TABLE === 'verify-licenses');
check('單一交易上限 49 人（1 + 2×49 ≤ 100）', MAX_NEW_MEMBERS_PER_TRANSACTION === 49);
if (failed) process.exit(1);

// 1 ─────────────────────────────────────────────────────────────────────────
console.log('\n[1] 席次不足 → 什麼都不寫');
reset({ maxSeats: 3, usedSeats: 1 });
let r = await registerMembersBatch({ orgId: 'org_1', rows: rows(3) });
check('回傳 not_enough_seats / 409', !r.ok && r.code === 'not_enough_seats' && r.status === 409, JSON.stringify(r));
check('沒有 profile、沒有 license', profiles().length === 0 && licenses().length === 0);
check('usedSeats 不變 (1)', org().usedSeats === 1);
check('完全沒有送出交易', transactCount === 0);

// 2 ─────────────────────────────────────────────────────────────────────────
console.log('\n[2] 列驗證失敗 → 每列錯誤、什麼都不寫');
reset();
table(PROFILES_TABLE).set('existing', { id: 'existing', email: `user3@${DOMAIN}` });
r = await registerMembersBatch({
  orgId: 'org_1',
  rows: [row(1), row(2, { email: 'x@other.test' }), row(1), row(4, { role: 'admin' }), row(5, { country: '' })],
});
const errOf = (idx) => r.rowErrors?.find((e) => e.index === idx)?.errors ?? [];
check('batch_validation_failed / 400', !r.ok && r.code === 'batch_validation_failed' && r.status === 400, JSON.stringify(r));
check('網域不符被擋', errOf(1).includes('email_domain_mismatch'));
check('批次內重複 email 被擋', errOf(2).includes('email_duplicate_in_batch'));
check('admin 角色被擋', errOf(3).includes('role_invalid'));
check('缺欄位被擋', errOf(4).includes('missing_country'));
check('沒有交易、沒有新 profile', transactCount === 0 && profiles().length === 1);
reset();
table(PROFILES_TABLE).set('existing', { id: 'existing', email: `user2@${DOMAIN}` });
r = await registerMembersBatch({ orgId: 'org_1', rows: rows(3) });
check('已註冊 email 被擋（index 1）', !r.ok && r.rowErrors?.[0]?.index === 1 && r.rowErrors[0].errors.includes('email_already_registered'), JSON.stringify(r));
check('什麼都不寫', transactCount === 0 && profiles().length === 1 && org().usedSeats === 0);
reset();
r = await registerMembersBatch({ orgId: 'org_1', rows: rows(201) });
check('超過 200 筆被擋', !r.ok && r.code === 'batch_too_large');

// 3 ─────────────────────────────────────────────────────────────────────────
console.log('\n[3] 5 筆成功 = 單一交易');
reset({ maxSeats: 10, usedSeats: 2 });
r = await registerMembersBatch({ orgId: 'org_1', rows: rows(5) });
check('ok', r.ok, JSON.stringify(r));
check('恰一次 TransactWrite', transactCount === 1, `transactCount=${transactCount}`);
check('5 個 profile、5 張 license、usedSeats 2→7', profiles().length === 5 && licenses().length === 5 && org().usedSeats === 7);
const p0 = profiles()[0];
check('profile 已是 B2B 成員（isB2B/orgId/licenseId/plan=null/planBeforeOrg=free）',
  p0.isB2B === true && p0.orgId === 'org_1' && !!p0.licenseId && p0.plan === null && p0.planBeforeOrg === 'free');
check('密碼為 scrypt 雜湊', typeof p0.password === 'string' && p0.password.startsWith('scrypt$'));
check('license 指回 profile', licenses().every((l) => profiles().some((p) => p.licenseId === l.id && l.userId === p.id && l.status === 'active')));
check('回傳驗證 token 供寄信', r.ok && r.created.every((c) => c.verificationToken && c.email));

// 4 ─────────────────────────────────────────────────────────────────────────
console.log('\n[4] 60 筆 → 分段交易');
reset({ maxSeats: 100, usedSeats: 0 });
r = await registerMembersBatch({ orgId: 'org_1', rows: rows(60) });
check('ok 且 2 次交易', r.ok && transactCount === 2, `transactCount=${transactCount}`);
check('60 profile / 60 license / usedSeats 60', profiles().length === 60 && licenses().length === 60 && org().usedSeats === 60);

// 5 ─────────────────────────────────────────────────────────────────────────
console.log('\n[5] 分段中途失敗（第 2 段提交後席次被別人拿走）→ 全部補償');
reset({ maxSeats: 10, usedSeats: 1 });
hooks.afterTransact = () => {
  if (transactCount === 2) org().usedSeats = org().maxSeats; // concurrent registrations filled the org
};
r = await registerMembersBatch({ orgId: 'org_1', rows: rows(5), chunkSize: 2 });
check('回傳 batch_rolled_back / 409', !r.ok && r.code === 'batch_rolled_back' && r.status === 409, JSON.stringify(r));
check('沒有殘留 profile / license', profiles().length === 0 && licenses().length === 0, `profiles=${profiles().length} licenses=${licenses().length}`);
check('本批次佔用的 4 個席次全數釋放（10 → 6）', org().usedSeats === 6, `usedSeats=${org().usedSeats}`);

// 6 ─────────────────────────────────────────────────────────────────────────
console.log('\n[6] 補償部分失敗 → leftBehind 只剩被動過的那一位');
reset({ maxSeats: 10, usedSeats: 0 });
let tamperedId = null;
hooks.afterTransact = (input) => {
  if (transactCount === 1) {
    const put = input.TransactItems.find((e) => e.Put?.TableName === PROFILES_TABLE);
    tamperedId = put.Put.Item.id;
    table(PROFILES_TABLE).get(tamperedId).licenseId = 'changed-by-admin';
  }
};
hooks.beforeTransact = () => {
  if (transactCount === 2) org().usedSeats = org().maxSeats;
};
r = await registerMembersBatch({ orgId: 'org_1', rows: rows(4), chunkSize: 2 });
check('回傳 batch_partial / 500', !r.ok && r.code === 'batch_partial' && r.status === 500, JSON.stringify(r));
check('leftBehind 恰為被改動的那位', r.leftBehind?.length === 1 && r.leftBehind[0].profileId === tamperedId);
check('其他人已補償（只剩 1 個 profile）', profiles().length === 1 && profiles()[0].id === tamperedId);

// 7 ─────────────────────────────────────────────────────────────────────────
console.log('\n[7] 交易結果未知（已提交但回傳逾時）→ 探測並補償');
reset({ maxSeats: 10, usedSeats: 0 });
hooks.afterTransact = () => {
  if (transactCount === 2) throw Object.assign(new Error('socket hang up'), { name: 'TimeoutError' });
};
r = await createNewMembersWithLicenses({
  orgId: 'org_1',
  profiles: [1, 2, 3, 4].map((n) => buildNewProfileRecord({ email: `u${n}@${DOMAIN}`, password: 'pw', role: 'student', plan: null, fields: {} }).profile),
  chunkSize: 2,
});
check('ok=false 且 rolledBack', !r.ok && r.rolledBack === true, JSON.stringify(r));
check('兩段都被補償（0 profile / 0 license / usedSeats 0）', profiles().length === 0 && licenses().length === 0 && org().usedSeats === 0,
  `profiles=${profiles().length} usedSeats=${org().usedSeats}`);

// 8 ─────────────────────────────────────────────────────────────────────────
console.log('\n[8] assignMemberWithLicense 已提交、後續讀取失敗 → 不 throw、保留席次');
reset({ maxSeats: 5, usedSeats: 0 });
table(PROFILES_TABLE).set('p_existing', { id: 'p_existing', email: `e@${DOMAIN}`, role: 'student', plan: 'basic', isB2B: false });
let committed = false;
hooks.afterTransact = () => { committed = true; };
hooks.beforeGet = (input) => {
  if (committed && input.TableName === LICENSES_TABLE) throw new Error('simulated read failure after commit');
};
let assignResult = null;
let assignErr = null;
try {
  assignResult = await assignMemberWithLicense({ orgId: 'org_1', profileId: 'p_existing', assignedBy: 'verify' });
} catch (e) {
  assignErr = e;
}
check('沒有 throw', !assignErr, assignErr?.message);
check('回傳 license 為剛寫入的值', assignResult?.license?.id && assignResult.license.userId === 'p_existing');
const pe = table(PROFILES_TABLE).get('p_existing');
check('profile 保留且持有席次（orgId/licenseId）', pe?.orgId === 'org_1' && pe.licenseId === assignResult?.license?.id);
check('usedSeats 1、planBeforeOrg=basic', org().usedSeats === 1 && pe?.planBeforeOrg === 'basic');

// 9 ─────────────────────────────────────────────────────────────────────────
console.log('\n[9] 單筆 B2B 註冊：profile + license + 席次同一交易');
reset({ maxSeats: 1, usedSeats: 1 });
const single = buildNewProfileRecord({ email: `solo@${DOMAIN}`, password: 'pw', role: 'student', plan: null, fields: pickProfileFields({ firstName: ' A ', isOrgAdmin: true, role: 'admin' }) });
check('建立前 isB2B=false、欄位白名單', single.profile.isB2B === false && single.profile.firstName === 'A' && single.profile.isOrgAdmin === undefined);
r = await createNewMembersWithLicenses({ orgId: 'org_1', profiles: [single.profile], assignedBy: 'self-registration' });
check('席次滿 → ok=false、席次已滿訊息', !r.ok && /席次已滿/.test(r.error), JSON.stringify(r));
check('不留 profile / license、usedSeats 不變', profiles().length === 0 && licenses().length === 0 && org().usedSeats === 1);
org().maxSeats = 2;
r = await createNewMembersWithLicenses({ orgId: 'org_1', profiles: [single.profile], assignedBy: 'self-registration' });
check('有席次 → 建立成功（isB2B=true、usedSeats 2）', r.ok && table(PROFILES_TABLE).get(single.id)?.isB2B === true && org().usedSeats === 2);

// 10 ────────────────────────────────────────────────────────────────────────
console.log('\n[10] parseCsv');
const csv = '﻿email,firstName,note\r\n"a@x.test","Lin, Mei","say ""hi"""\r\n\r\nb@x.test, Bob ,"line1\nline2"\nc@x.test,Cat,\n';
const parsed = parseCsv(csv);
check('4 筆（含標題、略過空行）', parsed.length === 4, JSON.stringify(parsed));
check('BOM 移除', parsed[0].values[0] === 'email');
check('引號內逗號與跳脫引號', parsed[1].values[1] === 'Lin, Mei' && parsed[1].values[2] === 'say "hi"');
check('欄位內換行、未加引號欄位 trim', parsed[2].values[1] === 'Bob' && parsed[2].values[2] === 'line1\nline2');
check('行號正確（2、4、6）', parsed[1].line === 2 && parsed[2].line === 4 && parsed[3].line === 6, parsed.map((p) => p.line).join(','));
check('結尾空欄位保留', parsed[3].values.length === 3 && parsed[3].values[2] === '');
let threw = false;
try { parseCsv('a,"b\n'); } catch { threw = true; }
check('未閉合引號 throw', threw);

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
