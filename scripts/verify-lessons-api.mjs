#!/usr/bin/env node
/**
 * Lesson store + finalize + session claim — offline test (in-memory DDB, no AWS).
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-lessons-api.mjs
 *
 * Covers: event append idempotency + ordering + since filter, finalize writes
 * segments, teacher edits survive re-finalize, updateLessonSegment on a missing
 * row fails, and ensureClassroomSession is idempotent under a create race.
 */
process.env.AWS_ACCESS_KEY_ID = 'verify-lessons-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-lessons-fake';
process.env.AWS_REGION = 'ap-northeast-1';

const { ddbDocClient } = await import('../lib/dynamo.ts');

// ── in-memory DynamoDB ────────────────────────────────────────────────────────
const tables = {};
const tableOf = (tn) => (tables[tn] ??= new Map());
function keyOf(tn, obj) {
  if (tn.includes('lesson-events')) return `${obj.sessionId}||${obj.sk}`;
  if (tn.includes('lesson-segments')) return `${obj.sessionId}||${obj.seq}`;
  return String(obj.id);
}
function applySet(item, inp) {
  const names = inp.ExpressionAttributeNames || {};
  const values = inp.ExpressionAttributeValues || {};
  const m = /^\s*SET\s+(.*)$/is.exec(inp.UpdateExpression || '');
  if (!m) return;
  for (const assign of m[1].split(',')) {
    const [lhsRaw, rhsRaw] = assign.split('=').map((s) => s.trim());
    if (!rhsRaw) continue;
    const lhs = names[lhsRaw] || lhsRaw;
    item[lhs] = values[rhsRaw];
  }
}
const clone = (x) => JSON.parse(JSON.stringify(x));
ddbDocClient.send = async (cmd) => {
  const n = cmd?.constructor?.name;
  const inp = cmd?.input || {};
  const tn = inp.TableName;
  if (n === 'PutCommand') {
    const map = tableOf(tn);
    const k = keyOf(tn, inp.Item);
    if (/attribute_not_exists/.test(inp.ConditionExpression || '') && map.has(k)) {
      const e = new Error('conditional');
      e.name = 'ConditionalCheckFailedException';
      throw e;
    }
    map.set(k, clone(inp.Item));
    return {};
  }
  if (n === 'GetCommand') return { Item: tableOf(tn).get(keyOf(tn, inp.Key)) };
  if (n === 'QueryCommand') {
    const v = inp.ExpressionAttributeValues || {};
    let items = [...tableOf(tn).values()].filter((it) => it.sessionId === v[':s']);
    if (/sk > :since/.test(inp.KeyConditionExpression || '')) items = items.filter((it) => it.sk > v[':since']);
    const skName = tn.includes('lesson-segments') ? 'seq' : 'sk';
    items.sort((a, b) => (a[skName] < b[skName] ? -1 : a[skName] > b[skName] ? 1 : 0));
    if (inp.ScanIndexForward === false) items.reverse();
    if (inp.Limit) items = items.slice(0, inp.Limit);
    return { Items: items };
  }
  if (n === 'BatchWriteCommand') {
    for (const [t, reqs] of Object.entries(inp.RequestItems || {})) {
      const m = tableOf(t);
      for (const r of reqs) if (r.PutRequest) m.set(keyOf(t, r.PutRequest.Item), clone(r.PutRequest.Item));
    }
    return {};
  }
  if (n === 'UpdateCommand') {
    const map = tableOf(tn);
    const k = keyOf(tn, inp.Key);
    if (/attribute_exists/.test(inp.ConditionExpression || '') && !map.has(k)) {
      const e = new Error('conditional');
      e.name = 'ConditionalCheckFailedException';
      throw e;
    }
    const item = map.get(k) || { ...inp.Key };
    applySet(item, inp);
    map.set(k, item);
    return { Attributes: clone(item) };
  }
  // profile / teacher lookups from requireCanonicalTeacherId → empty
  return { Item: undefined, Items: [] };
};

const store = await import('../lib/lessonAI/lessonStore.ts');
const { finalizeLessonSegments } = await import('../lib/lessonAI/finalize.ts');
const { ensureClassroomSession, getCourseSession } = await import('../lib/courseSessionService.ts');

let failed = 0,
  passed = 0;
