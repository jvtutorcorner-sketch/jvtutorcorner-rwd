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

console.log('\n[6] 彙整:週報');
const agg = await import('../lib/analytics/aggregate.ts');
let seq = 0;
const ev = (type, ts, props = {}) => ({ type, ts, eventId: props.eventId ?? `e${++seq}`, pk: `EVT#${ts.slice(0, 10)}`, sk: `${type}#x`, appEnv: 'dev', ...props });
const OK = { status: 'ok' }, MEM = { status: 'memory' }, BAD = { status: 'unavailable', hint: 'P-1' };
{
  const days = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'];
  const ledger = [
    { feature: 'tutor', actualCostMusd: 100, createdAt: '2026-09-21T01:00:00Z' },
    { feature: 'tutor', actualCostMusd: 100, createdAt: '2026-09-22T01:00:00Z' },
    { feature: 'tutor', actualCostMusd: 100, createdAt: '2026-09-23T01:00:00Z' },
    { feature: 'tutor', actualCostMusd: 5000, createdAt: '2026-09-24T01:00:00Z' },
    { feature: 'chat-assistant', actualCostMusd: 40, createdAt: '2026-09-22T02:00:00Z' },
    { feature: 'tutor', actualCostMusd: 999, createdAt: '2026-09-25T01:00:00Z' }, // 期間外
  ];
  const events = [
    ev('ai_error', '2026-09-22T03:00:00Z', { feature: 'tutor', reason: 'provider' }),
    ev('chat_message', '2026-09-22T02:00:00Z', { userId: 'u1', channel: 'widget' }),
    ev('line_message', '2026-09-23T02:00:00Z', { msgType: 'text', uidHash: 'h' }),
  ];
  const w = agg.aggregateWeekly(days, ledger, events);
  check('tutor 4 天請求 = 4、成本 = 5300', w.featureTotals.find((f) => f.feature === 'tutor')?.requests === 4 && w.featureTotals.find((f) => f.feature === 'tutor')?.musd === 5300);
  check('期間外的 ledger 列不計', w.totals.musd === 5340, `${w.totals.musd}`);
  check('tutor 錯誤率 = 1/(4+1)', w.featureTotals.find((f) => f.feature === 'tutor')?.errorRate === 0.2);
  check('每日訊息量', w.daily['2026-09-22'].widgetMessages === 1 && w.daily['2026-09-23'].lineMessages === 1);
  check('異常:tutor 09-24 成本 > 3× 平均', w.anomalies.length === 1 && w.anomalies[0].day === '2026-09-24' && w.anomalies[0].feature === 'tutor');
}

