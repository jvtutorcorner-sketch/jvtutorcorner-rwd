// Shared ICE-server logic for every non-Agora WebRTC path (SFU media + whiteboard
// DataChannel). The SFU used to pass Cloudflare's `generate-ice-servers` response
// through verbatim and silently degrade to STUN-only on any failure — exactly the
// wrong failure mode behind school / corporate firewalls, which only let UDP:443 or
// TCP/TLS:443 out. This module guarantees the returned list covers UDP, TCP and
// TLS-443 relay transports whenever TURN credentials are available, and reports
// when it could not (so the client can warn instead of failing blind).
//
// The pure helpers (analyzeIceServers / ensureTransportCoverage / normalizeIce)
// have no network or DOM dependency and are verified offline by
// scripts/verify-ice-servers.mjs. fetchIceServers wraps the network call.

import type { IceServer } from './sfuApi';
import type { RealtimeConfig } from './config';

// Value imports from sfuApi are done dynamically inside fetchIceServers so this module
// stays parseable by Node's strip-only TS runner (sfuApi uses a parameter-property
// constructor) — that keeps the pure helpers offline-testable.

/** Cloudflare's fixed TURN host — used to synthesize any missing transport variant. */
export const CF_TURN_HOST = 'turn.cloudflare.com';

/** Only STUN available (Cloudflare public STUN). Mirrors sfuApi.STUN_ONLY. */
const STUN_ONLY: IceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];

export interface IceTransports {
  /** turn: over UDP (default / ?transport=udp). */
  udp: boolean;
  /** turn: over TCP (?transport=tcp). */
  tcp: boolean;
  /** turns: over TLS on :443 — the only path that survives strict firewalls. */
  tls443: boolean;
}

export interface IceAnalysis {
  hasTurn: boolean;
  transports: IceTransports;
  username: string | null;
  credential: string | null;
}

function urlList(server: IceServer): string[] {
  const u = server.urls;
  return Array.isArray(u) ? u : u ? [u] : [];
}

function classify(url: string): keyof IceTransports | 'stun' | 'turn-other' | null {
  const s = url.trim().toLowerCase();
  if (s.startsWith('stun:')) return 'stun';
  if (s.startsWith('turns:')) {
    // turns: is always TLS, but only :443 reliably survives strict firewalls.
    return /:443(\?|$|\/)/.test(s) ? 'tls443' : 'turn-other';
  }
  if (s.startsWith('turn:')) {
    return s.includes('transport=tcp') ? 'tcp' : 'udp';
  }
  return null;
}

/** Inspect a set of ICE servers: does it have TURN, which relay transports, and the credential. */
export function analyzeIceServers(servers: IceServer[]): IceAnalysis {
  const transports: IceTransports = { udp: false, tcp: false, tls443: false };
  let username: string | null = null;
  let credential: string | null = null;
  let hasTurn = false;

  for (const server of servers ?? []) {
    for (const url of urlList(server)) {
      const kind = classify(url);
      if (kind === 'stun' || kind === null) continue;
      hasTurn = true;
      if (kind !== 'turn-other') transports[kind] = true;
      if (!username && server.username) username = server.username;
      if (!credential && server.credential) credential = server.credential;
    }
  }
  return { hasTurn, transports, username, credential };
}

/**
 * Guarantee UDP + TCP + TLS-443 relay coverage. When TURN credentials exist but a
 * transport variant is missing from what Cloudflare returned, synthesize it on the
 * fixed Cloudflare host so restrictive networks always have a 443 path to try.
 * STUN-only input is returned unchanged (there is no credential to build TURN from).
 */
export function ensureTransportCoverage(servers: IceServer[], host = CF_TURN_HOST): IceServer[] {
  const analysis = analyzeIceServers(servers);
  if (!analysis.hasTurn || !analysis.username || !analysis.credential) return servers;

  const missing: string[] = [];
  if (!analysis.transports.udp) missing.push(`turn:${host}:3478?transport=udp`);
  if (!analysis.transports.tcp) missing.push(`turn:${host}:3478?transport=tcp`);
  if (!analysis.transports.tls443) missing.push(`turns:${host}:443?transport=tcp`);
  if (missing.length === 0) return servers;

  return [
    ...servers,
    { urls: missing, username: analysis.username, credential: analysis.credential },
  ];
}

export interface NormalizedIce {
  iceServers: IceServer[];
  /** true when we could only offer STUN (no usable TURN) — relay-only networks will fail. */
  degraded: boolean;
  transports: IceTransports;
}

/** Pure: augment for transport coverage and report whether the result is usable behind a firewall. */
export function normalizeIce(servers: IceServer[]): NormalizedIce {
  const covered = ensureTransportCoverage(servers ?? []);
  const analysis = analyzeIceServers(covered);
  return {
    iceServers: covered.length ? covered : STUN_ONLY,
    degraded: !analysis.hasTurn,
    transports: analysis.transports,
  };
}

/**
 * Fetch + normalize ICE servers for a request. Reuses generateIceServers (Cloudflare
 * TURN, shared 1TB free egress with the SFU). Never throws: on any failure it returns
 * a degraded STUN-only result so the whiteboard/SFU can still attempt a direct P2P
 * connection — the caller is responsible for surfacing `degraded` to the user.
 */
export async function fetchIceServers(
  cfg: Pick<RealtimeConfig, 'turnKeyId' | 'turnKeyApiToken'>,
  ttlSec: number
): Promise<NormalizedIce> {
  try {
    const { generateIceServers } = await import('./sfuApi');
    const raw = await generateIceServers(cfg as RealtimeConfig, ttlSec);
    return normalizeIce(raw);
  } catch (err) {
    console.warn('[realtime/ice] fetch failed, STUN-only', err);
    return { iceServers: STUN_ONLY, degraded: true, transports: { udp: false, tcp: false, tls443: false } };
  }
}
