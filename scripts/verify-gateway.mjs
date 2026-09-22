#!/usr/bin/env node
/**
 * AI Gateway runModel 可靠性 + 計費測試(mock provider adapter,ledger 走記憶體)。
 *   1. 成功 → 回結果 + costMusd = usageToMusd + recordUsage 被呼叫
 *   2. primary 拋錯 → fallback 成功
 *   3. primary timeout(abort)→ fallback 成功、primary 不重試
 *   4. 暫時性錯誤 → 重試後成功(retry ≤1)
 *   5. cost cap → 估價超過即拒、不呼叫 provider
 *   6. circuit breaker → 連續失敗開路,後續略過該 provider
 *   7. 同 requestId 冪等 → rollup 不重複累加
 *
 * 不設 AWS 憑證 → ledger 走 LOCAL_USAGE/LOCAL_ROLLUPS 記憶體。
 * 用法: node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-gateway.mjs
 */
delete process.env.AWS_ACCESS_KEY_ID;
delete process.env.CI_AWS_ACCESS_KEY_ID;
process.env.NODE_ENV = 'test';

const gw = await import('../lib/ai/gateway/gateway.ts');
const ledger = await import('../lib/ai/gateway/ledger.ts');
const { usageToMusd } = await import('../lib/ai/gateway/pricing.ts');
const { runModel, setAdapters, _resetBreakers } = gw;
const { LOCAL_USAGE, LOCAL_ROLLUPS } = ledger;

let failed = 0, passed = 0;
const check = (l, c, d = '') => { if (c) { passed++; console.log(`  ✅ ${l}`); } else { failed++; console.log(`  ❌ ${l}${d ? `  (${d})` : ''}`); } };

const USAGE = { inputTokens: 1000, outputTokens: 500, reasoningTokens: 0 };
const okAdapter = (provider, model = 'gemini-2.5-flash') => async () => ({ text: `hi from ${provider}`, usage: USAGE, model, provider });
const throwAdapter = (msg = 'boom') => async () => { throw new Error(msg); };
const timeoutAdapter = () => (_req, opts) => new Promise((_res, rej) => {
  if (opts.signal) opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
});
const failThenSucceed = (provider) => { let n = 0; return async () => { if (n++ === 0) throw new Error('transient'); return { text: 'ok2', usage: USAGE, model: 'gemini-2.5-flash', provider }; }; };

const ctx = (requestId) => ({ feature: 'test', requestId, resolveKey: () => ({ apiKey: 'k' }) });
const policy = (primary, fallbacks = [], extra = {}) => ({ primary, fallbacks, maxTokens: 2048, timeoutMs: 50, ...extra });
const G = { provider: 'GEMINI', model: 'gemini-2.5-flash' };
const O = { provider: 'OPENAI', model: 'gpt-4o-mini' };

console.log('[1] 成功 + 計費');
{
  _resetBreakers();
  setAdapters({ GEMINI: okAdapter('GEMINI') });
  const before = LOCAL_USAGE.length;
  const r = await runModel(policy(G), { prompt: 'hello' }, ctx('req-1'));
  check('ok', r.ok === true);
  check('provider GEMINI', r.ok && r.provider === 'GEMINI');
  check('costMusd = usageToMusd', r.ok && r.costMusd === usageToMusd('gemini-2.5-flash', USAGE), r.ok ? `got ${r.costMusd}` : '');
  check('recordUsage 被呼叫(LOCAL_USAGE +1)', LOCAL_USAGE.length === before + 1);
}

console.log('\n[2] primary 拋錯 → fallback');
{
  _resetBreakers();
  setAdapters({ GEMINI: throwAdapter(), OPENAI: okAdapter('OPENAI', 'gpt-4o-mini') });
  const r = await runModel(policy(G, [O]), { prompt: 'x' }, ctx('req-2'));
  check('ok via fallback', r.ok === true && r.provider === 'OPENAI');
}

console.log('\n[3] primary timeout → fallback、primary 不重試');
{
  _resetBreakers();
  let geminiCalls = 0;
  setAdapters({ GEMINI: (req, opts) => { geminiCalls++; return timeoutAdapter()(req, opts); }, OPENAI: okAdapter('OPENAI', 'gpt-4o-mini') });
  const r = await runModel(policy(G, [O], { timeoutMs: 30 }), { prompt: 'x' }, ctx('req-3'));
  check('ok via fallback after timeout', r.ok === true && r.provider === 'OPENAI');
  check('primary timeout 只呼叫一次(不重試 abort)', geminiCalls === 1, `got ${geminiCalls}`);
}

console.log('\n[4] 暫時性錯誤 → 重試後成功');
{
  _resetBreakers();
  setAdapters({ GEMINI: failThenSucceed('GEMINI') });
  const r = await runModel(policy(G), { prompt: 'x' }, ctx('req-4'));
  check('ok after retry', r.ok === true && r.provider === 'GEMINI');
}

console.log('\n[5] cost cap → 拒絕、不呼叫 provider');
{
  _resetBreakers();
  let called = 0;
  setAdapters({ GEMINI: async () => { called++; return { text: 't', usage: USAGE, model: 'gemini-2.5-flash', provider: 'GEMINI' }; } });
  const r = await runModel(policy(G, [], { maxCostMusd: 1 }), { prompt: 'x'.repeat(4000) }, ctx('req-5'));
  check('ok:false cost cap', r.ok === false && /cost/.test(r.error));
  check('provider 未被呼叫', called === 0);
}

console.log('\n[6] circuit breaker 連續失敗開路');
{
  _resetBreakers();
  let calls = 0;
  setAdapters({ GEMINI: async () => { calls++; throw new Error('down'); } });
  // 4 次失敗(每次 2 attempts)應在第 4 次後開路
  for (let i = 0; i < 4; i++) await runModel(policy(G), { prompt: 'x' }, ctx(`brk-${i}`));
  const callsAfterFailures = calls;
  const r = await runModel(policy(G), { prompt: 'x' }, ctx('brk-open'));
  check('開路後回 ok:false circuit open', r.ok === false && /circuit open/.test(r.error), r.ok ? '' : r.error);
  check('開路後不再呼叫 provider', calls === callsAfterFailures, `calls ${calls} vs ${callsAfterFailures}`);
}

console.log('\n[7] 同 requestId 冪等');
{
  _resetBreakers();
  setAdapters({ GEMINI: okAdapter('GEMINI') });
  const g0 = (await ledger.getRollup(`GLOBAL#${new Date().toISOString().slice(0,7).replace('-','')}`))?.requests ?? 0;
  await runModel(policy(G), { prompt: 'x' }, ctx('dup-req'));
  const r2 = await runModel(policy(G), { prompt: 'x' }, ctx('dup-req'));
  const g1 = (await ledger.getRollup(`GLOBAL#${new Date().toISOString().slice(0,7).replace('-','')}`))?.requests ?? 0;
  check('第二次 duplicate', r2.ok === true && r2.duplicate === true);
  check('rollup 只 +1(冪等)', g1 - g0 === 1, `delta ${g1 - g0}`);
}

console.log(`\n${failed === 0 ? '✅ 全部通過' : '❌ 有失敗'} — passed ${passed}, failed ${failed}`);
process.exit(failed === 0 ? 0 : 1);
