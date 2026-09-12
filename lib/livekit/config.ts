// lib/livekit/config.ts
//
// 集中讀取 LiveKit 相關環境變數，並在第一次使用時做嚴格驗證。
// 這裡刻意「不」在模組載入時就丟錯，避免 Next.js build / 其他不需要 LiveKit 的
// route 因為缺環境變數而一起失敗。只有真的呼叫 getLiveKitConfig() 才會檢查。
//
// 必要環境變數（Server 端，勿加 NEXT_PUBLIC_ 前綴）：
//   LIVEKIT_URL         wss://livekit.jvtutorcorner.com   （前端連線用，也給 RoomServiceClient 用）
//   LIVEKIT_API_KEY     LiveKit Server 設定檔 keys: 區塊的 key
//   LIVEKIT_API_SECRET  對應的 secret（>= 32 字元）
//
// 可選：
//   LIVEKIT_EARLY_JOIN_MINUTES   開課前幾分鐘可進教室（預設 15）
//   LIVEKIT_GRACE_MINUTES        下課後幾分鐘內仍可重連（預設 30）
//   LIVEKIT_MAX_TOKEN_TTL_SEC    Token 最長存活秒數上限（預設 3 小時）
//   LIVEKIT_ROOM_EMPTY_TIMEOUT_SEC   房間無人後多久自動關閉（預設 300）

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
  earlyJoinMinutes: number;
  graceMinutes: number;
  maxTokenTtlSec: number;
  roomEmptyTimeoutSec: number;
  /** 結算門檻：師生同時在場需達幾秒，webhook 才會釋放 escrow（預設 300 = 5 分鐘）。 */
  minBillableSec: number;
  /** 結算門檻：老師在場需達幾秒（預設 60）。低於此視為老師未實質出席。 */
  minTeacherPresenceSec: number;
  /** webhook 簽章時間容忍（秒），對抗機器時鐘漂移（預設 300）。 */
  webhookClockToleranceSec: number;
}

export class LiveKitConfigError extends Error {
  readonly code = 'LIVEKIT_CONFIG_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'LiveKitConfigError';
  }
}

let cached: LiveKitConfig | null = null;

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new LiveKitConfigError(`${name} must be an integer between ${min} and ${max}, got "${raw}"`);
  }
  return Math.floor(n);
}

export function getLiveKitConfig(): LiveKitConfig {
  if (cached) return cached;

  const url = (process.env.LIVEKIT_URL || '').trim();
  const apiKey = (process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = (process.env.LIVEKIT_API_SECRET || '').trim();

  const missing: string[] = [];
  if (!url) missing.push('LIVEKIT_URL');
  if (!apiKey) missing.push('LIVEKIT_API_KEY');
  if (!apiSecret) missing.push('LIVEKIT_API_SECRET');
  if (missing.length > 0) {
    throw new LiveKitConfigError(`Missing required env: ${missing.join(', ')}`);
  }
  if (!/^wss?:\/\//.test(url)) {
    throw new LiveKitConfigError('LIVEKIT_URL must start with ws:// or wss://');
  }
  if (apiSecret.length < 32) {
    // LiveKit 官方建議 secret 至少 32 bytes，否則 JWT 簽章強度不足。
    throw new LiveKitConfigError('LIVEKIT_API_SECRET must be at least 32 characters');
  }

  cached = {
    url,
    apiKey,
    apiSecret,
    earlyJoinMinutes: readInt('LIVEKIT_EARLY_JOIN_MINUTES', 15, 0, 120),
    graceMinutes: readInt('LIVEKIT_GRACE_MINUTES', 30, 0, 240),
    maxTokenTtlSec: readInt('LIVEKIT_MAX_TOKEN_TTL_SEC', 3 * 60 * 60, 60, 12 * 60 * 60),
    roomEmptyTimeoutSec: readInt('LIVEKIT_ROOM_EMPTY_TIMEOUT_SEC', 300, 10, 3600),
    minBillableSec: readInt('LIVEKIT_MIN_BILLABLE_SEC', 300, 0, 24 * 60 * 60),
    minTeacherPresenceSec: readInt('LIVEKIT_MIN_TEACHER_PRESENCE_SEC', 60, 0, 24 * 60 * 60),
    webhookClockToleranceSec: readInt('LIVEKIT_WEBHOOK_CLOCK_TOLERANCE_SEC', 300, 0, 3600),
  };
  return cached;
}

/** RoomServiceClient / WebhookReceiver 需要 https(s) 形式的 host，而非 wss。 */
export function toHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

/** 測試用：清掉快取讓下一次重新讀 env。 */
export function resetLiveKitConfigCache(): void {
  cached = null;
}
