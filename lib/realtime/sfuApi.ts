// lib/realtime/sfuApi.ts
//
// 伺服器端呼叫 Cloudflare Realtime SFU HTTPS API。App Secret 只存在這裡，永遠不送到瀏覽器；
// 瀏覽器一律經過 app/api/realtime/* 的代理路由，由那裡做完授權與欄位白名單後才轉送。
//
// API 形狀依 Cloudflare 官方 echo 範例（cloudflare/realtime-examples）：
//   POST /sessions/new                              → { sessionId }
//   POST /sessions/:id/tracks/new                   推（local）或拉（remote）軌道
//   PUT  /sessions/:id/renegotiate                  回覆 SFU 發起的 offer
//   PUT  /sessions/:id/tracks/close                 關閉軌道

import type { RealtimeConfig } from './config';

export interface SessionDescription {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface SfuTrackObject {
  location: 'local' | 'remote';
  mid?: string;
  trackName: string;
  /** 拉軌道時填「發佈者」的 session。 */
  sessionId?: string;
  errorCode?: string;
  errorDescription?: string;
}

export interface SfuTracksResponse {
  requiresImmediateRenegotiation?: boolean;
  sessionDescription?: SessionDescription;
  tracks?: SfuTrackObject[];
  errorCode?: string;
  errorDescription?: string;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export class SfuApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
  }
}

async function call<T>(
  cfg: RealtimeConfig,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.appSecret}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }

  if (!res.ok) {
    throw new SfuApiError(`SFU ${method} ${path} failed with ${res.status}`, res.status, json);
  }
  // 整個請求層級的錯誤也可能以 200 + errorCode 回來；逐軌道的錯誤則在 tracks[].errorCode，交給呼叫端處理。
  if (json && typeof json === 'object' && typeof json.errorCode === 'string' && json.errorCode) {
    throw new SfuApiError(
      `SFU ${method} ${path}: ${json.errorCode}${json.errorDescription ? ` ${json.errorDescription}` : ''}`,
      502,
      json
    );
  }
  return json as T;
}

const sid = (sessionId: string) => encodeURIComponent(sessionId);

export const sfuApi = {
  newSession: (cfg: RealtimeConfig) => call<{ sessionId: string }>(cfg, 'POST', '/sessions/new'),

  newTracks: (
    cfg: RealtimeConfig,
    sessionId: string,
    body: { sessionDescription?: SessionDescription; tracks: SfuTrackObject[] }
  ) => call<SfuTracksResponse>(cfg, 'POST', `/sessions/${sid(sessionId)}/tracks/new`, body),

  renegotiate: (cfg: RealtimeConfig, sessionId: string, body: { sessionDescription: SessionDescription }) =>
    call<SfuTracksResponse>(cfg, 'PUT', `/sessions/${sid(sessionId)}/renegotiate`, body),

  closeTracks: (
    cfg: RealtimeConfig,
    sessionId: string,
    body: { tracks: Array<{ mid: string }>; sessionDescription?: SessionDescription; force?: boolean }
  ) => call<SfuTracksResponse>(cfg, 'PUT', `/sessions/${sid(sessionId)}/tracks/close`, body),
};

/** 只有 STUN 時的預設值（Cloudflare 公開 STUN）。 */
export const STUN_ONLY: IceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];

/**
 * 產生短效 TURN 憑證（搭配 SFU 使用時免費）。未設定 TURN key 或呼叫失敗時退回只有 STUN——
 * 大多數網路仍能連上，只有嚴格 NAT／防火牆後的使用者會受影響，不值得為此擋住整個教室。
 */
export async function generateIceServers(cfg: RealtimeConfig, ttlSec: number): Promise<IceServer[]> {
  if (!cfg.turnKeyId || !cfg.turnKeyApiToken) return STUN_ONLY;

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(cfg.turnKeyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.turnKeyApiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ttl: Math.max(60, Math.floor(ttlSec)) }),
        cache: 'no-store',
      }
    );
    if (!res.ok) {
      console.warn('[realtime/turn] generate-ice-servers failed', res.status);
      return STUN_ONLY;
    }
    const data = (await res.json()) as { iceServers?: IceServer[] | IceServer };
    const servers = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
    return servers.length ? servers : STUN_ONLY;
  } catch (err) {
    console.warn('[realtime/turn] generate-ice-servers error', err);
    return STUN_ONLY;
  }
}
