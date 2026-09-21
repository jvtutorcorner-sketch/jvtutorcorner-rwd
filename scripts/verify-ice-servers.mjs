// Offline checks for lib/realtime/ice.ts (no network / DOM).
//   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-ice-servers.mjs
import assert from 'node:assert/strict';

const { analyzeIceServers, ensureTransportCoverage, normalizeIce, CF_TURN_HOST } = await import(
  '../lib/realtime/ice.ts'
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

const CRED = { username: 'u', credential: 'c' };
const fullTurn = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: ['turn:turn.cloudflare.com:3478?transport=udp'], ...CRED },
  { urls: ['turn:turn.cloudflare.com:3478?transport=tcp'], ...CRED },
  { urls: ['turns:turn.cloudflare.com:443?transport=tcp'], ...CRED },
];

check('analyze detects all three transports + credential', () => {
  const a = analyzeIceServers(fullTurn);
  assert.equal(a.hasTurn, true);
  assert.deepEqual(a.transports, { udp: true, tcp: true, tls443: true });
  assert.equal(a.username, 'u');
  assert.equal(a.credential, 'c');
});

check('STUN-only is not TURN and stays degraded', () => {
  const a = analyzeIceServers([{ urls: 'stun:stun.cloudflare.com:3478' }]);
  assert.equal(a.hasTurn, false);
  const n = normalizeIce([{ urls: 'stun:stun.cloudflare.com:3478' }]);
  assert.equal(n.degraded, true);
});

check('turns on :5349 does NOT count as tls443', () => {
  const a = analyzeIceServers([{ urls: 'turns:turn.cloudflare.com:5349?transport=tcp', ...CRED }]);
  assert.equal(a.transports.tls443, false);
  assert.equal(a.hasTurn, true);
});

check('ensureTransportCoverage synthesizes missing 443 path', () => {
  const partial = [{ urls: ['turn:turn.cloudflare.com:3478?transport=udp'], ...CRED }];
  const covered = ensureTransportCoverage(partial);
  const a = analyzeIceServers(covered);
  assert.equal(a.transports.udp, true);
  assert.equal(a.transports.tcp, true);
  assert.equal(a.transports.tls443, true);
  // synthesized entries reuse the same credential on the fixed CF host
  const added = covered[covered.length - 1];
  assert.equal(added.username, 'u');
  assert.equal(added.credential, 'c');
  assert.equal(JSON.stringify(added.urls).includes(CF_TURN_HOST), true);
});

check('ensureTransportCoverage is a no-op when already complete', () => {
  const covered = ensureTransportCoverage(fullTurn);
  assert.equal(covered.length, fullTurn.length);
});

check('ensureTransportCoverage cannot fabricate TURN without a credential', () => {
  const stun = [{ urls: 'stun:stun.cloudflare.com:3478' }];
  assert.deepEqual(ensureTransportCoverage(stun), stun);
});

check('normalizeIce reports full coverage as not degraded', () => {
  const n = normalizeIce([{ urls: ['turn:turn.cloudflare.com:3478?transport=udp'], ...CRED }]);
  assert.equal(n.degraded, false);
  assert.equal(n.transports.tls443, true); // synthesized
});

check('empty input → STUN-only, degraded', () => {
  const n = normalizeIce([]);
  assert.equal(n.degraded, true);
  assert.equal(n.iceServers.length >= 1, true);
});

console.log(`\nice-servers verify: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
