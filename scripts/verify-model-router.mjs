#!/usr/bin/env node
/**
 * Task router 測試:task→policy、tier→model、fallback 鏈、override、複雜度映射。
 * 用法: node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-model-router.mjs
 */
delete process.env.AI_TIER_MID_MODEL; delete process.env.AI_TIER_LOW_MODEL;
const { resolvePolicy, chatTaskForComplexity } = await import('../lib/ai/gateway/router.ts');

let failed = 0, passed = 0;
const check = (l, c, d = '') => { if (c) { passed++; console.log(`  ✅ ${l}`); } else { failed++; console.log(`  ❌ ${l}${d ? `  (${d})` : ''}`); } };

const l1 = resolvePolicy('l1_detect');
check('l1_detect primary = low tier (flash-lite)', l1.primary.model === 'gemini-2.5-flash-lite', l1.primary.model);
check('l1_detect 有 fallback', l1.fallbacks.length >= 1);
check('l1_detect maxTokens 1024', l1.maxTokens === 1024);

const l3 = resolvePolicy('l3_lesson');
check('l3_lesson primary = mid (flash)', l3.primary.model === 'gemini-2.5-flash', l3.primary.model);
check('l3_lesson fallback[0] = high (sonnet)', l3.fallbacks[0]?.model === 'claude-3-5-sonnet-20241022', l3.fallbacks[0]?.model);

const tutor = resolvePolicy('tutor');
check('tutor 有 cost cap', typeof tutor.maxCostMusd === 'number' && tutor.maxCostMusd > 0);
check('tutor timeout ≤15s(同步)', tutor.timeoutMs <= 15000);

const hi = resolvePolicy('l3_lesson_high');
check('l3_lesson_high primary = ANTHROPIC high', hi.primary.provider === 'ANTHROPIC');

// override 勝過預設
const ov = resolvePolicy('l1_detect', { primary: { provider: 'OPENROUTER', model: 'google/gemini-2.5-flash-lite' }, maxTokens: 256 });
check('override primary 生效', ov.primary.provider === 'OPENROUTER' && ov.primary.model.startsWith('google/'));
check('override maxTokens 生效', ov.maxTokens === 256);

check('複雜度 FAST→chat_fast', chatTaskForComplexity('FAST') === 'chat_fast');
check('複雜度 COMPLEX→chat_complex', chatTaskForComplexity('COMPLEX') === 'chat_complex');
check('複雜度 BALANCED→chat', chatTaskForComplexity('BALANCED') === 'chat');

// env override tier model
process.env.AI_TIER_MID_MODEL = 'google/gemini-2.5-flash';
const { resolvePolicy: rp2 } = await import(`../lib/ai/gateway/router.ts?e=${Date.now()}`);
check('env AI_TIER_MID_MODEL 覆寫 tier model', rp2('l3_lesson').primary.model === 'google/gemini-2.5-flash', rp2('l3_lesson').primary.model);

console.log(`\n${failed === 0 ? '✅ 全部通過' : '❌ 有失敗'} — passed ${passed}, failed ${failed}`);
process.exit(failed === 0 ? 0 : 1);
