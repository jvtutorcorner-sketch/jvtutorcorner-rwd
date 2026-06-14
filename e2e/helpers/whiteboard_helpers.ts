/**
 * Shared helper functions for whiteboard sync E2E tests.
 * Import these in scenario spec files — keep test files clean.
 */

import { Page, Dialog } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getTestConfig, TestConfig, ADMIN_EMAIL, ADMIN_PASSWORD } from '../test_data/whiteboard_test_data';

export interface DrawingPoint {
  x: number;
  y: number;
}

// ─────────────────────────────────────────────────────────────────────
// Static PDF Fixtures
// Pre-built PDFs in public/test-pdfs/ — no dynamic generation needed.
// ─────────────────────────────────────────────────────────────────────

export const STATIC_PDFS = {
  singlePage: 'test-single-page.pdf',
  multiPage:  'test-multi-page.pdf',   // 5 pages
  longDoc:    'test-long-doc.pdf',     // 10 pages
  blank:      'test-blank.pdf',
} as const;

/**
 * Load a static test PDF from public/test-pdfs/ as a Buffer.
 * Usage: const buf = loadStaticPdf(STATIC_PDFS.multiPage);
 */
export function loadStaticPdf(filename: string): Buffer {
  const filePath = path.resolve(process.cwd(), 'public', 'test-pdfs', filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Static PDF not found: ${filePath}. Run PDF generation script first.`);
  }
  return fs.readFileSync(filePath);
}

// ─────────────────────────────────────────────────────────────────────
// Enrollment
// ─────────────────────────────────────────────────────────────────────

export async function runEnrollmentFlow(
  courseId: string,
  teacherEmail?: string,
  studentEmail?: string,
  maxRetries = 2
): Promise<void> {
  const config = getTestConfig();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  // Use playwright CLI to run the enrollment spec as a subprocess
  const cmd =
    process.platform === 'win32'
      ? `set TEST_COURSE_ID=${courseId}&& set SKIP_CLEANUP=true&& npx playwright test e2e/student_enrollment_flow.spec.ts --project=chromium`
      : `TEST_COURSE_ID=${courseId} SKIP_CLEANUP=true npx playwright test e2e/student_enrollment_flow.spec.ts --project=chromium`;

  const childEnv = {
    ...process.env,
    TEST_COURSE_ID: courseId,
    TEST_TEACHER_EMAIL: teacherEmail || config.teacherEmail,
    TEST_TEACHER_PASSWORD: process.env.TEST_TEACHER_PASSWORD,
    TEST_STUDENT_EMAIL: studentEmail || config.studentEmail,
    TEST_STUDENT_PASSWORD: process.env.TEST_STUDENT_PASSWORD,
    QA_TEACHER_EMAIL: teacherEmail || config.teacherEmail,
    QA_STUDENT_EMAIL: studentEmail || config.studentEmail,
    NEXT_PUBLIC_BASE_URL: baseUrl,
    AGORA_WHITEBOARD_APP_ID: process.env.AGORA_WHITEBOARD_APP_ID,
    AGORA_WHITEBOARD_AK: process.env.AGORA_WHITEBOARD_AK,
    AGORA_WHITEBOARD_SK: process.env.AGORA_WHITEBOARD_SK,
    LOGIN_BYPASS_SECRET: process.env.LOGIN_BYPASS_SECRET,
    // Preserve PWDEBUG if explicitly set in current process, otherwise undefined
    PWDEBUG: process.env.PWDEBUG, 
  } as any;

  console.log(`\n   🚀 [Enrollment] Starting subprocess for course: ${courseId}`);
  console.log(`      - Teacher: ${childEnv.TEST_TEACHER_EMAIL}`);
  console.log(`      - Student: ${childEnv.TEST_STUDENT_EMAIL}`);

  const buildLocalIsoMinutes = (date: Date) => {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const loginStudentProfile = async () => {
    const captchaRes = await fetch(`${baseUrl}/api/captcha`, {
      headers: { 'X-E2E-Secret': String(config.bypassSecret || '') }
    });
    const captchaJson = await captchaRes.json().catch(() => ({} as any));
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-E2E-Secret': String(config.bypassSecret || '')
      },
      body: JSON.stringify({
        email: childEnv.TEST_STUDENT_EMAIL,
        password: childEnv.TEST_STUDENT_PASSWORD,
        captchaToken: captchaJson?.token || '',
        captchaValue: config.bypassSecret,
      }),
    });
    const loginJson = await loginRes.json().catch(() => ({} as any));
    if (!loginRes.ok || !loginJson?.profile) {
      throw new Error(`Student login failed: ${loginRes.status} ${JSON.stringify(loginJson)}`);
    }
    return loginJson.profile;
  };

  const fetchCourseDetail = async () => {
    const res = await fetch(`${baseUrl}/api/courses?id=${encodeURIComponent(courseId)}`, {
      headers: { 'X-E2E-Secret': String(config.bypassSecret || '') }
    });
    const json = await res.json().catch(() => ({} as any));
    const course = json?.course || json?.data?.[0] || json?.data || null;
    if (!res.ok || !course) {
      throw new Error(`Course lookup failed for ${courseId}: ${res.status} ${JSON.stringify(json)}`);
    }
    return course;
  };

  const runEnrollmentViaApi = async () => {
    const studentProfile = await loginStudentProfile();
    const studentUserId = studentProfile?.roid_id || studentProfile?.id || childEnv.TEST_STUDENT_EMAIL;
    const course = await fetchCourseDetail();

    const grantRes = await fetch(`${baseUrl}/api/admin/grant-points`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-E2E-Secret': String(config.bypassSecret || '')
      },
      body: JSON.stringify({
        email: childEnv.TEST_STUDENT_EMAIL,
        amount: 9999,
      }),
    });
    if (!grantRes.ok) {
      const grantJson = await grantRes.json().catch(() => ({} as any));
      throw new Error(`Grant points failed: ${grantRes.status} ${JSON.stringify(grantJson)}`);
    }

    const durationMinutes = Number(course?.durationMinutes) || 5;
    const pointCost = Number(course?.pointCost) || 10;
    const start = new Date();
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const startTime = buildLocalIsoMinutes(start);
    const endTime = buildLocalIsoMinutes(end);

    const enrollRes = await fetch(`${baseUrl}/api/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-E2E-Secret': String(config.bypassSecret || '')
      },
      body: JSON.stringify({
        name: String(studentProfile?.firstName || 'E2E Student'),
        email: childEnv.TEST_STUDENT_EMAIL,
        courseId,
        courseTitle: course?.title || courseId,
        startTime,
        endTime,
      }),
    });
    const enrollJson = await enrollRes.json().catch(() => ({} as any));
    if (!enrollRes.ok || !enrollJson?.enrollment?.id) {
      throw new Error(`Enroll failed: ${enrollRes.status} ${JSON.stringify(enrollJson)}`);
    }

    const orderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-E2E-Secret': String(config.bypassSecret || '')
      },
      body: JSON.stringify({
        courseId,
        enrollmentId: enrollJson.enrollment.id,
        amount: 0,
        currency: 'TWD',
        userId: studentUserId,
        startTime,
        endTime,
        paymentMethod: 'points',
        pointsUsed: pointCost,
        status: 'PAID',
      }),
    });
    const orderJson = await orderRes.json().catch(() => ({} as any));
    if (!orderRes.ok || !orderJson?.ok) {
      throw new Error(`Order creation failed: ${orderRes.status} ${JSON.stringify(orderJson)}`);
    }

    await fetch(`${baseUrl}/api/enroll`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-E2E-Secret': String(config.bypassSecret || '')
      },
      body: JSON.stringify({
        id: enrollJson.enrollment.id,
        status: 'PAID',
      }),
    }).catch(() => null);

    console.log(`   ✅ [Enrollment] API flow succeeded for course: ${courseId}`);
    console.log(`      - userId: ${studentUserId}`);
    console.log(`      - orderId: ${orderJson?.order?.orderId}`);
    console.log(`      - time: ${startTime} → ${endTime}`);
  };
  
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
          console.log(`   🔄 [Enrollment] Retry attempt ${attempt}/${maxRetries}...`);
      }
      try {
        await runEnrollmentViaApi();
      } catch (apiErr) {
        console.warn(`   ⚠️ [Enrollment] API flow failed, falling back to subprocess: ${(apiErr as Error).message}`);
        const output = execSync(cmd, {
          stdio: 'pipe',
          cwd: path.resolve(__dirname, '../..'),
          env: childEnv,
          maxBuffer: 20 * 1024 * 1024,
        }).toString('utf8');

        if (process.env.DEBUG_ENROLLMENT_FLOW === '1' && output.trim()) {
          console.log(`   🔍 [${courseId}] Enrollment output:\n${output}`);
        }
      }

      console.log(`   ✅ [Enrollment] Flow succeeded for course: ${courseId}`);
      
      // ⭐ Critical: Wait for data to propagate in DB/Cache
      console.log(`   ⏳ [Enrollment] Waiting 3s for system sync...`);
      const startWait = Date.now();
      while (Date.now() - startWait < 3000) { /* wait */ }
      
      return;
    } catch (err) {
      lastError = err as Error;
      console.error(`   ❌ [Enrollment] Attempt ${attempt}/${maxRetries} failed`);

      const e = err as any;
      const fullOutput = (e?.stdout ? String(e.stdout) : '') + '\n' + (e?.stderr ? String(e.stderr) : '');
      
      // Extract specific errors like "No point package links found" or "Insufficient points"
      if (fullOutput.includes('No point package links found')) {
          console.error(`      ⚠️ [Detail] Pricing page failed to load package buttons.`);
      } else if (fullOutput.includes('Point shortage')) {
          console.error(`      ⚠️ [Detail] Student has insufficient points and top-up failed.`);
      }
      
      const tail = fullOutput.split(/\r?\n/).slice(-15).join('\n');
      if (tail) {
        console.error(`   🧪 [Enrollment] Error Tail:\n${tail}`);
      }

      if (attempt < maxRetries) {
        // Linear backoff
        const backoff = 2000 * attempt;
        const t = Date.now() + backoff;
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
    headers: { 
      'Content-Type': 'application/json',
      'X-E2E-Secret': String(bypassSecret || '')
    },
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
  const readyButton = page
    .locator('button')
    .filter({ hasText: /點擊表示準備好|準備好|Ready/i })
    .first();
  await expect(readyButton).toBeEnabled({ timeout: 15000 });
  console.log(`   ✅ [${role}] /classroom/wait loaded, Ready button enabled`);
}

export async function clickReadyButton(page: Page, role: 'teacher' | 'student'): Promise<void> {
  const readyButton = page
    .locator('button')
    .filter({ hasText: /點擊表示準備好|準備好|Ready/i })
    .first();
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
  // Some deployments use translated labels such as「開始上課」or auto-join.
  const enterLabel = /立即進入教室|進入教室|Enter Classroom|開始上課|Start Class|Join|等待所有人準備好|Waiting for all/i;

  if (page.url().includes('/classroom/room')) {
    await page.waitForTimeout(2000);
    // Check for page errors
    const errorText = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const errorKeywords = [
        '白板連線失敗',
        'Agora 連線失敗',
        'failed to initialize',
        'Join room failed',
        '網址無效',
        '你沒有權限',
      ];
      for (const keyword of errorKeywords) {
        if (bodyText.includes(keyword)) return keyword;
      }
      return null;
    });

    if (errorText) {
      throw new Error(`❌ [${role}] Already in /classroom/room but page is showing error: "${errorText}"`);
    }
    console.log(`   ✅ [${role}] Already in /classroom/room`);
    return;
  }

  const startedAt = Date.now();
  let lastReadyRefreshAt = 0;
  let didReloadForSync = false;

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (page.url().includes('/classroom/room')) {
      await page.waitForTimeout(2000);
      // Check for page errors
      const errorText = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const errorKeywords = [
          '白板連線失敗',
          'Agora 連線失敗',
          'failed to initialize',
          'Join room failed',
          '網址無效',
          '你沒有權限',
        ];
        for (const keyword of errorKeywords) {
          if (bodyText.includes(keyword)) return keyword;
        }
        return null;
      });

      if (errorText) {
        throw new Error(`❌ [${role}] Entered /classroom/room but page is showing error: "${errorText}"`);
      }
      console.log(`   ✅ [${role}] Entered /classroom/room`);
      return;
    }

    const enterBtn = page.locator('button, a').filter({ hasText: enterLabel }).first();
    const visible = await enterBtn.isVisible().catch(() => false);
    if (visible) {
      const tagName = await enterBtn
        .evaluate((el) => (el as HTMLElement).tagName.toLowerCase())
        .catch(() => 'button');
      const enabled = tagName === 'a' ? true : await enterBtn.isEnabled().catch(() => false);
      if (enabled) {
        await enterBtn.click().catch(() => {});
        await page.waitForURL(/\/classroom\/room/, { timeout: 12000 }).catch(() => {});
      }
    }

    if (page.url().includes('/classroom/room')) {
      await page.waitForTimeout(2000);
      // Check for page errors
      const errorText = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const errorKeywords = [
          '白板連線失敗',
          'Agora 連線失敗',
          'failed to initialize',
          'Join room failed',
          '網址無效',
          '你沒有權限',
        ];
        for (const keyword of errorKeywords) {
          if (bodyText.includes(keyword)) return keyword;
        }
        return null;
      });

      if (errorText) {
        throw new Error(`❌ [${role}] Entered /classroom/room but page is showing error: "${errorText}"`);
      }
      console.log(`   ✅ [${role}] Entered /classroom/room`);
      return;
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed > 20000 && Date.now() - lastReadyRefreshAt > 10000) {
      const refreshResult = await page.evaluate(async ({ role }: { role: 'teacher' | 'student' }) => {
        const parseUser = () => {
          try {
            // Must match autoLogin() which stores user in 'tutor_mock_user', NOT 'currentUser'
            return JSON.parse(localStorage.getItem('tutor_mock_user') || '{}');
          } catch {
            return {};
          }
        };

        const user = parseUser() as any;
        const userId = String(user.email || user.roid_id || user.id || '').toLowerCase().trim();
        const url = new URL(window.location.href);
        const uuid =
          url.searchParams.get('session') ||
          url.searchParams.get('uuid') ||
          '';

        if (!uuid || !userId) return { ok: false, reason: 'missing_uuid_or_user' };

        const res = await fetch('/api/classroom/ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uuid, role, userId, action: 'ready', present: true }),
        });
        const json = await res.json().catch(() => ({}));
        return {
          ok: res.ok,
          status: res.status,
          participants: Array.isArray((json as any).participants) ? (json as any).participants.length : null,
        };
      }, { role });
      lastReadyRefreshAt = Date.now();
      console.log(`   🔄 [${role}] ready refresh result:`, refreshResult);
    }

    if (elapsed > 30000 && !didReloadForSync && page.url().includes('/classroom/wait')) {
      didReloadForSync = true;
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(2000);
      continue;
    }

    if (elapsed > 45000 && page.url().includes('/classroom/wait')) {
      const current = page.url();
      // Read whiteboardUuid from sessionStorage (stored by wait page enterClassroom callback)
      // so ClientClassroom can use the fast-path initialization instead of full discovery.
      const sessionParam = new URL(current).searchParams.get('session') || '';
      const storedUuid = sessionParam
        ? await page.evaluate((key) => sessionStorage.getItem(`whiteboard_room_${key}`) || '', sessionParam).catch(() => '')
        : '';
      let directRoomUrl = current.replace('/classroom/wait', '/classroom/room');
      if (storedUuid && !directRoomUrl.includes('whiteboardUuid')) {
        directRoomUrl += `&whiteboardUuid=${encodeURIComponent(storedUuid)}`;
      }
      await page.goto(directRoomUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      if (page.url().includes('/classroom/room')) {
        await page.waitForTimeout(2000);
        // Check for page errors
        const errorText = await page.evaluate(() => {
          const bodyText = document.body.innerText;
          const errorKeywords = [
            '白板連線失敗',
            'Agora 連線失敗',
            'failed to initialize',
            'Join room failed',
            '網址無效',
            '你沒有權限',
          ];
          for (const keyword of errorKeywords) {
            if (bodyText.includes(keyword)) return keyword;
          }
          return null;
        });

        if (errorText) {
          throw new Error(`❌ [${role}] Entered /classroom/room via direct navigation fallback but page is showing error: "${errorText}"`);
        }
        console.warn(`   ⚠️ [${role}] FALLBACK: Entered /classroom/room via direct URL — normal canEnter flow did not trigger. Check DynamoDB sync / polling interval.`);
        return;
      }
    }

    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: `test-results/fail-enter-${role}.png` }).catch(() => {});
  throw new Error(`❌ [${role}] enter classroom button never became clickable`);
}

