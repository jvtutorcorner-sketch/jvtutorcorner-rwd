/**
 * lib/agora/types.ts
 *
 * 完整的 Agora 資料庫資料類型定義（對應 DynamoDB 四張資料表）
 *
 * 資料架構關聯：
 *
 *  [Order] ─── [AgSession] ─── [AgParticipant] ─── [AgConnectionEvent]
 *    │              │                 │
 *  [Course]    [/classroom/room]  [AgQualityEvent]
 *    │
 *  [User(teacher/student)]
 *
 * 資料表清單：
 *   1. jvtutorcorner-agora-sessions        (課堂 Session)
 *   2. jvtutorcorner-agora-participants    (參與者 + 設備快照)
 *   3. jvtutorcorner-agora-quality-events  (網路品質事件)
 *   4. jvtutorcorner-agora-connection-events (連線狀態事件)
 */

// ─── 共用 Enum ────────────────────────────────────────────────────────────────

/** Agora 網路類型（對應 Dashboard NET 欄位） */
export type AgoraNetworkType =
  | 'NETWORK_UNKNOWN'
  | 'WIFI'
  | 'LAN'
  | 'MOBILE_2G'
  | 'MOBILE_3G'
  | 'MOBILE_4G'
  | 'MOBILE_5G'
  | 'OFFLINE';

/** 作業系統平台（對應 Dashboard OS 欄位） */
export type AgoraOSName = 'iOS' | 'Android' | 'Windows' | 'MacOS' | 'Linux' | 'unknown';

/** 裝置類型（對應 Dashboard Device type 欄位） */
export type AgoraDeviceCategory = 'mobile' | 'tablet' | 'desktop' | 'unknown';

/** 瀏覽器名稱（對應 Dashboard Browser 欄位） */
export type AgoraBrowserName = 'Chrome' | 'Safari' | 'Firefox' | 'Edge' | 'Opera' | 'unknown';

/** Agora 音視訊品質等級（0=未知 / 1=優 / 6=斷線） */
export type AgoraQualityLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 參與者角色 */
export type ClassroomRole = 'teacher' | 'student';

/** Session 狀態 */
export type AgSessionStatus = 'active' | 'completed' | 'interrupted';

/** 連線事件類型 */
export type AgConnectionEventType =
  | 'join'
  | 'leave'
  | 'reconnect'
  | 'disconnect'
  | 'network-change'
  | 'stream-publish'
  | 'stream-unpublish';

// ─── 抽取的設備資訊（從 UA + Agora SDK 取得） ──────────────────────────────────

/**
 * 設備快照 — 對應 Agora Dashboard 可見欄位
 */
export interface AgoraDeviceSnapshot {
  /** OS 名稱：iOS / Windows / Android 等 */
  osName: AgoraOSName;
  /** OS 版本：17.6.1 / 10 / 18.5 */
  osVersion: string;
  /** 網路類型：NETWORK_UNKNOWN / WIFI / LAN 等 */
  networkType: AgoraNetworkType;
  /** Agora SDK 主版本號：4.24.2 */
  sdkVersion: string;
  /** Agora SDK 完整版本（含 build tag）：4.24.2/release_20260313_01_v... */
  sdkFullVersion: string;
  /** 裝置大類：mobile / tablet / desktop */
  deviceCategory: AgoraDeviceCategory;
  /** 裝置型號描述：Apple iPhone / Apple iPad / Mozilla/5.0... */
  deviceModel: string;
  /** 瀏覽器名稱：Chrome / Safari 等 */
  browserName: AgoraBrowserName;
  /** 瀏覽器版本：146.0.7680.151 / 18.5 */
  browserVersion: string;
  /** 完整 User-Agent 字串（原始值，供詳細診斷） */
  userAgent: string;
  /** Agora.checkSystemRequirements() 回傳結果 */
  systemRequirementsCheck: boolean | null;
}

// ─── Table 1：AgSession ───────────────────────────────────────────────────────

/**
 * jvtutorcorner-agora-sessions
 *
 * PK: sessionId
 * GSI-1: courseId-index         (courseId → sessionId)
 * GSI-2: orderId-index          (orderId  → sessionId)
 * GSI-3: channelName-index      (channelName → sessionId)
 *
 * 關聯：Course / Order / User(teacher + student) / /classroom/room 頁面
 */
export interface AgSession {
  /** 主鍵：UUID v4，Classroom 進入時產生 */
  sessionId: string;

  // — /classroom/room 必要關聯欄位 —
  /** Agora 頻道名（用戶識別連線，同 orderId or course channel） */
  channelName: string;
  /** 課程 ID（關聯 Course table） */
  courseId: string;
  /** 訂單 ID（關聯 Order table，決定課堂時長/點數） */
  orderId: string | null;
  /** 教師 User ID */
  teacherId: string;
  /** 學生 User ID */
  studentId: string;
  /** 觸發 Session 的頁面路徑（固定為 /classroom/room） */
  pageUrl: string;

