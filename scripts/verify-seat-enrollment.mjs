#!/usr/bin/env node
/**
 * B2B 企業席次報名回歸測試（完全離線）
 * ===================================
 *
 * 驗證：
 *   A. lib/accessControl.ts
 *      - findValidSeatLicense：有效席次 → 通過；他組織 / 已過期 / 課程不符 /
 *        組織停權 / 已撤銷 → null；ISO 字串的未來 expiresAt 仍視為有效
 *      - verifyCourseAccess：B2B_SEAT 報名列本身「不」授權 —— 授權撤銷後即拒絕；
 *        授權有效時以 B2B_SEAT 放行；B2C 購買列照舊以 B2C 放行
 *   B. lib/livekit/authorizeJoin.ts：無購買紀錄的席次學生可進教室；撤銷後 NOT_ENROLLED
 *   C. app/api/enroll/seat POST：401 / 404 / 400（時長、過去時間、下架課程）/ 403 /
 *      201（enrollment + order 同一個 TransactWrite、無 null GSI key）/ 409 重複報名
 *
 * 安全性：不連網路、不碰任何真實資料表。
 *   - 在載入被測模組前把 DynamoDBDocumentClient.prototype.send 換成記憶體實作
 *     （lib/dynamo、licenseService、organizationService 各自建立的 client 都繼承它），
 *     未知指令一律 throw
 *   - AWS 憑證只給假值（避免 SDK 走預設憑證鏈讀到本機 ~/.aws）
 *   - 全域 fetch 一律 throw
 *   - 不讀 .env.local
 *
 * 用法：
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-seat-enrollment.mjs
 *
 * 退出碼：0 = 全部通過；1 = 有失敗。
 */

import crypto from 'node:crypto';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

// Node 的型別剝除（type stripping）無法處理「值 import 裡混了型別」的寫法
// （lib/auth/apiGuard.ts: `import { getSession, ..., Session } from './sessionManager'`），
// 所以專案內的 .ts 改用 TypeScript transpileModule 轉譯 —— 它會刪掉只當型別用的 import。
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

process.env.AWS_ACCESS_KEY_ID = 'verify-seat-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-seat-fake';
delete process.env.AWS_SESSION_TOKEN;
delete process.env.AWS_PROFILE;
process.env.AWS_REGION = 'ap-northeast-1';
process.env.SESSION_SECRET = 'verify-seat-session-secret';
delete process.env.PROFILES_API_URL;
delete process.env.PROFILES_ENDPOINT;
delete process.env.PROFILES_LAMBDA_NAME;
delete process.env.PROFILES_FUNCTION_NAME;
delete process.env.LOGIN_BYPASS_SECRET;

const T = {
  enrollments: 'verify-seat-enrollments',
  orders: 'verify-seat-orders',
  courses: 'verify-seat-courses',
  licenses: 'verify-seat-licenses',
  orgs: 'verify-seat-orgs',
  profiles: 'verify-seat-profiles',
  sessions: 'verify-seat-sessions',
  courseSessions: 'verify-seat-course-sessions',
};
process.env.ENROLLMENTS_TABLE = T.enrollments;
process.env.DYNAMODB_TABLE_ENROLLMENTS = T.enrollments;
process.env.DYNAMODB_TABLE_ORDERS = T.orders;
process.env.DYNAMODB_TABLE_COURSES = T.courses;
process.env.DYNAMODB_TABLE_LICENSES = T.licenses;
process.env.DYNAMODB_TABLE_ORGANIZATIONS = T.orgs;
process.env.DYNAMODB_TABLE_PROFILES = T.profiles;
process.env.PROFILES_TABLE = T.profiles;
process.env.DYNAMODB_TABLE_SESSIONS = T.sessions;
process.env.DYNAMODB_TABLE_COURSE_SESSIONS = T.courseSessions;

globalThis.fetch = async (url) => {
  throw new Error(`verify-seat-enrollment: network access blocked (${url})`);
};

// ── 假 DynamoDB ──────────────────────────────────────────────────────────────
const PK = { [T.orders]: ['orderId'], [T.sessions]: ['sessionId'] };
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
const findByKey = (name, key) =>
  table(name).find((it) => pkOf(name).every((k) => it[k] === key[k]));
const putItem = (name, item) => {
  const rows = table(name);
  const idx = rows.findIndex((it) => pkOf(name).every((k) => it[k] === item[k]));
  if (idx >= 0) rows[idx] = clone(item);
  else rows.push(clone(item));
};
const txLog = [];

