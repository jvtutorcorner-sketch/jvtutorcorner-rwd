#!/usr/bin/env node
/**
 * course-sessions byStatus 索引 — 離線回歸測試
 * ============================================
 *
 * 不連網路、不碰任何真實資料表：假 AWS 憑證與假表名在 import 前設定，
 * ddbDocClient.send 在載入被測模組前換成「只記錄、不送出」的假實作。
 *
 * 驗證三件事：
 *   (a) schema 宣告：byStatus 鍵正確，以及一組通用守門 —— 每張表每個索引的鍵
 *       都已宣告在 attributes（setup-db.mjs 的 ensureTable 從那裡查型別，漏了會
 *       送出 AttributeType: undefined 而 ValidationException），每個 attribute 都被
 *       主鍵或某個索引使用（CreateTable 拒絕沒用到的 AttributeDefinitions）。
 *   (b) 查詢函式 listSessionsByStatus / listUpcomingAndLiveSessions 送出的
 *       IndexName / KeyConditionExpression / 值 / 分頁 / 上限。
 *   (c) setup-db.mjs 的 --only / --dry-run 步驟選擇（scripts/lib/setup-steps.mjs）。
 *
 * 用法：
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-course-sessions-index.mjs
 *
 * 退出碼：0 = 全部通過；1 = 有失敗。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.AWS_ACCESS_KEY_ID = 'verify-course-sessions-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-course-sessions-fake';
process.env.AWS_REGION = 'ap-northeast-1';
process.env.DYNAMODB_TABLE_COURSE_SESSIONS = 'verify-course-sessions-table';
delete process.env.LIVEKIT_EARLY_JOIN_MINUTES;

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');

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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const throws = (fn, re) => {
  try {
    fn();
    return false;
  } catch (e) {
    return re ? re.test(String(e?.message)) : true;
  }
};

// ── (a) schema ────────────────────────────────────────────────────────────────
console.log('\n[a] schema 宣告');
const schema = await import('./lib/schema.mjs');
const { TABLES, REQUIRED_INDEXES_ON_EXISTING_TABLES, createTableParams } = schema;

const cs = TABLES.courseSessions;
const byStatus = (cs.indexes || []).find((i) => i.name === 'byStatus');
check('courseSessions 宣告 byStatus', !!byStatus);
check('byStatus = hash status、range startTime', eq(byStatus && { h: byStatus.hash, r: byStatus.range }, { h: 'status', r: 'startTime' }));
check("attributes.status === 'S'", cs.attributes.status === 'S');
check('既有三個索引未變', eq(
  cs.indexes.filter((i) => i.name !== 'byStatus').map((i) => [i.name, i.hash, i.range ?? null]),
  [['byCourseId', 'courseId', 'startTime'], ['byTeacherId', 'teacherId', 'startTime'], ['byRoomId', 'roomId', null]]
));

for (const [key, def] of Object.entries(TABLES)) {
  const declared = new Set(Object.keys(def.attributes));
  const keyAttrs = new Set([def.partitionKey, def.sortKey].filter(Boolean));
  const missing = [];
  for (const idx of def.indexes || []) {
    for (const a of [idx.hash, idx.range].filter(Boolean)) {
      keyAttrs.add(a);
      if (!declared.has(a)) missing.push(`${idx.name}.${a}`);
    }
  }
  if (!declared.has(def.partitionKey)) missing.push(`PK.${def.partitionKey}`);
  check(`${key}: 所有索引鍵都宣告在 attributes`, missing.length === 0, missing.join(', '));
  const unused = [...declared].filter((a) => !keyAttrs.has(a));
  check(`${key}: 沒有未被任何鍵使用的 attribute`, unused.length === 0, unused.join(', '));

  // 模擬 setup-db.mjs ensureTable() 對既有表逐索引查型別
  const undefinedTypes = (def.indexes || []).filter(
    (idx) => def.attributes[idx.hash] === undefined || (idx.range && def.attributes[idx.range] === undefined)
  );
  check(`${key}: ensureTable 型別查找無 undefined`, undefinedTypes.length === 0, undefinedTypes.map((i) => i.name).join(', '));
}
for (const [key, def] of Object.entries(REQUIRED_INDEXES_ON_EXISTING_TABLES)) {
  const bad = (def.indexes || []).filter(
    (idx) => !idx.attributes || !idx.attributes[idx.hash] || (idx.range && !idx.attributes[idx.range])
  );
  check(`${key}（既有表）: 各索引自帶 attributes 涵蓋其鍵`, bad.length === 0, bad.map((i) => i.name).join(', '));
}
const params = createTableParams(cs, {});
check('createTableParams(courseSessions) 有 4 個 GSI', params.GlobalSecondaryIndexes?.length === 4);
check('全部 GSI 投影為 ALL', (params.GlobalSecondaryIndexes || []).every((g) => g.Projection?.ProjectionType === 'ALL'));
check('AttributeDefinitions 含 status:S', (params.AttributeDefinitions || []).some((d) => d.AttributeName === 'status' && d.AttributeType === 'S'));

// ── (b) 查詢函式 ──────────────────────────────────────────────────────────────
console.log('\n[b] 查詢函式');
const { ddbDocClient } = await import('../lib/dynamo.ts');
const sent = [];
let pages = [];
ddbDocClient.send = async (cmd) => {
  const name = cmd?.constructor?.name;
  if (name !== 'QueryCommand') throw new Error(`verifier: refusing ${name} (only QueryCommand is expected)`);
  sent.push(JSON.parse(JSON.stringify(cmd.input)));
  return pages.length ? pages.shift() : { Items: [] };
};
const reset = (p = []) => {
  sent.length = 0;
  pages = p;
};

const svc = await import('../lib/courseSessionService.ts');
const { listSessionsByStatus, listUpcomingAndLiveSessions, COURSE_SESSIONS_TABLE } = svc;
check('服務使用假表名（不會碰正式表）', COURSE_SESSIONS_TABLE === 'verify-course-sessions-table', COURSE_SESSIONS_TABLE);

const from = '2026-09-17T01:00:00.000Z';
const to = '2026-09-17T03:00:00.000Z';

reset();
await listSessionsByStatus('SCHEDULED', { from, to });
let q = sent[0];
check('from+to → BETWEEN', q?.KeyConditionExpression === '#status = :st AND startTime BETWEEN :from AND :to', q?.KeyConditionExpression);
check('IndexName byStatus、表名、升冪', q?.IndexName === 'byStatus' && q?.TableName === 'verify-course-sessions-table' && q?.ScanIndexForward === true);
check('#status 名稱對應（保留字）', eq(q?.ExpressionAttributeNames, { '#status': 'status' }));
check('值正確', eq(q?.ExpressionAttributeValues, { ':st': 'SCHEDULED', ':from': from, ':to': to }));
check('未設 limit 時不送 Limit', q && !('Limit' in q));

reset();
await listSessionsByStatus('LIVE', { from });
check('僅 from → >=', sent[0]?.KeyConditionExpression === '#status = :st AND startTime >= :from' && eq(sent[0]?.ExpressionAttributeValues, { ':st': 'LIVE', ':from': from }));

reset();
await listSessionsByStatus('SCHEDULED', { to });
check('僅 to → <=（抓逾時未開始的課）', sent[0]?.KeyConditionExpression === '#status = :st AND startTime <= :to' && eq(sent[0]?.ExpressionAttributeValues, { ':st': 'SCHEDULED', ':to': to }));

reset();
await listSessionsByStatus('COMPLETED');
check('無範圍 → 只比 status', sent[0]?.KeyConditionExpression === '#status = :st' && eq(sent[0]?.ExpressionAttributeValues, { ':st': 'COMPLETED' }));

reset();
const bad = await listSessionsByStatus('DONE');
check('非法 status → [] 且零請求', eq(bad, []) && sent.length === 0);
reset();
const badNull = await listSessionsByStatus(null);
check('null status → [] 且零請求', eq(badNull, []) && sent.length === 0);

reset([
  { Items: [{ id: 'a' }, { id: 'b' }], LastEvaluatedKey: { id: 'b' } },
  { Items: [{ id: 'c' }], LastEvaluatedKey: { id: 'c' } },
  { Items: [{ id: 'd' }] },
]);
const all = await listSessionsByStatus('LIVE');
check('分頁跟隨 LastEvaluatedKey 直到結束', eq(all.map((x) => x.id), ['a', 'b', 'c', 'd']) && sent.length === 3);
check('第 2 頁帶 ExclusiveStartKey', eq(sent[1]?.ExclusiveStartKey, { id: 'b' }));

reset([
  { Items: [{ id: 'a' }, { id: 'b' }], LastEvaluatedKey: { id: 'b' } },
  { Items: [{ id: 'c' }, { id: 'd' }], LastEvaluatedKey: { id: 'd' } },
  { Items: [{ id: 'e' }] },
]);
const capped = await listSessionsByStatus('LIVE', { limit: 3 });
check('limit=3 → 恰 3 筆', eq(capped.map((x) => x.id), ['a', 'b', 'c']), JSON.stringify(capped.map((x) => x.id)));
check('limit 達標即停止分頁（2 次請求）', sent.length === 2, String(sent.length));
check('limit 作為 Limit 送出', sent[0]?.Limit === 3);

const now = new Date('2026-09-17T08:00:00.000Z');
reset();
const r1 = await listUpcomingAndLiveSessions({ withinMinutes: 10, earlyJoinMinutes: 15, now });
const sched = sent.find((s) => s.ExpressionAttributeValues?.[':st'] === 'SCHEDULED');
const live = sent.find((s) => s.ExpressionAttributeValues?.[':st'] === 'LIVE');
check('恰兩次請求（SCHEDULED + LIVE）', sent.length === 2 && !!sched && !!live);
check('upcoming 視窗 = [now, now+25min]', eq(r1.window, { from: '2026-09-17T08:00:00.000Z', to: '2026-09-17T08:25:00.000Z' }), JSON.stringify(r1.window));
check('SCHEDULED 用 BETWEEN 精確 ISO 字串', sched?.KeyConditionExpression?.includes('BETWEEN') && sched?.ExpressionAttributeValues[':from'] === '2026-09-17T08:00:00.000Z' && sched?.ExpressionAttributeValues[':to'] === '2026-09-17T08:25:00.000Z');
check('LIVE 不設時間範圍', live?.KeyConditionExpression === '#status = :st');

reset();
const r2 = await listUpcomingAndLiveSessions({ withinMinutes: 10, earlyJoinMinutes: 15, lookbackMinutes: 30, now });
check('lookbackMinutes=30 前移 from', r2.window.from === '2026-09-17T07:30:00.000Z', r2.window.from);

reset();
const r3 = await listUpcomingAndLiveSessions({ withinMinutes: 10, now });
check('未給 earlyJoinMinutes → 用預設 15（LIVEKIT_EARLY_JOIN_MINUTES 未設）', r3.window.to === '2026-09-17T08:25:00.000Z', r3.window.to);

reset();
const r4 = await listUpcomingAndLiveSessions({ withinMinutes: -5, earlyJoinMinutes: 0, now });
check('負數分鐘視為 0', eq(r4.window, { from: '2026-09-17T08:00:00.000Z', to: '2026-09-17T08:00:00.000Z' }));

reset([{ Items: [{ id: 's1' }] }, { Items: [{ id: 'l1' }] }]);
const r5 = await listUpcomingAndLiveSessions({ withinMinutes: 10, earlyJoinMinutes: 0, now });
const ids = [...r5.upcoming, ...r5.live].map((x) => x.id).sort();
check('結果分流到 upcoming / live', eq(ids, ['l1', 's1']) && r5.upcoming.length === 1 && r5.live.length === 1);

// ── (c) setup-db 步驟選擇 ────────────────────────────────────────────────────
console.log('\n[c] setup-db --only / --dry-run');
const steps = await import('./lib/setup-steps.mjs');
const { STEP_KEYS, parseOnlyArg, parseDryRunArg, selectSteps, unknownArgs } = steps;
const fake = STEP_KEYS.map((key) => ({ key, name: `${key} step` }));

check('無旗標 → null', parseOnlyArg([]) === null);
check('--only=courseSessions', eq(parseOnlyArg(['--only=courseSessions']), ['courseSessions']));
check('--only=a,b 去空白', eq(parseOnlyArg(['--only= courseSessions , pointsEscrow ']), ['courseSessions', 'pointsEscrow']));
check('--only（無值）throw', throws(() => parseOnlyArg(['--only']), /needs a value/));
check('--only=（空）throw', throws(() => parseOnlyArg(['--only=']), /at least one/));
check('--only 給兩次 throw', throws(() => parseOnlyArg(['--only=a', '--only=b']), /more than once/));
check('--dry-run → true', parseDryRunArg(['--dry-run']) === true && parseDryRunArg([]) === false);
check('--dry-run=false 被拒（不會靜默變成套用）', throws(() => parseDryRunArg(['--dry-run=false']), /no value/));
check('unknownArgs 抓到拼錯的旗標', eq(unknownArgs(['--only=x', '--dryrun', 'foo']), ['--dryrun', 'foo']));

const allSel = selectSteps(null, fake);
check('null → 全部 16 步、順序不變', allSel.selected.length === 16 && eq(allSel.selected.map((s) => s.key), STEP_KEYS) && allSel.skipped.length === 0);
const one = selectSteps(['courseSessions'], fake);
check('courseSessions → 1 步、15 步略過', eq(one.selected.map((s) => s.key), ['courseSessions']) && one.skipped.length === 15);
const two = selectSteps(['pointsEscrow', 'courseSessions'], fake);
check('多個 key 保持宣告順序', eq(two.selected.map((s) => s.key), ['courseSessions', 'pointsEscrow']));
check('大小寫不敏感 + 去重', eq(selectSteps(['COURSESESSIONS', 'courseSessions'], fake).selected.map((s) => s.key), ['courseSessions']));
check('未知 key throw 並列出合法 key', throws(() => selectSteps(['courseSession'], fake), /unknown step key\(s\): courseSession\. Valid keys: organizations/));
check('宣告重複 key throw', throws(() => selectSteps(null, [...fake, { key: 'Courses', name: 'dup' }]), /declared twice/));

check(
  'schema 表 key（TABLES + REQUIRED_INDEXES_ON_EXISTING_TABLES）= STEP_KEYS（verify-schema 提示用）',
  eq([...Object.keys(TABLES), ...Object.keys(REQUIRED_INDEXES_ON_EXISTING_TABLES)], [...STEP_KEYS])
);

const setupSrc = fs.readFileSync(path.join(repo, 'scripts', 'setup-db.mjs'), 'utf8');
check('setup-db.mjs 使用 selectSteps', setupSrc.includes('selectSteps(ONLY, allSteps)'));
const declaredKeys = [...setupSrc.matchAll(/\{\s*key:\s*'([A-Za-z]+)'/g)].map((m) => m[1]);
check('setup-db.mjs 步驟 key 與 STEP_KEYS 完全一致', eq(declaredKeys, [...STEP_KEYS]), JSON.stringify(declaredKeys));
check('旗標在建立 AWS client 之前解析', setupSrc.indexOf('parseOnlyArg(') < setupSrc.indexOf('createDynamoDBClient()'));

console.log('');
if (failed === 0) {
  console.log(`✅ course-sessions byStatus 索引離線測試全數通過（${passed} 項）`);
  process.exit(0);
}
console.log(`❌ course-sessions byStatus 索引離線測試有 ${failed} 項失敗（通過 ${passed} 項）`);
process.exit(1);
