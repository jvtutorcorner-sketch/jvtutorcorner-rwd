// Centrifugo Phase-1 spike (plan appendix B.6).
// Validates the four B.1 acceptance conditions against 2 Centrifugo instances
// sharing one Valkey engine. Local only; touches no prod code or prod env.
//
//   1. presence + join/leave drives bothPresent; a killed peer is removed <=45s
//   2. existing signaling frames (wb-uuid-sync/page-change/request-page-state/
//      pdf-available) relay verbatim, and publisher info.user is server-forced
//   3. an HS256 JWT signed with the shared secret is enough to connect
//   4. two instances + Valkey engine fan out across instances
//
// Teacher connects to instance A (:8801), student to instance B (:8802), so
// every message that arrives has crossed the Redis engine.

import { Centrifuge } from 'centrifuge';
import WebSocket from 'ws';
import crypto from 'node:crypto';

const SECRET = 'spike-secret-do-not-use-in-prod';
const URL_A = 'ws://localhost:8801/connection/websocket';
const URL_B = 'ws://localhost:8802/connection/websocket';
const CHANNEL = `room:spike-${crypto.randomBytes(3).toString('hex')}`;
const TEACHER = 'teacher:u_1001';
const STUDENT = 'student:u_2002';
const LATENCY_MSGS = 200;
const KILL_DETECT_BUDGET_MS = 45_000;

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function signJwt(sub, info) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub, iat: now, exp: now + 3600 };
  if (info) payload.info = info;
  const head = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}`;
  const sig = crypto.createHmac('sha256', SECRET).update(head).digest('base64url');
  return `${head}.${sig}`;
}

// Wrap ws so we can capture the live socket and later kill it ungracefully
// (an OS-closed socket when a browser tab is killed).
function capturingWs(onSocket) {
  return class extends WebSocket {
    constructor(...args) {
      super(...args);
      onSocket(this);
    }
  };
}

function makeClient(url, sub, info, onSocket) {
  return new Centrifuge(url, {
    token: signJwt(sub, info),
    websocket: onSocket ? capturingWs(onSocket) : WebSocket,
    minReconnectDelay: 200,
  });
}

function connected(c, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} connect timeout`)), 10_000);
    c.on('connected', () => { clearTimeout(t); resolve(); });
    c.on('error', (ctx) => { /* keep trying; log for debug */ if (process.env.SPIKE_DEBUG) console.error(label, 'err', ctx?.error); });
    c.connect();
  });
}

function subscribed(sub, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} subscribe timeout`)), 10_000);
    sub.on('subscribed', () => { clearTimeout(t); resolve(); });
    sub.subscribe();
  });
}

const pct = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const results = [];
const record = (cond, pass, detail) => {
  results.push({ cond, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${cond}  — ${detail}`);
};