function assertNoNullKeys(item) {
  for (const [k, v] of Object.entries(item)) {
    if (v === null) throw new Error(`fake ddb: attribute ${k} is NULL (would break GSI keys)`);
  }
}

function matchesFilter(item, input) {
  const expr = input.FilterExpression;
  if (!expr) return true;
  const m = expr.match(/^\s*(#?\w+)\s+IN\s+\(([^)]*)\)\s*$/);
  if (!m) throw new Error(`fake ddb: unsupported FilterExpression "${expr}"`);
  const attr = m[1].startsWith('#') ? input.ExpressionAttributeNames[m[1]] : m[1];
  const vals = m[2].split(',').map((t) => input.ExpressionAttributeValues[t.trim()]);
  return vals.includes(item[attr]);
}

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
      const items = table(input.TableName)
        .filter((it) => it[attr] === val)
        .filter((it) => matchesFilter(it, input));
      return { Items: clone(items) };
    }
    case 'PutCommand':
      assertNoNullKeys(input.Item);
      putItem(input.TableName, input.Item);
      return {};
    case 'TransactWriteCommand': {
      txLog.push(clone(input));
      const reasons = input.TransactItems.map((ti) => {
        if (!ti.Put) throw new Error('fake ddb: only Put supported in transactions');
        const { TableName, Item, ConditionExpression } = ti.Put;
        assertNoNullKeys(Item);
        const cm = String(ConditionExpression || '').match(/^attribute_not_exists\((\w+)\)$/);
        if (!cm) throw new Error(`fake ddb: unsupported tx condition "${ConditionExpression}"`);
        const exists = !!findByKey(TableName, Item);
        return { Code: exists ? 'ConditionalCheckFailed' : 'None' };
      });
      if (reasons.some((r) => r.Code !== 'None')) {
        const err = new Error('Transaction cancelled');
        err.name = 'TransactionCanceledException';
        err.CancellationReasons = reasons;
        throw err;
      }
      for (const ti of input.TransactItems) putItem(ti.Put.TableName, ti.Put.Item);
      return {};
    }
    default:
      throw new Error(`fake ddb: unsupported command ${name}`);
  }
}

const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
DynamoDBDocumentClient.prototype.send = fakeSend;
const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
DynamoDBClient.prototype.send = async () => {
  throw new Error('verify-seat-enrollment: raw DynamoDBClient.send blocked');
};

const { verifyCourseAccess, findValidSeatLicense, findPurchasedEnrollment } =
  await import('../lib/accessControl.ts');
const { authorizeJoin } = await import('../lib/livekit/authorizeJoin.ts');
const seatRoute = await import('../app/api/enroll/seat/route.ts');

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
const ISO = (ms) => new Date(ms).toISOString();
// EnrollButton 存的 datetime-local 牆上時間（平台時區 +08:00，無時區字尾）
const TPE = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 16);

function seedBase() {
  tables.clear();
  putItem(T.orgs, { id: 'org_a', status: 'active' });
  putItem(T.orgs, { id: 'org_b', status: 'active' });
  putItem(T.orgs, { id: 'org_susp', status: 'suspended' });
  putItem(T.courses, { id: 'course_1', title: 'Course 1', status: '上架', durationMinutes: 50, totalSessions: 4 });
  putItem(T.courses, { id: 'course_2', title: 'Course 2', status: '上架', durationMinutes: 30, totalSessions: 1 });
  putItem(T.courses, { id: 'course_off', title: 'Off', status: '下架', durationMinutes: 30, totalSessions: 1 });
}

function addUser(userId, orgId, license) {
  putItem(T.profiles, { id: userId, orgId, isB2B: !!orgId, plan: null });
  if (license) putItem(T.licenses, { userId, orgId, status: 'active', ...license });
}

// ── A. accessControl ─────────────────────────────────────────────────────────
console.log('\nA. lib/accessControl.ts');
seedBase();
addUser('u_valid', 'org_a', { id: 'lic_valid' });
addUser('u_other_org', 'org_a', { id: 'lic_other', orgId: 'org_b' });
addUser('u_expired', 'org_a', { id: 'lic_exp', expiresAt: nowSec - 60 });
addUser('u_iso_future', 'org_a', { id: 'lic_iso', expiresAt: ISO(Date.now() + 86400_000) });
addUser('u_course', 'org_a', { id: 'lic_course', courseId: 'course_2' });
addUser('u_susp', 'org_susp', { id: 'lic_susp', orgId: 'org_susp' });
addUser('u_left', null, { id: 'lic_left' });
addUser('u_b2c', null, null);
putItem(T.enrollments, {
  id: 'enr_b2c', userId: 'u_b2c', courseId: 'course_1', status: 'PAID', sourceType: 'B2C', createdAt: ISO(Date.now()),
});

