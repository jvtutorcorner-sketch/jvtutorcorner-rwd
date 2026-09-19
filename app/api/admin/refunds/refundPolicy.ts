// app/api/admin/refunds/refundPolicy.ts
// 退款流程的「純邏輯」：誰能對訂單做什麼、退款要反轉哪些資產、金流退款紀錄長什麼樣子。
//
// 這個檔案刻意不 import 任何 AWS / Next.js 模組（也不用 `@/` alias），
// 讓 scripts/verify-refund-authz.mjs 可以在完全離線的情況下直接測試。
// 實際讀寫 DynamoDB 的部分在 ./refundService.ts 與 app/api/orders/[orderId]/route.ts。
//
// 金流實際退款（Stripe / PayPal / LINE Pay / ECPay）一律由管理員到各金流商後台手動處理，
// 本系統只記錄 gatewayRefund.reference，不呼叫任何金流退款 API。

/** 已付款、可以申請/執行退款的訂單狀態（paymentSuccessHandler 會把 PAID 推進成 COMPLETED）。 */
export const REFUNDABLE_ORDER_STATUSES: readonly string[] = ['PAID', 'COMPLETED'];

/** 尚未付款的訂單狀態：使用者可以自行取消，不牽涉任何資產。 */
export const UNPAID_ORDER_STATUSES: readonly string[] = ['PENDING', 'PENDING_PAYMENT', 'CREATED', 'UNPAID', 'FAILED'];

export type RefundStatus = 'REQUESTED' | 'PROCESSING' | 'MANUAL_REVIEW' | 'APPROVED' | 'REJECTED';

/** 這些 refundStatus 代表申請仍在處理中或已完成，不能再送出新的申請。 */
export const OPEN_REFUND_STATUSES: readonly RefundStatus[] = ['REQUESTED', 'PROCESSING', 'MANUAL_REVIEW', 'APPROVED'];

/** 管理員可以駁回的 refundStatus。 */
export const REJECTABLE_REFUND_STATUSES: readonly RefundStatus[] = ['REQUESTED', 'MANUAL_REVIEW'];

export const MAX_REFUND_REASON_LENGTH = 500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DynamoDB order items: shape varies by source (course / points / plan / B2B seat)
export type OrderRecord = Record<string, any>;

export function isRefundableStatus(status: unknown): boolean {
  return typeof status === 'string' && REFUNDABLE_ORDER_STATUSES.includes(status.toUpperCase());
}

export function isUnpaidStatus(status: unknown): boolean {
  return typeof status === 'string' && UNPAID_ORDER_STATUSES.includes(status.toUpperCase());
}

/**
 * B2B 席次訂單（app/api/enroll/seat/route.ts 建立）：amount 0、status PAID、沒有點數也沒有金流款項。
 * 不能申請或核准退款；要取消只能由管理員把訂單設為 CANCELLED（只取消報名、釋放席次）。
 */
export const B2B_SEAT_PAYMENT_METHOD = 'b2b_seat';
export const B2B_SEAT_REFUND_ERROR = 'B2B 席次報名沒有付款或點數可退，無法退款；如需取消請聯絡組織管理員';

export function isB2bSeatOrder(order: OrderRecord | null | undefined): boolean {
  return order?.paymentMethod === B2B_SEAT_PAYMENT_METHOD;
}

function isPrivilegedRole(role: string): boolean {
  return role === 'admin' || role === 'system';
}

// ─────────────────────────────────────────────
// 1. PATCH /api/orders/[orderId] 的授權與欄位白名單
// ─────────────────────────────────────────────

export type OrderPatchBody = {
  action?: unknown;
  status?: unknown;
  payments?: unknown;
  payment?: unknown;
  remainingSeconds?: unknown;
  reason?: unknown;
  manualGatewayRefundRef?: unknown;
  note?: unknown;
  [key: string]: unknown;
};

/** 非管理員送來的 body 只能出現這些 key，其餘一律 400（明確白名單，不默默忽略）。 */
export const RESTRICTED_PATCH_KEYS: readonly string[] = ['action', 'status', 'remainingSeconds', 'reason'];

