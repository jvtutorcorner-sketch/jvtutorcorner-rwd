#!/usr/bin/env node
/**
 * Media GPU job lifecycle — offline test (in-memory points + fake DDB for gpu-jobs).
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-media-job.mjs
 *
 * NO AWS keys → points/ledger use the in-memory path; gpu-jobs go through an
 * injected fake DynamoDB. Proves reserve/settle/refund correctness, idempotency,
 * settle-vs-refund race, sweeper, and ledger↔balance reconciliation.
 */
process.env.AWS_REGION = 'ap-northeast-1';
process.env.PLATFORM_REVENUE_ACCOUNT_ID = 'platform';
delete process.env.AWS_ACCESS_KEY_ID;
delete process.env.CI_AWS_ACCESS_KEY_ID;
process.env.NODE_ENV = 'test';

const { ddbDocClient } = await import('../lib/dynamo.ts');

// ── fake DynamoDB for gpu-jobs only ─────────────────────────────────────────────
const table = new Map();
const clone = (x) => JSON.parse(JSON.stringify(x));
ddbDocClient.send = async (cmd) => {
  const n = cmd?.constructor?.name;
  const inp = cmd?.input || {};
  if (n === 'PutCommand') {
    const k = inp.Item.jobId;
    if (/attribute_not_exists/.test(inp.ConditionExpression || '') && table.has(k)) {
      const e = new Error('exists');
      e.name = 'ConditionalCheckFailedException';
      throw e;
    }
    table.set(k, clone(inp.Item));
    return {};
  }
  if (n === 'GetCommand') return { Item: table.get(inp.Key.jobId) };
  if (n === 'QueryCommand') {
    const v = inp.ExpressionAttributeValues || {};
    let items = [...table.values()];
    if (':u' in v) items = items.filter((it) => it.userId === v[':u']);
    if (':st' in v) items = items.filter((it) => it.status === v[':st']);
    if (':now' in v) items = items.filter((it) => it.expiresAt < v[':now']);
    if (inp.ScanIndexForward === false) items.reverse();
    if (inp.Limit) items = items.slice(0, inp.Limit);
    return { Items: items };
  }
  if (n === 'UpdateCommand') {
    const k = inp.Key.jobId;
    const item = table.get(k);
    const names = inp.ExpressionAttributeNames || {};
    const values = inp.ExpressionAttributeValues || {};
    // condition: attribute_exists(jobId) AND (status in from)
    if (/attribute_exists/.test(inp.ConditionExpression || '') && !item) {
      const e = new Error('missing');
      e.name = 'ConditionalCheckFailedException';
      throw e;
    }
    const froms = Object.keys(values).filter((kk) => kk.startsWith(':f')).map((kk) => values[kk]);
    if (froms.length && !froms.includes(item.status)) {
      const e = new Error('bad-state');
      e.name = 'ConditionalCheckFailedException';
      throw e;
    }
    // apply SET assignments
    const m = /^\s*SET\s+(.*)$/is.exec(inp.UpdateExpression || '');
    if (m) {
      for (const a of m[1].split(',')) {
        const [lhsRaw, rhsRaw] = a.split('=').map((s) => s.trim());
        if (!rhsRaw) continue;
        const lhs = names[lhsRaw] || lhsRaw;
        item[lhs] = values[rhsRaw];
      }
    }
    table.set(k, item);
    return { Attributes: clone(item) };
  }
  return { Item: undefined, Items: [] };
};

const points = await import('../lib/pointsStorage.ts');
const { LOCAL_LEDGER } = points;
const mj = await import('../lib/media/mediaJob.ts');

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
const seed = async (userId, amount) =>
  points.applyPointsDelta({ userId, amount, type: 'purchase', refType: 'test', idempotencyKey: `seed:${userId}` });

const STU = 'stu1';
await seed(STU, 100);

console.log('[1] submit reserves points, creates QUEUED job');
const r1 = await mj.submitJob({ userId: STU, workflow: 'image' }); // price 2
check('submit ok', r1.ok === true);
check('餘額扣 2 → 98', (await points.getUserPoints(STU)) === 98, String(await points.getUserPoints(STU)));
check('job QUEUED、reservedCredits=2', r1.ok && r1.job.status === 'QUEUED' && r1.job.reservedCredits === 2);

