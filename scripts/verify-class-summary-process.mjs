// Offline checks for lib/classSummary/processSummary.ts with fully mocked deps (no S3 /
// LLM / network).
//   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-class-summary-process.mjs
import assert from 'node:assert/strict';

const { parseAudioKey, buildTranscript, processSummaryRow } = await import('../lib/classSummary/processSummary.ts');

let passed = 0;
let failed = 0;
function check(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
    })
    .catch((e) => {
      failed++;
      console.error(`FAIL: ${label}\n     ${e.message}`);
    });
}

const row = (over = {}) => ({
  summaryId: 'c1#o1#202609190630',
  courseId: 'c1',
  orderId: 'o1',
  teacherId: 't1',
  status: 'PROCESSING',
  consent: [],
  recordingEnabled: true,
  audioKeys: [
    'class-audio/c1#o1#202609190630/teacher/0000-0.webm',
    'class-audio/c1#o1#202609190630/student/0000-1500.webm',
  ],
  boardKeys: [],
  attempts: 1,
  createdAt: '2026-09-19T06:30:00.000Z',
  updatedAt: 1,
  ...over,
});

const longSummaryJson = JSON.stringify({
  summary: '這堂課教了二次函數的頂點式與圖形平移，並帶了兩題例題。',
  keyConcepts: ['頂點式', '圖形平移'],
  teacherHighlights: ['先配方再看頂點'],
  studentDifficulties: ['配方時符號錯'],
  homework: ['習題 3-1 第 5 到 8 題'],
  nextLessonSuggestions: ['接判別式'],
  vocabulary: [{ term: '頂點式', meaning: 'y=a(x-h)^2+k' }],
  confidence: 'high',
  insufficient: false,
});

const baseDeps = {
  getObjectBase64: async () => ({ base64: 'AAAA', mimeType: 'audio/webm' }),
  getIntegration: async () => ({ type: 'GEMINI', config: { apiKey: 'k', model: 'gemini-1.5-flash' } }),
  transcribe: async () =>
    '老師先複習上週的一元二次方程式，接著講解二次函數的頂點式 y 等於 a 乘以 x 減 h 平方加 k，示範如何用配方法把一般式改寫成頂點式，並在白板上畫出圖形平移的過程，然後出了兩題練習讓學生自己做，學生在配方時符號處理卡了一下，老師再示範一次並提醒符號要小心。',
  generateJson: async () => longSummaryJson,
};

await check('parseAudioKey extracts role + startMs', () => {
  assert.deepEqual(parseAudioKey('class-audio/c1#o1#x/teacher/0003-90000.webm'), { role: 'teacher', startMs: 90000 });
  assert.equal(parseAudioKey('bogus/key.txt'), null);
});

await check('buildTranscript orders segments and labels roles', async () => {
  const segs = await buildTranscript(row().audioKeys, baseDeps);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].role, 'teacher');
  assert.equal(segs[0].startMs, 0);
  assert.equal(segs[1].role, 'student');
});

await check('ready path returns parsed summary', async () => {
  const out = await processSummaryRow(row(), baseDeps);
  assert.equal(out.kind, 'ready');
  assert.equal(out.summary.confidence, 'high');
  assert.equal(out.summary.keyConcepts.includes('頂點式'), true);
  assert.equal(out.model, 'gemini-1.5-flash');
});

await check('thin transcript → insufficient (not fabricated)', async () => {
  const out = await processSummaryRow(row(), { ...baseDeps, transcribe: async () => '嗯' });
  assert.equal(out.kind, 'insufficient');
  assert.equal(out.summary.insufficient, true);
});

await check('no valid JSON → failed', async () => {
  const out = await processSummaryRow(row(), { ...baseDeps, generateJson: async () => 'totally not json' });
  assert.equal(out.kind, 'failed');
  assert.equal(out.reason, 'no-valid-json');
});

await check('no AI integration → failed', async () => {
  const out = await processSummaryRow(row(), { ...baseDeps, getIntegration: async () => null });
  assert.equal(out.kind, 'failed');
  assert.equal(out.reason, 'no-ai-integration');
});

await check('model returning insufficient:true is honored', async () => {
  const out = await processSummaryRow(row(), {
    ...baseDeps,
    generateJson: async () => JSON.stringify({ summary: '', insufficient: true, confidence: 'low' }),
  });
  assert.equal(out.kind, 'insufficient');
});

console.log(`\nclass-summary-process verify: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