console.log('\n[7] 彙整:對話、轉換視窗');
{
  const msgs = [
    ev('chat_message', '2026-09-10T01:00:00Z', { userId: 'a', channel: 'widget' }),
    ev('chat_message', '2026-09-10T05:00:00Z', { userId: 'a', channel: 'widget' }),
    ev('chat_message', '2026-09-11T01:00:00Z', { userId: 'a', channel: 'widget' }),
    ev('chat_message', '2026-09-10T02:00:00Z', { userId: 'b', channel: 'widget' }),
  ];
  const convs = agg.buildConversations(msgs);
  check('對話 = 使用者 × UTC 日 → 3 段', convs.length === 3);
  const handoffs = [
    ev('chat_handoff', '2026-09-11T04:59:00Z', { userId: 'a', department: 'CS' }), // a 09-10 的最後訊息 +24h 內;也在 09-11 對話內
    ev('chat_handoff', '2026-09-12T02:30:00Z', { userId: 'b', department: 'CS' }), // b 最後訊息 +24h 之後
  ];
  const sr = agg.selfResolve(convs, handoffs);
  check('自助解決:a 兩段都轉真人、b 超過 24h 算解決 → 1/3', sr.resolved === 1 && sr.total === 3, JSON.stringify(sr));

  const clicks = [ev('course_click', '2026-09-01T00:00:00Z', { userId: 'u', courseId: 'c1', src: 'recommendation' })];
  const buyIn = [ev('course_purchase', '2026-09-07T23:00:00Z', { userId: 'u', courseId: 'c1', orderId: 'o', paymentMethod: 'points' })];
  const buyOut = [ev('course_purchase', '2026-09-08T01:00:00Z', { userId: 'u', courseId: 'c1', orderId: 'o', paymentMethod: 'points' })];
  const buyOther = [ev('course_purchase', '2026-09-02T00:00:00Z', { userId: 'u', courseId: 'c2', orderId: 'o', paymentMethod: 'points' })];
  check('6 天 23 小時內購買同課程 → 算轉換', agg.clickToPurchase(clicks, buyIn).converted === 1);
  check('7 天 1 小時 → 不算', agg.clickToPurchase(clicks, buyOut).converted === 0);
  check('買了別門課 → 不算', agg.clickToPurchase(clicks, buyOther).converted === 0);
  const dup = agg.dedupeEvents([ev('course_purchase', '2026-09-02T00:00:00Z', { eventId: 'o9', userId: 'u', courseId: 'c', orderId: 'o9', paymentMethod: 'x' }), ev('course_purchase', '2026-09-03T00:00:00Z', { eventId: 'o9', userId: 'u', courseId: 'c', orderId: 'o9', paymentMethod: 'x' })]);
  check('跨日重複購買事件去重', dup.length === 1);
  check('z 檢定:空組 → null、相同比例 → 0', agg.zTwoProp(1, 0, 1, 10) === null && Math.abs(agg.zTwoProp(10, 100, 20, 200)) < 1e-9);
  check('z 檢定已知值(50/100 vs 30/100 ≈ 2.887)', Math.abs(agg.zTwoProp(50, 100, 30, 100) - 2.8868) < 0.001, String(agg.zTwoProp(50, 100, 30, 100)));
}