check('valid org-wide seat → findValidSeatLicense returns it',
  (await findValidSeatLicense('u_valid', 'course_1'))?.license?.id === 'lic_valid');
check('license of another org → null', (await findValidSeatLicense('u_other_org', 'course_1')) === null);
check('expired license → null', (await findValidSeatLicense('u_expired', 'course_1')) === null);
check('ISO-string future expiresAt → still valid',
  (await findValidSeatLicense('u_iso_future', 'course_1'))?.license?.id === 'lic_iso');
check('course-scoped license, other course → null', (await findValidSeatLicense('u_course', 'course_1')) === null);
check('course-scoped license, matching course → valid',
  (await findValidSeatLicense('u_course', 'course_2'))?.license?.id === 'lic_course');
check('suspended org → null', (await findValidSeatLicense('u_susp', 'course_1')) === null);
check('member no longer in any org → null', (await findValidSeatLicense('u_left', 'course_1')) === null);

let r = await verifyCourseAccess('u_valid', 'course_1');
check('verifyCourseAccess grants via license (B2B_SEAT)', r.granted && r.source === 'B2B_SEAT', r);
r = await verifyCourseAccess('u_b2c', 'course_1');
check('verifyCourseAccess still grants a B2C purchase', r.granted && r.source === 'B2C', r);

// Seat row present, then license revoked → must be denied.
putItem(T.enrollments, {
  id: 'enr_seat_x', userId: 'u_valid', courseId: 'course_1', status: 'ACTIVE', sourceType: 'B2B_SEAT',
  orgId: 'org_a', licenseId: 'lic_valid', createdAt: ISO(Date.now()),
});
check('findPurchasedEnrollment ignores B2B_SEAT rows', (await findPurchasedEnrollment('u_valid', 'course_1')) === null);
putItem(T.licenses, { id: 'lic_valid', userId: 'u_valid', orgId: 'org_a', status: 'revoked' });
r = await verifyCourseAccess('u_valid', 'course_1');
check('B2B_SEAT row alone does NOT grant access after license revoked', !r.granted, r);

// ── B. authorizeJoin ─────────────────────────────────────────────────────────
console.log('\nB. lib/livekit/authorizeJoin.ts');
putItem(T.courseSessions, {
  id: 'cs_1', courseId: 'course_1', teacherId: 't_1', status: 'SCHEDULED',
  startTime: ISO(Date.now() - 5 * 60_000), endTime: ISO(Date.now() + 45 * 60_000), roomId: 'room_1',
});
const joinOpts = { earlyJoinMinutes: 15, graceMinutes: 30, maxTokenTtlSec: 3 * 3600 };
let j = await authorizeJoin({ userId: 'u_valid', role: 'student' }, { courseSessionId: 'cs_1' }, joinOpts);
check('revoked seat (only B2B_SEAT row left) → NOT_ENROLLED', !j.ok && j.reason === 'NOT_ENROLLED', j);
putItem(T.licenses, { id: 'lic_valid', userId: 'u_valid', orgId: 'org_a', status: 'active' });
j = await authorizeJoin({ userId: 'u_valid', role: 'student' }, { courseSessionId: 'cs_1' }, joinOpts);
check('valid seat, no purchase → joins as student', j.ok && j.participantRole === 'student', j);
j = await authorizeJoin({ userId: 'u_other_org', role: 'student' }, { courseSessionId: 'cs_1' }, joinOpts);
check('seat of another org → NOT_ENROLLED', !j.ok && j.reason === 'NOT_ENROLLED', j);
j = await authorizeJoin({ userId: 'u_b2c', role: 'student' }, { courseSessionId: 'cs_1' }, joinOpts);
check('B2C purchase still joins', j.ok && j.participantRole === 'student', j);

// ── C. POST /api/enroll/seat ─────────────────────────────────────────────────
console.log('\nC. app/api/enroll/seat');
seedBase();
addUser('u_seat', 'org_a', { id: 'lic_seat' });
addUser('u_noseat', 'org_a', null);

function tokenFor(userId) {
  const sessionId = crypto.randomBytes(16).toString('hex');
  putItem(T.sessions, {
    sessionId, userId, email: `${userId}@example.test`, role: 'student', plan: 'basic',
    createdAt: nowSec, expiresAt: nowSec + 3600,
  });
  const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(sessionId).digest('hex');
  return `${sessionId}.${sig}`;
}

