#!/usr/bin/env node
/**
 * lib/interactionsStore.ts — offline test (no AWS).
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-interactions-store.mjs
 *
 * Locks: one row per deduped tag, collision-free interactionId (tag in the key),
 * 30-day TTL, and 25-item BatchWrite chunking with no duplicate keys per request.
 */
import { buildInteractionItems, putInteractions } from '../lib/interactionsStore.ts';
import { ddbDocClient } from '../lib/dynamo.ts';

let failed = 0, passed = 0;
const check = (l, c, d = '') => {
  if (c) { passed++; console.log(`  ✅ ${l}`); }
  else { failed++; console.log(`  ❌ ${l}${d ? `  (${d})` : ''}`); }
};

console.log('[1] one row per tag, distinct interactionId');
{
  const items = buildInteractionItems({
    userId: 'u1', kind: 'click', courseId: 'c9', tags: ['math', 'physics', 'exam'],
    weight: 0.5, source: 'click_homepage', now: 1_000,
  });
  check('3 rows', items.length === 3, String(items.length));
  const ids = new Set(items.map((i) => i.interactionId));
  check('3 distinct ids (no collision within batch)', ids.size === 3, [...ids].join(','));
  check('id embeds tag', items[0].interactionId === 'click_c9_1000_math', items[0].interactionId);
  check('weight + source carried', items[0].weight === 0.5 && items[0].source === 'click_homepage');
  const ttlDays = (new Date(items[0].expiresAt) - new Date(items[0].createdAt)) / 86_400_000;
  check('30-day TTL', Math.round(ttlDays) === 30, String(ttlDays));
}

console.log('\n[2] dedupe + non-string + empty guards');
{
  const dup = buildInteractionItems({ userId: 'u1', kind: 'feedback', courseId: 'c1', tags: ['a', 'a', 'b', 42, null, ''], weight: 0.3, source: 'feedback_like', now: 5 });
  check('deduped to 2', dup.length === 2, String(dup.length));
  check('no userId → []', buildInteractionItems({ userId: '', kind: 'click', courseId: 'c1', tags: ['a'], weight: 1, source: 's' }).length === 0);
  check('no tags → []', buildInteractionItems({ userId: 'u', kind: 'click', courseId: 'c1', tags: [], weight: 1, source: 's' }).length === 0);
  check('tags not array → []', buildInteractionItems({ userId: 'u', kind: 'click', courseId: 'c1', tags: 'nope', weight: 1, source: 's' }).length === 0);
}

console.log('\n[3] putInteractions chunks at 25, no dup keys per request');
{
  const sent = [];
  const orig = ddbDocClient.send;
  ddbDocClient.send = async (cmd) => { sent.push(cmd.input); return {}; };
  try {
    const tags = Array.from({ length: 60 }, (_, i) => `t${i}`);
    const items = buildInteractionItems({ userId: 'u1', kind: 'purchase', courseId: 'c1', tags, weight: 2, source: 'purchase_points', now: 7 });
    const n = await putInteractions(items);
    check('60 items written', n === 60, String(n));
    check('3 BatchWrite calls (25+25+10)', sent.length === 3, String(sent.length));
    let maxChunk = 0, anyDup = false;
    for (const input of sent) {
      const reqs = Object.values(input.RequestItems)[0];
      maxChunk = Math.max(maxChunk, reqs.length);
      const keys = reqs.map((r) => `${r.PutRequest.Item.userId}|${r.PutRequest.Item.interactionId}`);
      if (new Set(keys).size !== keys.length) anyDup = true;
    }
    check('no chunk exceeds 25', maxChunk <= 25, String(maxChunk));
    check('no duplicate keys in any request', !anyDup);
    check('empty items → 0 calls', (sent.length = sent.length) && (await putInteractions([])) === 0);
  } finally {
    ddbDocClient.send = orig;
  }
}

console.log('');
if (failed === 0) console.log(`✅ interactions-store 全數通過(${passed} 項)`);
else console.log(`❌ interactions-store 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
