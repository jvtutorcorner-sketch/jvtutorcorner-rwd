/**
 * Shared helpers for Phase 1 signaling tests.
 *
 * These utilities set up Playwright WebSocket interception to simulate
 * an AWS API Gateway WebSocket backend without needing a real deployment.
 */

import { type Page } from '@playwright/test';
import type { SignalingMessage } from '@/lib/providers/types';

// The WS URL used in test-phase1 pages — Playwright intercepts this.
export const MOCK_WS_URL = 'ws://phase1.test.invalid';

// Base URL for the test harness page.
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
export const HARNESS_PATH = '/test-phase1';

/** Build the absolute URL for the test harness with given params. */
export function harnessUrl(opts: {
  wsUrl?: string;
  /** Pass true to omit wsUrl entirely (tests the case where no WS URL is configured). */
  noWsUrl?: boolean;
  channel?: string;
  userId?: string;
  enabled?: boolean;
}): string {
  const p = new URLSearchParams();
  if (!opts.noWsUrl) p.set('wsUrl', opts.wsUrl ?? MOCK_WS_URL);
  if (opts.channel) p.set('channel', opts.channel);
  if (opts.userId) p.set('userId', opts.userId);
  if (opts.enabled === false) p.set('enabled', 'false');
  return `${BASE_URL}${HARNESS_PATH}?${p.toString()}`;
}

/** Base URL for use in browser.newContext() — ensures relative routes resolve correctly. */
export const TEST_BASE_URL = BASE_URL;

/**
 * Install a Playwright WS route that acts as a simple echo/fanout server.
 * - All messages sent by the client are echoed back unchanged.
 * - Optionally, the caller can get a `sendToClient` function to push server messages.
 */
export async function installEchoWsRoute(
  page: Page,
  urlPattern: string = `${MOCK_WS_URL}/**`,
): Promise<{
  receivedMessages: SignalingMessage[];
  sendToClient: (msg: SignalingMessage) => void;
  close: () => void;
}> {
  const receivedMessages: SignalingMessage[] = [];
  let _ws: any = null;

  await page.routeWebSocket(urlPattern, (ws) => {
    _ws = ws;
    ws.onMessage((raw) => {
      try {
        const msg: SignalingMessage = JSON.parse(String(raw));
        receivedMessages.push(msg);
        // Echo back to the same client (simulates server fanout to self)
        ws.send(JSON.stringify(msg));
      } catch {
        // ignore non-JSON frames
      }
    });
  });

  return {
    receivedMessages,
    sendToClient: (msg: SignalingMessage) => {
      _ws?.send(JSON.stringify(msg));
    },
    close: () => {
      _ws?.close();
    },
  };
}

/**
 * Install a Playwright WS route for a two-browser fanout scenario.
 * Messages sent by either page are forwarded to the other.
 */
export async function installFanoutWsRoute(
  teacherPage: Page,
  studentPage: Page,
  urlPattern: string = `${MOCK_WS_URL}/**`,
): Promise<{
  teacherMessages: SignalingMessage[];
  studentMessages: SignalingMessage[];
}> {
  const teacherMessages: SignalingMessage[] = [];
  const studentMessages: SignalingMessage[] = [];
  let teacherWs: any = null;
  let studentWs: any = null;

  // Route teacher page
  await teacherPage.routeWebSocket(urlPattern, (ws) => {
    teacherWs = ws;
    ws.onMessage((raw) => {
      try {
        const msg: SignalingMessage = JSON.parse(String(raw));
        teacherMessages.push(msg);
        // Fan out to student
        if (studentWs) studentWs.send(JSON.stringify(msg));
      } catch { /* ignore */ }
    });
  });

  // Route student page
  await studentPage.routeWebSocket(urlPattern, (ws) => {
    studentWs = ws;
    ws.onMessage((raw) => {
      try {
        const msg: SignalingMessage = JSON.parse(String(raw));
        studentMessages.push(msg);
        // Fan out to teacher
        if (teacherWs) teacherWs.send(JSON.stringify(msg));
      } catch { /* ignore */ }
    });
  });

  return { teacherMessages, studentMessages };
}

/** Mock the /api/signaling/token endpoint so WS tests don't need SIGNALING_TOKEN_SECRET. */
export async function mockTokenEndpoint(page: Page): Promise<void> {
  await page.route('**/api/signaling/token', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'mock-token.99999999999999',
        expiresAt: Date.now() + 60_000,
      }),
    });
  });
}

/** Wait for the harness to show a specific connectionState. */
export async function waitForConnectionState(
  page: Page,
  state: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error',
  timeoutMs = 10_000,
): Promise<void> {
  await page.waitForFunction(
    (s) => document.querySelector('[data-testid="connection-state"]')?.textContent === s,
    state,
    { timeout: timeoutMs },
  );
}

/** Get the last received message from the harness DOM. */
export async function getLastMessage(page: Page): Promise<SignalingMessage | null> {
  const text = await page.locator('[data-testid="last-message"]').textContent();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/** Count messages in the harness message log. */
export async function getMessageCount(page: Page): Promise<number> {
  return page.locator('[data-testid="message-log"] li').count();
}
