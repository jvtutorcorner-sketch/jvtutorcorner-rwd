#!/usr/bin/env node
/**
 * L1 go/no-go harness pure logic — offline test (NO network, NO paid call).
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-l1-harness.mjs
 *
 * Covers the L1 prompt/parse, mixed zh/en WER, and the pass/fail verdict — the
 * parts the harness relies on. The real audio call is exercised only by running
 * scripts/l1-go-no-go.mjs --go (gated, your consent).
 */
import { buildL1Prompt, parseL1Response, L1_EVENT_TYPES } from '../lib/lessonAI/l1Prompt.ts';
import { tokenizeMixed, werMixed, editDistance } from '../lib/lessonAI/wer.ts';
import { l1Verdict, DEFAULT_L1_THRESHOLDS } from '../lib/lessonAI/l1Verdict.ts';

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
const approx = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

console.log('[1] buildL1Prompt');
{
  const p = buildL1Prompt({ segmentSeconds: 60 });
  check('含 transcript+events JSON 格式', p.includes('"transcript"') && p.includes('"events"'));
  check('列出合法事件型別', L1_EVENT_TYPES.every((t) => p.includes(t)));
  check('含脈絡時帶入', buildL1Prompt({ contextSummary: '前段講了向量' }).includes('向量'));
}

console.log('\n[2] parseL1Response');
{
  const ok = parseL1Response('{"transcript":"你好 hello","events":[{"type":"qa","offsetSec":12,"confidence":0.9}]}');
  check('解析 transcript + events', ok && ok.transcript === '你好 hello' && ok.events.length === 1 && ok.events[0].type === 'qa');
  check('fenced ```json``` 可解析', !!parseL1Response('```json\n{"transcript":"x","events":[]}\n```'));
  check('壞 JSON → null', parseL1Response('not json') === null);
  check('transcript+events 皆空 → null', parseL1Response('{"transcript":"","events":[]}') === null);
  const norm = parseL1Response('{"transcript":"t","events":[{"type":"bogus","offsetSec":5},{"type":"confusion","offsetSec":-3,"confidence":9}]}');
  check('丟棄非法事件型別、夾 offset/confidence', norm.events.length === 1 && norm.events[0].type === 'confusion' && norm.events[0].offsetSec === 0 && norm.events[0].confidence === 1);
  check('缺 confidence → 預設 0.5', parseL1Response('{"transcript":"t","events":[{"type":"explanation","offsetSec":1}]}').events[0].confidence === 0.5);
}

console.log('\n[3] tokenizeMixed + WER');
{
  check('中文逐字、英文逐詞、去標點', JSON.stringify(tokenizeMixed('你好, hello world!')) === JSON.stringify(['你', '好', 'hello', 'world']));
  check('大小寫正規化', JSON.stringify(tokenizeMixed('Vector 向量')) === JSON.stringify(['vector', '向', '量']));
  check('editDistance 基本', editDistance(['a', 'b', 'c'], ['a', 'x', 'c']) === 1);
  check('完全相同 → WER 0', werMixed('今天教 vector', '今天教 vector').wer === 0);
  const w = werMixed('今天教 vector 這個概念', '今天教 vektor 這個概念');
  check('一個英文詞錯 → WER = 1/refLen', approx(w.wer, 1 / w.refLen), `${w.wer} refLen=${w.refLen}`);
  check('空 ref + 有 hyp → WER 1', werMixed('', '有字').wer === 1);
  check('空 ref + 空 hyp → WER 0', werMixed('', '').wer === 0);
}

console.log('\n[4] l1Verdict');
{
  const good = [
    { file: 's0', decoded: true, wer: 0.1, costMusd: 800, latencyMs: 5000, events: 2 },
    { file: 's1', decoded: true, wer: 0.2, costMusd: 900, latencyMs: 8000, events: 1 },
  ];
  check('全達標 → pass', l1Verdict(good, DEFAULT_L1_THRESHOLDS).pass === true);
  check('有段未獨立解碼 → fail', l1Verdict([{ file: 's1', decoded: false }], DEFAULT_L1_THRESHOLDS).pass === false);
  check('WER 超標 → fail', l1Verdict([{ file: 's0', decoded: true, wer: 0.9 }], DEFAULT_L1_THRESHOLDS).pass === false);
  check('成本超標 → fail', l1Verdict([{ file: 's0', decoded: true, costMusd: 5000 }], DEFAULT_L1_THRESHOLDS).pass === false);
  check('延遲超標 → fail', l1Verdict([{ file: 's0', decoded: true, latencyMs: 99999 }], DEFAULT_L1_THRESHOLDS).pass === false);
  check('無段 → fail', l1Verdict([], DEFAULT_L1_THRESHOLDS).pass === false);
  check('fail 帶原因', l1Verdict([{ file: 's0', decoded: false }], DEFAULT_L1_THRESHOLDS).reasons.length > 0);
}

console.log('');
if (failed === 0) console.log(`✅ l1 harness 全數通過(${passed} 項)`);
else console.log(`❌ l1 harness 有 ${failed} 項失敗(通過 ${passed})`);
process.exit(failed === 0 ? 0 : 1);
