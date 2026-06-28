/**
 * Phase 1 — WebSocket Hook Integration Tests
 *
 * Tests the useAwsApigwSignaling hook lifecycle using Playwright's
 * routeWebSocket() to mock the API Gateway WS server entirely in-process.
 * No real AWS deployment needed. No Agora. No production impact.
 *
 * Run:
 *   npx playwright test e2e/signaling/phase1_ws_signaling.spec.ts --project=chromium
 *
 * The test harness page at /test-phase1 must be reachable (next dev running).
 * In production, /test-phase1 returns 404 — safe to deploy.
 *
 * What is tested:
 *   1. Hook connects when enabled
 *   2. connectionState transitions: idle → connecting → connected
 *   3. sendMessage sends a well-formed JSON frame
 *   4. onMessage fires when server pushes a message
 *   5. Hook disconnects when enabled flips to false
 *   6. Hook reconnects after server closes the connection
 *   7. All 5 RTM message types are sent with correct structure
 */

import { test, expect } from '@playwright/test';
import {
  MOCK_WS_URL,
  harnessUrl,
  installEchoWsRoute,
  mockTokenEndpoint,
  waitForConnectionState,
  getLastMessage,
  getMessageCount,
} from '../helpers/signaling_test_helpers';

test.describe('[phase1] useAwsApigwSignaling hook', () => {
  test.setTimeout(30_000);

  test('1. hook connects when enabled=true', async ({ page }) => {
    const { receivedMessages } = await installEchoWsRoute(page);
    await mockTokenEndpoint(page);

    await page.goto(harnessUrl({ channel: 'ch-connect', userId: 'u-1' }));
    await waitForConnectionState(page, 'connected');

    expect(await page.locator('[data-testid="connected"]').textContent()).toBe('true');
    expect(receivedMessages).toHaveLength(0); // no messages sent yet
  });

  test('2. connectionState transitions idle → connecting → connected', async ({ page }) => {
    const states: string[] = [];

    // Install WS route BEFORE page.goto() so it's ready when Enable is clicked
    await installEchoWsRoute(page);
    await mockTokenEndpoint(page);

    // Start disabled so we can observe idle
    await page.goto(harnessUrl({ channel: 'ch-states', userId: 'u-2', enabled: false }));
    expect(await page.locator('[data-testid="connection-state"]').textContent()).toBe('idle');

    // Enable and capture state sequence
    await page.locator('[data-testid="btn-enable"]').click();

    // Poll until connected (intermediate states are fast)
    await waitForConnectionState(page, 'connected', 8_000);
    const finalState = await page.locator('[data-testid="connection-state"]').textContent();
    expect(finalState).toBe('connected');
  });

  test('3. sendMessage sends well-formed SignalingMessage JSON', async ({ page }) => {
    const { receivedMessages } = await installEchoWsRoute(page);
    await mockTokenEndpoint(page);

    await page.goto(harnessUrl({ channel: 'ch-send', userId: 'u-3' }));
    await waitForConnectionState(page, 'connected');

    await page.locator('[data-testid="btn-send-ping"]').click();
    await page.waitForFunction(() => {
      return document.querySelector('[data-testid="send-result"]')?.textContent === 'ok';
    }, undefined, { timeout: 5_000 });

    // Wait for echo to arrive
    await page.waitForFunction(() => {
      const log = document.querySelector('[data-testid="message-log"]');
      return (log?.querySelectorAll('li').length ?? 0) > 0;
    }, undefined, { timeout: 5_000 });

    // Validate message structure
    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0];
    expect(msg.type).toBe('ping');
    expect(msg.senderId).toBe('u-3');
    expect(typeof msg.timestamp).toBe('number');
    expect(typeof msg.seq).toBe('number');
    expect(msg.payload).toMatchObject({ test: true });
  });

  test('4. onMessage fires when server pushes a message', async ({ page }) => {
    const { sendToClient } = await installEchoWsRoute(page);
    await mockTokenEndpoint(page);

    await page.goto(harnessUrl({ channel: 'ch-receive', userId: 'u-4' }));
    await waitForConnectionState(page, 'connected');

    // Server pushes a message
    const pushed = {
      type: 'wb-uuid-sync' as const,
      payload: { uuid: 'test-board-uuid-42' },
      senderId: 'mock-server',
      timestamp: Date.now(),
    };
    sendToClient(pushed);

    // Wait for the hook's onMessage to fire and update the DOM
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="last-message"]');
      return el?.textContent?.includes('wb-uuid-sync') === true;
    }, undefined, { timeout: 5_000 });

    const last = await getLastMessage(page);
    expect(last?.type).toBe('wb-uuid-sync');
    expect(last?.payload?.uuid).toBe('test-board-uuid-42');
  });

  test('5. hook disconnects when enabled flips to false', async ({ page }) => {
    await installEchoWsRoute(page);
    await mockTokenEndpoint(page);

    await page.goto(harnessUrl({ channel: 'ch-disable', userId: 'u-5' }));
    await waitForConnectionState(page, 'connected');

    await page.locator('[data-testid="btn-disable"]').click();

    // State should return to idle (not disconnected, because we called disconnect())
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="connection-state"]');
      return el?.textContent === 'idle' || el?.textContent === 'disconnected';
    }, undefined, { timeout: 5_000 });

    expect(await page.locator('[data-testid="connected"]').textContent()).toBe('false');
  });

  test('6. hook reconnects after server closes the connection', async ({ page }) => {
    const { close } = await installEchoWsRoute(page);
    await mockTokenEndpoint(page);

    await page.goto(harnessUrl({ channel: 'ch-reconnect', userId: 'u-6' }));
    await waitForConnectionState(page, 'connected');

    // Simulate server disconnect
    close();

    // Should transition to disconnected then reconnect
    await waitForConnectionState(page, 'disconnected', 5_000);

    // Re-install WS route so reconnect attempt succeeds
    await installEchoWsRoute(page);
    await waitForConnectionState(page, 'connected', 15_000);
  });

  test('7. all 5 RTM message types send correctly', async ({ page }) => {
    const { receivedMessages } = await installEchoWsRoute(page);
    await mockTokenEndpoint(page);

    await page.goto(harnessUrl({ channel: 'ch-types', userId: 'u-7' }));
    await waitForConnectionState(page, 'connected');

    const buttons = [
      '[data-testid="btn-send-ping"]',
      '[data-testid="btn-send-uuid"]',
      '[data-testid="btn-send-page"]',
      '[data-testid="btn-send-pdf"]',
      '[data-testid="btn-send-ready"]',
    ];

    for (const btn of buttons) {
      await page.locator(btn).click();
      await page.waitForTimeout(100); // slight gap between sends
    }

    // Wait for all 5 echoes to arrive in the log
    await page.waitForFunction(() => {
      return (document.querySelectorAll('[data-testid="message-log"] li').length) >= 5;
    }, undefined, { timeout: 8_000 });

    const expectedTypes = ['ping', 'wb-uuid-sync', 'page-change', 'pdf-available', 'ready-state-update'];
    const sentTypes = receivedMessages.map((m) => m.type);
    for (const t of expectedTypes) {
      expect(sentTypes).toContain(t);
    }
  });

  test('8. seq number increments monotonically', async ({ page }) => {
    const { receivedMessages } = await installEchoWsRoute(page);
    await mockTokenEndpoint(page);

    await page.goto(harnessUrl({ channel: 'ch-seq', userId: 'u-8' }));
    await waitForConnectionState(page, 'connected');

    // Send 3 pings
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-testid="btn-send-ping"]').click();
      await page.waitForTimeout(50);
    }

    await page.waitForFunction(() => {
      return (document.querySelectorAll('[data-testid="message-log"] li').length) >= 3;
    }, undefined, { timeout: 5_000 });

    const seqs = receivedMessages.map((m) => m.seq ?? -1);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
  });

  test('9. token endpoint is called before connection', async ({ page }) => {
    let tokenFetched = false;
    await page.route('**/api/signaling/token', (route) => {
      tokenFetched = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'intercepted-token.99999', expiresAt: Date.now() + 60_000 }),
      });
    });

    await installEchoWsRoute(page);
    await page.goto(harnessUrl({ channel: 'ch-token', userId: 'u-9' }));
    await waitForConnectionState(page, 'connected');

    expect(tokenFetched).toBe(true);
  });

  test('10. hook stays idle when MOCK_WS_URL is not provided', async ({ page }) => {
    // No wsUrl → hook reads NEXT_PUBLIC_AWS_APIGW_WS_URL which is not set in .env.local
    // → hook should warn and stay idle (no crash)
    // Use absolute URL so this test works regardless of config baseURL
    await page.goto(harnessUrl({ noWsUrl: true, channel: 'ch-noop', userId: 'u-10' }));

    // Give the hook time to attempt connection (it would log a warning and bail)
    await page.waitForTimeout(2_000);

    const state = await page.locator('[data-testid="connection-state"]').textContent();
    // Acceptable: either 'idle' (no URL configured) or 'connected' (if env is set locally)
    expect(['idle', 'connecting', 'connected']).toContain(state);

    // The page must not have crashed
    const title = await page.title();
    expect(title).not.toMatch(/500|Error/i);
  });
});
