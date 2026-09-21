// Offline checks for lib/realtime/connectionPolicy.ts (no timers / DOM / network).
//   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-rtc-connection-policy.mjs
import assert from 'node:assert/strict';

const { initialPolicyState, nextConnectionAction, backoffDelay, DEFAULT_POLICY } = await import(
  '../lib/realtime/connectionPolicy.ts'
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

check('connected resets all counters', () => {
  const prev = { phase: 'recovering', iceRestarts: 2, rejoins: 1, attemptStartedAt: 5, lastAction: 'rejoin' };
  const { state, action } = nextConnectionAction(prev, { pcState: 'connected', now: 100 });
  assert.equal(action.type, 'none');
  assert.equal(state.phase, 'stable');
  assert.equal(state.iceRestarts, 0);
  assert.equal(state.rejoins, 0);
});

check('failed → ice-restart first', () => {
  const { state, action } = nextConnectionAction(initialPolicyState(), { pcState: 'failed', now: 0 });
  assert.equal(action.type, 'ice-restart');
  assert.equal(state.phase, 'recovering');
  assert.equal(state.iceRestarts, 1);
});

check('ice-restart exhausted → rejoin', () => {
  let s = initialPolicyState();
  // two ice-restart failures
  let r = nextConnectionAction(s, { pcState: 'failed', now: 0 });
  r = nextConnectionAction(r.state, { pcState: 'failed', now: 1, attemptResult: 'failure' });
  assert.equal(r.action.type, 'ice-restart'); // second restart
  r = nextConnectionAction(r.state, { pcState: 'failed', now: 2, attemptResult: 'failure' });
  assert.equal(r.action.type, 'rejoin');
  assert.equal(r.state.rejoins, 1);
});

check('rejoins exhausted → give-up (Agora fallback)', () => {
  let r = { state: { phase: 'recovering', iceRestarts: 2, rejoins: 3, attemptStartedAt: 0, lastAction: 'rejoin' } };
  r = nextConnectionAction(r.state, { pcState: 'failed', now: 10, attemptResult: 'failure' });
  assert.equal(r.action.type, 'give-up');
  assert.equal(r.state.phase, 'dead');
});

check('dead state stays quiet', () => {
  const dead = { phase: 'dead', iceRestarts: 2, rejoins: 3, attemptStartedAt: 0, lastAction: 'give-up' };
  const { action } = nextConnectionAction(dead, { pcState: 'failed', now: 99 });
  assert.equal(action.type, 'none');
});

check('disconnected waits out grace before acting', () => {
  const s0 = initialPolicyState();
  const r1 = nextConnectionAction(s0, { pcState: 'disconnected', now: 0 });
  assert.equal(r1.action.type, 'none'); // grace started
  assert.equal(r1.state.phase, 'recovering');
  const r2 = nextConnectionAction(r1.state, { pcState: 'disconnected', now: 1000 });
  assert.equal(r2.action.type, 'none'); // still within 3s grace
  const r3 = nextConnectionAction(r1.state, { pcState: 'disconnected', now: 3500 });
  assert.equal(r3.action.type, 'ice-restart'); // grace elapsed
});

check('ice-restart that never returns escalates after timeout', () => {
  const s = initialPolicyState();
  const r1 = nextConnectionAction(s, { pcState: 'failed', now: 0 }); // ice-restart at t=0
  // still not connected, no explicit result, past the 10s restart timeout
  const r2 = nextConnectionAction(r1.state, { pcState: 'disconnected', now: 11000 });
  assert.equal(r2.action.type, 'ice-restart'); // second restart (budget 2)
});

check('iceRestartSupported=false skips straight to rejoin', () => {
  const cfg = { ...DEFAULT_POLICY, iceRestartSupported: false };
  const { action } = nextConnectionAction(initialPolicyState(), { pcState: 'failed', now: 0 }, cfg);
  assert.equal(action.type, 'rejoin');
});

check('backoff grows and caps', () => {
  assert.equal(backoffDelay(0), 1000);
  assert.equal(backoffDelay(1), 2000);
  assert.equal(backoffDelay(2), 4000);
  assert.equal(backoffDelay(20), 30000); // capped
});

console.log(`\nrtc-connection-policy verify: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
