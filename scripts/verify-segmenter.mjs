#!/usr/bin/env node
/**
 * Segmenter pure state machine — offline test.
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-segmenter.mjs
 *
 * Locks the §3 rules: boundary markers cut immediately, point markers don't,
 * page-change needs dwell ≥45s AND segment ≥90s, time fallback >15min, out-of-
 * order tolerance.
 */
import { segmentLesson } from '../lib/lessonAI/segmenter.ts';

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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let n = 0;
const ev = (source, type, offsetSec, extra = {}) => ({ eventId: `e${n++}`, source, type, offsetSec, ...extra });
const spans = (segs) => segs.map((s) => [s.startSec, s.endSec]);

console.log('[1] boundary markers cut immediately');
{
  const segs = segmentLesson([
    ev('marker', 'start_new_topic', 100, { note: '三角函數' }),
    ev('marker', 'start_exercise', 300),
    ev('system', 'class_ended', 600),
  ]);
  check('三段', segs.length === 3, String(segs.length));
  check('切點正確', eq(spans(segs), [[0, 100], [100, 300], [300, 600]]), JSON.stringify(spans(segs)));
  check('seg1 boundarySource=marker、type=start_new_topic', segs[1].boundarySource === 'marker' && segs[1].boundaryType === 'start_new_topic');
  check('boundary marker 的 note 留在它開啟的段', segs[1].events[0]?.note === '三角函數');
  check('seg0 由 lesson_start 開啟、confidence 依來源', segs[0].boundaryType === 'lesson_start');
}

console.log('\n[2] point markers do NOT cut');
{
  const segs = segmentLesson([
    ev('marker', 'important_concept', 50),
    ev('marker', 'student_question', 120),
    ev('system', 'class_ended', 300),
  ]);
  check('僅一段', segs.length === 1, String(segs.length));
  check('兩個點狀事件掛在該段', segs[0].events.length === 2 && segs[0].events.every((e) => e.source === 'marker'));
}

console.log('\n[3] whiteboard page-change dwell gate');
{
  const enough = segmentLesson([ev('system', 'whiteboard_page_change', 100), ev('system', 'class_ended', 300)]);
  check('dwell 足夠(200s)+段長≥90 → 切', eq(spans(enough), [[0, 100], [100, 300]]), JSON.stringify(spans(enough)));

  const flip = segmentLesson([
    ev('system', 'whiteboard_page_change', 100),
    ev('system', 'whiteboard_page_change', 120),
    ev('system', 'class_ended', 300),
  ]);
  check('快速翻頁(dwell 20s)不切,停留那頁(dwell 180s)才切', eq(spans(flip), [[0, 120], [120, 300]]), JSON.stringify(spans(flip)));

  const tooShort = segmentLesson([ev('system', 'whiteboard_page_change', 50), ev('system', 'class_ended', 300)]);
  check('段長 <90s 不切(防碎片)', tooShort.length === 1, String(tooShort.length));
}

console.log('\n[4] immediate system boundary (quiz_start)');
{
  const segs = segmentLesson([ev('system', 'quiz_start', 200), ev('system', 'class_ended', 500)]);
  check('quiz_start 立即切', eq(spans(segs), [[0, 200], [200, 500]]));
  check('新段 boundarySource=system、type=quiz_start', segs[1].boundarySource === 'system' && segs[1].boundaryType === 'quiz_start');
}

console.log('\n[5] time fallback >15min');
{
  const segs = segmentLesson([ev('system', 'class_ended', 2000)]);
  check('無 marker 也切出時間段(900s 一段)', eq(spans(segs), [[0, 900], [900, 1800], [1800, 2000]]), JSON.stringify(spans(segs)));
  check('時間段 boundarySource=time、confidence 0.5', segs[1].boundarySource === 'time' && segs[1].confidence === 0.5);
}

console.log('\n[6] out-of-order tolerance');
{
  const segs = segmentLesson([
    ev('system', 'class_ended', 300),
    ev('marker', 'start_new_topic', 200),
    ev('marker', 'important_concept', 80),
  ]);
  check('依 offset 排序後切在 200,不受陣列順序影響', eq(spans(segs), [[0, 200], [200, 300]]), JSON.stringify(spans(segs)));
  check('80s 的點狀事件落在第一段', segs[0].events.some((e) => e.type === 'important_concept'));
}

console.log('\n[7] end_segment + edge cases');
{
  const segs = segmentLesson([ev('marker', 'end_segment', 200), ev('system', 'class_ended', 500)]);
  check('end_segment 切段', eq(spans(segs), [[0, 200], [200, 500]]));

  const empty = segmentLesson([]);
  check('空事件 → 一段 [0,0]', empty.length === 1 && empty[0].startSec === 0 && empty[0].endSec === 0);

  const atEnd = segmentLesson([ev('marker', 'end_segment', 500), ev('system', 'class_ended', 500)]);
  check('邊界恰在下課 → 不留空尾段', atEnd.length === 1 && atEnd[0].endSec === 500, JSON.stringify(spans(atEnd)));
}

console.log('\n[8] lessonEndSec option & tunables');
{
  const segs = segmentLesson([ev('marker', 'start_new_topic', 100)], { lessonEndSec: 400 });
  check('未收到 class_ended 時用 lessonEndSec 收尾', segs[segs.length - 1].endSec === 400);
  const custom = segmentLesson([ev('system', 'class_ended', 400)], { maxSegmentSec: 200 });
  check('maxSegmentSec 可調', eq(spans(custom), [[0, 200], [200, 400]]));
}

console.log('');
if (failed === 0) console.log(`✅ segmenter 全數通過(${passed} 項)`);
else console.log(`❌ segmenter 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
