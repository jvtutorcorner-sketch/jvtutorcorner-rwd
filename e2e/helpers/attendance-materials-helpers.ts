/// <reference types="node" />

/**
 * 共用測試工具：QR 報到核銷 (attendance-checkin-qr) 與講義線上預覽 (materials-pdf-preview)
 * ================================================================
 *
 * 設計原則（比照 e2e/helpers/b2c-helpers.ts）：
 *   - 角色行為（教師/學生）一律走真實登入 API 取得 session cookie，
 *     不用 x-e2e-secret bypass 模擬——bypass 只用於建立測試資料（建課程、核准上架）。
 *   - 使用者的正規識別碼是 `roid_id`（見 SKILLS_VERIFICATION_STATUS.md #23 已知問題），
 *     不是 email；本檔所有回傳的 userId 一律取 `profile.roid_id || profile.id`。
 */

import { APIRequestContext, APIResponse } from '@playwright/test';
import crypto from 'crypto';

export const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';

export interface LoggedInProfile {
  userId: string;
  email: string;
  role?: string;
}

/**
 * 走真實登入 API（captchaValue 帶 LOGIN_BYPASS_SECRET 繞過驗證碼），
 * 回傳的 session cookie 會自動附著在同一個 APIRequestContext 之後的所有請求上。
 */
