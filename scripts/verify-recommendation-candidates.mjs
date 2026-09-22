#!/usr/bin/env node
/**
 * lib/recommendationCandidates.ts — offline test (pure; no AWS).
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-recommendation-candidates.mjs
 *
 * Locks toCourseCandidate normalisation over DynamoDB-shaped records (missing
 * tags, null seats, createdAt fallback) and the seatsOccupied-first popularity.
 */
import { toCourseCandidate, computePopularity } from '../lib/recommendationCandidates.ts';

let failed = 0, passed = 0;
const check = (l, c, d = '') => { if (c) { passed++; console.log(`  ✅ ${l}`); } else { failed++; console.log(`  ❌ ${l}${d ? `  (${d})` : ''}`); } };

console.log('[1] toCourseCandidate normalisation');
{
  const cand = toCourseCandidate({ id: 'c1', title: '國中英文', subject: '英文', tags: ['grammar', 'exam'], seatsOccupied: 12, pointCost: 20, nextStartDate: '2026-10-01' });
  check('category 取 subject', cand.category === '英文', cand.category);
  check('tags 含原 tags + subject 衍生 tag', cand.tags.includes('grammar') && cand.tags.length >= 2);
  check('createdAt fallback 用 nextStartDate', cand.createdAt === '2026-10-01', String(cand.createdAt));
  check('攜帶 pointCost/seatsOccupied 供卡片渲染', cand.pointCost === 20 && cand.seatsOccupied === 12);
}
{
  // missing tags, no subject, no createdAt/nextStartDate
  const cand = toCourseCandidate({ id: 'c2', title: '', category: '數學' });
  check('缺 tags → 陣列(可能為空或僅 subject 衍生)', Array.isArray(cand.tags));
  check('category 用 category 欄位', cand.category === '數學');
  check('id 轉字串', cand.id === 'c2');
}
{
  const cand = toCourseCandidate({ id: 3, tags: 'not-an-array' });
  check('非陣列 tags → 不炸,回陣列', Array.isArray(cand.tags));
  check('數字 id → 字串', cand.id === '3');
  check('缺 subject/category → 其他', cand.category === '其他', cand.category);
}

console.log('\n[2] computePopularity: seatsOccupied first');
{
  const pop = computePopularity([
    { id: 'a', seatsOccupied: 10 },
    { id: 'b', seatsOccupied: 5 },
    { id: 'c', seatsOccupied: 0 },
    { id: 'd' }, // no signal → neutral 0.5
  ]);
  check('最熱門 = 1', pop.get('a') === 1, String(pop.get('a')));
  check('中間比例正確 (5/10=0.5)', pop.get('b') === 0.5, String(pop.get('b')));
  check('0 報名 → 0', pop.get('c') === 0, String(pop.get('c')));
  check('無 seatsOccupied → 0.5', pop.get('d') === 0.5, String(pop.get('d')));
}

console.log('\n[3] computePopularity: seatsLeft inversion fallback');
{
  const pop = computePopularity([
    { id: 'a', seatsLeft: 0 },   // fewest left → most popular = 1
    { id: 'b', seatsLeft: 10 },  // most left → least popular = 0
    { id: 'c', seatsLeft: null }, // no numeric → 0.5
  ]);
  check('seatsLeft 0 → 1', pop.get('a') === 1, String(pop.get('a')));
  check('seatsLeft 10 → 0', pop.get('b') === 0, String(pop.get('b')));
  check('seatsLeft null → 0.5', pop.get('c') === 0.5, String(pop.get('c')));
}

console.log('\n[4] no signal at all → empty map');
check('全無 seats 欄位 → 空 map', computePopularity([{ id: 'x' }, { id: 'y' }]).size === 0);

console.log('');
if (failed === 0) console.log(`✅ recommendation-candidates 全數通過(${passed} 項)`);
else console.log(`❌ recommendation-candidates 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