async function post(token, body) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.cookie = `session=${token}`;
  const res = await seatRoute.POST(
    new Request('http://localhost/api/enroll/seat', { method: 'POST', headers, body: JSON.stringify(body) })
  );
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

const seatToken = tokenFor('u_seat');
const start = Math.floor((Date.now() + 2 * 3600_000) / 60_000) * 60_000;
const good = { courseId: 'course_1', startTime: TPE(start), endTime: TPE(start + 50 * 60_000), userId: 'u_noseat' };

let p = await post(null, good);
check('no session → 401', p.status === 401, p);
p = await post(seatToken, { ...good, courseId: 'nope_course' });
check('unknown course → 404', p.status === 404, p);
p = await post(seatToken, { ...good, courseId: 'course_off', endTime: TPE(start + 30 * 60_000) });
check('下架 course → 400', p.status === 400, p);
p = await post(seatToken, { ...good, endTime: TPE(start + 90 * 60_000) });
check('duration mismatch → 400', p.status === 400, p);
p = await post(seatToken, { ...good, startTime: TPE(Date.now() - 3600_000), endTime: TPE(Date.now() - 10 * 60_000) });
check('start in the past → 400', p.status === 400, p);
p = await post(tokenFor('u_noseat'), good);
check('no valid seat → 403', p.status === 403, p);

p = await post(seatToken, good);
check('valid seat → 201', p.status === 201, p);
const enr = table(T.enrollments).find((e) => e.userId === 'u_seat');
const ord = table(T.orders).find((o) => o.userId === 'u_seat');
check('userId comes from session, not body', enr?.userId === 'u_seat' && !table(T.enrollments).some((e) => e.userId === 'u_noseat'));
check('enrollment is B2B_SEAT / ACTIVE with orgId + licenseId + orderId',
  enr?.sourceType === 'B2B_SEAT' && enr?.status === 'ACTIVE' && enr?.orgId === 'org_a' &&
  enr?.licenseId === 'lic_seat' && enr?.orderId === ord?.orderId, enr);
check('startTime/endTime stored in the same naive wall-clock format as B2C',
  enr?.startTime === good.startTime && enr?.endTime === good.endTime &&
  ord?.startTime === good.startTime && ord?.endTime === good.endTime, { enr, ord });
check('enrollment omits empty courseSessionId (no null GSI keys)', !('courseSessionId' in (enr || {})), enr);
check('order is PAID b2b_seat amount 0 with remainingSessions/Seconds',
  ord?.status === 'PAID' && ord?.paymentMethod === 'b2b_seat' && ord?.amount === 0 &&
  ord?.remainingSessions === 4 && ord?.remainingSeconds === 3000 && ord?.enrollmentId === enr?.id, ord);
check('both rows written in ONE TransactWrite with attribute_not_exists',
  txLog.length === 1 && txLog[0].TransactItems.length === 2 &&
  txLog[0].TransactItems.every((ti) => /^attribute_not_exists\(/.test(ti.Put.ConditionExpression)), txLog);

const accessAfter = await verifyCourseAccess('u_seat', 'course_1');
check('seat student has access (via license)', accessAfter.granted && accessAfter.source === 'B2B_SEAT', accessAfter);

p = await post(seatToken, good);
check('same slot again → 409', p.status === 409, p);
p = await post(seatToken, {
  courseId: 'course_2', startTime: TPE(start + 20 * 60_000), endTime: TPE(start + 50 * 60_000),
});
check('overlapping other course → 409', p.status === 409, p);
p = await post(seatToken, { ...good, startTime: ISO(start), endTime: ISO(start + 50 * 60_000) });
check('same instant sent as UTC ISO → still 409 (naive parsed as +08:00)', p.status === 409, p);

// Race: overlap check passes for both but the tx condition must still stop one.
// (ids hash the absolute start instant, so the ISO spelling collides too)
table(T.orders).length = 0;
p = await post(seatToken, { ...good, startTime: ISO(start), endTime: ISO(start + 50 * 60_000) });
check('duplicate caught by transaction condition → 409', p.status === 409, p);

putItem(T.licenses, { id: 'lic_seat', userId: 'u_seat', orgId: 'org_a', status: 'revoked' });
const revoked = await verifyCourseAccess('u_seat', 'course_1');
check('after revoke, the seat enrollment row no longer grants access', !revoked.granted, revoked);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
