#!/usr/bin/env node
/**
 * Student Tutor — offline test (mock adapter, stubbed DDB; no AWS / no paid API).
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-tutor.mjs
 *
 * Proves: hint ladder never skips, the "don't give the answer" guardrail is in
 * every level's system prompt, a success is metered (one TransactWrite), and a
 * provider failure charges nothing.
 */
process.env.AWS_ACCESS_KEY_ID = 'verify-tutor-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-tutor-fake';
process.env.AWS_REGION = 'ap-northeast-1';

// Stub the shared doc client before importing gateway/ledger so recordUsage
// never touches AWS.
const { ddbDocClient } = await import('../lib/dynamo.ts');
let sendCalls = [];
ddbDocClient.send = async (cmd) => {
  sendCalls.push(cmd?.constructor?.name);
  return {};
};

const { nextHintLevel, buildTutorPrompt, runTutor, MAX_HINT_LEVEL } = await import('../lib/lessonAI/tutor.ts');
const { setAdapters, _resetBreakers } = await import('../lib/ai/gateway/gateway.ts');

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

console.log('[1] hint ladder never skips');
check('第一次(undefined)→ 1', nextHintLevel(undefined) === 1);
check('0 → 1', nextHintLevel(0) === 1);
check('負數 → 1', nextHintLevel(-5) === 1);
check('1 → 2, 2 → 3, 3 → 4', nextHintLevel(1) === 2 && nextHintLevel(2) === 3 && nextHintLevel(3) === 4);
check('4 → 4(封頂,不跳級)', nextHintLevel(4) === 4 && nextHintLevel(99) === MAX_HINT_LEVEL);

console.log('\n[2] prompt guardrail present at every level');
for (let lvl = 1; lvl <= 4; lvl++) {
  const { systemInstruction } = buildTutorPrompt({ question: 'x', hintLevel: lvl });
  check(`第 ${lvl} 級:system 內含「目前是第 ${lvl} 級」`, systemInstruction.includes(`第 ${lvl} 級`));
  check(`第 ${lvl} 級:含「不要直接給出最終答案」守則`, systemInstruction.includes('不要直接給出最終答案'));
}
{
  const l1 = buildTutorPrompt({ question: 'x', hintLevel: 1 }).systemInstruction;
  const l4 = buildTutorPrompt({ question: 'x', hintLevel: 4 }).systemInstruction;
  check('各級策略不同(1 ≠ 4)', l1 !== l4);
  check('第 4 級仍要求把最後一步留給學生(不照抄)', l4.includes('照抄'));
  check('越級輸入被夾在 1..4', buildTutorPrompt({ question: 'x', hintLevel: 9 }).systemInstruction.includes('第 4 級'));
}

console.log('\n[3] success is metered through the gateway');
{
  _resetBreakers();
  sendCalls = [];
  let seenModel = '';
  setAdapters({
    GEMINI: async (_req, opts) => {
      seenModel = opts.model;
      return { text: '先想想這題要用哪個公式?', usage: { inputTokens: 20, outputTokens: 12, reasoningTokens: 0 }, model: opts.model, provider: 'GEMINI' };
    },
  });
  const res = await runTutor({
    question: '這題怎麼算?',
    hintLevel: 1,
    courseTitle: '國中數學',
    ctx: { feature: 'tutor', resolveKey: async () => ({ apiKey: 'k' }), userId: 'stu1', courseId: 'c1', sessionId: 'lsn_abc' },
  });
  check('回覆成功', res.ok === true, res.ok ? '' : res.error);
  check('回傳提示文字', res.ok && res.result.text.includes('公式'));
  check('走 tutor tier 主模型 gemini-2.5-flash', seenModel === 'gemini-2.5-flash', seenModel);
  check('成功時計費一次(TransactWrite)', sendCalls.includes('TransactWriteCommand'), sendCalls.join(','));
}

console.log('\n[4] provider failure charges nothing');
{
  _resetBreakers();
  sendCalls = [];
  setAdapters({
    GEMINI: async () => {
      throw new Error('boom');
    },
  });
  const res = await runTutor({
    question: '這題怎麼算?',
    hintLevel: 1,
    ctx: { feature: 'tutor', resolveKey: async () => ({ apiKey: 'k' }), userId: 'stu1', sessionId: 'lsn_abc' },
  });
  check('回覆失敗', res.ok === false);
  check('失敗時不寫帳(無 TransactWrite)', !sendCalls.includes('TransactWriteCommand'), sendCalls.join(','));
}

console.log('');
if (failed === 0) console.log(`✅ tutor 全數通過(${passed} 項)`);
else console.log(`❌ tutor 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