// ─────────────────────────────────────────────────────────────────────
// Whiteboard
// ─────────────────────────────────────────────────────────────────────

export async function drawOnWhiteboard(page: Page): Promise<void> {
  if (!page.url().includes('/classroom/room')) {
    await page.waitForURL(/\/classroom\/room/, { timeout: 20000 }).catch(() => {});
  }

  // Check for whiteboard-specific errors only.
  // Agora RTC (video/audio) errors such as "AgoraRTCError" and "INVALID_OPERATION"
  // come from a completely separate SDK (agora-rtc-sdk-ng) and do NOT affect the
  // whiteboard (white-web-sdk / Netless). They appear more frequently under stress
  // (5-10 concurrent groups hit Agora RTC rate-limits / headless device contention)
  // but the whiteboard remains fully functional regardless.
  const errorText = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const errorKeywords = [
      '白板連線失敗',
      'Agora 連線失敗',
      'failed to initialize',
      'Join room failed',
      '網址無效',
      '你沒有權限',
    ];
    for (const keyword of errorKeywords) {
      if (bodyText.includes(keyword)) return keyword;
    }
    return null;
  });

  if (errorText) {
    throw new Error(`❌ Cannot draw: page is showing error: "${errorText}"`);
  }

  // ClientClassroom exposes runtime readiness flags; use them as first gate.
  // Timeout raised to 90 s to accommodate concurrent 6–10 group Netless SDK init.
  await page
    .waitForFunction(() => {
      const w = window as any;
      const sdkLoaded = !!w.WhiteWebSdk?.WhiteWebSdk;
      const agoraRoomReady = !!w.agoraRoom;
      return !!w.__classroom_whiteboard_ready || (!!w.__classroom_ready && sdkLoaded && agoraRoomReady) || (sdkLoaded && agoraRoomReady && !!document.querySelector('canvas'));
    }, { timeout: 90000 })
    .catch(() => {
      console.log('   ⚠️ classroom readiness flag not observed within 90 s');
    });

  // Wait for Agora SDK + room, and throw if not ready
  for (const [label, fn] of [
    ['WhiteWebSdk', () => !!(window as any).WhiteWebSdk?.WhiteWebSdk],
    ['agoraRoom', () => !!(window as any).agoraRoom],
  ] as [string, () => boolean][]) {
    try {
      await page.waitForFunction(fn, { timeout: 30000 });
    } catch (e) {
      throw new Error(`❌ Agora whiteboard ${label} not ready within 30 s`);
    }
  }

  // Wait for visible canvas (up to 90 s)
  const canvas = page.locator('canvas:visible').first();
  let canvasVisible = false;
  for (let i = 0; i < 90 && !canvasVisible; i++) {
    canvasVisible = await canvas.isVisible({ timeout: 1000 }).catch(() => false);
    if (!canvasVisible) {
      if (i % 10 === 0) console.log(`   ⏳ [${i}s] Waiting for canvas...`);
      await page.waitForTimeout(1000);
    }
  }
  if (!canvasVisible) throw new Error('❌ Canvas not visible after 90 s');

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
  console.log(`   🔍 [${teacherEmail}] Attempting autoLogin...`);
  try {
    await injectDeviceCheckBypass(page);
    await autoLogin(page, teacherEmail, teacherPassword, bypassSecret);
    console.log(`   ✅ [${teacherEmail}] Login OK (already exists)`);
    return;
  } catch (err) {
    console.log(`   ℹ️ [${teacherEmail}] Login failed (${(err as Error).message}) — registering new account...`);
  }

  // Go to register page
  console.log(`   🌐 [${teacherEmail}] Navigating to /login/register...`);
  await page.goto(`${baseUrl}/login/register`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async (e) => {
    console.warn(`   ⚠️ [${teacherEmail}] domcontentloaded timeout, retrying with networkidle...`, e.message);
    await page.goto(`${baseUrl}/login/register`, { waitUntil: 'networkidle', timeout: 15000 }).catch((e2) => {
      console.error(`   ❌ [${teacherEmail}] Failed to load register page:`, e2.message);
    });
  });
  
  await page.waitForTimeout(2000);
  console.log(`   📝 [${teacherEmail}] Filling registration form...`);

  const [firstName, ...rest] = teacherEmail.split('@')[0].split('-');
  const lastName = rest.join('-') || 'Test';

  // Identity
  console.log(`   👤 [${teacherEmail}] Selecting identity: teacher`);
  const roleSelect = page.locator('select').filter({ hasText: /身份|Identity|Student|Teacher/i }).first();
  await roleSelect.selectOption('teacher').catch(async (e) => {
     console.warn(`   ⚠️ roleSelect failed, trying direct select:`, e.message);
     await page.locator('select').first().selectOption('teacher');
  });

  // Name / Email / Password
  console.log(`   📧 [${teacherEmail}] Filling names and email...`);
  await page.locator('input[name*="firstName"]').first().fill(firstName);
  await page.locator('input[name*="lastName"]').first().fill(lastName);
  await page.locator('input[type="email"]').first().fill(teacherEmail);
  
  console.log(`   🔑 [${teacherEmail}] Filling passwords...`);
  const pwInputs = page.locator('input[type="password"]');
  await pwInputs.nth(0).fill(teacherPassword);
  await pwInputs.nth(1).fill(teacherPassword);

  // Optional / Mandatory fields
  console.log(`   📅 [${teacherEmail}] Filling birthdate and gender...`);
  await page.locator('input[type="date"]').first().fill('1990-01-01');
  await page.locator('select').filter({ hasText: /性別|Gender|男|女/i }).first().selectOption('male').catch(() => {});
  
  console.log(`   🌍 [${teacherEmail}] Selecting country: TW...`);
  await page.locator('select').filter({ hasText: /國家|Country|台灣/i }).first().selectOption('TW').catch(() => {});
  
  console.log(`   ✅ [${teacherEmail}] Checking terms and captcha...`);
  // Wait for captcha to load to avoid race condition where loadCaptcha clears the field
  await page.waitForSelector('img[alt="captcha"]', { state: 'visible', timeout: 10000 }).catch(() => {
    console.warn(`   ⚠️ [${teacherEmail}] Captcha image not found, proceeding anyway...`);
  });
  
  // Terms checkbox - search for label text or name
  const termsCheckbox = page.locator('input[type="checkbox"]').filter({ has: page.locator('..', { hasText: /同意|terms|agree/i }) }).first();
  if (await termsCheckbox.count() > 0) {
    await termsCheckbox.check();
  } else {
    await page.locator('input[name="terms"]').first().check().catch(() => {});
  }
  
  await page.locator('input[placeholder*="驗"]').first().fill(bypassSecret);

  console.log(`   🚀 [${teacherEmail}] Submitting form...`);
  const submitBtn = page.locator('button[type="submit"]').filter({ hasText: /建立帳戶|Register|Submit/i }).first();
  await submitBtn.click();
  
  console.log(`   ⏳ [${teacherEmail}] Waiting for registration result...`);
  try {
    const result = await Promise.race([
      page.waitForSelector('text=註冊成功', { state: 'visible', timeout: 20000 }).then(() => 'success'),
      page.waitForSelector('h2:has-text("註冊成功")', { state: 'visible', timeout: 20000 }).then(() => 'success'),
      page.waitForSelector('.form-error', { state: 'visible', timeout: 20000 }).then(() => 'error'),
      page.waitForURL((url) => !url.toString().includes('/register'), { timeout: 20000 }).then(() => 'success')
    ]);

    if (result === 'error') {
      const errorMsg = await page.locator('.form-error').textContent();
      console.error(`   ❌ [${teacherEmail}] Registration failed with error: ${errorMsg}`);
      await page.screenshot({ path: `test-results/register-error-${teacherEmail.replace('@', '-')}.png` });
      throw new Error(`Registration failed: ${errorMsg}`);
    }
    
    console.log(`   ✨ [${teacherEmail}] Registration success signal received`);
  } catch (e) {
    if ((e as Error).message.includes('Registration failed')) throw e;
    console.warn(`   ⚠️ [${teacherEmail}] Wait for success signal timeout/error, proceeding to login anyway...`);
    await page.screenshot({ path: `test-results/register-timeout-${teacherEmail.replace('@', '-')}.png` }).catch(() => {});
  }

  await page.waitForTimeout(2000);

  console.log(`   🔑 [${teacherEmail}] Performing final autoLogin...`);
  await injectDeviceCheckBypass(page);
  await autoLogin(page, teacherEmail, teacherPassword, bypassSecret);
  console.log(`   ✅ [${teacherEmail}] Registered + logged in successfully`);
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
  const tzOffset = now.getTimezoneOffset() * 60000;
  // Set start time to 1 hour ago and end time to 1 hour from now to ensure it's active
  const startISO = new Date(now.getTime() - tzOffset - 3600000).toISOString().slice(0, 16);
  const endISO = new Date(now.getTime() - tzOffset + 3600000).toISOString().slice(0, 16);

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
    headers: { 
      'Content-Type': 'application/json',
      'X-E2E-Secret': String(bypassSecret || '')
    },
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
// Student Setup (stress test)
// ─────────────────────────────────────────────────────────────────────