console.log('\n[8] 彙整:月報 KPI 與狀態');
{
  const now = new Date('2026-10-20T00:00:00Z'); // 202609 的 +7 日視窗已結束
  const ledger = [
    { feature: 'chat-assistant', actualCostMusd: 300, createdAt: '2026-09-05T00:00:00Z', userId: 'a' },
    { feature: 'line-text', actualCostMusd: 200, createdAt: '2026-09-05T00:00:00Z' },
    { feature: 'line-text', actualCostMusd: 100, createdAt: '2026-09-06T00:00:00Z' },
    { feature: 'copilot', actualCostMusd: 1000, createdAt: '2026-09-07T00:00:00Z', sessionId: 's1' },
    { feature: 'tutor', actualCostMusd: 500, createdAt: '2026-09-07T00:00:00Z', sessionId: 's1' },
    { feature: 'assessment', actualCostMusd: 300, createdAt: '2026-09-08T00:00:00Z', sessionId: 's2' },
  ];
  const events = [
    ev('chat_message', '2026-09-05T00:00:00Z', { userId: 'a', channel: 'widget' }),
    ev('chat_message', '2026-09-05T00:10:00Z', { userId: 'a', channel: 'widget' }),
    ev('chat_message', '2026-09-06T00:00:00Z', { userId: 'b', channel: 'widget' }),
    ev('course_purchase', '2026-09-09T00:00:00Z', { userId: 'a', courseId: 'c1', orderId: 'o1', paymentMethod: 'points' }),
    ev('assessment_generated', '2026-09-08T00:00:00Z', { sessionId: 's2', requestId: 'r1', questionCount: 5 }),
    ev('assessment_generated', '2026-09-08T01:00:00Z', { sessionId: 's2', requestId: 'r2', questionCount: 5 }),
    ev('assessment_dispatched', '2026-09-08T02:00:00Z', { sessionId: 's2', assessmentId: 'x', generateRequestId: 'r2', questionCount: 5 }),
    ev('rec_impression', '2026-09-10T00:00:00Z', { userId: 'a', courseIds: ['c1', 'c2', 'c3'], arm: 'treatment' }),
    ev('course_click', '2026-09-10T00:01:00Z', { userId: 'a', courseId: 'c2', src: 'recommendation' }),
    ev('rec_served', '2026-09-10T00:00:00Z', { userId: 'a', arm: 'treatment', personalized: true, interactionCount: 3, n: 4, popNonDefault: 1 }),
    ev('rec_served', '2026-09-10T00:00:00Z', { arm: 'guest', personalized: false, interactionCount: 0, n: 4, popNonDefault: 1 }),
  ];
  const sessions = [{ id: 's1', teacherId: 't1' }, { id: 's2', teacherId: 't1' }, { id: 's3', teacherId: 't2' }];
  const manual = [{ metricKey: 'chat_error_sample', period: '202609', value: 2, sampleSize: 50, updatedBy: 'x', updatedAt: '' }];
  const m = agg.buildMonthly({ month: '202609', now, ledger: { src: OK, rows: ledger }, events: { src: OK, rows: events }, sessions: { src: OK, rows: sessions }, manual: { src: OK, rows: manual } });
  const k = (id) => m.kpis.find((x) => x.id === id);
  check('小幫手每則成本 = 300/3 = 100µ$', k('chat_cost_per_msg_widget').value === 100);
  check('LINE 每則成本 = 300/2 = 150µ$', k('chat_cost_per_msg_line').value === 150);
  check('對話類月費 = 600µ$', k('chat_monthly_cost').value === 600);
  check('對話 → 7 日購課 = a 買了 / 2 位 = 0.5,樣本不足', k('chat_to_purchase_7d').value === 0.5 && k('chat_to_purchase_7d').lowSample === true);
  check('AI 使用率 = 2/3 課堂', Math.abs(k('teacher_feature_usage').value - 2 / 3) < 1e-9);
  check('每堂 AI 成本 = 1800/2 = 900µ$', k('teacher_cost_per_lesson').value === 900 && m.lessonCost.medianMusd === 300 && m.lessonCost.p90Musd === 1500);
  check('題目採用率 = 1/2', k('assessment_adoption').value === 0.5);
  check('老師數 2、每人 1.5 堂', k('active_teachers').value === 2 && k('sessions_per_teacher').value === 1.5);
  check('推薦曝光 3 卡、CTR 1/3', k('rec_impressions').value === 3 && Math.abs(k('rec_ctr').value - 1 / 3) < 1e-9);
  check('個人化覆蓋率 1/2、熱門度有效率 2/8', k('personalization_coverage').value === 0.5 && k('popularity_signal_validity').value === 0.25);
  check('目錄沒有點擊 → no_denominator(不是 0%)', k('catalog_to_purchase_7d').status === 'no_denominator' && k('catalog_to_purchase_7d').value === null);
  check('差異缺一方 → no_denominator', k('rec_vs_catalog_diff').status === 'no_denominator');
  check('人工錯誤率 = 2/50', k('chat_error_rate').value === 0.04 && k('chat_error_rate').status === 'ok');
  check('人工工時未填 → manual_missing', k('cs_hours').status === 'manual_missing');
  check('摘要開啟率 → 待補(not_instrumented)', k('summary_open_rate').status === 'not_instrumented');
  check('題目修改率 → 不適用', k('assessment_edit_rate').status === 'not_applicable');
  check('月報不含季度 KPI', !k('repurchase_in_quarter'));

  const m2 = agg.buildMonthly({ month: '202609', now: new Date('2026-10-03T00:00:00Z'), ledger: { src: BAD, rows: [] }, events: { src: MEM, rows: events }, sessions: { src: OK, rows: sessions }, manual: { src: OK, rows: [] } });
  const k2 = (id) => m2.kpis.find((x) => x.id === id);
  check('ledger 不可用 → 成本 KPI unavailable、value null', k2('chat_monthly_cost').status === 'unavailable' && k2('chat_monthly_cost').value === null);
  check('混用 ledger(不可用)+ 事件 → unavailable', k2('chat_cost_per_msg_widget').status === 'unavailable');
  check('記憶體模式事件 → memory', k2('widget_msg_volume').status === 'memory');
  const m3 = agg.buildMonthly({ month: '202609', now: new Date('2026-10-03T00:00:00Z'), ledger: { src: OK, rows: ledger }, events: { src: OK, rows: events }, sessions: { src: OK, rows: sessions }, manual: { src: OK, rows: [] } });
  check('月底後 7 日內 → 轉換類 KPI partial', m3.kpis.find((x) => x.id === 'chat_to_purchase_7d').status === 'partial');
}

