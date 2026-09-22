#!/usr/bin/env node
/**
 * Recorder segment metadata — offline test.
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-recorder-rotation.mjs
 *
 * Proves segmentMeta computes seq + startMs from each segment's ACTUAL start
 * timestamp (correct for a short final segment), and contrasts it with the old
 * buggy formula it replaces.
 */
import { segmentMeta, SEGMENT_MS } from '../lib/classroom/recorderRotation.ts';

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

const t0 = 1_000_000; // recording start
console.log('[1] seq + startMs from actual segment start');
{
  const s0 = segmentMeta(t0, t0, 0);
  const s1 = segmentMeta(t0, t0 + SEGMENT_MS, 1);
  const s2 = segmentMeta(t0, t0 + 2 * SEGMENT_MS, 2);
  check('seq 單調 0,1,2', s0.seq === 0 && s1.seq === 1 && s2.seq === 2);
  check('startMs = 0 / 60000 / 120000', s0.startMs === 0 && s1.startMs === 60000 && s2.startMs === 120000, `${s0.startMs},${s1.startMs},${s2.startMs}`);
  check('startMs 單調遞增', s0.startMs < s1.startMs && s1.startMs < s2.startMs);
}

console.log('\n[2] short final segment');
{
  // A last segment that starts on schedule but runs only 12s before the class ends.
  const segStart = t0 + 3 * SEGMENT_MS;
  const meta = segmentMeta(t0, segStart, 3);
  check('末段 startMs = 180000(依實際起點,不受長度影響)', meta.startMs === 180000, String(meta.startMs));

  // The OLD formula computed startMs at UPLOAD time as (now - start - SEGMENT_MS).
  // For a 12s final segment uploaded at segStart+12000 that gives a WRONG value.
  const uploadNow = segStart + 12_000;
  const buggy = Math.max(0, uploadNow - t0 - SEGMENT_MS); // = 180000+12000-60000 = 132000
  check('舊公式對末段算錯(132000 ≠ 正確 180000)', buggy === 132000 && buggy !== meta.startMs, String(buggy));
}

console.log('\n[3] clamps + rounding');
{
  check('segmentStart 早於 recordingStart → 夾 0', segmentMeta(t0, t0 - 5000, 0).startMs === 0);
  check('毫秒四捨五入', segmentMeta(t0, t0 + 1000.6, 0).startMs === 1001);
  check('seq 取整非負', segmentMeta(t0, t0, -3).seq === 0);
  check('SEGMENT_MS = 60000', SEGMENT_MS === 60000);
}

console.log('');
if (failed === 0) console.log(`✅ recorder rotation 全數通過(${passed} 項)`);
else console.log(`❌ recorder rotation 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
