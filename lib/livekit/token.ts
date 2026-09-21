// lib/livekit/token.ts
//
// 把 authorizeJoin() 的結果轉成 LiveKit Access Token（JWT）。
//
// 權限對照：
//   teacher → roomAdmin（可踢人 / 靜音對方）、publish / subscribe / data
//   student → publish / subscribe / data（1 對 1 教室學生也要開鏡頭與麥克風）
//   admin   → 只能 subscribe，hidden=true（旁聽稽核，不出現在對方參與者清單）
//
// identity 規則：`<role>:<userId>`。LiveKit 用 identity 判斷「同一個人」，
// 同一個 identity 重複連線時新的會把舊的踢掉，這正是我們要的「換分頁 / 重連」行為。
// Webhook（Phase 4）也靠這個前綴把 participant 對回平台使用者與角色。

import { AccessToken, RoomServiceClient, type VideoGrant } from 'livekit-server-sdk';
import { getLiveKitConfig, toHttpUrl } from './config';
import type { ClassroomParticipantRole, JoinAuthorization } from './authorizeJoin';

/** 放進 token metadata 的內容，前端與 webhook 都能讀到。 */
export interface ParticipantMetadata {
  role: ClassroomParticipantRole;
  userId: string;
  courseSessionId: string;
  courseId: string;
}

export interface IssuedToken {
  token: string;
  url: string;
  roomName: string;
  identity: string;
  role: ClassroomParticipantRole;
  expiresAt: number;
}

export function buildIdentity(role: ClassroomParticipantRole, userId: string): string {
  return `${role}:${userId}`;
}

/** 從 identity 反解出角色與 userId；格式不符回 null（Phase 4 webhook 用）。 */
export function parseIdentity(identity: string): { role: ClassroomParticipantRole; userId: string } | null {
  const idx = identity.indexOf(':');
  if (idx <= 0) return null;
  const role = identity.slice(0, idx);
  const userId = identity.slice(idx + 1);
  if (role !== 'teacher' && role !== 'student' && role !== 'admin') return null;
  if (!userId) return null;
  return { role, userId };
}

function grantFor(role: ClassroomParticipantRole, roomName: string): VideoGrant {
  const base: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
  };
  switch (role) {
    case 'teacher':
      return { ...base, roomAdmin: true, canPublish: true, canPublishData: true };
    case 'student':
      return { ...base, canPublish: true, canPublishData: true };
    case 'admin':
      return { ...base, canPublish: false, canPublishData: false, hidden: true };
  }
}

export async function issueClassroomToken(
  auth: JoinAuthorization,
  userId: string
): Promise<IssuedToken> {
  const cfg = getLiveKitConfig();
  const nowSec = Math.floor(Date.now() / 1000);
  const ttl = Math.max(60, auth.tokenExpiresAt - nowSec);

  const identity = buildIdentity(auth.participantRole, userId);
  const metadata: ParticipantMetadata = {
    role: auth.participantRole,
    userId,
    courseSessionId: auth.courseSession.id,
    courseId: auth.courseSession.courseId,
  };

  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity,
    name: auth.displayName,
    ttl,
    metadata: JSON.stringify(metadata),
  });
  at.addGrant(grantFor(auth.participantRole, auth.roomName));

  const token = await at.toJwt();
  return {
    token,
    url: cfg.url,
    roomName: auth.roomName,
    identity,
    role: auth.participantRole,
    expiresAt: nowSec + ttl,
  };
}

let roomService: RoomServiceClient | null = null;
function getRoomService(): RoomServiceClient {
  if (!roomService) {
    const cfg = getLiveKitConfig();
    roomService = new RoomServiceClient(toHttpUrl(cfg.url), cfg.apiKey, cfg.apiSecret);
  }
  return roomService;
}

/**
 * 預先建立房間並鎖定人數上限。
 *
 * LiveKit 預設會在第一個人 join 時自動開房，但那樣無法設定 maxParticipants / emptyTimeout。
 * createRoom 對已存在的房間是冪等的（回傳既有房間），所以每次簽 token 前呼叫都安全。
 * 失敗時「不」阻擋簽 token：房間仍會由 server 自動建立，只是少了人數上限。
 */
export async function ensureClassroomRoom(
  roomName: string,
  opts: { isOneOnOne: boolean; courseSessionId: string }
): Promise<void> {
  const cfg = getLiveKitConfig();
  try {
    await getRoomService().createRoom({
      name: roomName,
      emptyTimeout: cfg.roomEmptyTimeoutSec,
      // 1 對 1：老師 + 學生 + 最多 1 位隱藏的稽核管理員
      maxParticipants: opts.isOneOnOne ? 3 : 0,
      metadata: JSON.stringify({ courseSessionId: opts.courseSessionId }),
    });
  } catch (err) {
    console.warn('[livekit/token] ensureClassroomRoom failed (non-fatal)', roomName, err);
  }
}
