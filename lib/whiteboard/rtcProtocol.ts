// Pure protocol helpers for the canvas whiteboard's WebRTC DataChannel transport.
// No DOM / network / React here so everything is verifiable offline
// (scripts/verify-whiteboard-rtc.mjs).

export type WbRtcRole = 'teacher' | 'assistant' | 'student' | 'observer';

/** Reliable, ordered: stroke-start / final stroke-update / clear / undo / redo / set-page / state. */
export const CTL_LABEL = 'wb-ctl';
/** Unreliable, unordered: in-progress point deltas. A lost packet is never retransmitted. */
export const PTS_LABEL = 'wb-pts';
/** Keep unreliable messages well under the SCTP fragmentation comfort zone. */
export const MAX_UNRELIABLE_BYTES = 12_000;
export const MAILBOX_CAP = 64;

const ROLE_RANK: Record<WbRtcRole, number> = { teacher: 0, assistant: 1, student: 2, observer: 3 };

/**
 * Exactly one side must create the offer. Lower role rank offers (teacher first);
 * on a tie the lexicographically smaller id offers. With an unknown peer, the
 * teacher offers and everyone else waits — so two "editable" peers never both offer.
 */
export function electOfferer(input: {
  selfRole: WbRtcRole;
  selfId: string;
  peerRole?: WbRtcRole | null;
  peerId?: string | null;
}): boolean {
  const { selfRole, selfId, peerRole, peerId } = input;
  if (!peerRole || !peerId) return selfRole === 'teacher';
  const a = ROLE_RANK[selfRole] ?? 9;
  const b = ROLE_RANK[peerRole] ?? 9;
  if (a !== b) return a < b;
  return String(selfId) < String(peerId);
}

export interface PointsDelta {
  type: 'pts';
  strokeId: string;
  /** Index into the flat [x0,y0,x1,y1,…] array where `pts` starts. */
  from: number;
  pts: number[];
}

/** Encode only the points the peer has not been sent yet. Returns null when nothing is new. */
export function encodePointsDelta(strokeId: string, points: number[], fromIndex: number): PointsDelta | null {
  const from = Math.max(0, Math.min(fromIndex, points.length));
  if (from >= points.length) return null;
  return { type: 'pts', strokeId, from, pts: points.slice(from) };
}

/**
 * Apply a delta to the local copy. A delta that starts beyond what we hold means
 * an earlier unreliable packet was lost: report a gap and leave the points alone —
 * the reliable final stroke-update repairs it.
 */
export function applyPointsDelta(local: number[], msg: PointsDelta): { points: number[]; gap: boolean; applied: boolean } {
  if (!Array.isArray(msg?.pts) || msg.pts.some((n) => typeof n !== 'number' || Number.isNaN(n))) {
    return { points: local, gap: false, applied: false };
  }
  if (msg.from > local.length) return { points: local, gap: true, applied: false };
  const end = msg.from + msg.pts.length;
  if (end <= local.length) return { points: local, gap: false, applied: false }; // stale / duplicate
  return { points: local.slice(0, msg.from).concat(msg.pts), gap: false, applied: true };
}

export interface StateChunk {
  type: 'state-chunk';
  sid: string;
  index: number;
  total: number;
  page?: number;
  strokes: unknown[];
}

/** Split a full-board state into chunks that each serialize under maxBytes. */
export function chunkState(strokes: unknown[], opts: { sid: string; page?: number; maxBytes?: number }): StateChunk[] {
  const maxBytes = opts.maxBytes ?? MAX_UNRELIABLE_BYTES;
  const groups: unknown[][] = [];
  let cur: unknown[] = [];
  let size = 0;
  for (const s of strokes) {
    const bytes = JSON.stringify(s).length + 1;
    if (cur.length && size + bytes > maxBytes) {
      groups.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(s);
    size += bytes;
  }
  groups.push(cur); // always at least one (possibly empty) chunk so an empty board still syncs
  return groups.map((g, index) => ({ type: 'state-chunk', sid: opts.sid, index, total: groups.length, page: opts.page, strokes: g }));
}

/** Reassemble once every chunk of one sid has arrived; otherwise null. */
export function assembleState(chunks: StateChunk[]): { strokes: unknown[]; page?: number } | null {
  if (!chunks.length) return null;
  const { sid, total } = chunks[0];
  const mine = chunks.filter((c) => c.sid === sid);
  const byIndex = new Map<number, StateChunk>();
  for (const c of mine) byIndex.set(c.index, c);
  if (byIndex.size < total) return null;
  const strokes: unknown[] = [];
  for (let i = 0; i < total; i++) {
    const c = byIndex.get(i);
    if (!c) return null;
    strokes.push(...c.strokes);
  }
  return { strokes, page: chunks[0].page };
}

/** Merge a received full state into local strokes by id: remote wins per id, local-only strokes are kept. */
export function mergeStateById<T extends { id?: string }>(local: T[], remote: T[]): T[] {
  const remoteIds = new Set(remote.map((s) => s.id));
  const keep = local.filter((s) => !s.id || !remoteIds.has(s.id));
  return [...remote, ...keep];
}

export interface MailboxMsg {
  role: string;
  kind: string;
  data: unknown;
  mid: string;
  t: number;
  epoch?: string;
}

/** Signaling mailbox reducer: a new offer starts a fresh handshake; everything is capped. */
export function reduceMailbox(msgs: MailboxMsg[], incoming: MailboxMsg, cap: number = MAILBOX_CAP): MailboxMsg[] {
  if (incoming.kind === 'offer') return [incoming];
  if (msgs.some((m) => m.mid === incoming.mid)) return msgs;
  const next = [...msgs, incoming];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
