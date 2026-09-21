/**
 * canvas_demo.spec.ts — canvas whiteboard sync over the WebRTC DataChannel (UDP),
 * scaled to N concurrent teacher/student groups.
 *
 * Each group is an independent teacher+student pair in SEPARATE browser contexts
 * (separate BroadcastChannel → sync is proven over the real P2P DataChannel, not
 * same-tab), on its own channel. Every teacher draws concurrently; each student
 * mirrors over UDP. Per group we assert: DataChannel open on both sides AND the
 * student actually received strokes (RTC latency logs) AND its canvas has ink.
 *
 *   GROUPS=3 HEADLESS=true NEXT_PUBLIC_BASE_URL=http://localhost:3005 APP_ENV=local \
 *     npx playwright test e2e/whiteboard-demo/canvas_demo.spec.ts --project=chromium
 * Knobs: GROUPS (default 1), DEMO_DURATION_SEC (default 25).
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { autoLogin } from '../helpers/whiteboard_helpers';
import { getTestConfig } from '../test_data/whiteboard_test_data';
import { hasAnyInk } from '../helpers/canvas_probe';

// Track every context we open and close them after each test — Playwright does not
// auto-close manually-created contexts, and leaked ones keep polling and starve the
// next test's WebRTC handshake.
const openContexts: BrowserContext[] = [];
async function newCtx(browser: Browser): Promise<BrowserContext> {
  const c = await browser.newContext();
  openContexts.push(c);
  return c;
}
test.afterEach(async () => {
  for (const c of openContexts.splice(0)) { try { await c.close(); } catch {} }
});

interface Group {
  idx: number;
  channel: string;
  tctx: BrowserContext;
  sctx: BrowserContext;
  t: Page;
  s: Page;
  dcT: boolean;
  dcS: boolean;
  synced: number;
  drawn: number;
}

test('canvas whiteboard RTC sync across N groups', async ({ browser }) => {
  // NOTE: use WB_GROUPS, not GROUPS — GROUPS is a bash built-in readonly var and
  // an inline `GROUPS=N` prefix never reaches the process.
  const GROUPS = Math.max(1, Number(process.env.WB_GROUPS || process.env.GROUPS || '1'));
  const durationSec = Number(process.env.DEMO_DURATION_SEC || '25');
  const strokeGapMs = Number(process.env.DEMO_STROKE_GAP_MS || '600'); // pause between strokes
  const strokePoints = Number(process.env.DEMO_STROKE_POINTS || '24'); // samples per stroke
  const strokeWidth = Number(process.env.DEMO_STROKE_WIDTH || '4'); // brush size
  test.setTimeout((durationSec + 90 + GROUPS * 15) * 1000);

  const cfg = getTestConfig();
  const ts = Date.now();
  const groups: Group[] = [];

  for (let i = 0; i < GROUPS; i++) {
    const tctx = await newCtx(browser);
    const sctx = await newCtx(browser);
    const t = await tctx.newPage();
    const s = await sctx.newPage();
    const g: Group = { idx: i, channel: `demo-${ts}-g${i}`, tctx, sctx, t, s, dcT: false, dcS: false, synced: 0, drawn: 0 };
    t.on('console', (m) => { if (/datachannel OPEN/.test(m.text())) g.dcT = true; });
    s.on('console', (m) => {
      const x = m.text();
      if (/datachannel OPEN/.test(x)) g.dcS = true;
      if (/stroke synced, latency/.test(x)) g.synced++;
    });
    groups.push(g);
  }

  // Log in every context (same test teacher/student account is fine — sessions are per-context).
  await Promise.all(
    groups.flatMap((g) => [
      autoLogin(g.t, cfg.teacherEmail, cfg.teacherPassword, cfg.bypassSecret),
      autoLogin(g.s, cfg.studentEmail, cfg.studentPassword, cfg.bypassSecret),
    ])
  );

  const url = (ch: string, role: string) =>
    `${cfg.baseUrl}/whiteboard-demo?channel=${encodeURIComponent(ch)}&role=${role}`;
  await Promise.all(groups.flatMap((g) => [g.t.goto(url(g.channel, 'teacher')), g.s.goto(url(g.channel, 'student'))]));
  await Promise.all(
    groups.flatMap((g) => [
      g.t.waitForSelector('.whiteboard-container canvas', { timeout: 30000 }),
      g.s.waitForSelector('.whiteboard-container canvas', { timeout: 30000 }),
    ])
  );

  // Wait for every group's DataChannel to open (P2P handshake via signaling).
  const openDeadline = Date.now() + 30000;
  while (Date.now() < openDeadline && !groups.every((g) => g.dcT && g.dcS)) {
    await groups[0].t.waitForTimeout(500);
  }

  // Enlarge the brush on every teacher so strokes are clearly visible.
  await Promise.all(groups.map((g) => g.t.evaluate((w) => (window as any).__wb_setWidth?.(w), strokeWidth).catch(() => {})));

  // Draw on every teacher concurrently.
  const drawOne = async (g: Group) => {
    const box = await g.t.locator('.whiteboard-container').boundingBox();
    if (!box) return;
    const pad = 40;
    const area = { x: box.x + pad, y: box.y + pad, w: box.width - pad * 2, h: box.height - pad * 2 };
    const deadline = Date.now() + durationSec * 1000;
    let i = 0;
    while (Date.now() < deadline) {
      const y0 = area.y + Math.random() * area.h * 0.85;
      const x0 = area.x + 10;
      await g.t.mouse.move(x0, y0);
      await g.t.mouse.down();
      for (let k = 1; k <= strokePoints; k++) {
        await g.t.mouse.move(x0 + (area.w - 20) * (k / strokePoints), y0 + Math.sin(k / 2 + i) * 32);
        await g.t.waitForTimeout(12);
      }
      await g.t.mouse.up();
      i++;
      await g.t.waitForTimeout(strokeGapMs);
    }
    g.drawn = i;
  };
  await Promise.all(groups.map(drawOne));
  await groups[0].t.waitForTimeout(1500);

  // Report + assert per group.
  console.log(`\n=== RTC SYNC RESULT (GROUPS=${GROUPS}) ===`);
  const inks: boolean[] = [];
  for (const g of groups) {
    const ink = await hasAnyInk(g.s, { strict: false }).then((r) => r.hasInk).catch(() => false);
    inks.push(ink);
    console.log(`  group ${g.idx}: dc(T/S)=${g.dcT}/${g.dcS} drawn=${g.drawn} studentSynced=${g.synced} studentInk=${ink}`);
  }
  await groups[0].s.screenshot({ path: `test-results/rtc-g${GROUPS}-student0.png` }).catch(() => {});

  for (const g of groups) {
    expect(g.dcT && g.dcS, `group ${g.idx}: DataChannel not open on both sides`).toBe(true);
    expect(g.synced, `group ${g.idx}: student received no strokes over RTC`).toBeGreaterThan(0);
    expect(inks[g.idx], `group ${g.idx}: student canvas has no ink`).toBe(true);
  }
});

// ── shared helpers for the capability tests ──────────────────────────────────
async function drawN(page: Page, n: number, points = 20, gapMs = 250) {
  const box = await page.locator('.whiteboard-container').boundingBox();
  if (!box) throw new Error('no whiteboard container');
  const pad = 40;
  const area = { x: box.x + pad, y: box.y + pad, w: box.width - pad * 2, h: box.height - pad * 2 };
  for (let i = 0; i < n; i++) {
    const y0 = area.y + Math.random() * area.h * 0.85;
    const x0 = area.x + 10;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let k = 1; k <= points; k++) {
      await page.mouse.move(x0 + (area.w - 20) * (k / points), y0 + Math.sin(k / 2 + i) * 28);
      await page.waitForTimeout(10);
    }
    await page.mouse.up();
    await page.waitForTimeout(gapMs);
  }
}
const strokeCount = (p: Page) => p.evaluate(() => Number((window as any).__wb_strokeCount?.() ?? 0));

test('canvas whiteboard RTC late-join: student receives the existing board', async ({ browser }) => {
  test.setTimeout(120000);
  const cfg = getTestConfig();
  const channel = `demo-latejoin-${Date.now()}`;
  const url = (role: string) => `${cfg.baseUrl}/whiteboard-demo?channel=${encodeURIComponent(channel)}&role=${role}`;

  // Teacher joins alone and draws before the student is present.
  const tctx = await newCtx(browser);
  const t = await tctx.newPage();
  if (process.env.DEMO_LOG_CONSOLE === '1') {
    t.on('console', (m) => { if (/\[WB RTC\]|\[WB apply\]/.test(m.text())) console.log(`[T] ${m.text()}`.slice(0, 180)); });
  }
  await autoLogin(t, cfg.teacherEmail, cfg.teacherPassword, cfg.bypassSecret);
  await t.goto(url('teacher'));
  await t.waitForSelector('.whiteboard-container canvas', { timeout: 30000 });
  await t.waitForTimeout(1500);
  await drawN(t, 6);
  const teacherCount = await strokeCount(t);
  expect(teacherCount).toBeGreaterThanOrEqual(6);

  // Student joins late → must recover the existing board (RTC request-state, or snapshot).
  const sctx = await newCtx(browser);
  const s = await sctx.newPage();
  let dcOpen = false;
  s.on('console', (m) => { if (/datachannel OPEN/.test(m.text())) dcOpen = true; });
  if (process.env.DEMO_LOG_CONSOLE === '1') {
    s.on('console', (m) => { if (/\[WB RTC\]|\[WB apply\]/.test(m.text())) console.log(`[S] ${m.text()}`.slice(0, 180)); });
  }
  await autoLogin(s, cfg.studentEmail, cfg.studentPassword, cfg.bypassSecret);
  await s.goto(url('student'));
  await s.waitForSelector('.whiteboard-container canvas', { timeout: 30000 });

  await expect.poll(() => strokeCount(s), { timeout: 30000, intervals: [500, 1000] }).toBeGreaterThanOrEqual(teacherCount);
  console.log(`[late-join] teacher=${teacherCount} student=${await strokeCount(s)} dcOpen=${dcOpen}`);

  // Live strokes after join keep flowing.
  await drawN(t, 4);
  await expect.poll(() => strokeCount(s), { timeout: 20000, intervals: [500] }).toBeGreaterThanOrEqual(teacherCount + 4);
});

test('canvas whiteboard RTC reconnect: drops recover and sync resumes', async ({ browser }) => {
  test.setTimeout(120000);
  const cfg = getTestConfig();
  const channel = `demo-reconnect-${Date.now()}`;
  const url = (role: string) => `${cfg.baseUrl}/whiteboard-demo?channel=${encodeURIComponent(channel)}&role=${role}`;

  const tctx = await newCtx(browser);
  const sctx = await newCtx(browser);
  const t = await tctx.newPage();
  const s = await sctx.newPage();
  let sOpens = 0;
  s.on('console', (m) => { if (/datachannel OPEN/.test(m.text())) sOpens++; });
  await Promise.all([
    autoLogin(t, cfg.teacherEmail, cfg.teacherPassword, cfg.bypassSecret),
    autoLogin(s, cfg.studentEmail, cfg.studentPassword, cfg.bypassSecret),
  ]);
  await Promise.all([t.goto(url('teacher')), s.goto(url('student'))]);
  await Promise.all([
    t.waitForSelector('.whiteboard-container canvas', { timeout: 30000 }),
    s.waitForSelector('.whiteboard-container canvas', { timeout: 30000 }),
  ]);
  await expect.poll(() => sOpens, { timeout: 30000, intervals: [500] }).toBeGreaterThanOrEqual(1);

  await drawN(t, 4);
  await expect.poll(() => strokeCount(s), { timeout: 20000 }).toBeGreaterThanOrEqual(4);

  // Force a drop; the transport must recover (snapshot fills the gap, then RTC resumes).
  await t.evaluate(() => (window as any).__wb_rtc_debug?.drop());
  await drawN(t, 5);
  const teacherTotal = await strokeCount(t);
  await expect.poll(() => strokeCount(s), { timeout: 45000, intervals: [1000] }).toBeGreaterThanOrEqual(teacherTotal);
  console.log(`[reconnect] teacherTotal=${teacherTotal} student=${await strokeCount(s)} studentOpens=${sOpens}`);
});
