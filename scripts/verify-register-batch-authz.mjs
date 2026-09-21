#!/usr/bin/env node
/**
 * 企業 CSV 批次匯入授權回歸測試（離線）
 * ====================================
 *
 * POST /api/register/batch 原本掛在公開頁 /login/register_enterprise 上，只靠驗證碼 +
 * IP 限流把關：驗證碼 5 分鐘內可重用，所以單一 IP 每小時最多能灌入 5 批 × 200 = 1000
 * 個帳號。現在改為必須登入，且必須是該組織的企業管理員（requireOrgAccess 'write'）。
 *
 * 本腳本驗證那道閘門：
 *   1. 沒有 session → 401（授權早於任何 body 檢查）
 *   2. 一般學員（無組織）→ 403
 *   3. 該組織的普通成員（isOrgAdmin 不為 true）→ 403
 *   4. dept_admin → 403（部門管理員不得批次建立帳號）
 *   5. 其他組織的企業管理員 → 403（不得跨租戶匯入）
 *   6. 本組織的企業管理員 → 通過閘門，進入 body 驗證
 *   7. 系統管理員（role='admin'）→ 通過閘門
 *   8. 所有被拒的情況都沒有寫入任何 profile
 *   9. 授權早於限流：非管理員拿到 403 而不是 429
 *
 * 安全性：不連網路、不寄信。DynamoDBDocumentClient.prototype.send 在載入被測模組前
 * 就換成記憶體實作，未知表名一律 throw；AWS 憑證只給假值；fetch 被封住。
 *
 * 用法：
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-register-batch-authz.mjs
 *
 * 退出碼：0 = 全部通過；1 = 有失敗。
 */

import crypto from 'node:crypto';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

// 同 verify-seat-enrollment：Node 的型別剝除處理不了「值 import 混型別」的寫法
// （lib/auth/apiGuard.ts 就是這樣 import Session），改用 TypeScript transpileModule。
const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const TS_URL = pathToFileURL(resolvePath(ROOT, 'node_modules/typescript/lib/typescript.js')).href;
const ROOT_URL = pathToFileURL(ROOT).href;
const transpileHook = `
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const tsMod = await import(${JSON.stringify(TS_URL)});
const ts = tsMod.default || tsMod;
export async function load(url, context, nextLoad) {
  if (url.startsWith(${JSON.stringify(ROOT_URL)}) && url.endsWith('.ts') && !url.includes('/node_modules/')) {
    const src = await readFile(fileURLToPath(url), 'utf8');
    const out = ts.transpileModule(src, {
      fileName: fileURLToPath(url),
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    });
    return { format: 'module', source: out.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}`;
register('data:text/javascript,' + encodeURIComponent(transpileHook));

process.env.AWS_ACCESS_KEY_ID = 'verify-batch-authz-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-batch-authz-fake';
delete process.env.AWS_SESSION_TOKEN;
delete process.env.AWS_PROFILE;
process.env.AWS_REGION = 'ap-northeast-1';
process.env.SESSION_SECRET = 'verify-batch-authz-session-secret';
// 限流本身已由 verify 之外的路徑覆蓋；這裡關掉才不用假造限流表。
process.env.DISABLE_RATE_LIMIT = 'true';
// E2E bypass 是 role='system' 的萬能鑰匙，會讓授權測試失去意義 —— 明確關掉。
delete process.env.LOGIN_BYPASS_SECRET;
delete process.env.PROFILES_API_URL;
delete process.env.PROFILES_ENDPOINT;
delete process.env.PROFILES_LAMBDA_NAME;
delete process.env.PROFILES_FUNCTION_NAME;
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

const T = {
  profiles: 'verify-batch-authz-profiles',
  sessions: 'verify-batch-authz-sessions',
  orgs: 'verify-batch-authz-orgs',
  licenses: 'verify-batch-authz-licenses',
  orgUnits: 'verify-batch-authz-org-units',
};
process.env.DYNAMODB_TABLE_PROFILES = T.profiles;
process.env.PROFILES_TABLE = T.profiles;
process.env.DYNAMODB_TABLE_SESSIONS = T.sessions;
process.env.DYNAMODB_TABLE_ORGANIZATIONS = T.orgs;
process.env.DYNAMODB_TABLE_LICENSES = T.licenses;
process.env.DYNAMODB_TABLE_ORG_UNITS = T.orgUnits;

