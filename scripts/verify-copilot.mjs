#!/usr/bin/env node
/**
 * Teacher Copilot — offline test (mock adapter, stubbed DDB; no AWS/paid API).
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-copilot.mjs
 *
 * Proves: prompt tells the model it has no transcript + asks for one concrete
 * next step; a success is metered once; a provider failure charges nothing.
 */
process.env.AWS_ACCESS_KEY_ID = 'verify-copilot-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-copilot-fake';
process.env.AWS_REGION = 'ap-northeast-1';

const { ddbDocClient } = await import('../lib/dynamo.ts');
let sendCalls = [];
ddbDocClient.send = async (cmd) => {
  sendCalls.push(cmd?.constructor?.name);
  return {};
};

const { buildCopilotPrompt, runCopilot } = await import('../lib/lessonAI/copilot.ts');
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

console.log('[1] prompt shape + guardrails');
{
  const { systemInstruction, prompt } = buildCopilotPrompt({
    events: [
      { offsetSec: 60, source: 'marker', type: 'start_new_topic', note: '三角函數' },
      { offsetSec: 300, source: 'marker', type: 'student_question' },
    ],
    segments: [{ index: 0, topic: '三角函數' }],
    courseTitle: '高中數學',
  });
  check('system:告知看不到逐字稿', systemInstruction.includes('看不到逐字稿'));
  check('system:只給一個具體下一步', systemInstruction.includes('一個') && systemInstruction.includes('下一步'));
  check('system:只建議不指揮', systemInstruction.includes('只建議、不指揮'));
  check('prompt:含事件時間軸(mm:ss)', prompt.includes('05:00') && prompt.includes('學生提問'));
  check('prompt:含課程與主題', prompt.includes('高中數學') && prompt.includes('三角函數'));
}
{
  const { prompt } = buildCopilotPrompt({ events: [] });
  check('無事件時仍可出 prompt', prompt.includes('目前還沒有標記或事件'));
}

console.log('\n[2] success is metered');
{
  _resetBreakers();
  sendCalls = [];
  let seenModel = '';
  setAdapters({
    GEMINI: async (_req, opts) => {
      seenModel = opts.model;
      return { text: '請一位學生用自己的話複述剛才的定義。', usage: { inputTokens: 40, outputTokens: 15, reasoningTokens: 0 }, model: opts.model, provider: 'GEMINI' };
    },
  });
  const res = await runCopilot({
    events: [{ offsetSec: 120, source: 'marker', type: 'important_concept' }],
    courseTitle: '高中數學',
    ctx: { feature: 'copilot', resolveKey: async () => ({ apiKey: 'k' }), teacherId: 't1', courseId: 'c1', sessionId: 'lsn_x' },
  });
  check('回覆成功', res.ok === true, res.ok ? '' : res.error);
  check('走 copilot tier 主模型 gemini-2.5-flash', seenModel === 'gemini-2.5-flash', seenModel);
  check('成功計費一次(TransactWrite)', sendCalls.includes('TransactWriteCommand'));
}

console.log('\n[3] provider failure charges nothing');
{
  _resetBreakers();
  sendCalls = [];
  setAdapters({ GEMINI: async () => { throw new Error('boom'); } });
  const res = await runCopilot({
    events: [],
    ctx: { feature: 'copilot', resolveKey: async () => ({ apiKey: 'k' }), teacherId: 't1', sessionId: 'lsn_x' },
  });
  check('回覆失敗', res.ok === false);
  check('失敗不寫帳(無 TransactWrite)', !sendCalls.includes('TransactWriteCommand'));
}

console.log('');
if (failed === 0) console.log(`✅ copilot 全數通過(${passed} 項)`);
else console.log(`❌ copilot 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
