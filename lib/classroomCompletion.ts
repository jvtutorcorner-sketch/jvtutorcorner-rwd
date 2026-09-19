// lib/classroomCompletion.ts
// 老師按「結束課程」時的點數結算判斷。
//
// Agora 路徑先前沒有任何前端呼叫會觸發結算：/api/agora/session 的 PATCH 雖然會
// releaseEscrow，但教室頁面從未建立或結束 agora session；只有 LiveKit webhook
// 與管理員手動 POST /api/points-escrow 會撥款。結果老師結束課程後點數永遠停在
// HOLDING。這裡把「可不可以撥款」抽成純函式，讓 /api/classroom/complete 與離線
// 測試共用。

import type { EscrowRecord } from '@/lib/pointsEscrow';

/** 開課前多久起算「課程已開始」，與進入教室按鈕的開放時間一致。 */
export const COMPLETION_EARLY_WINDOW_MS = 10 * 60 * 1000;

const SETTLED_ORDER_STATUSES = new Set(['PAID', 'ACTIVE', 'COMPLETED']);

export type CompletionOrder = {
  orderId: string;
  courseId?: string | null;
  status?: string | null;
  startTime?: string | null;
};

export type CompletionDecision =
  | { action: 'release'; escrowId: string }
  | { action: 'noop'; reason: 'NO_ESCROW' | 'ALREADY_RELEASED' }
  | { action: 'reject'; status: 400 | 404 | 409; error: string };

/**
 * 訂單時間有兩種格式：EnrollButton 存的是 datetime-local 的牆上時間
 * （`2026-09-17T18:00`，沒有時區），其他路徑存 UTC ISO（帶 `Z`）。伺服器在
 * Lambda 上是 UTC，直接 Date.parse 會把台灣時間當成 UTC 而差 8 小時，
 * 所以沒有時區的字串一律視為平台時區（台北，+08:00）。
 */
const NAIVE_LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const PLATFORM_UTC_OFFSET = '+08:00';

export function parseOrderTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = NAIVE_LOCAL_TIME.test(value) ? `${value}${PLATFORM_UTC_OFFSET}` : value;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

export function decideCompletion(input: {
  courseId: string;
  order: CompletionOrder | null;
  escrow: Pick<EscrowRecord, 'escrowId' | 'status' | 'courseId'> | null;
  now: number;
}): CompletionDecision {
  const { courseId, order, escrow, now } = input;

  if (!order) return { action: 'reject', status: 404, error: 'Order not found' };
  if (order.courseId !== courseId) {
    return { action: 'reject', status: 400, error: 'Order does not belong to this course' };
  }
  if (!SETTLED_ORDER_STATUSES.has(String(order.status || '').toUpperCase())) {
    return { action: 'reject', status: 409, error: `Order is not payable (status=${order.status ?? 'unknown'})` };
  }

  // 課程還沒開始就結束，不撥款（避免排課後立刻按結束領點數）。
  const start = parseOrderTime(order.startTime);
  if (start !== null && now < start - COMPLETION_EARLY_WINDOW_MS) {
    return { action: 'reject', status: 409, error: 'Class has not started yet' };
  }

  // 非點數付款（刷卡、企業席次）沒有暫存紀錄，結束課程不需要撥款。
  if (!escrow) return { action: 'noop', reason: 'NO_ESCROW' };
  if (escrow.courseId && escrow.courseId !== courseId) {
    return { action: 'reject', status: 400, error: 'Escrow does not belong to this course' };
  }
  if (escrow.status === 'RELEASED') return { action: 'noop', reason: 'ALREADY_RELEASED' };
  if (escrow.status !== 'HOLDING') {
    return { action: 'reject', status: 409, error: `Escrow is ${escrow.status}` };
  }
  return { action: 'release', escrowId: escrow.escrowId };
}