export type OrderPatchDecision =
  | { ok: false; httpStatus: 400 | 403 | 409; error: string }
  /** admin/system：沿用原本的整筆更新（標記 PAID、CANCELLED、附加 payment 紀錄…）。 */
  | { ok: true; mode: 'privileged' }
  /** admin/system 把狀態設成 REFUNDED：交給 refundService.approveRefund（資產反轉 + 冪等）。 */
  | { ok: true; mode: 'refund' }
  /** 課程時間進度：只更新 remainingSeconds / remainingSessions。 */
  | {
      ok: true;
      mode: 'timer';
      remainingSeconds?: number;
      deduct: boolean;
      /** true = 呼叫者不是訂單擁有者，route 必須再確認他是這堂課的老師（canManageCourse）。 */
      requiresCourseTeacher: boolean;
    }
  /** 訂單擁有者申請退款：只寫 refundStatus=REQUESTED，不動 status 與任何資產。 */
  | { ok: true; mode: 'request_refund'; reason: string }
  /** 訂單擁有者取消「尚未付款」的訂單。 */
  | { ok: true; mode: 'cancel_unpaid' };

/**
 * 決定這次 PATCH 能不能做、要走哪條路徑。純函式：只看 session 角色、訂單目前內容與 body。
 *
 * 規則：
 *   - admin/system：status=REFUNDED 走 refund 流程，其餘沿用整筆更新（已退款訂單不可再改狀態）。
 *   - 其他角色（含 teacher）一律白名單：
 *       * action=request_refund（擁有者、已付款訂單、沒有進行中的申請）
 *       * status=CANCELLED（擁有者、未付款訂單）
 *       * remainingSeconds / action=deduct（擁有者只能更新 remainingSeconds；
 *         課程老師兩者皆可，但需要 route 端另外驗證課程擁有權）
 *     不能附加 payments、不能設定其他狀態（PAID / REFUNDED / COMPLETED …）。
 */