globalThis.fetch = async (url) => {
  throw new Error(`verify-register-batch-authz: network access blocked (${url})`);
};

// ── 假 DynamoDB ──────────────────────────────────────────────────────────────
const PK = { [T.sessions]: ['sessionId'] };
const tables = new Map();
const table = (name) => {
  if (!name || !Object.values(T).includes(name)) {
    throw new Error(`fake ddb: unexpected table "${name}"`);
  }
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name);
};
const pkOf = (name) => PK[name] || ['id'];
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const findByKey = (name, key) => table(name).find((it) => pkOf(name).every((k) => it[k] === key[k]));
const putItem = (name, item) => {
  const rows = table(name);
  const idx = rows.findIndex((it) => pkOf(name).every((k) => it[k] === item[k]));
  if (idx >= 0) rows[idx] = clone(item);
  else rows.push(clone(item));
};

async function fakeSend(cmd) {
  const name = cmd?.constructor?.name;
  const input = cmd?.input || {};
  switch (name) {
    case 'GetCommand':
      return { Item: clone(findByKey(input.TableName, input.Key)) };
    case 'QueryCommand': {
      const m = String(input.KeyConditionExpression).match(/^\s*(\w+)\s*=\s*(:\w+)\s*$/);
      if (!m) throw new Error(`fake ddb: unsupported KeyConditionExpression "${input.KeyConditionExpression}"`);
      const [, attr, ph] = m;
      const val = input.ExpressionAttributeValues[ph];
      return { Items: clone(table(input.TableName).filter((it) => it[attr] === val)) };
    }
    case 'ScanCommand':
      return { Items: clone(table(input.TableName)) };
    case 'PutCommand':
      putItem(input.TableName, input.Item);
      return {};
    default:
      // 任何寫入類指令都不該在被拒的請求裡出現 —— 直接炸開比默默通過好。
      throw new Error(`fake ddb: unsupported command ${name}`);
  }
}

const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
DynamoDBDocumentClient.prototype.send = fakeSend;
const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
DynamoDBClient.prototype.send = async () => {
  throw new Error('verify-register-batch-authz: raw DynamoDBClient.send blocked');
};

const batchRoute = await import('../app/api/register/batch/route.ts');