console.log('\n[2] settle success: platform earns, student stays debited, idempotent');
const s1 = await mj.settleJobSuccess(r1.job.jobId, { actualCostMusd: 1000, gpuSeconds: 3, outputKey: 'k' });
check('settle ok、狀態 SUCCEEDED', s1.ok && s1.job?.status === 'SUCCEEDED');
check('學生維持 98(reserve 即扣款)', (await points.getUserPoints(STU)) === 98);
check('平台入帳 +2', (await points.getUserPoints('platform')) === 2, String(await points.getUserPoints('platform')));
const s1b = await mj.settleJobSuccess(r1.job.jobId, { actualCostMusd: 1000 });
check('重複 settle 冪等(平台仍 2、學生仍 98)', s1b.ok && (await points.getUserPoints('platform')) === 2 && (await points.getUserPoints(STU)) === 98);

console.log('\n[3] refund returns points, idempotent');
const r2 = await mj.submitJob({ userId: STU, workflow: 'image' }); // 98 → 96
check('reserve 後 96', (await points.getUserPoints(STU)) === 96);
const f2 = await mj.refundJob(r2.job.jobId, { reason: 'boom' });
check('refund ok、狀態 FAILED、退回 98', f2.ok && f2.job?.status === 'FAILED' && (await points.getUserPoints(STU)) === 98);
const f2b = await mj.refundJob(r2.job.jobId, { reason: 'boom again' });
check('重複 refund 冪等(仍 98)', f2b.ok && (await points.getUserPoints(STU)) === 98);

console.log('\n[4] insufficient balance → no job, no deduct');
await seed('poor', 1);
const bal0 = await points.getUserPoints('poor');
const r3 = await mj.submitJob({ userId: 'poor', workflow: 'image' }); // needs 2, has 1
check('submit 回 insufficient', r3.ok === false && r3.error === 'insufficient');
check('餘額不變', (await points.getUserPoints('poor')) === bal0);

console.log('\n[5] settle vs refund race → exactly one wins');
const r4 = await mj.submitJob({ userId: STU, workflow: 'image' }); // 98 → 96
const before = await points.getUserPoints(STU);
const [sr, rr] = await Promise.all([mj.settleJobSuccess(r4.job.jobId), mj.refundJob(r4.job.jobId)]);
const won = [sr.ok && sr.job?.status === 'SUCCEEDED', rr.ok && rr.job?.status === 'FAILED'].filter(Boolean);
const finalJob = await mj.settleJobSuccess(r4.job.jobId); // no-op read of terminal
check('恰一方成為終態(settle 或 refund)', (finalJob.job?.status === 'SUCCEEDED') !== (finalJob.job?.status === 'FAILED'));
const after = await points.getUserPoints(STU);
check('不會雙重退款(餘額 = before 或 before+2,只一種)', after === before || after === before + 2, `${before}->${after}`);
check('settle 先手勝出(此實作確定性)', finalJob.job?.status === 'SUCCEEDED' && after === before, finalJob.job?.status);

console.log('\n[6] sweeper refunds an expired reservation');
const r5 = await mj.submitJob({ userId: STU, workflow: 'image' });
const balBeforeSweep = await points.getUserPoints(STU);
// force the reservation past its deadline
const stored = table.get(r5.job.jobId);
stored.expiresAt = new Date(Date.now() - 60_000).toISOString();
const swept = await mj.sweepExpired(new Date().toISOString());
check('sweep 掃到 1 筆', swept.swept === 1, String(swept.swept));
check('過期 job → EXPIRED', (await mj.settleJobSuccess(r5.job.jobId)).job?.status === 'EXPIRED');
check('過期退回點數', (await points.getUserPoints(STU)) === balBeforeSweep + 2);

console.log('\n[7] ledger reconciles with balance');
const sumStu = LOCAL_LEDGER.filter((r) => r.userId === STU).reduce((a, r) => a + r.amount, 0);
check('LOCAL_LEDGER 加總 = 學生餘額', sumStu === (await points.getUserPoints(STU)), `${sumStu} vs ${await points.getUserPoints(STU)}`);

console.log('');
if (failed === 0) console.log(`✅ media job 全數通過(${passed} 項)`);
else console.log(`❌ media job 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
