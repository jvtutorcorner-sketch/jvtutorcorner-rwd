// lib/realtime/config.ts
//
// Cloudflare Realtime SFU 設定（NEXT_PUBLIC_RTC_PROVIDER=cloudflare-sfu 時使用）。
// 缺必要值時丟 RealtimeConfigError，路由回 503——與 lib/livekit/config.ts 的慣例相同。
//
//   CF_REALTIME_APP_ID          Realtime SFU App ID
//   CF_REALTIME_APP_SECRET      Realtime SFU App Secret（祕密，只在伺服器端使用）
//   CF_TURN_KEY_ID              TURN key ID（選填；未設定時只給 STUN）
//   CF_TURN_KEY_API_TOKEN       TURN key API token（祕密）
//   REALTIME_HEARTBEAT_TIMEOUT_SEC  多久沒心跳視為離開（預設 45 秒）
//
// 進教室時間窗沿用 LIVEKIT_EARLY_JOIN_MINUTES / LIVEKIT_GRACE_MINUTES / LIVEKIT_MAX_TOKEN_TTL_SEC，
// 讓切換 provider 時進場規則完全一樣。

export class RealtimeConfigError extends Error {}

export interface RealtimeConfig {
  appId: string;
  appSecret: string;
  turnKeyId: string | null;
  turnKeyApiToken: string | null;
  /** https://rtc.live.cloudflare.com/v1/apps/<appId> */
  apiBase: string;
  earlyJoinMinutes: number;
  graceMinutes: number;
  maxTokenTtlSec: number;
  /**
   * 超過這麼久沒有心跳就視為離開（秒）。前端每 15 秒送一次心跳；
   * SFU 對 30 秒沒有媒體封包的軌道會自動回收，45 秒足以涵蓋一次心跳遺失。
   */
  heartbeatTimeoutSec: number;
  /** 前端送心跳的間隔（秒）。 */
  heartbeatIntervalSec: number;
}

function readInt(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function getRealtimeConfig(): RealtimeConfig {
  const appId = process.env.CF_REALTIME_APP_ID?.trim();
  const appSecret = process.env.CF_REALTIME_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new RealtimeConfigError('CF_REALTIME_APP_ID / CF_REALTIME_APP_SECRET are not configured');
  }

  return {
    appId,
    appSecret,
    turnKeyId: process.env.CF_TURN_KEY_ID?.trim() || null,
    turnKeyApiToken: process.env.CF_TURN_KEY_API_TOKEN?.trim() || null,
    apiBase: `https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(appId)}`,
    earlyJoinMinutes: readInt('LIVEKIT_EARLY_JOIN_MINUTES', 15, 0, 120),
    graceMinutes: readInt('LIVEKIT_GRACE_MINUTES', 30, 0, 240),
    maxTokenTtlSec: readInt('LIVEKIT_MAX_TOKEN_TTL_SEC', 3 * 60 * 60, 60, 12 * 60 * 60),
    heartbeatTimeoutSec: readInt('REALTIME_HEARTBEAT_TIMEOUT_SEC', 45, 20, 300),
    heartbeatIntervalSec: 15,
  };
}