console.log('\n[9] 彙整:季報 holdout 比較');
{
  const events = [];
  const imp = (u, arm, ts) => events.push(ev('rec_impression', ts, { userId: u, courseIds: ['c1', 'c2'], arm }));
  imp('t1', 'treatment', '2026-10-02T00:00:00Z');
  imp('t2', 'treatment', '2026-10-02T00:00:00Z');
  imp('h1', 'holdout', '2026-10-02T00:00:00Z');
  imp('t1', 'holdout', '2026-10-05T00:00:00Z'); // 之後比例變更:仍以第一次曝光的組別為準
  events.push(ev('course_click', '2026-10-02T01:00:00Z', { userId: 't1', courseId: 'c1', src: 'recommendation' }));
  events.push(ev('course_purchase', '2026-10-03T00:00:00Z', { userId: 't1', courseId: 'c1', orderId: 'o1', paymentMethod: 'points' }));
  events.push(ev('course_purchase', '2026-11-03T00:00:00Z', { userId: 't1', courseId: 'c9', orderId: 'o2', paymentMethod: 'points' }));
  const q = agg.buildQuarterly({ quarter: '2026Q4', from: '2026-10-01', to: '2026-12-31', now: new Date('2027-01-10T00:00:00Z'), months: [], events: { src: OK, rows: events } });
  const t = q.arms.find((a) => a.arm === 'treatment'), h = q.arms.find((a) => a.arm === 'holdout');
  check('組別以第一次曝光為準:treatment 2 人、holdout 1 人', t.users === 2 && h.users === 1);
  check('treatment 卡片 6(含 t1 第二次曝光)、點擊 1', t.cards === 6 && t.recClicks === 1, `${t.cards}/${t.recClicks}`);
  check('treatment 推薦→購買 1/1、7 日內任一購課 1/2', t.recPurchase.rate === 1 && t.anyPurchase.rate === 0.5);
  check('樣本 < 300 → 警示只看趨勢', q.warnings.some((w) => w.includes('只看趨勢')));
  check('沒有個人化請求 → 警示兩組會相同', q.warnings.some((w) => w.includes('個人化覆蓋率接近 0')));
  check('季內回購率 = t1 買 2 次 / 1 位', q.repurchase.value === 1 && q.repurchase.status === 'ok');
  const qBad = agg.buildQuarterly({ quarter: '2026Q4', from: '2026-10-01', to: '2026-12-31', now: new Date(), months: [], events: { src: BAD, rows: [] } });
  check('事件不可用 → 無分組、回購 unavailable', qBad.arms.length === 0 && qBad.repurchase.status === 'unavailable');
}

console.log('\n[10] CSV');
{
  const csv = await import('../lib/analytics/csv.ts');
  const out = csv.kpiRowsCsv([{ id: 'x', section: 'chat', name: '名稱 "含引號"', tier: 'G', unit: 'pct', value: 0.5, status: 'ok', formula: 'a, b' }], 32, '202609');
  check('CSV 以 BOM 開頭', out.charCodeAt(0) === 0xfeff);
  check('CSV 引號跳脫、逗號包在引號內', out.includes('"名稱 ""含引號"""') && out.includes('"a, b"') && out.includes('"50.0%"'));
}

console.log('');
if (failed === 0) console.log(`✅ analytics 全數通過(${passed} 項)`);
else console.log(`❌ analytics 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
