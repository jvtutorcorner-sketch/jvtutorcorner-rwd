#!/usr/bin/env node
/**
 * AI Gateway 定價/成本換算純函式測試。
 * 用法: node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-ai-pricing.mjs
 */
const { usageToMusd, estimateMusd, estimateTokens, priceForModel, DEFAULT_PRICE } =
  await import('../lib/ai/gateway/pricing.ts');

let failed = 0, passed = 0;
const check = (l, c, d = '') => { if (c) { passed++; console.log(`  ✅ ${l}`); } else { failed++; console.log(`  ❌ ${l}${d ? `  (${d})` : ''}`); } };

// gemini-2.5-flash: in $0.30/M, out $2.50/M. 1000 in + 500 out:
// (1000*0.30 + 500*2.50)/1e6 USD = (300+1250)/1e6 = 0.00155 USD = 1550 µ$
check('usageToMusd 基本(flash 1000in/500out=1550µ$)',
  usageToMusd('gemini-2.5-flash', { inputTokens: 1000, outputTokens: 500, reasoningTokens: 0 }) === 1550,
  `got ${usageToMusd('gemini-2.5-flash', { inputTokens: 1000, outputTokens: 500, reasoningTokens: 0 })}`);

// reasoning 以 output 價計:1000in + 0out + 400reasoning = (300 + 400*2.5)/1e6 = 1300µ$
check('reasoning token 以 output 價計',
  usageToMusd('gemini-2.5-flash', { inputTokens: 1000, outputTokens: 0, reasoningTokens: 400 }) === 1300,
  `got ${usageToMusd('gemini-2.5-flash', { inputTokens: 1000, outputTokens: 0, reasoningTokens: 400 })}`);

// flash-lite in $0.10 out $0.40:2000in/1000out = (200+400)/1e6 = 600µ$
check('flash-lite 2000in/1000out=600µ$',
  usageToMusd('gemini-2.5-flash-lite', { inputTokens: 2000, outputTokens: 1000, reasoningTokens: 0 }) === 600,
  `got ${usageToMusd('gemini-2.5-flash-lite', { inputTokens: 2000, outputTokens: 1000, reasoningTokens: 0 })}`);

check('未知 model 用 DEFAULT_PRICE(不為 0)',
  usageToMusd('some-unknown-model', { inputTokens: 1000, outputTokens: 1000, reasoningTokens: 0 }) > 0);
check('priceForModel 未知 → DEFAULT_PRICE', priceForModel('nope') === DEFAULT_PRICE);

check('estimateTokens ~ len/4', estimateTokens('a'.repeat(400)) === 100);

// estimateMusd flash: 1000 est in + 2048 maxTokens out = (1000*0.3 + 2048*2.5)/1e6 = (300+5120)/1e6=5420µ$
check('estimateMusd 用 maxTokens 當 output 上限',
  estimateMusd('gemini-2.5-flash', 1000, 2048) === 5420,
  `got ${estimateMusd('gemini-2.5-flash', 1000, 2048)}`);

check('值皆整數 micro-USD',
  Number.isInteger(usageToMusd('gpt-4o-mini', { inputTokens: 333, outputTokens: 777, reasoningTokens: 11 })));

console.log(`\n${failed === 0 ? '✅ 全部通過' : '❌ 有失敗'} — passed ${passed}, failed ${failed}`);
process.exit(failed === 0 ? 0 : 1);
