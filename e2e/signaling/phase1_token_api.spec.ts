/**
 * Phase 1 — Token API Tests
 *
 * Tests the /api/signaling/token route that generates HMAC-SHA256 signed
 * tokens for AWS API Gateway WebSocket connections.
 *
 * Run:
 *   APP_ENV=test.phase1 npx playwright test e2e/signaling/phase1_token_api.spec.ts --project=chromium
 *
 * Prerequisites:
 *   SIGNALING_TOKEN_SECRET must be set in .env.local or .env.test.phase1
 *   (the .env.test.phase1 file ships with a local-only test secret)
 *
 * These tests make HTTP calls only — no WebSocket, no Agora, no production impact.
 */

import { test, expect } from '@playwright/test';

const TOKEN_ROUTE = '/api/signaling/token';

test.describe('[phase1] /api/signaling/token', () => {
  test('returns 400 when channelName is missing', async ({ request }) => {
    const res = await request.post(TOKEN_ROUTE, {
      data: { userId: 'user-1' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('returns 400 when userId is missing', async ({ request }) => {
    const res = await request.post(TOKEN_ROUTE, {
      data: { channelName: 'test-channel' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('returns 400 when body is not JSON', async ({ request }) => {
    const res = await request.post(TOKEN_ROUTE, {
      headers: { 'Content-Type': 'application/json' },
      data: 'not-json',
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with token and expiresAt when SIGNALING_TOKEN_SECRET is set', async ({ request }) => {
    const res = await request.post(TOKEN_ROUTE, {
      data: { channelName: 'test-channel', userId: 'test-user' },
    });

    if (res.status() === 503) {
      test.skip(true, 'SIGNALING_TOKEN_SECRET is not configured — skipping token generation test');
      return;
    }

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('token');
    expect(body).toHaveProperty('expiresAt');
    expect(typeof body.token).toBe('string');
    expect(typeof body.expiresAt).toBe('number');
  });

  test('token has expected HMAC.expiry format', async ({ request }) => {
    const res = await request.post(TOKEN_ROUTE, {
      data: { channelName: 'ch-abc', userId: 'u-123' },
    });

    if (res.status() === 503) {
      test.skip(true, 'SIGNALING_TOKEN_SECRET is not configured');
      return;
    }

    const { token, expiresAt } = await res.json();

    // Format: <hex-hmac>.<unix-timestamp-ms>
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex = 64 chars
    expect(Number(parts[1])).toBe(expiresAt);
  });

  test('token expiresAt is ~60 seconds from now', async ({ request }) => {
    const before = Date.now();
    const res = await request.post(TOKEN_ROUTE, {
      data: { channelName: 'ch-exp', userId: 'u-exp' },
    });

    if (res.status() === 503) {
      test.skip(true, 'SIGNALING_TOKEN_SECRET is not configured');
      return;
    }

    const { expiresAt } = await res.json();
    const after = Date.now();

    expect(expiresAt).toBeGreaterThan(before + 55_000);
    expect(expiresAt).toBeLessThan(after + 65_000);
  });

  test('different inputs produce different tokens', async ({ request }) => {
    if (process.env.SIGNALING_TOKEN_SECRET === undefined) {
      test.skip(true, 'SIGNALING_TOKEN_SECRET is not configured');
      return;
    }

    const [res1, res2] = await Promise.all([
      request.post(TOKEN_ROUTE, { data: { channelName: 'ch-a', userId: 'user-1' } }),
      request.post(TOKEN_ROUTE, { data: { channelName: 'ch-b', userId: 'user-1' } }),
    ]);

    if (res1.status() === 503 || res2.status() === 503) {
      test.skip(true, 'SIGNALING_TOKEN_SECRET is not configured');
      return;
    }

    const [b1, b2] = await Promise.all([res1.json(), res2.json()]);
    expect(b1.token.split('.')[0]).not.toBe(b2.token.split('.')[0]);
  });
});