  // — 狀態 —
  /** active / completed / interrupted */
  status: AgSessionStatus;
  /** Session 實際開始時間（ISO 8601） */
  startedAt: string;
  /** Session 結束時間（ISO 8601，進行中為 null） */
  endedAt: string | null;
  /** 實際課堂秒數 */
  durationSeconds: number | null;

  // — 稽核時間戳記 —
  /** 首次寫入時間（ISO 8601） */
  createdAt: string;
  /** 最後更新時間（ISO 8601） */
  updatedAt: string;
}

// ─── Table 2：AgParticipant ───────────────────────────────────────────────────

/**
 * jvtutorcorner-agora-participants
 *
 * PK: participantId
 * GSI-1: sessionId-index    (sessionId → participantId)
 * GSI-2: userId-index       (userId    → participantId)
 *
 * 包含完整的 Agora Dashboard 可見欄位（OS / NET / SDK / Device type / Browser）
 */
export interface AgParticipant extends AgoraDeviceSnapshot {
  /** 主鍵：UUID v4 */
  participantId: string;

  // — 外鍵關聯 —
  /** 所屬 Session（→ AgSession.sessionId） */
  sessionId: string;
  /** 平台 User ID */
  userId: string;
  /** teacher / student */
  role: ClassroomRole;
  /** Agora 指派的數字 UID */
  agoraUid: number;
  /** Agora 頻道名（冗餘存放，方便查詢） */
  channelName: string;

  // — 連線時間 —
  /** 加入頻道時間（ISO 8601） */
  joinedAt: string;
  /** 離開頻道時間（ISO 8601，仍在線為 null） */
  leftAt: string | null;

  // — 稽核時間戳記 —
  createdAt: string;
  updatedAt: string;
}

// ─── Table 3：AgQualityEvent ──────────────────────────────────────────────────

/**
 * jvtutorcorner-agora-quality-events
 *
 * PK: eventId
 * GSI-1: sessionId-index        (sessionId     → eventId)
 * GSI-2: participantId-index    (participantId → eventId)
 *
 * 每 N 秒由前端 Agora `network-quality` 事件觸發寫入
 */
export interface AgQualityEvent {
  /** 主鍵：UUID v4 */
  eventId: string;

  // — 關聯 —
  sessionId: string;
  participantId: string;
  channelName: string;

  // — Agora 品質指標 —
  /** 上行品質：0(未知)～6(斷線) */
  uplinkQuality: AgoraQualityLevel;
  /** 下行品質：0(未知)～6(斷線) */
  downlinkQuality: AgoraQualityLevel;
  /** 當前網路類型（採樣時刻） */
  networkType: AgoraNetworkType;
  /** 往返延遲 ms（若 SDK 提供） */
  rtt: number | null;
  /** 封包遺失率 % */
  packetLossRate: number | null;

  /** 採樣時間（ISO 8601） */
  sampledAt: string;
  createdAt: string;
}

// ─── Table 4：AgConnectionEvent ───────────────────────────────────────────────

/**
 * jvtutorcorner-agora-connection-events
 *
 * PK: eventId
 * GSI-1: sessionId-index        (sessionId     → eventId)
 * GSI-2: participantId-index    (participantId → eventId)
 *
 * 記錄 join / leave / reconnect / disconnect / network-change 等狀態轉換
 */
export interface AgConnectionEvent {
  /** 主鍵：UUID v4 */
  eventId: string;

  // — 關聯 —
  sessionId: string;
  participantId: string;
  channelName: string;

  // — 事件內容 —
  /** join / leave / reconnect / disconnect / network-change / stream-* */
  eventType: AgConnectionEventType;
  /** 前一個連線狀態（Agora connection-state-change 舊狀態） */
  prevState: string | null;
  /** 目前連線狀態（CONNECTING / CONNECTED / DISCONNECTED / RECONNECTING） */
  currState: string;
  /** 狀態變化原因（Agora SDK 回傳的 reason） */
  reason: string | null;

  /** 事件發生時間（ISO 8601） */
  occurredAt: string;
  createdAt: string;
}

// ─── API Payload 型別 ─────────────────────────────────────────────────────────

/** POST /api/agora/connection-log 請求 body */
export interface ConnectionLogPayload
  extends AgoraDeviceSnapshot,
    Omit<AgParticipant, 'participantId' | 'createdAt' | 'updatedAt'> {}

/** POST /api/agora/quality-event 請求 body */
export type QualityEventPayload = Omit<AgQualityEvent, 'eventId' | 'createdAt'>;

/** POST /api/agora/connection-event 請求 body */
export type ConnectionEventPayload = Omit<AgConnectionEvent, 'eventId' | 'createdAt'>;

/** POST /api/agora/session 請求 body（建立或更新 Session） */
export type SessionUpsertPayload = Omit<AgSession, 'sessionId' | 'createdAt' | 'updatedAt'> & {
  sessionId?: string;
};