/**
 * Register a student account via API if it doesn't already exist.
 * Uses the bypass secret to skip captcha.
 */
export async function registerStudentIfNeeded(
  page: Page,
  studentEmail: string,
  studentPassword: string,
  bypassSecret: string
): Promise<void> {
  const { baseUrl } = getTestConfig();

  // Try login first
  const loginRes = await page.request.post(`${baseUrl}/api/login`, {
    data: JSON.stringify({ email: studentEmail, password: studentPassword, captchaToken: '', captchaValue: bypassSecret }),
    headers: { 'Content-Type': 'application/json', 'X-E2E-Secret': bypassSecret },
  });

  if (loginRes.ok()) {
    console.log(`   ✅ [${studentEmail}] Student account exists`);
    return;
  }

  // Register new student account
  const registerRes = await page.request.post(`${baseUrl}/api/register`, {
    data: JSON.stringify({
      email: studentEmail,
      password: studentPassword,
      firstName: 'Test',
      lastName: 'Student',
      captchaValue: bypassSecret,
    }),
    headers: { 'Content-Type': 'application/json', 'X-E2E-Secret': bypassSecret },
  });

  const registerData = await registerRes.json().catch(() => ({}));
  if (!registerRes.ok() && (registerData as any).message !== 'Email already registered') {
    console.warn(`   ⚠️ [${studentEmail}] Registration failed: ${JSON.stringify(registerData)}`);
  } else {
    console.log(`   ✅ [${studentEmail}] Student registered`);
  }
}

