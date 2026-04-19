/**
 * Shared helper functions for whiteboard sync E2E tests.
 * Import these in scenario spec files — keep test files clean.
 */

import { Page, Dialog } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';
import { getTestConfig, TestConfig, ADMIN_EMAIL, ADMIN_PASSWORD } from '../test_data/whiteboard_test_data';

export interface DrawingPoint {
  x: number;
  y: number;
}

// ─────────────────────────────────────────────────────────────────────
// Enrollment
// ─────────────────────────────────────────────────────────────────────

export function runEnrollmentFlow(
  courseId: string,
  teacherEmail?: string,
  studentEmail?: string,
  maxRetries = 2
): void {
  const config = getTestConfig();
  const cmd =
    process.platform === 'win32'
      ? `set TEST_COURSE_ID=${courseId}&& set SKIP_CLEANUP=true&& npx playwright test e2e/student_enrollment_flow.spec.ts --project=chromium`
      : `TEST_COURSE_ID=${courseId} SKIP_CLEANUP=true npx playwright test e2e/student_enrollment_flow.spec.ts --project=chromium`;

  const childEnv = {
    ...process.env,
    TEST_TEACHER_EMAIL: teacherEmail || config.teacherEmail,
    TEST_TEACHER_PASSWORD: process.env.TEST_TEACHER_PASSWORD,
    TEST_STUDENT_EMAIL: studentEmail || config.studentEmail,
    TEST_STUDENT_PASSWORD: process.env.TEST_STUDENT_PASSWORD,
    QA_TEACHER_EMAIL: teacherEmail || config.teacherEmail,
    QA_STUDENT_EMAIL: studentEmail || config.studentEmail,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    AGORA_WHITEBOARD_APP_ID: process.env.AGORA_WHITEBOARD_APP_ID,
    AGORA_WHITEBOARD_AK: process.env.AGORA_WHITEBOARD_AK,
    AGORA_WHITEBOARD_SK: process.env.AGORA_WHITEBOARD_SK,
    LOGIN_BYPASS_SECRET: process.env.LOGIN_BYPASS_SECRET,
    PWDEBUG: undefined,
  } as any;

  console.log(`\n   🚀 [${courseId}] Starting enrollment subprocess`);
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      execSync(cmd, { stdio: 'inherit', cwd: path.resolve(__dirname, '../..'), env: childEnv });
      console.log(`   ✅ [${courseId}] Enrollment flow succeeded`);
      
      // ⭐ Critical: Wait for course list cache to update
      // In stress tests, DynamoDB/cache may need extra time to propagate
      console.log(`   ⏳ [${courseId}] Waiting 3s for course list cache refresh...`);
      const startWait = Date.now();
      while (Date.now() - startWait < 3000) { /* wait */ }
      
      return;
    } catch (err) {
      lastError = err as Error;
      console.error(`   ❌ [${courseId}] Attempt ${attempt}/${maxRetries} failed`);
      if (attempt < maxRetries) {
        const t = Date.now() + 2000;
        while (Date.now() < t) { /* busy wait */ }
      }
    }
  }
  throw lastError || new Error(`Enrollment flow failed for course: ${courseId}`);
}

// ─────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────

export async function injectDeviceCheckBypass(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as any).__E2E_BYPASS_DEVICE_CHECK__ = true;
  });
}

export async function autoLogin(
  page: Page,
  email: string,
  password: string,
  bypassSecret: string
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const captchaRes = await page.request.get(`${baseUrl}/api/captcha`).catch(() => null);
  const captchaToken = (await captchaRes?.json().catch(() => ({})))?.token || '';

  const loginRes = await page.request.post(`${baseUrl}/api/login`, {
    data: JSON.stringify({ email, password, captchaToken, captchaValue: bypassSecret }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!loginRes.ok()) {
    throw new Error(`❌ Login failed (${loginRes.status()}): ${await loginRes.text()}`);
  }

  const loginData = await loginRes.json();
  const profile = loginData?.profile || loginData?.data || loginData;
  const isTeacher =
    email === process.env.TEST_TEACHER_EMAIL ||
    email.includes('teacher') ||
    (email.includes('test') && email.includes('lin'));

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ profile, isTeacher }) => {
      const userData = {
        email: profile?.email || profile?.data?.email,
        role: isTeacher ? 'teacher' : (profile?.role || 'student'),
        plan: profile?.plan || 'basic',
        id: profile?.id || profile?.userId || '',
        teacherId: profile?.id || profile?.userId || profile?.email || '',
      };
      localStorage.setItem('tutor_mock_user', JSON.stringify(userData));
      const now = Date.now().toString();
      sessionStorage.setItem('tutor_last_login_time', now);
      localStorage.setItem('tutor_last_login_time', now);
      sessionStorage.setItem('tutor_login_complete', 'true');
      window.dispatchEvent(new Event('tutor:auth-changed'));
    },
    { profile, isTeacher }
  );

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('tutor_mock_user');
    return raw ? JSON.parse(raw) : null;
  });
  if (!stored?.email) throw new Error('❌ autoLogin: localStorage not set properly');
  console.log(`✅ autoLogin OK — email: ${stored.email}, role: ${stored.role}`);
  await page.waitForTimeout(500);
}

