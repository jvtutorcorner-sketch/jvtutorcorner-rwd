#!/usr/bin/env node
/**
 * AI 效益分析回歸測試(offline,不連 AWS)
 * =====================================
 *   [1] holdout 分組:穩定、比例、pct=0 關閉
 *   [2] UTC 期間:ISO 週、月、季、日列表
 *   [3] eventStore 記憶體模式:寫入、去重、依日查詢、人工指標
 *   [4] eventStore DynamoDB 模式(記憶體假 DynamoDB):條件式 Put 去重、分頁、錯誤不外拋
 *
 * 用法: node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-analytics.mjs
 */

process.env.AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';
process.env.DYNAMODB_TABLE_ANALYTICS_EVENTS = 'verify-analytics-events';
delete process.env.ANALYTICS_REC_HOLDOUT_PCT;

let failed = 0, passed = 0;
const check = (l, c, d = '') => { if (c) { passed++; console.log(`  ✅ ${l}`); } else { failed++; console.log(`  ❌ ${l}${d ? `  (${d})` : ''}`); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Fake DynamoDB (Put with attribute_not_exists, paginated Query) ────────────
const fakeRows = new Map(); // `${pk}|${sk}` → item
let failNext = null;
const QUERY_PAGE = 2;
async function fakeSend(cmd) {
  const kind = cmd?.constructor?.name, input = cmd?.input ?? {};
  if (failNext) { const e = failNext; failNext = null; throw e; }
  if (kind === 'PutCommand') {
    const k = `${input.Item.pk}|${input.Item.sk}`;
    if (input.ConditionExpression === 'attribute_not_exists(sk)' && fakeRows.has(k)) {
      const e = new Error('The conditional request failed'); e.name = 'ConditionalCheckFailedException'; throw e;
    }
    fakeRows.set(k, JSON.parse(JSON.stringify(input.Item)));
    return {};
  }
  if (kind === 'QueryCommand') {
    const pk = input.ExpressionAttributeValues[':pk'];
    const all = [...fakeRows.values()].filter((r) => r.pk === pk).sort((a, b) => (a.sk < b.sk ? -1 : 1));
    const start = input.ExclusiveStartKey ? all.findIndex((r) => r.sk === input.ExclusiveStartKey.sk) + 1 : 0;
    const page = all.slice(start, start + QUERY_PAGE);
    const more = start + QUERY_PAGE < all.length;
    return { Items: page, LastEvaluatedKey: more ? { pk, sk: page[page.length - 1].sk } : undefined };
  }
  throw new Error(`unsupported ${kind}`);
}

const { ddbDocClient } = await import('../lib/dynamo.ts');
ddbDocClient.send = fakeSend;
const { assignArm, holdoutPct, fnv1a32 } = await import('../lib/analytics/holdout.ts');
const periods = await import('../lib/analytics/periods.ts');
const store = await import('../lib/analytics/eventStore.ts');
const { normalizeClickSrc } = await import('../lib/analytics/events.ts');

console.log('[1] holdout 分組');
{
  const ids = Array.from({ length: 10000 }, (_, i) => `user-${i}`);
  const holdout = ids.filter((id) => assignArm(id, 10) === 'holdout').length;
  check('1 萬個 id 約 10% ± 1% 分到 holdout', holdout >= 900 && holdout <= 1100, `${holdout}`);
  check('同一 id 永遠同組', ids.slice(0, 200).every((id) => assignArm(id, 10) === assignArm(id, 10)));
  check('pct=0 → 全部 treatment', ids.every((id) => assignArm(id, 0) === 'treatment'));
  check('空 userId → treatment', assignArm('', 10) === 'treatment');
  check('預設比例 = 10', holdoutPct() === 10);
  process.env.ANALYTICS_REC_HOLDOUT_PCT = '99';
  check('比例上限 50', holdoutPct() === 50);
  process.env.ANALYTICS_REC_HOLDOUT_PCT = 'abc';
  check('非數字 → 預設 10', holdoutPct() === 10);
  delete process.env.ANALYTICS_REC_HOLDOUT_PCT;
  check('FNV-1a 已知值("a" = 0xe40c292c)', fnv1a32('a') === 0xe40c292c, fnv1a32('a').toString(16));
}

console.log('\n[2] UTC 期間');
{
  check('ISO 週:2026-01-01(週四)= 2026-W01', periods.isoWeekLabel('2026-01-01') === '2026-W01', periods.isoWeekLabel('2026-01-01'));
  check('ISO 週:2021-01-03(週日)= 2020-W53', periods.isoWeekLabel('2021-01-03') === '2020-W53', periods.isoWeekLabel('2021-01-03'));
  check('ISO 週:2026-09-28(週一)= 2026-W40', periods.isoWeekLabel('2026-09-28') === '2026-W40', periods.isoWeekLabel('2026-09-28'));
  check('月範圍 202602 → 02-01~02-28', eq(periods.monthRange('202602'), { from: '2026-02-01', to: '2026-02-28' }));
  check('月範圍 202402(閏年)→ 02-29', periods.monthRange('202402').to === '2024-02-29');
  const q = periods.quarterRange('2026Q4');
  check('季 2026Q4 = 10/01~12/31、三個月', q.from === '2026-10-01' && q.to === '2026-12-31' && eq(q.months, ['202610', '202611', '202612']));
  check('日列表含頭尾', eq(periods.daysBetween('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']));
  check('from > to → 空', periods.daysBetween('2026-10-02', '2026-10-01').length === 0);
  check('近 7 個完整日不含今天', eq(periods.lastFullDays(7, new Date('2026-09-27T10:00:00Z')), { from: '2026-09-20', to: '2026-09-26' }));
  check('isDayKey 擋掉 2026-02-30', !periods.isDayKey('2026-02-30') && periods.isDayKey('2026-02-28'));
  check('isMonthKey / isQuarterKey', periods.isMonthKey('202612') && !periods.isMonthKey('202613') && periods.isQuarterKey('2026Q1') && !periods.isQuarterKey('2026Q5'));
  check('currentQuarterKey(2026-11-05) = 2026Q4', periods.currentQuarterKey(new Date('2026-11-05T00:00:00Z')) === '2026Q4');
}

console.log('\n[3] eventStore 記憶體模式');
{
  process.env.ANALYTICS_STORE = 'memory';
  store._resetLocalAnalytics();
  const now = new Date('2026-09-27T03:00:00Z');
  const r1 = await store.recordEvent({ type: 'course_purchase', userId: 'u1', orderId: 'o1', courseId: 'c1', paymentMethod: 'points' }, { dedupeKey: 'o1', now });
  const r2 = await store.recordEvent({ type: 'course_purchase', userId: 'u1', orderId: 'o1', courseId: 'c1', paymentMethod: 'points' }, { dedupeKey: 'o1', now });
  await store.recordEvent({ type: 'chat_message', userId: 'u1', channel: 'widget' }, { now });
  await store.recordEvent({ type: 'chat_message', userId: 'u1', channel: 'widget' }, { now });
  check('第一次寫入 ok', r1.ok && !r1.duplicate);
  check('同 dedupeKey 第二次 → duplicate', r2.ok && r2.duplicate === true);
  const day = await store.queryEventsForDay('2026-09-27');
  check('依日查詢:1 購買 + 2 對話', day.filter((e) => e.type === 'course_purchase').length === 1 && day.filter((e) => e.type === 'chat_message').length === 2, `${day.length}`);
  check('事件帶 pk/sk/appEnv', day.every((e) => e.pk === 'EVT#2026-09-27' && e.sk.startsWith(`${e.type}#`) && e.appEnv === 'dev'));
  check('其他日期為空', (await store.queryEventsForDay('2026-09-28')).length === 0);
  await store.putManualMetric({ metricKey: 'cs_hours', period: '2026-W39', value: 12, updatedBy: 'a', updatedAt: now.toISOString() });
  await store.putManualMetric({ metricKey: 'cs_hours', period: '2026-W39', value: 10, updatedBy: 'a', updatedAt: now.toISOString() });
  const m = await store.listManualMetric('cs_hours');
  check('人工指標同期間覆寫', m.length === 1 && m[0].value === 10, JSON.stringify(m));
  check('click src 白名單', normalizeClickSrc('catalog') === 'catalog' && normalizeClickSrc('<script>') === 'other');
  delete process.env.ANALYTICS_STORE;
}

console.log('\n[4] eventStore DynamoDB 模式(假 DynamoDB)');
{
  process.env.AWS_ACCESS_KEY_ID = 'verify-analytics-fake';
  process.env.AWS_SECRET_ACCESS_KEY = 'verify-analytics-fake';
  check('有憑證 → dynamo 模式', store.storeMode() === 'dynamo');
  const now = new Date('2026-09-26T05:00:00Z');
  const a = await store.recordEvent({ type: 'course_purchase', userId: 'u2', orderId: 'o2', courseId: 'c2', paymentMethod: 'stripe' }, { dedupeKey: 'o2', now });
  const b = await store.recordEvent({ type: 'course_purchase', userId: 'u2', orderId: 'o2', courseId: 'c2', paymentMethod: 'stripe' }, { dedupeKey: 'o2', now });
  check('條件式 Put:第二次為 duplicate', a.ok && !a.duplicate && b.ok && b.duplicate === true);
  for (let i = 0; i < 5; i++) await store.recordEvent({ type: 'chat_message', userId: `u${i}`, channel: 'widget' }, { now });
  const rows = await store.queryEventsForDay('2026-09-26');
  check('分頁查詢拿到全部 6 列(每頁 2 列)', rows.length === 6, `${rows.length}`);
  failNext = Object.assign(new Error('boom'), { name: 'InternalServerError' });
  const c = await store.recordEvent({ type: 'chat_message', userId: 'x', channel: 'widget' }, { now });
  check('DynamoDB 錯誤 → 回 ok:false、不 throw', c.ok === false && c.error === 'boom');
  failNext = Object.assign(new Error('Requested resource not found'), { name: 'ResourceNotFoundException' });
  let threw = null;
  try { await store.queryEventsForDay('2026-09-26'); } catch (e) { threw = e; }
  check('查詢錯誤會 throw(由報表標示資料源不可用)', threw?.name === 'ResourceNotFoundException');
  process.env.ANALYTICS_STORE = 'memory';
  check('ANALYTICS_STORE=memory 覆寫憑證判斷', store.storeMode() === 'memory');
  delete process.env.ANALYTICS_STORE;
}

console.log('\n[5] 推薦 holdout 排序');
{
  const { rankForArm, countPopularitySignals } = await import('../lib/recommendationCandidates.ts');
  const { generateRecommendations } = await import('../lib/recommendationEngine.ts');
  const cands = [
    { id: 'a', title: 'A', category: '英文', tags: ['english'], createdAt: '2026-09-01', popularityScore: 1 },
    { id: 'b', title: 'B', category: '數學', tags: ['math'], createdAt: '2026-09-02', popularityScore: 0.5 },
    { id: 'c', title: 'C', category: '日文', tags: ['japanese'], createdAt: '2026-09-03', popularityScore: 0.2 },
  ];
  const inter = [{ tag: 'japanese', weight: 5, createdAt: new Date().toISOString(), source: 'click' }];
  const hold = rankForArm('holdout', inter, cands);
  const cold = generateRecommendations([], cands);
  check('holdout = cold-start 熱門排序(忽略互動)', eq(hold.courses.map((c) => c.id), cold.courses.map((c) => c.id)) && hold.personalized === false);
  const treat = rankForArm('treatment', inter, cands);
  check('treatment 有互動 → personalized', treat.personalized === true && treat.isNewUser === false);
  check('guest 沿用傳入的 seeds', rankForArm('guest', inter, cands).personalized === true);
  check('熱門度訊號數:排除 0.5 與缺值', countPopularitySignals([...cands, { id: 'd', title: 'D', category: 'x', tags: [] }]) === 2);
}

console.log('');
if (failed === 0) console.log(`✅ analytics 全數通過(${passed} 項)`);
else console.log(`❌ analytics 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
