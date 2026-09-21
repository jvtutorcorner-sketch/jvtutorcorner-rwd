// Offline checks for lib/whiteboard/rtcProtocol.ts (no DOM / network / DB).
//   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-whiteboard-rtc.mjs
import assert from 'node:assert/strict';

const {
  electOfferer,
  encodePointsDelta,
  applyPointsDelta,
  chunkState,
  assembleState,
  mergeStateById,
  reduceMailbox,
  CTL_LABEL,
  PTS_LABEL,
  MAILBOX_CAP,
} = await import('../lib/whiteboard/rtcProtocol.ts');

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

// ── electOfferer ────────────────────────────────────────────────────────────
check('teacher offers vs student', () => {
  assert.equal(electOfferer({ selfRole: 'teacher', selfId: 'a', peerRole: 'student', peerId: 'b' }), true);
  assert.equal(electOfferer({ selfRole: 'student', selfId: 'b', peerRole: 'teacher', peerId: 'a' }), false);
});
check('exactly one offerer for teacher/student pair', () => {
  const t = electOfferer({ selfRole: 'teacher', selfId: 't', peerRole: 'student', peerId: 's' });
  const s = electOfferer({ selfRole: 'student', selfId: 's', peerRole: 'teacher', peerId: 't' });
  assert.equal(t && !s, true);
});
check('same role → lexicographic id, exactly one offerer', () => {
  const a = electOfferer({ selfRole: 'teacher', selfId: 'aaa', peerRole: 'teacher', peerId: 'zzz' });
  const b = electOfferer({ selfRole: 'teacher', selfId: 'zzz', peerRole: 'teacher', peerId: 'aaa' });
  assert.equal(a, true);
  assert.equal(b, false);
  assert.equal(a !== b, true);
});
check('two editable peers (teacher+assistant) → exactly one offers', () => {
  const t = electOfferer({ selfRole: 'teacher', selfId: 't', peerRole: 'assistant', peerId: 'x' });
  const x = electOfferer({ selfRole: 'assistant', selfId: 'x', peerRole: 'teacher', peerId: 't' });
  assert.equal(t && !x, true);
});
check('unknown peer → only teacher offers', () => {
  assert.equal(electOfferer({ selfRole: 'teacher', selfId: 't' }), true);
  assert.equal(electOfferer({ selfRole: 'student', selfId: 's' }), false);
  assert.equal(electOfferer({ selfRole: 'assistant', selfId: 'a' }), false);
});

// ── points delta ─────────────────────────────────────────────────────────────
check('encode only the tail beyond fromIndex', () => {
  const d = encodePointsDelta('s1', [0, 0, 1, 1, 2, 2], 2);
  assert.deepEqual(d, { type: 'pts', strokeId: 's1', from: 2, pts: [1, 1, 2, 2] });
  assert.equal(encodePointsDelta('s1', [0, 0], 2), null); // nothing new
});
check('apply contiguous delta', () => {
  const r = applyPointsDelta([0, 0], { type: 'pts', strokeId: 's', from: 2, pts: [1, 1] });
  assert.deepEqual(r, { points: [0, 0, 1, 1], gap: false, applied: true });
});
check('apply detects gap (from beyond local)', () => {
  const r = applyPointsDelta([0, 0], { type: 'pts', strokeId: 's', from: 4, pts: [2, 2] });
  assert.equal(r.gap, true);
  assert.equal(r.applied, false);
  assert.deepEqual(r.points, [0, 0]);
});
check('apply ignores stale/duplicate delta', () => {
  const r = applyPointsDelta([0, 0, 1, 1], { type: 'pts', strokeId: 's', from: 0, pts: [0, 0] });
  assert.equal(r.applied, false);
  assert.equal(r.gap, false);
});
check('apply rejects malformed points', () => {
  const r = applyPointsDelta([0, 0], { type: 'pts', strokeId: 's', from: 2, pts: [1, NaN] });
  assert.equal(r.applied, false);
});

// ── chunk / assemble ─────────────────────────────────────────────────────────
check('chunk + assemble round-trips large boards', () => {
  const strokes = Array.from({ length: 300 }, (_, i) => ({ id: `k${i}`, points: [i, i, i + 1, i + 1], stroke: '#000' }));
  const chunks = chunkState(strokes, { sid: 'x', page: 2, maxBytes: 2000 });
  assert.equal(chunks.length > 1, true);
  const out = assembleState(chunks);
  assert.deepEqual(out.strokes, strokes);
  assert.equal(out.page, 2);
});
check('empty board still produces one chunk that assembles', () => {
  const chunks = chunkState([], { sid: 'e' });
  assert.equal(chunks.length, 1);
  assert.deepEqual(assembleState(chunks), { strokes: [], page: undefined });
});
check('assemble returns null until all chunks present', () => {
  const chunks = chunkState(Array.from({ length: 50 }, (_, i) => ({ id: i })), { sid: 's', maxBytes: 200 });
  assert.equal(assembleState(chunks.slice(0, chunks.length - 1)), null);
});

// ── merge by id ──────────────────────────────────────────────────────────────
check('mergeStateById keeps local-only, remote wins per id', () => {
  const local = [{ id: 'a', v: 'localA' }, { id: 'z', v: 'localZ' }];
  const remote = [{ id: 'a', v: 'remoteA' }, { id: 'b', v: 'remoteB' }];
  const merged = mergeStateById(local, remote);
  assert.equal(merged.find((s) => s.id === 'a').v, 'remoteA');
  assert.equal(merged.some((s) => s.id === 'z'), true);
  assert.equal(merged.some((s) => s.id === 'b'), true);
  assert.equal(merged.length, 3);
});

// ── mailbox reducer ──────────────────────────────────────────────────────────
const mk = (kind, mid, epoch) => ({ role: 'offerer', kind, data: {}, mid, t: Date.now(), epoch });
check('new offer resets the mailbox', () => {
  let box = [mk('offer', 'o1'), mk('candidate', 'c1'), mk('candidate', 'c2')];
  box = reduceMailbox(box, mk('offer', 'o2', 'e2'));
  assert.equal(box.length, 1);
  assert.equal(box[0].kind, 'offer');
  assert.equal(box[0].mid, 'o2');
});
check('duplicate mid is ignored', () => {
  let box = reduceMailbox([], mk('candidate', 'c1'));
  box = reduceMailbox(box, mk('candidate', 'c1'));
  assert.equal(box.length, 1);
});
check('mailbox is capped', () => {
  let box = [];
  for (let i = 0; i < MAILBOX_CAP + 20; i++) box = reduceMailbox(box, mk('candidate', `c${i}`));
  assert.equal(box.length, MAILBOX_CAP);
  assert.equal(box[box.length - 1].mid, `c${MAILBOX_CAP + 19}`); // newest retained
});

check('channel labels are stable constants', () => {
  assert.equal(CTL_LABEL, 'wb-ctl');
  assert.equal(PTS_LABEL, 'wb-pts');
});

console.log(`\nwhiteboard-rtc verify: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