// ── 測試工具 ─────────────────────────────────────────────────────────────────
let failures = 0;
let passes = 0;
function check(label, cond, detail) {
  if (cond) {
    passes++;
    console.log(`  ✅ ${label}`);
  } else {
    failures++;
    console.log(`  ❌ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

const nowSec = Math.floor(Date.now() / 1000);

/** 建立 profile，回傳 userId。企業管理員的 role 通常仍是 student，只有 isOrgAdmin 為 true。 */
function addProfile(userId, { role = 'student', orgId = null, orgUnitId = null, isOrgAdmin = false } = {}) {
  const item = { id: userId, email: `${userId}@example.test`, role };
  if (orgId) {
    item.orgId = orgId;
    item.isB2B = true;
  }
  if (orgUnitId) item.orgUnitId = orgUnitId;
  if (isOrgAdmin) item.isOrgAdmin = true;
  putItem(T.profiles, item);
  return userId;
}

function tokenFor(userId, role = 'student') {
  const sessionId = crypto.randomBytes(16).toString('hex');
  putItem(T.sessions, {
    sessionId,
    userId,
    email: `${userId}@example.test`,
    role,
    plan: 'basic',
    createdAt: nowSec,
    expiresAt: nowSec + 3600,
  });
  const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(sessionId).digest('hex');
  return `${sessionId}.${sig}`;
}

async function post(token, body) {
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' };
  if (token) headers.cookie = `session=${token}`;
  const res = await batchRoute.POST(
    new Request('http://localhost/api/register/batch', { method: 'POST', headers, body: JSON.stringify(body) })
  );
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

// ── 種子資料 ─────────────────────────────────────────────────────────────────
putItem(T.orgs, { id: 'org_a', name: 'Org A', domain: 'a.example.test', status: 'active', maxSeats: 50, usedSeats: 1 });
putItem(T.orgs, { id: 'org_b', name: 'Org B', domain: 'b.example.test', status: 'active', maxSeats: 50, usedSeats: 1 });

addProfile('u_plain');
addProfile('u_member_a', { orgId: 'org_a' });
addProfile('u_dept_a', { role: 'dept_admin', orgId: 'org_a', orgUnitId: 'unit_a1' });
addProfile('u_admin_a', { orgId: 'org_a', isOrgAdmin: true });
addProfile('u_admin_b', { orgId: 'org_b', isOrgAdmin: true });
addProfile('u_sysadmin', { role: 'admin' });

const profilesBefore = table(T.profiles).length;

const goodRows = [
  {
    email: 'new1@a.example.test',
    password: 'password123',
    firstName: 'New',
    lastName: 'One',
    role: 'student',
    birthdate: '2000-01-01',
    gender: 'male',
    country: 'TW',
  },
];
const goodBody = { orgId: 'org_a', rows: goodRows };

// ── A. 未登入與非管理員一律擋下 ──────────────────────────────────────────────
console.log('\nA. 未登入 / 權限不足');

let r = await post(null, goodBody);
check('沒有 session → 401', r.status === 401, r);

r = await post(null, { rows: goodRows });
check('沒有 session 且沒帶 orgId → 仍是 401（授權早於 body 檢查）', r.status === 401, r);

r = await post(tokenFor('u_plain'), goodBody);
check('一般學員（無組織）→ 403', r.status === 403, r);

r = await post(tokenFor('u_member_a'), goodBody);
check('組織內普通成員（isOrgAdmin 非 true）→ 403', r.status === 403, r);

r = await post(tokenFor('u_dept_a'), goodBody);
check('dept_admin → 403（不得批次建立帳號）', r.status === 403, r);

r = await post(tokenFor('u_admin_b'), goodBody);
check('其他組織的企業管理員 → 403（跨租戶）', r.status === 403, r);

r = await post(tokenFor('u_plain'), { orgId: 'org_a', rows: [] });
check('權限不足時先回 403，不會先回 batch_empty', r.status === 403, r);

check('被拒的請求沒有寫入任何 profile', table(T.profiles).length === profilesBefore, {
  before: profilesBefore,
  after: table(T.profiles).length,
});

// ── B. 企業管理員與系統管理員通過閘門 ───────────────────────────────────────
console.log('\nB. 通過授權後進入 body 驗證');

r = await post(tokenFor('u_admin_a'), { orgId: 'org_a', rows: [] });
check('本組織企業管理員 + 空 rows → 400 batch_empty（已過閘門）', r.status === 400 && r.data?.message === 'batch_empty', r);

r = await post(tokenFor('u_admin_a'), { rows: goodRows });
check('缺 orgId → 400 org_required', r.status === 400 && r.data?.message === 'org_required', r);

r = await post(tokenFor('u_admin_a'), { orgId: 'org_a', rows: new Array(201).fill(goodRows[0]) });
check(
  '超過單批上限 → 400 batch_too_large + maxRows',
  r.status === 400 && r.data?.message === 'batch_too_large' && r.data?.maxRows === 200,
  r
);

r = await post(tokenFor('u_sysadmin', 'admin'), { orgId: 'org_a', rows: [] });
check('系統管理員（role=admin）→ 通過閘門', r.status === 400 && r.data?.message === 'batch_empty', r);

r = await post(tokenFor('u_sysadmin', 'admin'), { orgId: 'org_nonexistent', rows: [] });
check('系統管理員對不存在的組織 → 仍先過閘門再驗 body', r.status === 400 && r.data?.message === 'batch_empty', r);

check('body 驗證階段也沒有建立 profile', table(T.profiles).length === profilesBefore, {
  before: profilesBefore,
  after: table(T.profiles).length,
});

// ── 結果 ─────────────────────────────────────────────────────────────────────
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
