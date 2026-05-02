/**
 * 00 — Pre-flight Health Gate
 *
 * Pattern: Streaming platform "pre-stream system check"
 *   → Before any live test starts, verify all subsystems respond.
 *   → Fast (<45 s). Block heavier specs if any critical endpoint fails.
 *
 * Run standalone:
 *   npx playwright test e2e/classroom/00_preflight.spec.ts --project=chromium
 *
 * Gate usage (CI):
 *   Run this FIRST. If it fails, skip remaining classroom specs entirely.
 */

import { test, expect } from '@playwright/test';
import {
  checkSystemHealth,
  printHealthReport,
  API_LATENCY_SLO_MS,
  SYNC_LATENCY_SLO_MS,
} from '../helpers/streaming_monitor';

function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  throw new Error(`Missing required environment variable(s): ${keys.join(', ')}`);
}

test.describe('[preflight] System Health Gate', () => {
  test.setTimeout(60_000);

  // ── 1. API Endpoint Reachability ─────────────────────────────────
  test('all critical API endpoints are reachable', async ({ page }) => {
    console.log('\n🔍 Pre-flight: checking critical API endpoints...');
    const report = await checkSystemHealth(page);
    printHealthReport(report);

    const critical = ['/api/captcha', '/api/courses?limit=1', '/api/orders?limit=1'];
    for (const ep of critical) {
      const found = report.endpoints.find(e => e.endpoint === ep);
      expect(found, `Endpoint ${ep} not probed`).toBeDefined();
      expect(found!.ok, `CRITICAL: ${ep} returned ${found!.statusCode}`).toBe(true);
    }
  });

  // ── 2. Login API ─────────────────────────────────────────────────
  test('login API responds within SLO', async ({ page }) => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const teacherEmail = process.env.QA_TEACHER_EMAIL || process.env.TEST_TEACHER_EMAIL || 'teacher@example.com';
    const teacherPassword = requireEnv('TEST_TEACHER_PASSWORD', 'QA_TEACHER_PASSWORD');
    const bypassSecret = requireEnv('LOGIN_BYPASS_SECRET', 'NEXT_PUBLIC_LOGIN_BYPASS_SECRET', 'QA_CAPTCHA_BYPASS');

    const start = Date.now();

    const captchaRes = await page.request.get(`${baseUrl}/api/captcha`);
    expect(captchaRes.ok()).toBe(true);
    const { token: captchaToken } = await captchaRes.json().catch(() => ({ token: '' }));

    const loginStart = Date.now();
    const res = await page.request.post(`${baseUrl}/api/login`, {
      data: JSON.stringify({
        email: teacherEmail,
        password: teacherPassword,
        captchaToken,
        captchaValue: bypassSecret,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const loginLatency = Date.now() - loginStart;
    const totalMs = Date.now() - start;

    console.log(`   Login status: ${res.status()}, latency: ${loginLatency}ms (total: ${totalMs}ms)`);
    expect(res.status(), `Login failed: ${res.status()}`).toBeLessThan(500);
    expect(loginLatency, `Login latency ${loginLatency}ms exceeds SLO ${API_LATENCY_SLO_MS}ms`).toBeLessThanOrEqual(API_LATENCY_SLO_MS);
  });

  // ── 3. Agora Whiteboard App ID ───────────────────────────────────
  test('AGORA_WHITEBOARD_APP_ID environment variable is configured', async ({}) => {
    const appId = process.env.AGORA_WHITEBOARD_APP_ID || '';
    console.log(`   AGORA_WHITEBOARD_APP_ID present: ${!!appId}, length: ${appId.length}`);
    expect(appId.length, 'AGORA_WHITEBOARD_APP_ID must be set').toBeGreaterThan(10);
    expect(appId, 'App ID must not be placeholder').not.toContain('YOUR_APP_ID');
  });

  // ── 4. DynamoDB Connectivity via Orders API ──────────────────────
  test('DynamoDB is accessible (orders API latency check)', async ({ page }) => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    const start = Date.now();
    const res = await page.request.get(`${baseUrl}/api/orders?limit=1`);
    const latencyMs = Date.now() - start;

    console.log(`   /api/orders latency: ${latencyMs}ms, status: ${res.status()}`);
    expect(res.status(), `/api/orders unexpected status`).toBeLessThan(500);
    expect(latencyMs, `DynamoDB latency ${latencyMs}ms exceeds SLO ${API_LATENCY_SLO_MS}ms`).toBeLessThanOrEqual(API_LATENCY_SLO_MS);
  });

  // ── 5. Classroom Ready API ───────────────────────────────────────
  test('/api/classroom/ready endpoint is reachable', async ({ page }) => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    const start = Date.now();
    const res = await page.request.get(`${baseUrl}/api/classroom/ready`);
    const latencyMs = Date.now() - start;

    // 405 (Method Not Allowed) is fine — endpoint exists but needs POST
    console.log(`   /api/classroom/ready: status=${res.status()}, latency=${latencyMs}ms`);
    expect(res.status(), '/api/classroom/ready returned 5xx').toBeLessThan(500);
    expect(latencyMs, `API latency ${latencyMs}ms > SLO`).toBeLessThanOrEqual(API_LATENCY_SLO_MS);
  });

  // ── 6. ENV vars configured ───────────────────────────────────────
  test('required environment variables are present', async ({}) => {
    const required: Record<string, string | undefined> = {
      NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
      LOGIN_BYPASS_SECRET: process.env.LOGIN_BYPASS_SECRET,
      AGORA_WHITEBOARD_APP_ID: process.env.AGORA_WHITEBOARD_APP_ID,
      QA_TEACHER_EMAIL: process.env.QA_TEACHER_EMAIL || process.env.TEST_TEACHER_EMAIL,
      QA_STUDENT_EMAIL: process.env.QA_STUDENT_EMAIL || process.env.TEST_STUDENT_EMAIL,
    };

    for (const [key, val] of Object.entries(required)) {
      console.log(`   ${val ? '✅' : '❌'} ${key}: ${val ? 'present' : 'MISSING'}`);
      expect(val, `${key} must be set`).toBeTruthy();
    }

    console.log(`\n   📍 Production URL: ${required.NEXT_PUBLIC_BASE_URL}`);
    console.log(`   📍 Sync SLO: ${SYNC_LATENCY_SLO_MS}ms`);
    console.log(`   📍 API SLO:  ${API_LATENCY_SLO_MS}ms`);
  });

  // ── 7. Browser can load the homepage ────────────────────────────
  test('homepage loads within acceptable time', async ({ page }) => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const start = Date.now();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    const loadMs = Date.now() - start;

    const title = await page.title().catch(() => '');
    console.log(`   Homepage title: "${title}", load time: ${loadMs}ms`);
    expect(loadMs, `Homepage load ${loadMs}ms > 10s`).toBeLessThan(10_000);
    expect(page.url()).toContain(baseUrl.replace(/^https?:\/\//, '').split('/')[0]);
  });
});