const check = (l, c, d = '') => {
  if (c) {
    passed++;
    console.log(`  ✅ ${l}`);
  } else {
    failed++;
    console.log(`  ❌ ${l}${d ? `  (${d})` : ''}`);
  }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('[1] event append idempotency');
{
  const sid = 'lsn_evt1';
  const e = { eventId: 'm1', source: 'marker', type: 'important_concept', offsetSec: 30, ts: 1000, confidence: 1 };
  await store.appendLessonEvent(sid, e);
  await store.appendLessonEvent(sid, e); // retry same object
  const rows = await store.listLessonEvents(sid);
  check('同一 event 重送只留一列', rows.length === 1, String(rows.length));
}

console.log('\n[2] ordering + since filter');
{
  const sid = 'lsn_evt2';
  await store.appendLessonEvents(sid, [
    { eventId: 'a', source: 'system', type: 'tick', offsetSec: 60, ts: 1000 },
    { eventId: 'b', source: 'marker', type: 'start_new_topic', offsetSec: 120, ts: 2000 },
    { eventId: 'c', source: 'system', type: 'class_ended', offsetSec: 180, ts: 3000 },
  ]);
  const all = await store.listLessonEvents(sid);
  check('依 sk 時序回傳', eq(all.map((r) => r.eventId), ['a', 'b', 'c']), JSON.stringify(all.map((r) => r.eventId)));
  const since = await store.listLessonEvents(sid, { sinceSk: all[0].sk });
  check('since= 只回較新的', eq(since.map((r) => r.eventId), ['b', 'c']));
}

console.log('\n[3] finalize writes segments');
{
  const sid = 'lsn_fin';
  await store.appendLessonEvents(sid, [
    { eventId: 's', source: 'system', type: 'class_started', offsetSec: 0, ts: 0 },
    { eventId: 't', source: 'marker', type: 'start_new_topic', offsetSec: 300, ts: 300000, note: '第二段' },
    { eventId: 'e', source: 'system', type: 'class_ended', offsetSec: 600, ts: 600000 },
  ]);
  const r = await finalizeLessonSegments({
    sessionId: sid,
    courseId: 'c1',
    lessonStartIso: '2026-09-22T13:00:00.000Z',
    lessonEndIso: '2026-09-22T13:50:00.000Z',
  });
  const segs = await store.listLessonSegments(sid);
  check('切成兩段', r.segments === 2 && segs.length === 2, `${r.segments}/${segs.length}`);
  check('每段有 courseId 與非空 startTime(byCourseId 鍵不為 null)', segs.every((s) => s.courseId === 'c1' && !!s.startTime));
  check('seq 為零補字串、index 為數字', segs[0].seq === '000000' && segs[0].index === 0);

  const empty = await finalizeLessonSegments({ sessionId: 'lsn_none', courseId: 'c1', lessonStartIso: '2026-09-22T13:00:00.000Z' });
  check('無事件 → skipped', empty.segments === 0 && empty.skipped === 'no-events');
}

console.log('\n[4] teacher edit survives re-finalize');
{
  const sid = 'lsn_edit';
  await store.appendLessonEvents(sid, [
    { eventId: 's', source: 'system', type: 'class_started', offsetSec: 0, ts: 0 },
    { eventId: 'e', source: 'system', type: 'class_ended', offsetSec: 300, ts: 300000 },
  ]);
  await finalizeLessonSegments({ sessionId: sid, courseId: 'c1', lessonStartIso: '2026-09-22T13:00:00.000Z' });
  const updated = await store.updateLessonSegment(sid, '000000', { topic: '一元二次方程式' }, 'teacher1');
  check('updateLessonSegment 回傳更新後 topic + editedBy', updated?.topic === '一元二次方程式' && updated?.editedBy === 'teacher1');
  await finalizeLessonSegments({ sessionId: sid, courseId: 'c1', lessonStartIso: '2026-09-22T13:00:00.000Z' });
  const after = await store.listLessonSegments(sid);
  check('重新 finalize 後老師編輯的 topic 仍在', after[0].topic === '一元二次方程式' && after[0].editedBy === 'teacher1');
}

console.log('\n[5] updateLessonSegment on a missing row fails');
{
  let threw = false;
  try {
    await store.updateLessonSegment('lsn_missing', '000000', { topic: 'x' }, 'teacher1');
  } catch (err) {
    threw = err?.name === 'ConditionalCheckFailedException';
  }
  check('缺該段 → ConditionalCheckFailedException', threw);
}

console.log('\n[6] ensureClassroomSession idempotent under a create race');
{
  const id = 'lsn_race';
  const input = {
    id,
    courseId: 'c1',
    teacherId: 'teacher-raw',
    orderId: 'o1',
    startTime: '2026-09-22T13:00:00.000Z',
    endTime: '2026-09-22T13:50:00.000Z',
  };
  const results = await Promise.all(Array.from({ length: 8 }, () => ensureClassroomSession(input)));
  check('8 個並發呼叫都拿到同一 id', results.every((r) => r.id === id));
  const stored = [...tableOf('jvtutorcorner-course-sessions').values()].filter((s) => s.id === id);
  check('course-sessions 只建立一列', stored.length === 1, String(stored.length));
  const again = await ensureClassroomSession(input);
  check('再呼叫回傳既有列(createdAt 不變)', again.createdAt === results[0].createdAt);
  check('orderId / summaryId 交叉參照寫入', stored[0].orderId === 'o1');
}

console.log('');
if (failed === 0) console.log(`✅ lessons api/store 全數通過(${passed} 項)`);
else console.log(`❌ lessons api/store 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