export function decideOrderPatch(input: {
  role: string;
  sessionUserId: string;
  order: OrderRecord;
  body: OrderPatchBody | null | undefined;
}): OrderPatchDecision {
  const { role, sessionUserId, order } = input;
  const body: OrderPatchBody = input.body && typeof input.body === 'object' ? input.body : {};
  const { action, status } = body;
  const hasRemaining = body.remainingSeconds !== undefined;
  const hasPayments = body.payments !== undefined || body.payment !== undefined;
  const currentStatus = typeof order.status === 'string' ? order.status.toUpperCase() : '';

  if (isPrivilegedRole(role)) {
    if (action === 'request_refund') {
      return { ok: false, httpStatus: 400, error: '管理員請直接核准或駁回退款（/api/admin/refunds），不需要送出申請' };
    }
    if (status === 'REFUNDED') {
      if (isB2bSeatOrder(order)) return { ok: false, httpStatus: 409, error: B2B_SEAT_REFUND_ERROR };
      return { ok: true, mode: 'refund' };
    }
    if (!status && action !== 'deduct' && typeof body.remainingSeconds !== 'number') {
      return { ok: false, httpStatus: 400, error: 'status, action, or remainingSeconds required' };
    }
    if (status && currentStatus === 'REFUNDED') {
      return { ok: false, httpStatus: 409, error: 'Order is already REFUNDED; its status can no longer change' };
    }
    return { ok: true, mode: 'privileged' };
  }

  // ── 非管理員：先擋欄位，再看動作 ──
  const unknownKeys = Object.keys(body).filter((k) => !RESTRICTED_PATCH_KEYS.includes(k));
  if (hasPayments) {
    return { ok: false, httpStatus: 403, error: 'Forbidden: only the payment gateway or an admin can record payments' };
  }
  if (unknownKeys.length > 0) {
    return { ok: false, httpStatus: 400, error: `Field(s) not allowed: ${unknownKeys.join(', ')}` };
  }
  if (status === 'PAID') {
    return { ok: false, httpStatus: 403, error: 'Forbidden: only the payment gateway or an admin can mark an order paid' };
  }

  const isOwner = !!order.userId && order.userId === sessionUserId;
  const isTeacher = role === 'teacher';

  if (action === 'request_refund') {
    if (status !== undefined || hasRemaining) {
      return { ok: false, httpStatus: 400, error: 'request_refund cannot be combined with other changes' };
    }
    if (!isOwner) {
      return { ok: false, httpStatus: 403, error: 'Forbidden: not the order owner' };
    }
    if (isB2bSeatOrder(order)) {
      return { ok: false, httpStatus: 409, error: B2B_SEAT_REFUND_ERROR };
    }
    if (!isRefundableStatus(currentStatus)) {
      return { ok: false, httpStatus: 409, error: `只有已付款的訂單可以申請退款（目前狀態：${currentStatus || 'UNKNOWN'}）` };
    }
    if (OPEN_REFUND_STATUSES.includes(order.refundStatus)) {
      return { ok: false, httpStatus: 409, error: `此訂單已有退款申請（${order.refundStatus}），請勿重複送出` };
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return { ok: false, httpStatus: 400, error: '請填寫退款原因' };
    }
    return { ok: true, mode: 'request_refund', reason: reason.slice(0, MAX_REFUND_REASON_LENGTH) };
  }

  if (status !== undefined) {
    if (status !== 'CANCELLED') {
      return {
        ok: false,
        httpStatus: 403,
        error: 'Forbidden: refunds must be requested (action: request_refund) and approved by an admin',
      };
    }
    if (action !== undefined || hasRemaining) {
      return { ok: false, httpStatus: 400, error: 'CANCELLED cannot be combined with other changes' };
    }
    if (!isOwner) {
      return { ok: false, httpStatus: 403, error: 'Forbidden: not the order owner' };
    }
    if (!isUnpaidStatus(currentStatus)) {
      return {
        ok: false,
        httpStatus: 403,
        error: `已付款或已結束的訂單無法自行取消（目前狀態：${currentStatus || 'UNKNOWN'}），請改為申請退款`,
      };
    }
    return { ok: true, mode: 'cancel_unpaid' };
  }

  if (body.reason !== undefined) {
    return { ok: false, httpStatus: 400, error: 'reason is only valid with action: request_refund' };
  }

  if (action === 'deduct' || hasRemaining) {
    if (action !== undefined && action !== 'deduct') {
      return { ok: false, httpStatus: 400, error: `Unknown action: ${String(action)}` };
    }
    let remainingSeconds: number | undefined;
    if (hasRemaining) {
      if (typeof body.remainingSeconds !== 'number' || !Number.isFinite(body.remainingSeconds)) {
        return { ok: false, httpStatus: 400, error: 'remainingSeconds must be a finite number' };
      }
      remainingSeconds = Math.max(0, body.remainingSeconds);
    }
    const deduct = action === 'deduct';
    if (currentStatus === 'REFUNDED' || currentStatus === 'CANCELLED') {
      return { ok: false, httpStatus: 409, error: `Order is ${currentStatus}; progress can no longer change` };
    }
    // 扣堂數只給課程老師（教室倒數結束時由老師端送出）；擁有者只能同步剩餘秒數。
    if (isTeacher && (!isOwner || deduct)) {
      return { ok: true, mode: 'timer', remainingSeconds, deduct, requiresCourseTeacher: true };
    }
    if (isOwner && !deduct) {
      return { ok: true, mode: 'timer', remainingSeconds, deduct, requiresCourseTeacher: false };
    }
    return { ok: false, httpStatus: 403, error: 'Forbidden: not the order owner or the course teacher' };
  }

  if (action !== undefined) {
    return { ok: false, httpStatus: 400, error: `Unknown action: ${String(action)}` };
  }
  return { ok: false, httpStatus: 400, error: 'status, action, or remainingSeconds required' };
}

// ─────────────────────────────────────────────
// 2. 管理員核准退款：要反轉哪些資產
// ─────────────────────────────────────────────

export type AssetReversalPlan =
  /** 以點數報名課程且有 escrow：把 escrow 退回學生（HOLDING → REFUNDED）。 */
  | { kind: 'escrow_refund'; escrowId: string; points: number }
  /** 以點數報名但訂單沒記 escrowId（舊資料）：先找 escrow，找不到才直接加回點數。 */
  | { kind: 'points_credit_legacy'; points: number }
  /** 用金流購買點數套餐：把買到的點數扣回；餘額不足 → 人工審查。 */
  | { kind: 'points_takeback'; points: number }
  /** 方案訂單：原方案沒有記錄，無法自動降級 → 人工審查。 */
  | { kind: 'manual'; reason: string }
  | { kind: 'none' };

