/**
 * full_journey.ts — the MVP acceptance path that 07 skips by default.
 *
 * 07 normally grants 9999 points via /api/admin/grant-points and enrolls through
 * runEnrollmentFlow (which grants again), then stops after classroom sync. The MVP
 * acceptance (docs/MVP.md §6.1) needs each group to:
 *   B1  buy points with the simulated gateway and see them credited,
 *   B2  enroll with those points: balanceBefore − pointsUsed = balanceAfter,
 *   B3  get a HOLDING escrow for the order,
 *   F   have the teacher end the class → escrow RELEASED, teacher += escrow points.
 *
 * Every request that reads balances/escrows carries X-E2E-Secret (system session);
 * enrollment mirrors runEnrollmentViaApi minus the admin grant.
 */
import type { Page, APIRequestContext } from '@playwright/test';

// Loosely-typed API payloads (profiles, courses, orders) as returned by the app.
type Json = Record<string, unknown>;
type Profile = { email?: string; roid_id?: string; id?: string; plan?: string; role?: string; firstName?: string; lastName?: string };

export interface JourneyAccount {
  email: string;
  password: string;
}

export interface PurchaseResult {
  userId: string;
  balanceBefore: number;
  balanceAfter: number;
}

export interface EnrollResult {
  userId: string;
  orderId: string;
  pointsUsed: number;
  balanceBefore: number;
  balanceAfter: number;
}

export interface EscrowSnapshot {
  escrowId: string;
  orderId: string;
  teacherId: string;
  studentId: string;
  points: number;
  status: string;
}