export async function loginViaApi(
  request: APIRequestContext,
  email: string,
  password: string,
  bypassSecret: string
): Promise<LoggedInProfile> {
  const captchaRes = await request.get(`${BASE_URL}/api/captcha`);
  const captchaToken = captchaRes.ok() ? (await captchaRes.json())?.token || '' : '';

  const loginRes = await request.post(`${BASE_URL}/api/login`, {
    data: JSON.stringify({ email, password, captchaToken, captchaValue: bypassSecret }),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!loginRes.ok()) {
    throw new Error(`[attendance-materials-helpers] Login failed for ${email}: ${loginRes.status()} ${await loginRes.text()}`);
  }

  const data = await loginRes.json();
  const profile = data?.profile || {};
  const userId = profile.roid_id || profile.id;
  if (!userId) {
    throw new Error(`[attendance-materials-helpers] Login response for ${email} had no roid_id/id: ${JSON.stringify(data)}`);
  }

  return { userId, email: profile.email || email, role: profile.role };
}

/**
 * 建立一堂帶時間戳標題的測試課程（綁定真實教師 UUID）並立即核准上架。
 * 回傳 courseId 供後續建立訂單/教材使用。
 */
export async function createAndApproveTestCourse(
  request: APIRequestContext,
  opts: { teacherId: string; bypassSecret: string; pointCost?: number; titlePrefix?: string }
): Promise<{ courseId: string; title: string }> {
  const courseId = crypto.randomUUID();
  const title = `${opts.titlePrefix || 'E2E 測試課程'} - ${Date.now()}`;
  const pointCost = opts.pointCost ?? 10;
  const now = new Date();

  const createRes = await request.post(`${BASE_URL}/api/courses`, {
    data: JSON.stringify({
      id: courseId,
      title,
      teacherName: 'E2E Test Teacher',
      teacherId: opts.teacherId,
      enrollmentType: 'points',
      pointCost,
      startDate: now.toISOString(),
      endDate: new Date(now.getTime() + 30 * 86400000).toISOString(),
      status: '上架',
    }),
    headers: { 'Content-Type': 'application/json', 'X-E2E-Secret': opts.bypassSecret },
  });
  if (!createRes.ok()) {
    throw new Error(`[attendance-materials-helpers] Course creation failed: ${createRes.status()} ${await createRes.text()}`);
  }

  const approveRes = await request.post(`${BASE_URL}/api/admin/course-reviews/${encodeURIComponent(courseId)}`, {
    data: JSON.stringify({ action: 'approve' }),
    headers: { 'Content-Type': 'application/json', 'X-E2E-Secret': opts.bypassSecret },
  });
  if (!approveRes.ok()) {
    console.warn(`[attendance-materials-helpers] Course approval returned ${approveRes.status()} (course may already be 上架, continuing)`);
  }

  return { courseId, title };
}

/**
 * 直接建立一筆已付款 (PAID) 訂單，跳過點數/escrow 邏輯（paymentMethod: 'free'），
 * 純粹用來造出票券/教材測試所需的「已報名」狀態。
 */
export async function createPaidOrder(
  request: APIRequestContext,
  opts: { courseId: string; userId: string; bypassSecret: string; courseTitle?: string }
): Promise<{ orderId: string }> {
  const res = await request.post(`${BASE_URL}/api/orders`, {
    data: JSON.stringify({
      courseId: opts.courseId,
      userId: opts.userId,
      status: 'PAID',
      paymentMethod: 'free',
      amount: 0,
      currency: 'TWD',
    }),
    headers: { 'Content-Type': 'application/json', 'X-E2E-Secret': opts.bypassSecret },
  });
  if (!res.ok()) {
    throw new Error(`[attendance-materials-helpers] Order creation failed: ${res.status()} ${await res.text()}`);
  }
  const data = await res.json();
  const orderId = data?.order?.orderId;
  if (!orderId) {
    throw new Error(`[attendance-materials-helpers] Order response missing orderId: ${JSON.stringify(data)}`);
  }
  return { orderId };
}

/**
 * ⚠️ 此函式的簽章邏輯必須與 lib/ticket/ticketToken.ts 的 signOrderToken 保持同步。
 * 測試腳本無法真的收信取得票券連結，因此在本地重現同一段 HMAC 簽章。
 */
export function computeTicketToken(orderId: string): string {
  const secret =
    process.env.TICKET_TOKEN_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.API_HMAC_SECRET ||
    'dev-insecure-ticket-secret';
  const sig = crypto.createHmac('sha256', secret).update(orderId).digest('hex');
  return `${orderId}.${sig}`;
}

/**
 * 建立一筆狀態為 ACTIVE 的報名紀錄（jvtutorcorner-enrollments）。
 *
 * ⚠️ 這是 lib/accessControl.ts 的 verifyCourseAccess() 實際檢查的資料表——
 * 「訂單 (orders) 是 PAID」不等於「報名 (enrollments) 是 PAID/ACTIVE」，
 * 兩者是不同的表，materials-preview 等依賴 verifyCourseAccess 的功能只認 enrollments。
 * 必須帶著已登入該學生的 request context 呼叫（POST /api/enroll 從 session 解析 userId）。
 */
export async function createActiveEnrollment(
  request: APIRequestContext,
  opts: { courseId: string; courseTitle: string; name: string; email: string }
): Promise<{ enrollmentId: string }> {
  const postRes = await request.post(`${BASE_URL}/api/enroll`, {
    data: JSON.stringify({
      name: opts.name,
      email: opts.email,
      courseId: opts.courseId,
      courseTitle: opts.courseTitle,
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!postRes.ok()) {
    throw new Error(`[attendance-materials-helpers] Enrollment creation failed: ${postRes.status()} ${await postRes.text()}`);
  }
  const enrollmentId = (await postRes.json())?.enrollment?.id;
  if (!enrollmentId) {
    throw new Error('[attendance-materials-helpers] Enrollment response missing id');
  }

  const patchRes = await request.patch(`${BASE_URL}/api/enroll`, {
    data: JSON.stringify({ id: enrollmentId, status: 'ACTIVE' }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!patchRes.ok()) {
    throw new Error(`[attendance-materials-helpers] Enrollment activation failed: ${patchRes.status()} ${await patchRes.text()}`);
  }

  return { enrollmentId };
}

export async function deleteEnrollment(request: APIRequestContext, enrollmentId: string): Promise<void> {
  try {
    await request.delete(`${BASE_URL}/api/enroll?id=${encodeURIComponent(enrollmentId)}`);
  } catch (e) {
    console.warn('[attendance-materials-helpers] Failed to clean up enrollment:', e);
  }
}

/** 刪除某課程底下所有訂單，再刪除課程本身（比照 e2e/student_enrollment_flow.spec.ts 的 cleanup 區塊）。 */
export async function cleanupCourseAndOrders(request: APIRequestContext, courseId: string): Promise<void> {
  try {
    const ordersRes = await request.get(`${BASE_URL}/api/orders?courseId=${encodeURIComponent(courseId)}&limit=50`);
    if (ordersRes.ok()) {
      const data = await ordersRes.json();
      const orders: Array<{ orderId: string }> = data?.data || [];
      for (const order of orders) {
        await request.delete(`${BASE_URL}/api/orders/${encodeURIComponent(order.orderId)}`).catch(() => {});
      }
    }
  } catch (e) {
    console.warn('[attendance-materials-helpers] Failed to clean up orders:', e);
  }

  try {
    await request.delete(`${BASE_URL}/api/courses?id=${encodeURIComponent(courseId)}`);
  } catch (e) {
    console.warn('[attendance-materials-helpers] Failed to clean up course:', e);
  }
}

export function readResponseHeader(res: APIResponse, name: string): string {
  return res.headers()[name.toLowerCase()] || '';
}
