#!/usr/bin/env node
/**
 * Deterministic lesson session id — offline test.
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-lesson-session-id.mjs
 *
 * Proves: determinism, URL-safety (no '#'), stability across early/late class
 * end (same scheduled minute → same id), sensitivity to each input, and that it
 * agrees with buildSummaryId's minute bucket.
 */
import { buildSummaryId } from '../lib/classSummary/summaryLogic.ts';
import {
  deriveLessonSessionId,
  isLessonSessionId,
  startMinuteBucket,
  LESSON_SESSION_PREFIX,
} from '../lib/lessonAI/sessionId.ts';

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

const start = Date.UTC(2026, 8, 22, 13, 0, 0); // 2026-09-22 13:00 UTC

console.log('[1] determinism & shape');
const id = deriveLessonSessionId('course-1', 'order-1', start);
check('決定性:同輸入同 id', id === deriveLessonSessionId('course-1', 'order-1', start));
check('URL-safe:無 # / 空白 / 斜線', /^lsn_[0-9a-z]+$/.test(id) && !/[#\/\s]/.test(id), id);
check('isLessonSessionId 認得', isLessonSessionId(id));
check('前綴正確', id.startsWith(LESSON_SESSION_PREFIX));
check('isLessonSessionId 拒絕含 # 的舊式 id', !isLessonSessionId('course-1#order-1#202609221300'));

console.log('\n[2] stability across early/late end');
// Any wall time within the same scheduled MINUTE yields the same id.
const sameMinute = Date.UTC(2026, 8, 22, 13, 0, 59);
check('同一分鐘內 → 同 id(早退/遲退不影響)', id === deriveLessonSessionId('course-1', 'order-1', sameMinute));
const nextMinute = Date.UTC(2026, 8, 22, 13, 1, 0);
check('跨到下一分鐘 → 不同 id', id !== deriveLessonSessionId('course-1', 'order-1', nextMinute));

console.log('\n[3] sensitivity to inputs (no accidental collision)');
check('course 不同 → 不同', id !== deriveLessonSessionId('course-2', 'order-1', start));
check('order 不同 → 不同', id !== deriveLessonSessionId('course-1', 'order-2', start));
const seen = new Set();
for (let c = 0; c < 40; c++)
  for (let o = 0; o < 40; o++) seen.add(deriveLessonSessionId(`c${c}`, `o${o}`, start + c * 60000));
check('1600 組 (course,order,分鐘) 無碰撞', seen.size === 1600, `${seen.size}/1600`);

console.log('\n[4] agrees with buildSummaryId bucket');
const bucket = startMinuteBucket(start);
check('bucket 為 12 碼 UTC 分鐘', /^\d{12}$/.test(bucket) && bucket === '202609221300', bucket);
check('buildSummaryId 使用同 bucket', buildSummaryId('course-1', 'order-1', start).endsWith(`#${bucket}`));

console.log('\n[5] invalid input');
const throws = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
check('缺 courseId → throw', throws(() => deriveLessonSessionId('', 'o', start)));
check('NaN 開始時間 → throw', throws(() => deriveLessonSessionId('c', 'o', NaN)));

console.log('');
if (failed === 0) console.log(`✅ lesson session id 全數通過(${passed} 項)`);
else console.log(`❌ lesson session id 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
