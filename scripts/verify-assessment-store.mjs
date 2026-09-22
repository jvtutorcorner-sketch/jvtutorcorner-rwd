#!/usr/bin/env node
/**
 * Assessment store — offline test (in-memory DDB, no AWS).
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-assessment-store.mjs
 */
process.env.AWS_ACCESS_KEY_ID = 'verify-assessment-store-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-assessment-store-fake';
process.env.AWS_REGION = 'ap-northeast-1';

const { ddbDocClient } = await import('../lib/dynamo.ts');

const tables = {};
const tableOf = (tn) => (tables[tn] ??= new Map());
function keyOf(tn, obj) {
  if (tn.includes('assessment-submissions')) return `${obj.assessmentId}||${obj.studentId}`;
  return `${obj.sessionId}||${obj.assessmentId}`;
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
    const wantSession = /sessionId = :s/.test(inp.KeyConditionExpression || '');
    const items = [...tableOf(tn).values()].filter((it) => (wantSession ? it.sessionId === v[':s'] : it.assessmentId === v[':a']));
    return { Items: items };
  }
  return { Item: undefined, Items: [] };
};

const store = await import('../lib/lessonAI/assessmentStore.ts');

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

const sid = 'lsn_a1';
const questions = [{ qid: 'q1', type: 'mcq', prompt: 'x', options: ['a', 'b'], answerIndex: 1, points: 10 }];

console.log('[1] create + get + list assessments');
const a = await store.createAssessment({ sessionId: sid, courseId: 'c1', teacherId: 't1', title: '測驗一', questions, status: 'dispatched' });
check('createAssessment 產生 assessmentId', !!a.assessmentId);
const got = await store.getAssessment(sid, a.assessmentId);
check('getAssessment 取回', got?.title === '測驗一' && got.status === 'dispatched');
const a2 = await store.createAssessment({ sessionId: sid, courseId: 'c1', teacherId: 't1', title: '測驗二', questions, status: 'dispatched' });
const list = await store.listAssessmentsBySession(sid);
check('listAssessmentsBySession 回 2 筆、依 createdAt 排序', list.length === 2, String(list.length));
check('不同 assessment 各自 id', a.assessmentId !== a2.assessmentId);

console.log('\n[2] submission put/get/list + idempotent overwrite');
await store.putSubmission({ assessmentId: a.assessmentId, studentId: 'stu1', sessionId: sid, courseId: 'c1', answers: { q1: 1 }, grades: [{ qid: 'q1', score: 10, max: 10 }], score: 10, maxScore: 10, status: 'graded', gradedAt: new Date().toISOString() });
let sub = await store.getSubmission(a.assessmentId, 'stu1');
check('getSubmission 取回、分數 10', sub?.score === 10);
// re-submit (overwrite) with a lower score
await store.putSubmission({ assessmentId: a.assessmentId, studentId: 'stu1', sessionId: sid, courseId: 'c1', answers: { q1: 0 }, grades: [{ qid: 'q1', score: 0, max: 10 }], score: 0, maxScore: 10, status: 'graded', gradedAt: new Date().toISOString() });
sub = await store.getSubmission(a.assessmentId, 'stu1');
check('重送覆寫同一列(分數變 0)', sub?.score === 0);
await store.putSubmission({ assessmentId: a.assessmentId, studentId: 'stu2', sessionId: sid, courseId: 'c1', answers: {}, grades: [], score: 0, maxScore: 10, status: 'graded', gradedAt: new Date().toISOString() });
const subs = await store.listSubmissions(a.assessmentId);
check('listSubmissions 回 2 位學生', subs.length === 2, String(subs.length));
check('另一份 assessment 無提交', (await store.listSubmissions(a2.assessmentId)).length === 0);

console.log('');
if (failed === 0) console.log(`✅ assessment store 全數通過(${passed} 項)`);
else console.log(`❌ assessment store 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
