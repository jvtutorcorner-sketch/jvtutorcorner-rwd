#!/usr/bin/env node
/**
 * AI Assessment core — offline test (mock adapter, stubbed DDB; no AWS/paid API).
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-assessment.mjs
 */
process.env.AWS_ACCESS_KEY_ID = 'verify-assessment-fake';
process.env.AWS_SECRET_ACCESS_KEY = 'verify-assessment-fake';
process.env.AWS_REGION = 'ap-northeast-1';

const { ddbDocClient } = await import('../lib/dynamo.ts');
let sendCalls = [];
ddbDocClient.send = async (cmd) => {
  sendCalls.push(cmd?.constructor?.name);
  return {};
};

const A = await import('../lib/lessonAI/assessment.ts');
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

console.log('[1] buildGeneratePrompt');
{
  const { systemInstruction, prompt } = A.buildGeneratePrompt({ topic: '一元二次方程式', count: 3, courseTitle: '國中數學' });
  check('system 含 JSON 格式 + mcq/answerIndex 規則', systemInstruction.includes('questions') && systemInstruction.includes('answerIndex'));
  check('prompt 含主題與題數', prompt.includes('一元二次方程式') && prompt.includes('3'));
}

console.log('\n[2] parseAssessment');
{
  const good = JSON.stringify({
    questions: [
      { type: 'mcq', prompt: '1+1=?', options: ['1', '2', '3'], answerIndex: 1, points: 10 },
      { type: 'short', prompt: '說明加法', rubric: '有提到累加', points: 20 },
    ],
  });
  const q = A.parseAssessment(good);
  check('解析出 2 題', q && q.length === 2, String(q?.length));
  check('每題有唯一 qid', q && q[0].qid && q[1].qid && q[0].qid !== q[1].qid);
  check('mcq 保留 options/answerIndex、short 保留 rubric', q[0].type === 'mcq' && q[0].answerIndex === 1 && q[1].rubric === '有提到累加');
  check('fenced ```json``` 也能解析', !!A.parseAssessment('```json\n' + good + '\n```'));
  check('bare array 也能解析', !!A.parseAssessment('[{"type":"short","prompt":"x","points":5}]'));
  check('mcq 選項 <2 被丟棄', A.parseAssessment('{"questions":[{"type":"mcq","prompt":"x","options":["A"],"points":5}]}') === null);
  check('壞 JSON → null', A.parseAssessment('not json at all') === null);
  check('points 夾在 1..100', A.parseAssessment('[{"type":"short","prompt":"x","points":9999}]')[0].points === 100);
}

console.log('\n[3] normalizeQuestions preserveQid + redactForStudent');
{
  const norm = A.normalizeQuestions([{ qid: 'keep-me', type: 'short', prompt: 'x', points: 5 }], { preserveQid: true });
  check('preserveQid 保留既有 qid', norm[0].qid === 'keep-me');
  const red = A.redactForStudent([{ qid: 'q1', type: 'mcq', prompt: 'x', options: ['a', 'b'], answerIndex: 1, points: 10 }]);
  check('redact 移除 answerIndex/rubric,保留 options', red[0].answerIndex === undefined && red[0].rubric === undefined && red[0].options.length === 2);
}

console.log('\n[4] gradeMcq (local)');
{
  const qs = [
    { qid: 'm1', type: 'mcq', prompt: 'x', options: ['a', 'b'], answerIndex: 1, points: 10 },
    { qid: 'm2', type: 'mcq', prompt: 'y', options: ['a', 'b', 'c'], answerIndex: 2, points: 5 },
  ];
  const g = A.gradeMcq(qs, { m1: 1, m2: '0' });
  check('答對 m1 得滿分、答錯 m2 得 0', g[0].score === 10 && g[0].correct === true && g[1].score === 0 && g[1].correct === false);
  check('數字字串答案也能比對', A.gradeMcq(qs, { m1: '1' })[0].correct === true);
}

