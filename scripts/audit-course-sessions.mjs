#!/usr/bin/env node
/**
 * course-sessions 資料審核（唯讀）
 * ================================
 *
 * 建立 byStatus GSI（hash status、range startTime）之前的閘門，以及建立之後的驗證。
 *
 * 為什麼要先審核：DynamoDB 回填 GSI 時會略過鍵型別不符的列；更糟的是，之後
 * 對那一列任何會寫到 status 的更新都會被拒絕（Type mismatch for Index Key）。
 * status 缺值的列只是「不進索引」，非字串的 status 才是真正的風險。
 *
 * 本腳本只 import ScanCommand / QueryCommand，沒有任何寫入指令。
 *
 * 用法：
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/audit-course-sessions.mjs
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/audit-course-sessions.mjs --probe-index
 *
 *   表名依 DYNAMODB_TABLE_COURSE_SESSIONS（預設 jvtutorcorner-course-sessions）。
 *   --probe-index：對每個 status 以 byStatus 做 COUNT 查詢，與 Scan 分布比對。
 *                  索引還在回填時查詢會直接報錯（= 尚未 ACTIVE）；計數相等 = 回填完成。
 *
 * 退出碼：0 = 無硬性問題（且 --probe-index 計數一致）；1 = 有硬性問題或計數不一致。
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const { ScanCommand, QueryCommand } = await import('@aws-sdk/lib-dynamodb');
const { ddbDocClient } = await import('../lib/dynamo.ts');
const { COURSE_SESSION_STATUSES } = await import('../lib/types/courseSession.ts');

const TABLE = process.env.DYNAMODB_TABLE_COURSE_SESSIONS || 'jvtutorcorner-course-sessions';
const PROBE = process.argv.includes('--probe-index');
const MAX_IDS = 20;
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

const unknownArgs = process.argv.slice(2).filter((a) => a !== '--probe-index');
if (unknownArgs.length) {
  console.error(`❌ unknown argument(s): ${unknownArgs.join(' ')}`);
  process.exit(1);
}

console.log(`\n🔍 Auditing ${TABLE} (read-only)\n`);

const hard = {
  statusMissing: [],
  statusNotString: [],
  statusUnknownValue: [],
  startTimeMissing: [],
  startTimeNotString: [],
};
const warn = {
  endTimeMissing: [],
  endTimeNotString: [],
  startTimeNotIsoZ: [],
  endTimeNotIsoZ: [],
};
const counts = {};
const extraStatusValues = {};
let total = 0;

const push = (bucket, id) => bucket.push(String(id ?? '(no id)'));

let ExclusiveStartKey;
do {
  const res = await ddbDocClient.send(
    new ScanCommand({
      TableName: TABLE,
      ProjectionExpression: 'id, #status, startTime, endTime',
      ExpressionAttributeNames: { '#status': 'status' },
      ExclusiveStartKey,
    })
  );
  for (const item of res.Items || []) {
    total++;
    const { id, status, startTime, endTime } = item;

    if (!('status' in item) || status === null || status === undefined) {
      push(hard.statusMissing, id);
    } else if (typeof status !== 'string') {
      push(hard.statusNotString, id);
    } else if (!COURSE_SESSION_STATUSES.includes(status)) {
      push(hard.statusUnknownValue, id);
      extraStatusValues[status] = (extraStatusValues[status] || 0) + 1;
    } else {
      counts[status] = (counts[status] || 0) + 1;
    }

    if (!('startTime' in item) || startTime === null || startTime === undefined) push(hard.startTimeMissing, id);
    else if (typeof startTime !== 'string') push(hard.startTimeNotString, id);
    else if (!ISO_Z.test(startTime)) push(warn.startTimeNotIsoZ, id);

    if (!('endTime' in item) || endTime === null || endTime === undefined) push(warn.endTimeMissing, id);
    else if (typeof endTime !== 'string') push(warn.endTimeNotString, id);
    else if (!ISO_Z.test(endTime)) push(warn.endTimeNotIsoZ, id);
  }
  ExclusiveStartKey = res.LastEvaluatedKey;
} while (ExclusiveStartKey);

console.log(`Total rows: ${total}`);
console.log('Status distribution:');
for (const s of COURSE_SESSION_STATUSES) console.log(`  ${s.padEnd(10)} ${counts[s] || 0}`);
if (Object.keys(extraStatusValues).length) {
  console.log(`  (unexpected values: ${JSON.stringify(extraStatusValues)})`);
}

const report = (title, groups, icon) => {
  let n = 0;
  for (const [name, ids] of Object.entries(groups)) {
    if (!ids.length) continue;
    n += ids.length;
    const shown = ids.slice(0, MAX_IDS).join(', ');
    console.log(`  ${icon} ${name}: ${ids.length}${ids.length ? ` — ${shown}${ids.length > MAX_IDS ? ', …' : ''}` : ''}`);
  }
  console.log(`${title}: ${n}`);
  return n;
};

console.log('');
const hardCount = report('hard failures', hard, '❌');
const warnCount = report('warnings', warn, '⚠️');

let probeFailed = false;
if (PROBE) {
  console.log('\n🔎 Probing byStatus index (COUNT per status)');
  for (const s of COURSE_SESSION_STATUSES) {
    try {
      let indexed = 0;
      let key;
      do {
        const r = await ddbDocClient.send(
          new QueryCommand({
            TableName: TABLE,
            IndexName: 'byStatus',
            Select: 'COUNT',
            KeyConditionExpression: '#status = :s',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':s': s },
            ExclusiveStartKey: key,
          })
        );
        indexed += r.Count || 0;
        key = r.LastEvaluatedKey;
      } while (key);
      const scanned = counts[s] || 0;
      const same = indexed === scanned;
      if (!same) probeFailed = true;
      console.log(`  ${same ? '✅' : '❌'} ${s.padEnd(10)} index=${indexed} scan=${scanned}`);
    } catch (err) {
      probeFailed = true;
      console.log(`  ❌ ${s.padEnd(10)} query failed: ${err?.name || ''} ${err?.message || err}`);
    }
  }
  console.log(
    probeFailed
      ? 'Index probe: NOT consistent (missing, still backfilling, or rows changed during the audit)'
      : 'Index probe: consistent with scan — byStatus is ACTIVE and fully backfilled'
  );
}

console.log('');
if (hardCount === 0 && !probeFailed) {
  console.log(`✅ Audit passed (${warnCount} warning(s))`);
  process.exit(0);
}
console.log('❌ Audit failed');
process.exit(1);