function e2eHeaders(bypassSecret: string, json = false): Record<string, string> {
  return {
    'X-E2E-Secret': bypassSecret,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

function buildLocalIsoMinutes(date: Date): string {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

/** API login in the page's context (cookies land in the context). Returns the profile. */
export async function loginViaApi(
  page: Page,
  baseUrl: string,
  account: JourneyAccount,
  bypassSecret: string
): Promise<Profile> {
  const captchaRes = await page.request.get(`${baseUrl}/api/captcha`, { headers: e2eHeaders(bypassSecret) });
  const captcha: { token?: string } = await captchaRes.json().catch(() => ({}));
  const loginRes = await page.request.post(`${baseUrl}/api/login`, {
    headers: e2eHeaders(bypassSecret, true),
    data: JSON.stringify({
      email: account.email,
      password: account.password,
      captchaToken: captcha?.token || '',
      captchaValue: bypassSecret,
    }),
  });
  const login: { profile?: Profile } = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok() || !login?.profile) {
    throw new Error(`Login failed for ${account.email}: ${loginRes.status()} ${JSON.stringify(login)}`);
  }
  return login.profile;
}

function profileUserId(profile: Profile, fallback: string): string {
  return String(profile?.roid_id || profile?.id || fallback);
}

export async function getPointsBalance(
  request: APIRequestContext,
  baseUrl: string,
  userId: string,
  bypassSecret: string
): Promise<number> {
  const res = await request.get(`${baseUrl}/api/points?userId=${encodeURIComponent(userId)}`, {
    headers: e2eHeaders(bypassSecret),
  });
  const json: { balance?: unknown } = await res.json().catch(() => ({}));
  if (!res.ok() || typeof json?.balance !== 'number') {
    throw new Error(`Balance lookup failed for ${userId}: ${res.status()} ${JSON.stringify(json)}`);
  }
  return json.balance as number;
}

/**
 * B1: buy the first point package on /pricing with the simulated gateway.
 * Asserts only that the balance went up; the package/app-cost formula is covered
 * by e2e/pricing_deduction.spec.ts.
 */
export async function purchasePointsSimulated(
  page: Page,
  baseUrl: string,
  account: JourneyAccount,
  bypassSecret: string
): Promise<PurchaseResult> {
  const profile = await loginViaApi(page, baseUrl, account, bypassSecret);
  const userId = profileUserId(profile, account.email);

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((p: Profile) => {
    localStorage.setItem('tutor_mock_user', JSON.stringify({
      email: p.email,
      roid_id: p.roid_id,
      id: p.id,
      plan: p.plan || 'basic',
      role: p.role,
      firstName: p.firstName,
      lastName: p.lastName,
    }));
    window.dispatchEvent(new Event('tutor:auth-changed'));
  }, profile);

  const balanceBefore = await getPointsBalance(page.request, baseUrl, userId, bypassSecret);

  await page.goto(`${baseUrl}/pricing`, { waitUntil: 'networkidle' });
  await page.locator('a:has-text("購買點數"), button:has-text("購買點數")').first().click();
  await page.waitForURL(/\/pricing\/checkout/, { timeout: 30000 });
  await page.locator('button:has-text("模擬支付 (Demo)")').click();
  await page.waitForURL(url => url.pathname === '/plans' || url.pathname === '/pricing', { timeout: 30000 });

  let balanceAfter = balanceBefore;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    balanceAfter = await getPointsBalance(page.request, baseUrl, userId, bypassSecret);
    if (balanceAfter > balanceBefore) break;
    await page.waitForTimeout(1000);
  }
  if (balanceAfter <= balanceBefore) {
    throw new Error(`B1: balance did not increase after simulated purchase (${balanceBefore} → ${balanceAfter})`);
  }
  return { userId, balanceBefore, balanceAfter };
}

/** B2/B3: enroll with the student's own points (no admin grant) and check the deduction. */
export async function enrollWithOwnPoints(
  page: Page,
  baseUrl: string,
  courseId: string,
  account: JourneyAccount,
  bypassSecret: string
): Promise<EnrollResult> {
  const profile = await loginViaApi(page, baseUrl, account, bypassSecret);
  const userId = profileUserId(profile, account.email);

  const courseRes = await page.request.get(`${baseUrl}/api/courses?id=${encodeURIComponent(courseId)}`, {
    headers: e2eHeaders(bypassSecret),
  });
  const courseJson: { course?: Json; data?: Json | Json[] } = await courseRes.json().catch(() => ({}));
  const course: Json | null =
    courseJson?.course || (Array.isArray(courseJson?.data) ? courseJson.data[0] : courseJson?.data) || null;
  if (!courseRes.ok() || !course) {
    throw new Error(`Course lookup failed for ${courseId}: ${courseRes.status()}`);
  }

  const balanceBefore = await getPointsBalance(page.request, baseUrl, userId, bypassSecret);
  const durationMinutes = Number(course?.durationMinutes) || 5;
  const pointCost = Number(course?.pointCost) || 10;
  if (balanceBefore < pointCost) {
    throw new Error(`B2: purchased balance ${balanceBefore} is below the course cost ${pointCost}`);
  }

  const start = new Date();
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const startTime = buildLocalIsoMinutes(start);
  const endTime = buildLocalIsoMinutes(end);

  const enrollRes = await page.request.post(`${baseUrl}/api/enroll`, {
    headers: e2eHeaders(bypassSecret, true),
    data: JSON.stringify({
      name: String(profile?.firstName || 'E2E Student'),
      email: account.email,
      courseId,
      courseTitle: course?.title || courseId,
      startTime,
      endTime,
    }),
  });
  const enrollJson: { enrollment?: { id?: string } } = await enrollRes.json().catch(() => ({}));
  if (!enrollRes.ok() || !enrollJson?.enrollment?.id) {
    throw new Error(`Enroll failed: ${enrollRes.status()} ${JSON.stringify(enrollJson)}`);
  }

  const orderRes = await page.request.post(`${baseUrl}/api/orders`, {
    headers: e2eHeaders(bypassSecret, true),
    data: JSON.stringify({
      courseId,
      enrollmentId: enrollJson.enrollment.id,
      amount: 0,
      currency: 'TWD',
      userId,
      startTime,
      endTime,
      paymentMethod: 'points',
      pointsUsed: pointCost,
      status: 'PAID',
    }),
  });
  const orderJson: { ok?: boolean; order?: { orderId?: string; pointsUsed?: number } } = await orderRes.json().catch(() => ({}));
  const order = orderJson?.order;
  if (!orderRes.ok() || !orderJson?.ok || !order?.orderId) {
    throw new Error(`Order creation failed: ${orderRes.status()} ${JSON.stringify(orderJson)}`);
  }

  const pointsUsed = Number(order.pointsUsed ?? pointCost);
  const balanceAfter = await getPointsBalance(page.request, baseUrl, userId, bypassSecret);
  if (balanceBefore - pointsUsed !== balanceAfter) {
    throw new Error(`B2: expected ${balanceBefore} − ${pointsUsed} = ${balanceBefore - pointsUsed}, got ${balanceAfter}`);
  }
  return { userId, orderId: String(order.orderId), pointsUsed, balanceBefore, balanceAfter };
}

export async function getEscrowForOrder(
  request: APIRequestContext,
  baseUrl: string,
  orderId: string,
  bypassSecret: string
): Promise<EscrowSnapshot | null> {
  const res = await request.get(`${baseUrl}/api/points-escrow?orderId=${encodeURIComponent(orderId)}`, {
    headers: e2eHeaders(bypassSecret),
  });
  // 404 = no escrow for this order yet
  if (!res.ok()) return null;
  const json: { escrow?: EscrowSnapshot } = await res.json().catch(() => ({}));
  const record = json?.escrow;
  return record?.orderId === orderId ? (record as EscrowSnapshot) : null;
}

export async function waitForEscrowStatus(
  request: APIRequestContext,
  baseUrl: string,
  orderId: string,
  status: 'HOLDING' | 'RELEASED',
  bypassSecret: string,
  timeoutMs = 60000
): Promise<EscrowSnapshot> {
  const deadline = Date.now() + timeoutMs;
  let last: EscrowSnapshot | null = null;
  while (Date.now() < deadline) {
    last = await getEscrowForOrder(request, baseUrl, orderId, bypassSecret);
    if (last?.status === status) return last;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Escrow for order ${orderId} not ${status} within ${timeoutMs}ms (last=${last?.status ?? 'none'})`);
}

/** Teacher clicks 結束課程 / End Class, accepts the confirm() dialog, and waits to leave the room. */
export async function endClassAsTeacher(teacherPage: Page, timeoutMs = 30000): Promise<void> {
  teacherPage.once('dialog', dialog => dialog.accept().catch(() => {}));
  const endButton = teacherPage
    .locator('button:has-text("結束課程"), button:has-text("结束课程"), button:has-text("End Class"), button:has-text("End Session")')
    .first();
  await endButton.waitFor({ state: 'visible', timeout: timeoutMs });
  await endButton.click();
  await teacherPage.waitForURL(/\/classroom\/wait/, { timeout: timeoutMs });
}