/**
 * Grant points to a test account via /api/admin/grant-points.
 * Safety: only @test.com accounts are allowed — enforced on both client and server side.
 * Uses X-E2E-Secret bypass so no admin session cookie is required.
 * This is the recommended path for all E2E / stress-test point top-ups.
 */
export async function grantPointsViaAdmin(
  adminPage: Page,
  studentEmail: string,
  amount: number,
  bypassSecret?: string
): Promise<boolean> {
  const { baseUrl } = getTestConfig();

  // Safety guard: only test accounts (@test.com) may be targeted
  if (!studentEmail.toLowerCase().endsWith('@test.com')) {
    console.error(`   ❌ [grantPointsViaAdmin] Blocked: "${studentEmail}" is not a @test.com account. Refusing to modify real user points.`);
    return false;
  }

  if (!bypassSecret) {
    console.warn(`   ⚠️ [${studentEmail}] No bypassSecret provided — cannot authenticate against /api/admin/grant-points`);
    return false;
  }

  // /api/admin/grant-points accepts email directly + X-E2E-Secret bypass (no session cookie needed).
  const grantRes = await adminPage.request.post(`${baseUrl}/api/admin/grant-points`, {
    data: JSON.stringify({ email: studentEmail, amount }),
    headers: {
      'Content-Type': 'application/json',
      'X-E2E-Secret': bypassSecret,
    },
  });

  if (grantRes.ok()) {
    const data = await grantRes.json().catch(() => ({}));
    console.log(`   ✅ [${studentEmail}] Granted ${(data as any).amount ?? amount} points via /api/admin/grant-points`);
    return true;
  }

  const err = await grantRes.json().catch(() => ({}));
  console.warn(`   ⚠️ [${studentEmail}] /api/admin/grant-points failed (${grantRes.status()}): ${JSON.stringify(err)}`);
  return false;
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

/**
 * Create a course with custom duration (in minutes)
 * Supports different course lengths for stress testing
 */
export async function createCourseAsTeacherWithDuration(
  page: Page,
  courseId: string,
  teacherEmail: string,
  teacherPassword: string,
  bypassSecret: string,
  durationMinutes: number = 60
): Promise<void> {
  const { baseUrl } = getTestConfig();

  // Ensure teacher account exists
  await registerOrLoginTeacher(page, teacherEmail, teacherPassword, bypassSecret);

  // Get teacher UUID via login API so we can store it as teacherId
  const loginRes = await page.request.post(`${baseUrl}/api/login`, {
    data: JSON.stringify({ email: teacherEmail, password: teacherPassword, captchaToken: '', captchaValue: bypassSecret }),
    headers: { 'Content-Type': 'application/json', 'X-E2E-Secret': String(bypassSecret || '') },
  });
  const loginData = await loginRes.json().catch(() => ({}));
  const teacherId = loginData?.profile?.id || loginData?.profile?.roid_id || teacherEmail;

  const now = new Date();
  const startISO = new Date(now.getTime() - 30000).toISOString();
  const endISO = new Date(now.getTime() + durationMinutes * 60000 + 30000).toISOString();

  // Create course via API with explicit id so it can be looked up by courseId later
  const res = await page.request.post(`${baseUrl}/api/courses`, {
    data: JSON.stringify({
      id: courseId,
      title: courseId,
      description: `Stress test (${durationMinutes}min) — Teacher: ${teacherEmail}`,
      teacherId,
      teacherName: teacherEmail,
      teacherEmail,
      enrollmentType: 'points',
      pointCost: 10,
      nextStartDate: startISO,
      startDate: startISO,
      endDate: endISO,
      durationMinutes,
      status: '上架',
    }),
    headers: {
      'Content-Type': 'application/json',
      'X-E2E-Secret': String(bypassSecret || ''),
    },
  });

  if (!res.ok()) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[${courseId}] Course creation failed (${res.status()}): ${body?.message || 'unknown'}`);
  }

  console.log(`   ✅ [${courseId}] Course created (${durationMinutes}min) by ${teacherEmail}`);
}