async function main() {
  let studentSocket = null;
  const teacher = makeClient(URL_A, TEACHER, { role: 'teacher' });
  const student = makeClient(URL_B, STUDENT, { role: 'student' }, (s) => { studentSocket = s; });

  await Promise.all([connected(teacher, 'teacher'), connected(student, 'student')]);
  // Condition 3: both connected purely via an HS256 JWT signed with the shared secret.
  record('C3 JWT(HS256) connect', true, `both clients connected to A(:8801)/B(:8802) with a self-signed token`);

  const tSub = teacher.newSubscription(CHANNEL);
  const sSub = student.newSubscription(CHANNEL);

  // --- Condition 4 + 2 wiring: student records everything it receives from teacher.
  const latencies = [];
  const typed = {}; // messageType -> received payload
  sSub.on('publication', (ctx) => {
    const d = ctx.data || {};
    if (d.kind === 'latency') {
      latencies.push(Date.now() - d.t);
    } else if (d.messageType) {
      typed[d.messageType] = { data: d, infoUser: ctx.info?.user ?? null };
    }
  });

  // --- Condition 1 wiring: teacher watches join/leave for the student.
  let studentLeaveAt = null;
  const joinEvents = [];
  tSub.on('join', (ctx) => joinEvents.push(ctx.info?.user));
  tSub.on('leave', (ctx) => {
    if (ctx.info?.user === STUDENT && studentLeaveAt === null) studentLeaveAt = Date.now();
  });

  await Promise.all([subscribed(tSub, 'teacher'), subscribed(sSub, 'student')]);
  await new Promise((r) => setTimeout(r, 500)); // let join events settle

  // Condition 1a: presence shows both members (proves cross-instance presence via Redis).
  const pres = await tSub.presence();
  const users = new Set(Object.values(pres.clients || {}).map((c) => c.user));
  const bothPresent = users.has(TEACHER) && users.has(STUDENT);
  record('C1a presence bothPresent', bothPresent,
    `presence users = [${[...users].join(', ')}]`);

  // Condition 4: cross-instance fan-out latency (teacher A -> student B via engine).
  for (let seq = 0; seq < LATENCY_MSGS; seq++) {
    await tSub.publish({ kind: 'latency', seq, t: Date.now() });
    await new Promise((r) => setTimeout(r, 5));
  }
  await new Promise((r) => setTimeout(r, 1000)); // drain
  const gotAll = latencies.length === LATENCY_MSGS;
  record('C4 cross-instance fan-out', gotAll,
    `${latencies.length}/${LATENCY_MSGS} received across instances; ` +
    `p50=${pct(latencies, 50)}ms p95=${pct(latencies, 95)}ms max=${Math.max(...latencies)}ms`);

  // Condition 2: existing signaling frames relay verbatim + server-forced info.user.
  const frames = [
    { messageType: 'wb-uuid-sync', uuid: 'abc-123', token: 'roomTok' },
    { messageType: 'page-change', page: 4, seq: 7 },
    { messageType: 'request-page-state' },
    { messageType: 'pdf-available', docId: 'doc-9', pages: 12 },
  ];
  for (const f of frames) { await tSub.publish(f); await new Promise((r) => setTimeout(r, 30)); }
  await new Promise((r) => setTimeout(r, 800));
  let relayOk = true;
  let infoOk = true;
  const detail = [];
  for (const f of frames) {
    const got = typed[f.messageType];
    const verbatim = got && deepEq(got.data, f);
    const trusted = got && got.infoUser === TEACHER;
    relayOk &&= !!verbatim;
    infoOk &&= !!trusted;
    detail.push(`${f.messageType}:${verbatim ? 'ok' : 'MISS'}/${got ? got.infoUser : 'no-info'}`);
  }
  record('C2 frame relay verbatim', relayOk, detail.join('  '));
  record('C2 info.user server-forced', infoOk, `all publisher info.user === "${TEACHER}"`);

  // Condition 1b: kill the student socket ungracefully (RST, like a killed tab),
  // stop JS-side reconnect, and measure when the teacher sees the leave.
  const tKill = Date.now();
  studentLeaveAt = null;
  if (studentSocket) studentSocket.terminate();
  student.disconnect(); // cancel client-side auto-reconnect so the peer stays dead
  const killDeadline = tKill + KILL_DETECT_BUDGET_MS;
  while (studentLeaveAt === null && Date.now() < killDeadline) {
    await new Promise((r) => setTimeout(r, 250));
  }
  let removedByPresence = false;
  if (studentLeaveAt === null) {
    // no explicit leave push — fall back to presence disappearance as the signal
    const p2 = await tSub.presence();
    const u2 = new Set(Object.values(p2.clients || {}).map((c) => c.user));
    removedByPresence = !u2.has(STUDENT);
  }
  const detectMs = studentLeaveAt ? studentLeaveAt - tKill : (Date.now() - tKill);
  const killPass = (studentLeaveAt !== null || removedByPresence) && detectMs <= KILL_DETECT_BUDGET_MS;
  record('C1b killed peer removed <=45s', killPass,
    studentLeaveAt !== null
      ? `leave event ${detectMs}ms after kill`
      : removedByPresence
        ? `no leave push, but presence dropped student within ${detectMs}ms`
        : `still present after ${detectMs}ms`);

  teacher.disconnect();

  const allPass = results.every((r) => r.pass);
  console.log(`\n==== Centrifugo spike: ${allPass ? 'ALL PASS' : 'FAILURES PRESENT'} (${results.filter(r => r.pass).length}/${results.length}) ====`);
  console.log(`channel=${CHANNEL}  latency n=${latencies.length}  p50=${pct(latencies, 50)}ms  p95=${pct(latencies, 95)}ms`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error('spike crashed:', e); process.exit(2); });