export function planAssetReversal(order: OrderRecord): AssetReversalPlan {
  const itemType = typeof order.itemType === 'string' ? order.itemType.toUpperCase() : 'COURSE';
  const pointsUsed = Number(order.pointsUsed) || 0;
  const purchasedPoints = Number(order.points) || 0;

  if (isB2bSeatOrder(order)) {
    return { kind: 'none' };
  }
  if (order.paymentMethod === 'points' && pointsUsed > 0) {
    if (order.pointsEscrowId) {
      return { kind: 'escrow_refund', escrowId: String(order.pointsEscrowId), points: pointsUsed };
    }
    return { kind: 'points_credit_legacy', points: pointsUsed };
  }
  if (itemType === 'POINTS' && purchasedPoints > 0) {
    return { kind: 'points_takeback', points: purchasedPoints };
  }
  if (itemType === 'PLAN') {
    return {
      kind: 'manual',
      reason: '方案訂單需人工撤銷方案權限；處理完成後請勾選「資產已人工處理」再核准',
    };
  }
  return { kind: 'none' };
}

/** 非點數付款的訂單都需要人工到金流商後台退款。 */
export function needsManualGatewayRefund(order: OrderRecord): boolean {
  return order.paymentMethod !== 'points' && !isB2bSeatOrder(order);
}

/** 從 payments[] 找出金流交易編號（目前只有 LINE Pay 會存 transactionId），方便管理員到後台查詢。 */
export function findGatewayTransactionId(order: OrderRecord): string | null {
  const payments = Array.isArray(order.payments) ? order.payments : [];
  for (let i = payments.length - 1; i >= 0; i--) {
    const p = payments[i] || {};
    const id = p.transactionId || p.captureId || p.paymentIntentId || p.reference;
    if (id) return String(id);
  }
  return null;
}

export type GatewayRefundRecord = {
  mode: 'manual';
  status: 'PENDING_MANUAL' | 'DONE';
  reference: string | null;
  paymentMethod: string | null;
  gatewayTransactionId: string | null;
  updatedAt: string;
  updatedBy: string;
};

export function buildGatewayRefund(
  order: OrderRecord,
  reference: unknown,
  actorId: string,
  now: string
): GatewayRefundRecord {
  const ref = typeof reference === 'string' && reference.trim() ? reference.trim().slice(0, 200) : null;
  return {
    mode: 'manual',
    status: ref ? 'DONE' : 'PENDING_MANUAL',
    reference: ref,
    paymentMethod: order.paymentMethod ?? null,
    gatewayTransactionId: findGatewayTransactionId(order),
    updatedAt: now,
    updatedBy: actorId,
  };
}

// ─────────────────────────────────────────────
// 3. POST /api/admin/refunds 的輸入驗證
// ─────────────────────────────────────────────

export type AdminRefundAction =
  | {
      ok: true;
      action: 'approve';
      orderId: string;
      note: string | null;
      manualGatewayRefundRef: string | null;
      assetsHandledManually: boolean;
    }
  | { ok: true; action: 'reject'; orderId: string; note: string | null }
  | { ok: true; action: 'gateway_ref'; orderId: string; manualGatewayRefundRef: string; note: string | null }
  | { ok: false; error: string };

function optionalText(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

export function parseAdminRefundAction(body: unknown): AdminRefundAction {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const orderId = typeof b.orderId === 'string' ? b.orderId.trim() : '';
  if (!orderId) return { ok: false, error: 'orderId required' };
  const note = optionalText(b.note, MAX_REFUND_REASON_LENGTH);
  const ref = optionalText(b.manualGatewayRefundRef, 200);

  switch (b.action) {
    case 'approve':
      return {
        ok: true,
        action: 'approve',
        orderId,
        note,
        manualGatewayRefundRef: ref,
        assetsHandledManually: b.assetsHandledManually === true,
      };
    case 'reject':
      return { ok: true, action: 'reject', orderId, note };
    case 'gateway_ref':
      if (!ref) return { ok: false, error: 'manualGatewayRefundRef required' };
      return { ok: true, action: 'gateway_ref', orderId, manualGatewayRefundRef: ref, note };
    default:
      return { ok: false, error: "action must be 'approve', 'reject' or 'gateway_ref'" };
  }
}
