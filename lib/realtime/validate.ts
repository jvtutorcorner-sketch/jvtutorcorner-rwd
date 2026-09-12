// lib/realtime/validate.ts
//
// 代理路由的請求白名單。純函式、不碰網路與資料庫，方便單獨測試。
//
// 為什麼要這一層：Realtime SFU 的 sessionId 與 trackName 本身不是祕密，拿到就能拉軌道。
// 所以代理路由不能把瀏覽器送來的 body 原封不動轉給 SFU，而是：
//   * 推軌道（local）：只能推在自己 session 上，trackName 只能是 audio / video，觀察者不能推
//   * 拉軌道（remote）：來源 session 必須是「同一堂課、目前在場」的其他參與者，且 trackName 確實由對方發佈
//   * 只轉送白名單欄位，其他欄位一律丟掉

import type { SessionDescription, SfuTrackObject } from './sfuApi';

export const LOCAL_TRACK_NAMES = ['audio', 'video'] as const;
export type LocalTrackName = (typeof LOCAL_TRACK_NAMES)[number];

const MAX_SDP_LENGTH = 256 * 1024;
const MAX_TRACKS_PER_CALL = 64; // SFU 單次 API 上限
const SFU_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const MID_RE = /^[A-Za-z0-9_-]{1,32}$/;

export type Validation<T> = { ok: true; value: T } | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

export function isValidSfuSessionId(v: unknown): v is string {
  return typeof v === 'string' && SFU_ID_RE.test(v);
}

export function isValidCourseSessionId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
}

export function isLocalTrackName(v: unknown): v is LocalTrackName {
  return typeof v === 'string' && (LOCAL_TRACK_NAMES as readonly string[]).includes(v);
}

export function parseSessionDescription(
  v: unknown,
  expected?: SessionDescription['type']
): Validation<SessionDescription | undefined> {
  if (v === undefined || v === null) return { ok: true, value: undefined };
  if (typeof v !== 'object') return fail('sessionDescription must be an object');
  const { type, sdp } = v as Record<string, unknown>;
  if (type !== 'offer' && type !== 'answer') return fail('sessionDescription.type must be offer or answer');
  if (expected && type !== expected) return fail(`sessionDescription.type must be ${expected}`);
  if (typeof sdp !== 'string' || !sdp.startsWith('v=') || sdp.length > MAX_SDP_LENGTH) {
    return fail('sessionDescription.sdp is invalid');
  }
  return { ok: true, value: { type, sdp } };
}

export interface TracksRequestContext {
  /** 呼叫者自己的 SFU session（已確認屬於呼叫者）。 */
  ownSessionId: string;
  /** 同一堂課中、目前在場的其他參與者：sessionId → 已發佈的 trackName。 */
  remoteSessions: Record<string, string[]>;
  /** 觀察者（admin）只能看、不能推。 */
  canPublish: boolean;
}

export interface SanitizedTracksRequest {
  kind: 'local' | 'remote';
  sessionDescription?: SessionDescription;
  tracks: SfuTrackObject[];
  /** 推軌道時要登錄到房間的 trackName。 */
  localTrackNames: LocalTrackName[];
}

export function sanitizeTracksRequest(body: unknown, ctx: TracksRequestContext): Validation<SanitizedTracksRequest> {
  if (!body || typeof body !== 'object') return fail('Body must be a JSON object');
  const { tracks, sessionDescription } = body as Record<string, unknown>;

  if (!Array.isArray(tracks) || tracks.length === 0) return fail('tracks must be a non-empty array');
  if (tracks.length > MAX_TRACKS_PER_CALL) return fail(`At most ${MAX_TRACKS_PER_CALL} tracks per request`);

  const locations = new Set(tracks.map((t) => (t && typeof t === 'object' ? (t as any).location : undefined)));
  if (locations.size !== 1) return fail('Do not mix local and remote tracks in one request');
  const kind = locations.values().next().value;

  if (kind === 'local') {
    if (!ctx.canPublish) return fail('Observers cannot publish tracks');
    const sd = parseSessionDescription(sessionDescription, 'offer');
    if (!sd.ok) return sd;
    if (!sd.value) return fail('Publishing tracks requires an SDP offer');

    const seen = new Set<string>();
    const out: SfuTrackObject[] = [];
    for (const t of tracks as Array<Record<string, unknown>>) {
      if (!isLocalTrackName(t.trackName)) return fail('trackName must be audio or video');
      if (typeof t.mid !== 'string' || !MID_RE.test(t.mid)) return fail('mid is invalid');
      if (seen.has(t.trackName)) return fail(`Duplicate trackName ${t.trackName}`);
      seen.add(t.trackName);
      out.push({ location: 'local', mid: t.mid, trackName: t.trackName });
    }
    return {
      ok: true,
      value: { kind: 'local', sessionDescription: sd.value, tracks: out, localTrackNames: [...seen] as LocalTrackName[] },
    };
  }

  if (kind === 'remote') {
    const sd = parseSessionDescription(sessionDescription, 'offer');
    if (!sd.ok) return sd;

    const out: SfuTrackObject[] = [];
    for (const t of tracks as Array<Record<string, unknown>>) {
      const source = t.sessionId;
      if (!isValidSfuSessionId(source)) return fail('Remote track sessionId is invalid');
      if (source === ctx.ownSessionId) return fail('Cannot pull your own tracks');
      const published = ctx.remoteSessions[source];
      if (!published) return fail('Remote session is not an active participant of this class');
      if (typeof t.trackName !== 'string' || !published.includes(t.trackName)) {
        return fail('Remote track is not published by that participant');
      }
      out.push({ location: 'remote', sessionId: source, trackName: t.trackName });
    }
    return { ok: true, value: { kind: 'remote', sessionDescription: sd.value, tracks: out, localTrackNames: [] } };
  }

  return fail('track location must be local or remote');
}

export interface SanitizedCloseRequest {
  tracks: Array<{ mid: string }>;
  sessionDescription?: SessionDescription;
  force: boolean;
}

export function sanitizeCloseRequest(body: unknown): Validation<SanitizedCloseRequest> {
  if (!body || typeof body !== 'object') return fail('Body must be a JSON object');
  const { tracks, sessionDescription, force } = body as Record<string, unknown>;
  if (!Array.isArray(tracks) || tracks.length === 0) return fail('tracks must be a non-empty array');
  if (tracks.length > MAX_TRACKS_PER_CALL) return fail(`At most ${MAX_TRACKS_PER_CALL} tracks per request`);

  const out: Array<{ mid: string }> = [];
  for (const t of tracks as Array<Record<string, unknown>>) {
    if (typeof t?.mid !== 'string' || !MID_RE.test(t.mid)) return fail('mid is invalid');
    out.push({ mid: t.mid });
  }
  const sd = parseSessionDescription(sessionDescription);
  if (!sd.ok) return sd;
  // 沒帶 SDP 時必須 force，否則 SFU 會等不到重新協商
  return { ok: true, value: { tracks: out, sessionDescription: sd.value, force: sd.value ? force === true : true } };
}