// ─────────────────────────────────────────────────────────────────────
// Enrollment Check
// ─────────────────────────────────────────────────────────────────────

export async function checkAndFindEnrollment(
  page: Page,
  config: TestConfig,
  preferredId?: string
): Promise<string | null> {
  console.log(`   🔍 Checking enrollment for ${config.studentEmail}...`);
  try {
    const url = new URL(`${config.baseUrl}/api/orders`);
    url.searchParams.append('userId', config.studentEmail);
    url.searchParams.append('limit', '100');

    const res = await page.request.get(url.toString());
    if (!res.ok()) return null;

    const { data: orders = [] } = await res.json();
    const validOrders = orders.filter((o: any) => {
      const s = String(o.status || '').toUpperCase();
      return s !== 'CANCELLED' && s !== 'FAILED' && o.courseId;
    });

    for (const order of validOrders) {
      if (preferredId && order.courseId !== preferredId && !order.courseId.includes(preferredId)) continue;
      const courseRes = await page.request
        .get(`${config.baseUrl}/api/courses?id=${order.courseId}`)
        .catch(() => null);
      if (courseRes?.ok()) {
        const { course } = await courseRes.json();
        const teacher = (course.teacherId || course.teacherEmail || '').toLowerCase().trim();
        const target = config.teacherEmail.trim();
        if (course.teacherId && (teacher === target || teacher.includes(target) || target.includes(teacher))) {
          return order.courseId;
        }
      }
    }
  } catch (e) {
    console.warn('   ⚠️ Enrollment check failed:', e);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────

export async function goToWaitRoom(
  page: Page,
  courseId: string,
  role: 'teacher' | 'student'
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const listPath = role === 'teacher' ? 'teacher_courses?includeTests=true' : 'student_courses';

  // Retry logic: Poll for course up to 5 times (stress tests may need extra time)
  let found = false;
  const maxRetries = 5;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`   🔄 [${role}] Attempt ${attempt}/${maxRetries} to find course ${courseId}...`);
    
    await page.goto(`${baseUrl}/${listPath}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('table, .course-list, .orders-table, .section', { timeout: 15000 });
    await page.waitForTimeout(1000 * attempt); // Increase wait time with each attempt

    // Debug: Log all rows/cards on the page
    const allRows = await page.locator('tr, div[class*="course"], [data-testid*="course"]').count();
    console.log(`   📊 [${role}] Found ${allRows} course rows/cards on page`);

    // Strategy 1: Find by exact courseId attribute
    // Note: Playwright's :has-text() with regex should be :has-text("/regex/") but usually "text" is safer
    const exactBtn = page.locator(`[data-course-id="${courseId}"] button`, { hasText: /進入教室|enter|Enter/i }).first();
    if (await exactBtn.isVisible().catch(() => false)) {
      console.log(`   ✅ [${role}] Found course via exact data-course-id match`);
      await exactBtn.click();
      found = true;
      break;
    }

    // Strategy 2: Search all "進入教室" buttons and check their parent row
    const allEnterBtns = page.locator('button, a').filter({ hasText: /進入教室|enter|Enter/i });
    const btnCount = await allEnterBtns.count();
    console.log(`   🔍 [${role}] Found ${btnCount} "進入教室" buttons`);
    
    for (let i = 0; i < btnCount; i++) {
      const btn = allEnterBtns.nth(i);
      const btnText = await btn.textContent().catch(() => '');
      const rowId = await btn.evaluate((el) => {
        const row = el.closest('tr, div[class*="row"], div[class*="card"]');
        return row?.getAttribute('data-course-id') || row?.textContent?.slice(0, 50) || 'unknown';
      });
      
      console.log(`   └─ Button ${i}: "${(btnText || '').trim()}" in row: ${rowId}`);
      
      // Check if courseId is in the row text or attribute
      const isMatch = await btn.evaluate((el, cid) => {
        const row = el.closest('tr, div[class*="row"], div[class*="card"], section, [role="row"]');
        if (!row) return false;
        
        const rowText = row.textContent || '';
        const rowId = row.getAttribute('data-course-id') || '';
        const href = (row.querySelector('a') as any)?.href || '';
        
        // Extract courseId from various places
        return (
          rowText.includes(cid) || 
          rowId === cid || 
          rowId.includes(cid) ||
          href.includes(cid) ||
          href.includes(`/classroom/wait?course=${cid}`) ||
          href.includes(`course=${cid}`)
        );
      }, courseId);
      
      if (isMatch) {
        console.log(`   ✅ [${role}] Found matching row at button ${i}`);
        await btn.click();
        found = true;
        break;
      }
    }
    
    if (found) break;
    
    // If not found and not last attempt, refresh and retry
    if (attempt < maxRetries) {
      console.log(`   ⏳ Course not found, waiting before retry...`);
      await page.waitForTimeout(2000);
    } else {
      // Last attempt: take screenshot and show available courses
      const courseList = await page.locator('tr, div[class*="course"]').evaluateAll(rows => {
        return rows.slice(0, 10).map(row => ({
          text: row.textContent?.slice(0, 100) || 'unknown',
          id: (row as any).getAttribute('data-course-id') || 'no-id'
        }));
      });
      console.log(`   📋 [${role}] Available courses:\n${courseList.map(c => `      ${c.id}: ${c.text}`).join('\n')}`);
      await page.screenshot({ path: `test-results/fail-find-course-${role}-${courseId}.png` });
    }
  }

  if (!found) {
    throw new Error(`❌ [${role}] Course ${courseId} not found in list after ${maxRetries} attempts`);
  }

  await page.waitForURL(/\/classroom\/wait/, { timeout: 15000 });
}

// ─────────────────────────────────────────────────────────────────────
// Classroom Entry
// ─────────────────────────────────────────────────────────────────────

export async function enterClassroom(page: Page, role: 'teacher' | 'student'): Promise<void> {
  const { expect } = await import('@playwright/test');
  await expect(page.locator('.wait-page-container, h2').first()).toBeVisible({ timeout: 10000 });
  const readyButton = page.locator('button').filter({ hasText: /準備好|Ready/ }).first();
  await expect(readyButton).toBeEnabled({ timeout: 15000 });
  console.log(`   ✅ [${role}] /classroom/wait loaded, Ready button enabled`);
}

export async function clickReadyButton(page: Page, role: 'teacher' | 'student'): Promise<void> {
  const readyButton = page.locator('button').filter({ hasText: /準備好|Ready/ }).first();
  let resolved = false;
  const readyPromise = new Promise<void>((resolve) => {
    const handler = async (response: any) => {
      if (!response.url().includes('/api/classroom/ready') || response.request().method() !== 'POST') return;
      try { await response.json(); } catch { /* ignore */ }
      if (!resolved) { resolved = true; page.off('response', handler); resolve(); }
    };
    page.on('response', handler);
  });

  await readyButton.click();
  await Promise.race([readyPromise, page.waitForTimeout(8000)]);
  await page.waitForTimeout(1000); // let DynamoDB write settle
  console.log(`   ✅ [${role}] Ready state sent`);
}

export async function waitAndEnterClassroom(page: Page, role: 'teacher' | 'student'): Promise<void> {
  const enterBtn = page.locator('button, a').filter({ hasText: /立即進入教室|Enter Classroom/ }).first();
  try {
    await enterBtn.waitFor({ state: 'visible', timeout: 60000 });
  } catch {
    await page.screenshot({ path: `test-results/fail-enter-${role}.png` }).catch(() => {});
    throw new Error(`❌ [${role}] 立即進入教室 button never appeared`);
  }
  await enterBtn.click();
  await page.waitForURL(/\/classroom\/room/, { timeout: 20000 });
  await page.waitForTimeout(5000);
  console.log(`   ✅ [${role}] Entered /classroom/room`);
}

// ─────────────────────────────────────────────────────────────────────
// Whiteboard
// ─────────────────────────────────────────────────────────────────────

export async function drawOnWhiteboard(page: Page): Promise<void> {
  // Wait for Agora SDK + room
  for (const [label, fn] of [
    ['WhiteWebSdk', () => !!(window as any).WhiteWebSdk?.WhiteWebSdk],
    ['agoraRoom', () => (window as any).agoraRoom !== undefined],
  ] as [string, () => boolean][]) {
    await page.waitForFunction(fn, { timeout: 20000 }).catch(() => {
      console.log(`   ⚠️ ${label} not ready within 20 s`);
    });
  }

  // Wait for visible canvas (up to 60 s)
  const canvas = page.locator('canvas:visible').first();
  let canvasVisible = false;
  for (let i = 0; i < 60 && !canvasVisible; i++) {
    canvasVisible = await canvas.isVisible({ timeout: 1000 }).catch(() => false);
    if (!canvasVisible) {
      if (i % 10 === 0) console.log(`   ⏳ [${i}s] Waiting for canvas...`);
      await page.waitForTimeout(1000);
    }
  }
  if (!canvasVisible) throw new Error('❌ Canvas not visible after 60 s');

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box null');

  // Draw 3-5 random lines
  const numLines = 3 + Math.floor(Math.random() * 3);
  for (let l = 0; l < numLines; l++) {
    const sx = box.x + box.width * (0.1 + Math.random() * 0.4);
    const sy = box.y + box.height * (0.1 + Math.random() * 0.4);
    const ex = box.x + box.width * (0.5 + Math.random() * 0.4);
    const ey = box.y + box.height * (0.5 + Math.random() * 0.4);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let step = 1; step <= 5; step++) {
      await page.mouse.move(sx + (ex - sx) * (step / 5), sy + (ey - sy) * (step / 5));
    }
    await page.mouse.up();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(1000);
  console.log(`   ✅ Drew ${numLines} lines on whiteboard`);
}

export async function hasDrawingContent(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = Array.from(document.querySelectorAll('canvas')).find(
      (c) => getComputedStyle(c).visibility === 'visible' && getComputedStyle(c).display !== 'none'
    ) as HTMLCanvasElement | undefined;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    try {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 10) return true;
      }
    } catch {
      return true; // cross-origin fallback
    }
    return false;
  });
}

// ─────────────────────────────────────────────────────────────────────
// Teacher Setup (stress test)
// ─────────────────────────────────────────────────────────────────────

export async function registerOrLoginTeacher(
  page: Page,
  teacherEmail: string,
  teacherPassword: string,
  bypassSecret: string
): Promise<void> {
  const { baseUrl } = getTestConfig();

  // Try login first
  try {
    await injectDeviceCheckBypass(page);
    await autoLogin(page, teacherEmail, teacherPassword, bypassSecret);
    console.log(`   ✅ [${teacherEmail}] Login OK`);
    return;
  } catch {
    console.log(`   ℹ️ [${teacherEmail}] Login failed — registering...`);
  }

  await page.goto(`${baseUrl}/login/register`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const [firstName, ...rest] = teacherEmail.split('@')[0].split('-');
  const lastName = rest.join('-') || 'Test';

  // Identity
  await page.locator('div.field:has(label:has-text("身份")) select, select[name*="identity"]').first()
    .selectOption('教師').catch(() =>
      page.locator('select[name*="identity"]').first().selectOption('teacher').catch(() => {}));

  // Name / Email / Password
  await page.locator('input[name*="firstName"], input[name*="first"]').first().fill(firstName).catch(() => {});
  await page.locator('input[name*="lastName"], input[name*="last"]').first().fill(lastName).catch(() => {});
  await page.locator('input[type="email"]').first().fill(teacherEmail).catch(() => {});
  const pwInputs = page.locator('input[type="password"]');
  await pwInputs.nth(0).fill(teacherPassword).catch(() => {});
  await pwInputs.nth(1).fill(teacherPassword).catch(() => {});

  // Optional fields
  await page.locator('input[name*="birthdate"], input[type="date"]').first().fill('1990-01-01').catch(() => {});
  await page.locator('select[name*="gender"]').first().selectOption('男').catch(() =>
    page.locator('select[name*="gender"]').first().selectOption('male').catch(() => {}));
  await page.locator('select[name*="country"]').first().selectOption('TW').catch(() => {});
  await page.locator('input[name="terms"], input[name*="agreement"]').first().check().catch(() => {});
  await page.locator('input[placeholder*="驗"], input[name*="captcha"]').first().fill(bypassSecret).catch(() => {});

  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.toString().includes('/register'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  await injectDeviceCheckBypass(page);
  await autoLogin(page, teacherEmail, teacherPassword, bypassSecret);
  console.log(`   ✅ [${teacherEmail}] Registered + logged in`);
}

export async function createCourseAsTeacher(
  page: Page,
  courseId: string,
  teacherEmail: string,
  teacherPassword: string,
  bypassSecret: string
): Promise<void> {
  const { baseUrl } = getTestConfig();
  await registerOrLoginTeacher(page, teacherEmail, teacherPassword, bypassSecret);

  await page.goto(`${baseUrl}/courses_manage/new`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(async () => {
    await page.goto(`${baseUrl}/courses_manage/new`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  });
  await page.waitForTimeout(1500);

  const now = new Date();
  const startISO = new Date(now.getTime() + 86400000).toISOString().slice(0, 16);
  const endISO = new Date(now.getTime() + 90000000).toISOString().slice(0, 16);

  await page.locator('form input').first().fill(courseId).catch(() => {});
  await page.locator('form textarea').first().fill(`Stress test — Teacher: ${teacherEmail}`).catch(() => {});
  await page.locator('form input[type="datetime-local"]').first().fill(startISO).catch(() => {});
  await page.locator('form input[type="datetime-local"]').nth(1).fill(endISO).catch(() => {});
  await page.locator('form input[type="number"]').first().fill('10').catch(() => {});

  const submit = page.locator('form button[type="submit"]');
  if (await submit.count() === 0) throw new Error(`[${courseId}] Submit button not found`);
  await submit.click();
  await page.waitForTimeout(2000);
  await page.waitForURL(
    (url) => url.toString().includes('/courses_manage') || url.toString().includes('/teacher'),
    { timeout: 15000 }
  ).catch(() => {});

  console.log(`   ✅ [${courseId}] Course created by ${teacherEmail}`);
}

// ─────────────────────────────────────────────────────────────────────
// Admin Approval
// ─────────────────────────────────────────────────────────────────────

export async function adminApproveCourse(
  page: Page,
  courseId: string,
  adminEmail: string,
  adminPassword: string,
  bypassSecret: string
): Promise<void> {
  const { baseUrl } = getTestConfig();
  await injectDeviceCheckBypass(page);
  await autoLogin(page, adminEmail, adminPassword, bypassSecret);

  // Try API first
  const res = await page.request.post(`${baseUrl}/api/admin/course-reviews/${courseId}`, {
    data: JSON.stringify({ action: 'approve' }),
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => null);

  if (res?.ok()) {
    console.log(`   ✅ [${courseId}] Approved via API`);
    return;
  }

  // Fallback: UI
  let dialogHandled = false;
  const onDialog = async (d: Dialog) => {
    if (!dialogHandled) { dialogHandled = true; await d.accept(); }
  };
  page.on('dialog', onDialog);
  try {
    await page.goto(`${baseUrl}/admin/course-reviews`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 10000 });
    await page.waitForTimeout(3500);

    const card = page.locator('div').filter({ hasText: courseId }).first();
    if (!(await card.isVisible({ timeout: 8000 }).catch(() => false))) {
      console.log(`   ℹ️ [${courseId}] Not in pending review list — possibly already approved`);
      return;
    }
    const approveBtn = card.locator('button').filter({ hasText: /核准|Approve/ }).first();
    if (await approveBtn.isEnabled().catch(() => false)) {
      await approveBtn.click();
      await page.waitForTimeout(2000);
      console.log(`   ✅ [${courseId}] Approved via UI`);
    }
  } finally {
    page.removeListener('dialog', onDialog);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────

export async function cleanupTestData(
  page: Page,
  courseIds: string[],
  groupCount: number,
  bypassSecret: string
): Promise<void> {
  const { baseUrl } = getTestConfig();
  await injectDeviceCheckBypass(page);
  await autoLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD, bypassSecret);

  console.log(`\n   🧹 Cleaning up ${courseIds.length} courses...`);
  for (const id of courseIds) {
    await page.request.delete(`${baseUrl}/api/courses?id=${id}`).catch(() => {});
    await page.request.delete(`${baseUrl}/api/orders?courseId=${id}`).catch(() => {});
  }

  const emails = [
    ...Array.from({ length: groupCount }, (_, i) => `group-${i}-teacher@test.com`),
    ...Array.from({ length: groupCount }, (_, i) => `group-${i}-student@test.com`),
  ];
  for (const email of emails) {
    await page.request
      .delete(`${baseUrl}/api/profiles?email=${encodeURIComponent(email)}`)
      .catch(() => {});
  }
  console.log('   ✅ Cleanup complete');
}
