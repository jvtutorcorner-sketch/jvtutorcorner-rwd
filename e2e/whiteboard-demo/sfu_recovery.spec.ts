import { test, expect, type Page } from '@playwright/test';

// Verifies the Cloudflare SFU provider's self-healing (A2), quality adaptation (A3) and
// Agora-fallback (A4) against the fake SFU harness (app/rtc-harness). No real Cloudflare
// credentials or media server needed — the harness swaps in a controllable
// RTCPeerConnection + fetch(/api/realtime/*) and drives the REAL provider code.

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3005';

async function harness<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(fn) as Promise<T>;
}

async function waitStatus(page: Page, want: string, timeout = 15000) {
  await expect
    .poll(() => page.evaluate(() => (window as any).__sfu_harness?.connectionStatus), { timeout })
    .toBe(want);
}

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/rtc-harness`);
  await waitStatus(page, 'connected');
});

test('A2: dropped connection auto-recovers (rejoin) without user action', async ({ page }) => {
  const before = await harness<number>(page, '(window.__sfu_harness.sessionCount)');
  // Sever the peer connection.
  await page.evaluate(() => (window as any).__rtc_debug.drop());
  // It should reconnect on its own and mint a new SFU session.
  await waitStatus(page, 'connected');
  const after = await harness<number>(page, '(window.__sfu_harness.sessionCount)');
  expect(after).toBeGreaterThan(before);
  const fellBack = await harness<string | null>(page, '(window.__sfu_harness.fallbackReason)');
  expect(fellBack).toBeNull(); // recovered without needing Agora
});

test('A3: sustained bad network downgrades quality toward audio-only', async ({ page }) => {
  // Feed congested stats; the 2-bad-sample rule walks the rung down every ~2 samples.
  await page.evaluate(() => {
    (window as any).__sfu_harness.stats = {
      rttMs: 600,
      packetLoss: 0.15,
      availableBitrate: 80_000,
      limitation: 'bandwidth',
      freezes: 1,
    };
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__rtc_debug.quality()), { timeout: 15000 })
    .toBe('audio-only');
  // Video track is disabled (kept, not removed, to avoid the 30s SFU reclaim).
  const videoEnabled = await page.evaluate(() => {
    const pc = (window as any).__sfu_harness.lastPc;
    const v = pc?.getTransceivers?.().find((t: any) => t.sender?.track?.kind === 'video');
    return v?.sender?.track?.enabled;
  });
  expect(videoEnabled).toBe(false);
});

test('A4: exhausted self-healing falls back to Agora', async ({ page }) => {
  // Make every (re)join fail, then sever the connection: recovery should escalate
  // through its rejoin budget and finally invoke onProviderFallback.
  await page.evaluate(() => {
    (window as any).__sfu_harness.failSession = true;
    (window as any).__rtc_debug.drop();
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__sfu_harness.fallbackReason), { timeout: 20000 })
    .toBe('sfu-recovery-exhausted');
  const status = await harness<string>(page, '(window.__sfu_harness.connectionStatus)');
  expect(status).toBe('failed');
});
