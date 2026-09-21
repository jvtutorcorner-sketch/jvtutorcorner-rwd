// Offline checks for lib/realtime/qualityPolicy.ts (no WebRTC / DOM).
//   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-rtc-quality-policy.mjs
import assert from 'node:assert/strict';

const { initialQualityState, nextQuality, classifySample, rungParams, DEFAULT_QUALITY } = await import(
  '../lib/realtime/qualityPolicy.ts'
);

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

const good = { rttMs: 50, packetLoss: 0, availableBitrate: 2_000_000, limitation: 'none', freezes: 0 };
const bad = { rttMs: 500, packetLoss: 0.1, availableBitrate: 100_000, limitation: 'bandwidth', freezes: 1 };
const neutral = { rttMs: 300, packetLoss: 0.03, availableBitrate: 800_000, limitation: 'none', freezes: 0 };

check('classify good / bad / neutral', () => {
  assert.equal(classifySample(good), 'good');
  assert.equal(classifySample(bad), 'bad');
  assert.equal(classifySample(neutral), 'neutral');
});

check('two bad samples downgrade one rung', () => {
  let s = initialQualityState('high');
  let r = nextQuality(s, bad);
  assert.equal(r.changed, false); // one bad only
  r = nextQuality(r.state, bad);
  assert.equal(r.changed, true);
  assert.equal(r.state.rung, 'medium');
  assert.equal(r.state.auto, true);
});

check('sustained bad walks down to audio-only and stops', () => {
  let s = initialQualityState('high');
  for (let i = 0; i < 20; i++) s = nextQuality(s, bad).state;
  assert.equal(s.rung, 'audio-only');
  // further bad samples cannot go lower
  const r = nextQuality(s, bad);
  assert.equal(r.changed, false);
  assert.equal(r.state.rung, 'audio-only');
});

check('recovery is slow (needs upgradeAfter good samples)', () => {
  let s = { rung: 'low', badStreak: 0, goodStreak: 0, auto: true };
  for (let i = 0; i < DEFAULT_QUALITY.upgradeAfter - 1; i++) s = nextQuality(s, good).state;
  assert.equal(s.rung, 'low'); // not yet
  const r = nextQuality(s, good);
  assert.equal(r.changed, true);
  assert.equal(r.state.rung, 'medium');
});

check('a bad sample resets the good streak', () => {
  let s = { rung: 'low', badStreak: 0, goodStreak: 10, auto: true };
  s = nextQuality(s, bad).state;
  assert.equal(s.goodStreak, 0);
  assert.equal(s.badStreak, 1);
});

check('manual ceiling caps recovery', () => {
  let s = { rung: 'low', badStreak: 0, goodStreak: 0, auto: true };
  // ceiling = medium: even with endless good samples we never reach high
  for (let i = 0; i < 100; i++) s = nextQuality(s, good, 'medium').state;
  assert.equal(s.rung, 'medium');
});

check('rungParams: audio-only disables video, high has highest bitrate', () => {
  assert.equal(rungParams('audio-only').video, false);
  assert.equal(rungParams('audio-only').maxBitrate, null);
  assert.equal(rungParams('high').maxBitrate > rungParams('low').maxBitrate, true);
  assert.equal(rungParams('low').scaleResolutionDownBy, 2);
});

console.log(`\nrtc-quality-policy verify: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