console.log('\n[5] buildGradingPrompt + parseGrade + totalScore');
{
  const shortQs = [{ qid: 's1', type: 'short', prompt: 'x', rubric: 'r', points: 20 }];
  const { systemInstruction, prompt } = A.buildGradingPrompt(shortQs, { s1: '我的答案' }, '國中數學');
  check('grading system 要求 JSON grades', systemInstruction.includes('grades'));
  check('grading prompt 含 rubric 與作答', prompt.includes('"rubric"') && prompt.includes('我的答案'));
  const grades = A.parseGrade('{"grades":[{"qid":"s1","score":18,"feedback":"不錯"}]}', shortQs);
  check('parseGrade 取分數 + 回饋', grades[0].score === 18 && grades[0].feedback === '不錯');
  check('parseGrade 夾在 0..points', A.parseGrade('{"grades":[{"qid":"s1","score":999}]}', shortQs)[0].score === 20);
  check('缺該題 → 0 分', A.parseGrade('{"grades":[]}', shortQs)[0].score === 0);
  check('totalScore 加總', A.totalScore([{ qid: 'a', score: 3, max: 5 }, { qid: 'b', score: 2, max: 10 }]).score === 5);
}

console.log('\n[6] runGenerate / runGradeShort metering');
{
  _resetBreakers();
  sendCalls = [];
  let genModel = '',
    gradeModel = '';
  setAdapters({
    GEMINI: async (_req, opts) => {
      if (opts.model.includes('lite')) {
        gradeModel = opts.model;
        return { text: '{"grades":[{"qid":"s1","score":15,"feedback":"ok"}]}', usage: { inputTokens: 30, outputTokens: 10, reasoningTokens: 0 }, model: opts.model, provider: 'GEMINI' };
      }
      genModel = opts.model;
      return { text: '{"questions":[{"type":"short","prompt":"x","points":20}]}', usage: { inputTokens: 40, outputTokens: 20, reasoningTokens: 0 }, model: opts.model, provider: 'GEMINI' };
    },
  });
  const gen = await A.runGenerate({ topic: 't', count: 1, ctx: { feature: 'assessment', resolveKey: async () => ({ apiKey: 'k' }), teacherId: 't1', courseId: 'c1', sessionId: 'lsn_x' } });
  check('runGenerate 成功 + assessment_gen 主模型 gemini-2.5-flash', gen.ok && genModel === 'gemini-2.5-flash', genModel);
  check('runGenerate 計費一次', sendCalls.includes('TransactWriteCommand'));

  sendCalls = [];
  const grade = await A.runGradeShort({ shortQuestions: [{ qid: 's1', type: 'short', prompt: 'x', points: 20 }], answers: { s1: 'ans' }, ctx: { feature: 'assessment', resolveKey: async () => ({ apiKey: 'k' }), teacherId: 't1', sessionId: 'lsn_x' } });
  check('runGradeShort 成功 + grading 主模型 gemini-2.5-flash-lite', grade.ok && gradeModel === 'gemini-2.5-flash-lite', gradeModel);
  check('runGradeShort 計費一次', sendCalls.includes('TransactWriteCommand'));
}

console.log('\n[7] grading failure charges nothing');
{
  _resetBreakers();
  sendCalls = [];
  setAdapters({ GEMINI: async () => { throw new Error('boom'); } });
  const grade = await A.runGradeShort({ shortQuestions: [{ qid: 's1', type: 'short', prompt: 'x', points: 20 }], answers: { s1: 'a' }, ctx: { feature: 'assessment', resolveKey: async () => ({ apiKey: 'k' }), sessionId: 'lsn_x' } });
  check('失敗 ok=false', grade.ok === false);
  check('失敗不寫帳', !sendCalls.includes('TransactWriteCommand'));
}

console.log('');
if (failed === 0) console.log(`✅ assessment 全數通過(${passed} 項)`);
else console.log(`❌ assessment 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
