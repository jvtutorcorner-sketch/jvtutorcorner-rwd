#!/usr/bin/env node
/**
 * 畫線壓測規劃（e2e/helpers/draw_plan.ts）純函式回歸測試
 * ====================================================
 *
 * draw_workload.ts 的正確性取決於這些數學：筆畫是否真的落在格子內、
 * 點密度是否符合 DRAW_PPS、老師→學生座標轉換是否算對、百分位數與
 * 掉筆判定是否正確。這裡不開瀏覽器、不連網路，直接驗證。
 *
 * 用法：
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-draw-plan.mjs
 *
 * 退出碼：0 = 全部通過；1 = 有失敗。
 */

const plan = await import('../e2e/helpers/draw_plan.ts');
const {
  DEFAULT_STROKE_SHAPE, classifyHits, createRng, fitAreaToStudent, gridCells, hashSeed,
  insetRect, mapPoint, percentile, planRound, planStrokeInCell, rectContains,
  similarityResidual, solveSimilarity, summarizeLatencies,
} = plan;

let failed = 0;
let passed = 0;
function check(label, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${detail ? `  (${detail})` : ''}`); }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

console.log('\n[rng]');
{
  const a = createRng(42); const b = createRng(42); const c = createRng(43);
  const sa = Array.from({ length: 5 }, a); const sb = Array.from({ length: 5 }, b); const sc = Array.from({ length: 5 }, c);
  check('同 seed 產生相同序列', JSON.stringify(sa) === JSON.stringify(sb));
  check('不同 seed 產生不同序列', JSON.stringify(sa) !== JSON.stringify(sc));
  check('值域在 [0,1)', sa.every((v) => v >= 0 && v < 1));
  check('hashSeed 決定性', hashSeed('group-3') === hashSeed('group-3') && hashSeed('group-3') !== hashSeed('group-4'));
}

console.log('\n[grid]');
{
  const area = { x: 100, y: 50, w: 800, h: 400 };
  const cells = gridCells(area, 10);
  check('格子數 ≥ 要求數', cells.length >= 10, `cells=${cells.length}`);
  const union = cells.reduce((s, c) => s + c.w * c.h, 0);
  check('格子面積總和等於區域面積', near(union, area.w * area.h, 1e-3));
  let overlap = false;
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const A = cells[i], B = cells[j];
    if (A.x < B.x + B.w - 1e-9 && B.x < A.x + A.w - 1e-9 && A.y < B.y + B.h - 1e-9 && B.y < A.y + A.h - 1e-9) overlap = true;
  }
  check('格子互不重疊', !overlap);
}

console.log('\n[stroke]');
{
  const cell = { x: 200, y: 100, w: 180, h: 120 };
  let allInside = true, samplesInside = true, densityOk = true, endpointsExact = true;
  let minPts = Infinity;
  for (let s = 0; s < 200; s++) {
    const rng = createRng(1000 + s);
    const st = planStrokeInCell(rng, cell, { ...DEFAULT_STROKE_SHAPE, pointsPerSecond: 80 }, `s${s}`, 0);
    if (!st.points.every((p) => rectContains(cell, p))) allInside = false;
    if (!st.samples.every((p) => rectContains(cell, p))) samplesInside = false;
    const expected = Math.max(DEFAULT_STROKE_SHAPE.minPoints, Math.round((st.durationMs / 1000) * 80));
    if (st.points.length !== expected) densityOk = false;
    if (st.samples.length !== DEFAULT_STROKE_SHAPE.sampleCount) endpointsExact = false;
    minPts = Math.min(minPts, st.points.length);
  }
  check('200 筆筆畫的所有指標點都在格子內', allInside);
  check('驗證取樣點都在格子內', samplesInside);
  check('點數 = max(minPoints, 時長 × pps)', densityOk);
  check('取樣點數符合設定', endpointsExact);
  check(`每筆至少 ${DEFAULT_STROKE_SHAPE.minPoints} 點`, minPts >= DEFAULT_STROKE_SHAPE.minPoints, `min=${minPts}`);

  const rng1 = createRng(7), rng2 = createRng(7);
  const s1 = planStrokeInCell(rng1, cell, DEFAULT_STROKE_SHAPE, 'x', 0);
  const s2 = planStrokeInCell(rng2, cell, DEFAULT_STROKE_SHAPE, 'x', 0);
  check('同 seed 筆畫完全相同（可重現）', JSON.stringify(s1) === JSON.stringify(s2));

  const fast = planStrokeInCell(createRng(9), cell, { ...DEFAULT_STROKE_SHAPE, pointsPerSecond: 240 }, 'f', 0);
  const slow = planStrokeInCell(createRng(9), cell, { ...DEFAULT_STROKE_SHAPE, pointsPerSecond: 40 }, 'f', 0);
  check('pps 越高點越密（240 pps 點數 > 40 pps）', fast.points.length > slow.points.length, `${fast.points.length} vs ${slow.points.length}`);
}

console.log('\n[round]');
{
  const cells = gridCells({ x: 0, y: 0, w: 900, h: 500 }, 10);
  const r0 = planRound(123, 0, cells, 10);
  const r0b = planRound(123, 0, cells, 10);
  const r1 = planRound(123, 1, cells, 10);
  check('一回合 10 筆', r0.length === 10);
  check('同 seed/round 可重現', JSON.stringify(r0) === JSON.stringify(r0b));
  check('不同 round 規劃不同', JSON.stringify(r0) !== JSON.stringify(r1));
  const cellKeys = new Set(r0.map((s) => JSON.stringify(s.cell)));
  check('同回合每筆使用不同格子（不重疊）', cellKeys.size === r0.length);
  check('格子不足時筆數被限制', planRound(1, 0, cells.slice(0, 3), 10).length === 3);
}

console.log('\n[similarity]');
{
  const truth = { scale: 0.8, tx: 37, ty: -12 };
  const tA = { x: 300, y: 250 }, tB = { x: 700, y: 480 };
  const sA = mapPoint(truth, tA), sB = mapPoint(truth, tB);
  const solved = solveSimilarity(tA, tB, sA, sB);
  check('解出的 scale 正確', near(solved.scale, truth.scale, 1e-9), JSON.stringify(solved));
  check('解出的平移正確', near(solved.tx, truth.tx, 1e-6) && near(solved.ty, truth.ty, 1e-6));
  check('殘差為 0', similarityResidual(solved, [[tA, sA], [tB, sB]]) < 1e-6);
  const p = { x: 512, y: 333 };
  const m = mapPoint(solved, p), e = mapPoint(truth, p);
  check('任意點映射一致', near(m.x, e.x, 1e-6) && near(m.y, e.y, 1e-6));
  let threw = false;
  try { solveSimilarity(tA, { x: 300.2, y: 250.2 }, sA, sB); } catch { threw = true; }
  check('兩個校正點太近時拋錯', threw);

  const noisyB = { x: sB.x + 2, y: sB.y - 1 };
  const noisy = solveSimilarity(tA, tB, sA, noisyB);
  check('校正點有 2px 雜訊時殘差仍 < 3px', similarityResidual(noisy, [[tA, sA], [tB, noisyB]]) < 3);
}

console.log('\n[fitArea]');
{
  const t = { scale: 0.5, tx: 100, ty: 50 };
  const teacherArea = { x: 0, y: 0, w: 1000, h: 600 };
  const studentBounds = { x: 150, y: 100, w: 300, h: 150 };
  const fitted = fitAreaToStudent(teacherArea, t, studentBounds);
  const corners = [
    { x: fitted.x, y: fitted.y }, { x: fitted.x + fitted.w, y: fitted.y },
    { x: fitted.x, y: fitted.y + fitted.h }, { x: fitted.x + fitted.w, y: fitted.y + fitted.h },
  ].map((c) => mapPoint(t, c));
  const inside = corners.every((c) => c.x >= studentBounds.x - 1e-6 && c.x <= studentBounds.x + studentBounds.w + 1e-6 && c.y >= studentBounds.y - 1e-6 && c.y <= studentBounds.y + studentBounds.h + 1e-6);
  check('縮小後區域映射到學生端完全在畫布內', inside, JSON.stringify(fitted));
  check('縮小後區域仍在老師區域內', fitted.x >= 0 && fitted.y >= 0 && fitted.x + fitted.w <= 1000 && fitted.y + fitted.h <= 600);
  const inset = insetRect({ x: 0, y: 0, w: 100, h: 50 }, 10);
  check('insetRect 正確', inset.x === 10 && inset.y === 10 && inset.w === 80 && inset.h === 30);
}

console.log('\n[stats]');
{
  check('percentile 空集合回 null', percentile([], 95) === null);
  const v = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
  check('p50 = 50（nearest-rank）', percentile(v, 50) === 50);
  check('p95 = 95', percentile(v, 95) === 95);
  check('p100 = max', percentile(v, 100) === 100);
  check('不會改動輸入陣列', JSON.stringify(v.slice(0, 3)) === '[1,2,3]');
  const s = summarizeLatencies([300, 100, 200]);
  check('summarize 計數/最大值', s.count === 3 && s.maxMs === 300 && s.p50Ms === 200);
}

console.log('\n[classifyHits]');
{
  const all = [true, true, true, true, true];
  check('全部取樣有墨 → synced', classifyHits(all, all.map(() => true), 0.8).synced);
  check('4/5 = 0.8 → synced', classifyHits([true, true, true, true, false], [true, true, true, true, true], 0.8).synced);
  check('3/5 = 0.6 → 未同步', !classifyHits([true, true, true, false, false], [true, true, true, true, true], 0.8).synced);
  const bg = classifyHits([true, true, false, false, false], [false, false, true, true, true], 0.8);
  check('背景已有墨的取樣點不計入（避免 PDF 背景假陽性）', bg.eligibleCount === 3 && bg.inkedCount === 0 && !bg.synced);
  check('沒有可用取樣點 → 不算 synced', !classifyHits([true, true], [false, false], 0.8).synced);
}

console.log('');
if (failed === 0) {
  console.log(`✅ draw_plan 純函式回歸測試全數通過（${passed} 項）`);
  process.exit(0);
}
console.log(`❌ draw_plan 純函式回歸測試有 ${failed} 項失敗（通過 ${passed} 項）`);
process.exit(1);
