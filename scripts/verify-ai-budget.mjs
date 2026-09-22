#!/usr/bin/env node
/**
 * AI budget enforcement — offline test (fake DDB; no AWS/paid API).
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-ai-budget.mjs
 *
 * Covers the pure verdict, store-backed checkTenantBudget (tenant + global), the
 * gateway runModel integration (denies over-budget before calling the provider),
 * and CSV escaping.
 */
process.env.AWS_ACCESS_KEY_ID = 'verify-budget-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-budget-fake';
process.env.AWS_REGION = 'ap-northeast-1';

const { ddbDocClient } = await import('../lib/dynamo.ts');

const budgets = new Map(); // scopeKey -> BudgetConfig
const rollups = new Map(); // scopeKey -> rollup
let transactWrites = 0;
ddbDocClient.send = async (cmd) => {
  const n = cmd?.constructor?.name;
  const inp = cmd?.input || {};
  const tn = inp.TableName || '';
  if (n === 'GetCommand') {
    if (tn.includes('ai-budgets')) return { Item: budgets.get(inp.Key.scopeKey) };
    if (tn.includes('cost-rollups')) return { Item: rollups.get(inp.Key.scopeKey) };
    return { Item: undefined };
  }
  if (n === 'TransactWriteCommand') {
    transactWrites++;
    return {};
  }
  return { Item: undefined, Items: [] };
};

const { budgetVerdict, checkTenantBudget, currentYyyymm } = await import('../lib/ai/budget.ts');
const { _clearBudgetCache } = await import('../lib/ai/budgetStore.ts');
const { setAdapters, _resetBreakers, runModel } = await import('../lib/ai/gateway/gateway.ts');
const { resolvePolicy } = await import('../lib/ai/gateway/router.ts');
const { toCsv } = await import('../lib/enterprise/csv.ts');

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
const MONTH = currentYyyymm();

console.log('[1] pure budgetVerdict');
check('無 cap → 允許', budgetVerdict({ spentMusd: 999999, estMusd: 100 }).allowed === true);
check('未超額 → 允許、非 over', (() => { const v = budgetVerdict({ spentMusd: 100, capMusd: 1000, estMusd: 50 }); return v.allowed && !v.over && v.remainingMusd === 900; })());
check('超額 + hardStop → 拒絕 budget_exceeded', (() => { const v = budgetVerdict({ spentMusd: 900, capMusd: 1000, estMusd: 200, hardStop: true }); return !v.allowed && v.over && v.reason === 'budget_exceeded'; })());
check('超額 + soft → 允許但 over 旗標', (() => { const v = budgetVerdict({ spentMusd: 900, capMusd: 1000, estMusd: 200, hardStop: false }); return v.allowed && v.over; })());

console.log('\n[2] checkTenantBudget (tenant + global)');
const reset = () => { budgets.clear(); rollups.clear(); _clearBudgetCache(); };

reset();
check('無設定預算 → 允許', (await checkTenantBudget('o1', 100)).allowed === true);

reset();
budgets.set('TENANT#o1', { scopeKey: 'TENANT#o1', monthlyCapMusd: 1000, hardStop: true });
rollups.set(`TENANT#o1#${MONTH}`, { ai_musd: 900, total_musd: 900 });
check('租戶超額 hardStop → 拒絕', (await checkTenantBudget('o1', 200)).allowed === false);
reset();
budgets.set('TENANT#o1', { scopeKey: 'TENANT#o1', monthlyCapMusd: 1000, hardStop: true });
rollups.set(`TENANT#o1#${MONTH}`, { ai_musd: 900 });
check('租戶未超額 → 允許', (await checkTenantBudget('o1', 50)).allowed === true);

reset();
budgets.set('TENANT#o1', { scopeKey: 'TENANT#o1', monthlyCapMusd: 100000, hardStop: true });
budgets.set('GLOBAL', { scopeKey: 'GLOBAL', monthlyCapMusd: 1000, hardStop: true });
rollups.set(`GLOBAL#${MONTH}`, { ai_musd: 1500 });
check('全域超額 → 拒絕(即使租戶未超)', (await checkTenantBudget('o1', 10)).allowed === false);

reset();
budgets.set('TENANT#o1', { scopeKey: 'TENANT#o1', monthlyCapMusd: 1000, hardStop: false });
rollups.set(`TENANT#o1#${MONTH}`, { ai_musd: 5000 });
check('soft 超額 → 仍允許', (await checkTenantBudget('o1', 100)).allowed === true);

console.log('\n[3] gateway runModel enforces tenant budget before calling provider');
{
  reset();
  _resetBreakers();
  let adapterCalls = 0;
  setAdapters({
    GEMINI: async (_r, opts) => {
      adapterCalls++;
      return { text: 'ok', usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 0 }, model: opts.model, provider: 'GEMINI' };
    },
  });
  budgets.set('TENANT#o1', { scopeKey: 'TENANT#o1', monthlyCapMusd: 1, hardStop: true }); // 1 µ$ cap → any call over
  rollups.set(`TENANT#o1#${MONTH}`, { ai_musd: 1 });
  transactWrites = 0;
  const denied = await runModel(resolvePolicy('tutor'), { prompt: '幫我解題' }, { feature: 'tutor', orgId: 'o1', resolveKey: async () => ({ apiKey: 'k' }) });
  check('超額租戶 → runModel 回 ok:false', denied.ok === false, denied.ok ? '' : denied.error);
  check('未呼叫 provider', adapterCalls === 0);
  check('未計費', transactWrites === 0);

  reset();
  _resetBreakers();
  adapterCalls = 0;
  transactWrites = 0;
  // generous budget → proceeds
  budgets.set('TENANT#o1', { scopeKey: 'TENANT#o1', monthlyCapMusd: 100_000_000, hardStop: true });
  const ok = await runModel(resolvePolicy('tutor'), { prompt: '幫我解題' }, { feature: 'tutor', orgId: 'o1', resolveKey: async () => ({ apiKey: 'k' }) });
  check('未超額 → 正常成功', ok.ok === true, ok.ok ? '' : ok.error);
  check('有呼叫 provider + 計費一次', adapterCalls === 1 && transactWrites === 1);

  reset();
  _resetBreakers();
  adapterCalls = 0;
  // no orgId → budget skipped entirely
  const noOrg = await runModel(resolvePolicy('tutor'), { prompt: 'x' }, { feature: 'tutor', resolveKey: async () => ({ apiKey: 'k' }) });
  check('無 orgId → 不做預算檢查、正常成功', noOrg.ok === true && adapterCalls === 1);
}

console.log('\n[4] CSV escaping');
check('toCsv 逸出引號/逗號/換行', toCsv(['a', 'b'], [['x,y', 'he said "hi"\nnext']]) === '"a","b"\n"x,y","he said ""hi""\nnext"');

console.log('');
if (failed === 0) console.log(`✅ ai budget 全數通過(${passed} 項)`);
else console.log(`❌ ai budget 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
