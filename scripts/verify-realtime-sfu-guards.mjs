#!/usr/bin/env node
/**
 * Realtime SFU 代理的授權白名單回歸測試
 * ======================================
 *
 * Realtime SFU 的 sessionId 與 trackName 不是祕密，拿到就能拉軌道，所以
 * app/api/realtime/* 的安全性完全取決於 lib/realtime/validate.ts 與
 * lib/realtime/participants.ts 這兩個純函式。本腳本不連網路、不碰資料庫，
 * 直接驗證它們的判斷。
 *
 * 用法：
 *   node scripts/verify-realtime-sfu-guards.mjs
 *
 * 做法：用專案內的 typescript 套件把兩個檔案轉成 CommonJS 放到暫存目錄再載入
 * （兩個檔案都只有型別匯入，轉譯後沒有任何執行期相依）。
 *
 * 退出碼：0 = 全部通過；1 = 有失敗。
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const outDir = mkdtempSync(join(tmpdir(), 'realtime-guards-'));

function load(relPath) {
  const source = readFileSync(join(process.cwd(), relPath), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: relPath,
  });
  const file = join(outDir, basename(relPath).replace(/\.ts$/, '.js'));
  writeFileSync(file, outputText);
  return require(file);
}

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${name}\n      ${err.message.split('\n').join('\n      ')}`);
  }
}

try {
  const v = load('lib/realtime/validate.ts');
  const p = load('lib/realtime/participants.ts');

  const OWN = 'a'.repeat(32);
  const PEER = 'b'.repeat(32);
  const STRANGER = 'c'.repeat(32);
  const OFFER = { type: 'offer', sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n' };
  const ANSWER = { type: 'answer', sdp: 'v=0\r\n' };
  const ctx = { ownSessionId: OWN, remoteSessions: { [PEER]: ['audio', 'video'] }, canPublish: true };
  const local = (trackName, mid = '0') => ({ location: 'local', mid, trackName });
  const remote = (sessionId, trackName) => ({ location: 'remote', sessionId, trackName });

  console.log('\n🔍 ID 與 SDP 格式');
  check('太短或含路徑字元的 sessionId 無效', () => {
    assert.equal(v.isValidSfuSessionId('abc'), false);
    assert.equal(v.isValidSfuSessionId('../' + 'a'.repeat(20)), false);
    assert.equal(v.isValidSfuSessionId(OWN), true);
  });
  check('SDP：型別、開頭與預期型別都要對', () => {
    assert.deepEqual(v.parseSessionDescription(undefined), { ok: true, value: undefined });
    assert.equal(v.parseSessionDescription(OFFER).ok, true);
    assert.equal(v.parseSessionDescription({ type: 'pranswer', sdp: 'v=0' }).ok, false);
    assert.equal(v.parseSessionDescription({ type: 'offer', sdp: 'hello' }).ok, false);
    assert.equal(v.parseSessionDescription(OFFER, 'answer').ok, false);
    assert.equal(v.parseSessionDescription(ANSWER, 'answer').ok, true);
  });

  console.log('\n🔍 推軌道（local）');
  check('合法請求：只轉送白名單欄位', () => {
    const r = v.sanitizeTracksRequest(
      { sessionDescription: OFFER, tracks: [{ ...local('audio'), sessionId: STRANGER, extra: 'x' }] },
      ctx
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r.value.tracks, [{ location: 'local', mid: '0', trackName: 'audio' }]);
    assert.deepEqual(r.value.localTrackNames, ['audio']);
  });
  check('沒有 offer 不能推', () => {
    assert.equal(v.sanitizeTracksRequest({ tracks: [local('audio')] }, ctx).ok, false);
  });
  check('trackName 只能是 audio / video', () => {
    assert.equal(v.sanitizeTracksRequest({ sessionDescription: OFFER, tracks: [local('screen')] }, ctx).ok, false);
  });
  check('同一次請求不能重複 trackName', () => {
    const r = v.sanitizeTracksRequest(
      { sessionDescription: OFFER, tracks: [local('audio', '0'), local('audio', '1')] },
      ctx
    );
    assert.equal(r.ok, false);
  });
  check('觀察者（admin）不能推', () => {
    const r = v.sanitizeTracksRequest(
      { sessionDescription: OFFER, tracks: [local('video')] },
      { ...ctx, canPublish: false }
    );
    assert.equal(r.ok, false);
  });

  console.log('\n🔍 拉軌道（remote）');
  check('可以拉同一堂課在場者已發佈的軌道', () => {
    const r = v.sanitizeTracksRequest({ tracks: [{ ...remote(PEER, 'video'), mid: '9' }] }, ctx);
    assert.equal(r.ok, true);
    assert.deepEqual(r.value.tracks, [{ location: 'remote', sessionId: PEER, trackName: 'video' }]);
  });
  check('不能拉不在這堂課的 session（跨課程偷看）', () => {
    assert.equal(v.sanitizeTracksRequest({ tracks: [remote(STRANGER, 'video')] }, ctx).ok, false);
  });
  check('不能拉自己的軌道', () => {
    const r = v.sanitizeTracksRequest(
      { tracks: [remote(OWN, 'video')] },
      { ...ctx, remoteSessions: { ...ctx.remoteSessions, [OWN]: ['video'] } }
    );
    assert.equal(r.ok, false);
  });
  check('不能拉對方沒有發佈的軌道', () => {
    const r = v.sanitizeTracksRequest(
      { tracks: [remote(PEER, 'audio')] },
      { ...ctx, remoteSessions: { [PEER]: ['video'] } }
    );
    assert.equal(r.ok, false);
  });

  console.log('\n🔍 請求形狀');
  check('同一次請求不能混合推與拉', () => {
    const r = v.sanitizeTracksRequest({ sessionDescription: OFFER, tracks: [local('audio'), remote(PEER, 'video')] }, ctx);
    assert.equal(r.ok, false);
  });
  check('超過 64 條軌道拒絕', () => {
    const tracks = Array.from({ length: 65 }, () => remote(PEER, 'video'));
    assert.equal(v.sanitizeTracksRequest({ tracks }, ctx).ok, false);
  });
  check('未知的 location 拒絕', () => {
    assert.equal(v.sanitizeTracksRequest({ tracks: [{ location: 'other', trackName: 'audio' }] }, ctx).ok, false);
  });
  check('關閉軌道：沒帶 SDP 時一律 force，mid 要合法', () => {
    const noSdp = v.sanitizeCloseRequest({ tracks: [{ mid: '1' }], force: false });
    assert.equal(noSdp.ok, true);
    assert.equal(noSdp.value.force, true);
    const withSdp = v.sanitizeCloseRequest({ tracks: [{ mid: '1' }], sessionDescription: OFFER, force: false });
    assert.equal(withSdp.value.force, false);
    assert.equal(v.sanitizeCloseRequest({ tracks: [{ mid: '../1' }] }).ok, false);
  });

  console.log('\n🔍 房間參與者');
  const now = Date.parse('2026-09-10T10:00:00.000Z');
  const iso = (secAgo) => new Date(now - secAgo * 1000).toISOString();
  const entry = (userId, role, joinedSecAgo, lastSeenSecAgo, extra = {}) => ({
    identity: p.identityFor(role, userId),
    userId,
    role,
    joinedAt: iso(joinedSecAgo),
    lastSeenAt: iso(lastSeenSecAgo),
    tracks: { video: iso(joinedSecAgo), audio: iso(joinedSecAgo) },
    ...extra,
  });
  const session = {
    sfuSessions: {
      s_teacher_new: entry('T', 'teacher', 30, 5),
      s_teacher_old: entry('T', 'teacher', 300, 10), // 重新整理前的舊 session，尚未逾時
      s_caller: entry('ME', 'student', 60, 1),
      s_admin: entry('ADM', 'admin', 60, 1),
      s_left: entry('L', 'student', 60, 1, { leftAt: iso(20) }),
      s_stale: entry('Z', 'student', 600, 60),
      s_student2: entry('S2', 'student', 120, 3),
    },
  };
  const list = p.activeParticipants(session, { excludeUserId: 'ME', nowMs: now, heartbeatTimeoutSec: 45 });

  check('身分格式與 LiveKit 相同', () => assert.equal(p.identityFor('student', 'u1'), 'student:u1'));
  check('排除自己、觀察者、已離開、心跳逾時', () => {
    const ids = list.map((x) => x.sessionId);
    for (const hidden of ['s_caller', 's_admin', 's_left', 's_stale']) assert.equal(ids.includes(hidden), false, hidden);
  });
  check('同一身分只留最新的 session（避免 ClientClassroom 出現重複 uid）', () => {
    assert.equal(list.filter((x) => x.identity === 'teacher:T').length, 1);
    assert.equal(list.find((x) => x.identity === 'teacher:T').sessionId, 's_teacher_new');
  });
  check('依加入時間排序，軌道名稱排序', () => {
    assert.deepEqual(list.map((x) => x.sessionId), ['s_student2', 's_teacher_new']);
    assert.deepEqual(list[0].tracks, ['audio', 'video']);
  });
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
