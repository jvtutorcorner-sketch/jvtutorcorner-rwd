// Offline checks for lib/classSummary/summaryLogic.ts (no DB / network / LLM).
//   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-class-summary.mjs
import assert from 'node:assert/strict';

const {
  buildSummaryId,
  canRecord,
  nextSummaryStatus,
  mergeTranscript,
  transcriptToText,
  parseSummaryJson,
  MAX_SUMMARY_ATTEMPTS,
} = await import('../lib/classSummary/summaryLogic.ts');

let passed = 0;
let failed = 0;
function check(label, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL: ${label}\n     ${e.message}`);
  }
}

// ── summaryId ────────────────────────────────────────────────────────────────
check('summaryId is stable for the same start minute', () => {
  const ms = Date.UTC(2026, 8, 19, 6, 30, 0); // 2026-09-19 06:30 UTC
  const a = buildSummaryId('c1', 'o1', ms);
  const b = buildSummaryId('c1', 'o1', ms + 59_000); // same minute
  assert.equal(a, b);
  assert.equal(a, 'c1#o1#202609190630');
});
check('summaryId differs by minute / course / order', () => {
  const ms = Date.UTC(2026, 8, 19, 6, 30);
  assert.notEqual(buildSummaryId('c1', 'o1', ms), buildSummaryId('c1', 'o1', ms + 60_000));
  assert.notEqual(buildSummaryId('c1', 'o1', ms), buildSummaryId('c2', 'o1', ms));
});

// ── consent gating ───────────────────────────────────────────────────────────
const consent = (role, agreed) => ({ role, userId: role, agreed, at: 1, version: 'v' });
check('recording needs BOTH teacher and student agreement', () => {
  assert.equal(canRecord([consent('teacher', true), consent('student', true)]), true);
  assert.equal(canRecord([consent('teacher', true)]), false); // student missing
  assert.equal(canRecord([consent('student', true)]), false); // teacher missing
  assert.equal(canRecord([]), false);
});
check('any decline blocks recording', () => {
  assert.equal(canRecord([consent('teacher', true), consent('student', false)]), false);
  assert.equal(canRecord([consent('teacher', false), consent('student', true)]), false);
});
check('assistant/observer consent does not gate', () => {
  assert.equal(canRecord([consent('teacher', true), consent('student', true), consent('assistant', false)]), true);
});

// ── state machine ──────────────────────────────────────────────────────────────
check('happy path RECORDING→PENDING→PROCESSING→READY', () => {
  assert.equal(nextSummaryStatus('RECORDING', { type: 'class_ended' }), 'PENDING');
  assert.equal(nextSummaryStatus('PENDING', { type: 'claim' }), 'PROCESSING');
  assert.equal(nextSummaryStatus('PROCESSING', { type: 'succeed' }), 'READY');
});
check('fail retries until max, then FAILED', () => {
  assert.equal(nextSummaryStatus('PROCESSING', { type: 'fail', attempts: 1 }), 'PENDING');
  assert.equal(nextSummaryStatus('PROCESSING', { type: 'fail', attempts: MAX_SUMMARY_ATTEMPTS }), 'FAILED');
});
check('invalid transitions return null (idempotent no-op)', () => {
  assert.equal(nextSummaryStatus('READY', { type: 'claim' }), null);
  assert.equal(nextSummaryStatus('PENDING', { type: 'succeed' }), null);
  assert.equal(nextSummaryStatus('RECORDING', { type: 'claim' }), null);
});
check('consent_declined skips unless already READY', () => {
  assert.equal(nextSummaryStatus('RECORDING', { type: 'consent_declined' }), 'SKIPPED');
  assert.equal(nextSummaryStatus('PENDING', { type: 'consent_declined' }), 'SKIPPED');
  assert.equal(nextSummaryStatus('READY', { type: 'consent_declined' }), null);
});

// ── transcript merge ─────────────────────────────────────────────────────────
check('mergeTranscript orders by startMs and drops empties', () => {
  const segs = [
    { role: 'student', startMs: 3000, text: '我不太懂' },
    { role: 'teacher', startMs: 1000, text: '今天上二次函數' },
    { role: 'teacher', startMs: 2000, text: '  ' }, // empty → dropped
    { role: 'teacher', startMs: 5000, text: '看這題' },
  ];
  const merged = mergeTranscript(segs);
  assert.equal(merged.length, 3);
  assert.deepEqual(merged.map((s) => s.startMs), [1000, 3000, 5000]);
  const text = transcriptToText(segs);
  assert.equal(text.startsWith('老師：今天上二次函數'), true);
  assert.equal(text.includes('學生：我不太懂'), true);
});

// ── summary JSON parsing ───────────────────────────────────────────────────────
check('parseSummaryJson accepts fenced JSON and normalizes arrays', () => {
  const out = parseSummaryJson('```json\n{"summary":"教了二次函數","keyConcepts":["頂點式",123],"confidence":"high"}\n```');
  assert.equal(out.summary, '教了二次函數');
  assert.deepEqual(out.keyConcepts, ['頂點式']); // non-strings filtered
  assert.equal(out.confidence, 'high');
  assert.equal(Array.isArray(out.homework), true);
});
check('parseSummaryJson flags insufficient + defaults bad confidence to low', () => {
  const out = parseSummaryJson('{"summary":"","insufficient":true,"confidence":"???"}');
  assert.equal(out.insufficient, true);
  assert.equal(out.confidence, 'low');
});
check('parseSummaryJson returns null on garbage', () => {
  assert.equal(parseSummaryJson('not json at all'), null);
});

console.log(`\nclass-summary verify: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
