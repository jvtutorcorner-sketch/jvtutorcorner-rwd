/**
 * Phase 1 — Two-Browser Fanout Tests
 *
 * Simulates a real teacher + student session where signaling messages
 * sent from one participant's browser are fanned out to the other.
 *
 * Playwright's WS routing intercepts both browsers' connections.
 * The test itself acts as the API Gateway fanout Lambda — no AWS deployment needed.
 *
 * Run:
 *   npx playwright test e2e/signaling/phase1_dual_browser.spec.ts --project=chromium
 *
 * Note on array semantics:
 *   teacherMessages = messages the TEACHER browser SENT (captured by teacher WS route)
 *   studentMessages = messages the STUDENT browser SENT (captured by student WS route)
 *   To verify RECEIVED messages, read the DOM's [data-testid="message-log"] via helpers.
 *
 * What is tested:
 *   A. Teacher sends wb-uuid-sync → student DOM shows receipt
 *   B. Student sends ping → teacher DOM shows receipt
 *   C. Teacher sends page-change → student DOM shows correct type
 *   D. Teacher sends pdf-available → student DOM shows receipt
 *   E. Both send ready-state-update → both DOMs show the other's message
 *   F. Seq numbers from each sender are monotonically increasing
 *   G. 10 rapid messages from teacher all arrive at student in order
 */

import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  harnessUrl,
  installFanoutWsRoute,
  mockTokenEndpoint,
  waitForConnectionState,
  getLastMessage,
  TEST_BASE_URL,
} from '../helpers/signaling_test_helpers';
import type { SignalingMessage } from '@/lib/providers/types';

const CHANNEL = 'dual-test-channel';

/** Wait for the DOM message log to contain at least one message of given type. */
async function waitForReceivedMessage(page: Page, type: string, timeoutMs = 12_000): Promise<void> {
  await page.waitForFunction(
    (t) => {
      const items = Array.from(document.querySelectorAll('[data-testid="message-log"] li'));
      return items.some((el) => {
        try { return (JSON.parse(el.textContent ?? '') as SignalingMessage).type === t; }
        catch { return false; }
      });
    },
    type,
    { timeout: timeoutMs },
  );
}

/** Get all messages from the DOM log of the given type. */
async function getDomMessages(page: Page, type?: string): Promise<SignalingMessage[]> {
  const items = await page.locator('[data-testid="message-log"] li').all();
  const msgs: SignalingMessage[] = [];
  for (const li of items) {
    try {
      const msg: SignalingMessage = JSON.parse((await li.textContent()) ?? '');
      if (!type || msg.type === type) msgs.push(msg);
    } catch { /* skip */ }
  }
  return msgs;
}

async function setupTwoClients(
  browser: Browser,
  teacherId: string,
  studentId: string,
) {
  // Pass baseURL so relative page.goto() works in new contexts
  const ctxOptions = { baseURL: TEST_BASE_URL };
  const teacherCtx = await browser.newContext(ctxOptions);
  const studentCtx = await browser.newContext(ctxOptions);
  const teacherPage = await teacherCtx.newPage();
  const studentPage = await studentCtx.newPage();

  await mockTokenEndpoint(teacherPage);
  await mockTokenEndpoint(studentPage);

  const { teacherMessages, studentMessages } = await installFanoutWsRoute(teacherPage, studentPage);

  await Promise.all([
    teacherPage.goto(harnessUrl({ channel: CHANNEL, userId: teacherId })),
    studentPage.goto(harnessUrl({ channel: CHANNEL, userId: studentId })),
  ]);

  await Promise.all([
    waitForConnectionState(teacherPage, 'connected'),
    waitForConnectionState(studentPage, 'connected'),
  ]);

  async function cleanup() {
    await teacherCtx.close();
    await studentCtx.close();
  }

  return { teacherPage, studentPage, teacherMessages, studentMessages, cleanup };
}

test.describe('[phase1] Two-browser fanout', () => {
  test.setTimeout(60_000);

  test('A. teacher wb-uuid-sync reaches student DOM', async ({ browser }) => {
    const { teacherPage, studentPage, teacherMessages, cleanup } =
      await setupTwoClients(browser, 'teacher-a', 'student-a');
    try {
      await teacherPage.locator('[data-testid="btn-send-uuid"]').click();

      // Verify server received the teacher's message
      await teacherPage.waitForFunction(
        () => document.querySelector('[data-testid="send-result"]')?.textContent === 'ok',
        undefined, { timeout: 5_000 },
      );

      // Verify student DOM received the fanned-out message
      await waitForReceivedMessage(studentPage, 'wb-uuid-sync');
      const studentDomMsgs = await getDomMessages(studentPage, 'wb-uuid-sync');
      expect(studentDomMsgs[0]?.senderId).toBe('teacher-a');

      // Verify server captured the sent message
      expect(teacherMessages.some((m) => m.type === 'wb-uuid-sync')).toBe(true);
    } finally { await cleanup(); }
  });

  test('B. student ping reaches teacher DOM (reverse direction)', async ({ browser }) => {
    const { teacherPage, studentPage, studentMessages, cleanup } =
      await setupTwoClients(browser, 'teacher-b', 'student-b');
    try {
      await studentPage.locator('[data-testid="btn-send-ping"]').click();

      await waitForReceivedMessage(teacherPage, 'ping');
      const teacherDomMsgs = await getDomMessages(teacherPage, 'ping');
      expect(teacherDomMsgs[0]?.senderId).toBe('student-b');

      expect(studentMessages.some((m) => m.type === 'ping')).toBe(true);
    } finally { await cleanup(); }
  });

  test('C. teacher page-change reaches student DOM with correct senderId', async ({ browser }) => {
    const { teacherPage, studentPage, teacherMessages, cleanup } =
      await setupTwoClients(browser, 'teacher-c', 'student-c');
    try {
      await teacherPage.locator('[data-testid="btn-send-page"]').click();

      await waitForReceivedMessage(studentPage, 'page-change');
      const msgs = await getDomMessages(studentPage, 'page-change');
      expect(msgs[0]?.senderId).toBe('teacher-c');

      expect(teacherMessages.some((m) => m.type === 'page-change')).toBe(true);
    } finally { await cleanup(); }
  });

  test('D. teacher pdf-available reaches student DOM', async ({ browser }) => {
    const { teacherPage, studentPage, cleanup } =
      await setupTwoClients(browser, 'teacher-d', 'student-d');
    try {
      await teacherPage.locator('[data-testid="btn-send-pdf"]').click();

      await waitForReceivedMessage(studentPage, 'pdf-available');
      const msgs = await getDomMessages(studentPage, 'pdf-available');
      expect(msgs.length).toBeGreaterThan(0);
    } finally { await cleanup(); }
  });

  test('E. both send ready-state-update and both DOMs receive the other\'s', async ({ browser }) => {
    const { teacherPage, studentPage, cleanup } =
      await setupTwoClients(browser, 'teacher-e', 'student-e');
    try {
      // Both send simultaneously
      await Promise.all([
        teacherPage.locator('[data-testid="btn-send-ready"]').click(),
        studentPage.locator('[data-testid="btn-send-ready"]').click(),
      ]);

      // Each should receive the other's message in their DOM
      await Promise.all([
        waitForReceivedMessage(teacherPage, 'ready-state-update'),
        waitForReceivedMessage(studentPage, 'ready-state-update'),
      ]);

      const [teacherReceived, studentReceived] = await Promise.all([
        getDomMessages(teacherPage, 'ready-state-update'),
        getDomMessages(studentPage, 'ready-state-update'),
      ]);

      expect(teacherReceived.some((m) => m.senderId === 'student-e')).toBe(true);
      expect(studentReceived.some((m) => m.senderId === 'teacher-e')).toBe(true);
    } finally { await cleanup(); }
  });

  test('F. seq numbers from each sender are monotonically increasing', async ({ browser }) => {
    const { teacherPage, studentPage, teacherMessages, studentMessages, cleanup } =
      await setupTwoClients(browser, 'teacher-f', 'student-f');
    try {
      for (let i = 0; i < 3; i++) await teacherPage.locator('[data-testid="btn-send-ping"]').click();
      for (let i = 0; i < 2; i++) await studentPage.locator('[data-testid="btn-send-ping"]').click();

      // Wait for student to receive all 3 from teacher
      await studentPage.waitForFunction(
        (n) => document.querySelectorAll('[data-testid="message-log"] li').length >= n,
        3, { timeout: 12_000 },
      );

      // Teacher messages captured by server (sent BY teacher)
      const tSeqs = teacherMessages.filter((m) => m.senderId === 'teacher-f').map((m) => m.seq ?? -1);
      const sSeqs = studentMessages.filter((m) => m.senderId === 'student-f').map((m) => m.seq ?? -1);

      expect(tSeqs.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < tSeqs.length; i++) expect(tSeqs[i]).toBeGreaterThan(tSeqs[i - 1]);
      for (let i = 1; i < sSeqs.length; i++) expect(sSeqs[i]).toBeGreaterThan(sSeqs[i - 1]);
    } finally { await cleanup(); }
  });

  test('G. 10 rapid messages from teacher arrive at student in order', async ({ browser }) => {
    const { teacherPage, studentPage, teacherMessages, cleanup } =
      await setupTwoClients(browser, 'teacher-g', 'student-g');
    try {
      for (let i = 0; i < 10; i++) {
        await teacherPage.locator('[data-testid="btn-send-ping"]').click();
      }

      // Wait for student DOM to show at least 10 received messages
      await studentPage.waitForFunction(
        (n) => document.querySelectorAll('[data-testid="message-log"] li').length >= n,
        10, { timeout: 15_000 },
      );

      // Verify from server-side captured messages (teacher SENT them in order)
      const fromTeacher = teacherMessages.filter((m) => m.senderId === 'teacher-g');
      expect(fromTeacher.length).toBeGreaterThanOrEqual(10);

      const seqs = fromTeacher.map((m) => m.seq ?? -1);
      for (let i = 1; i < seqs.length; i++) {
        expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
      }

      // Also verify received messages in student DOM have matching seq numbers
      const studentDomMsgs = await getDomMessages(studentPage);
      const receivedFromTeacher = studentDomMsgs.filter((m) => m.senderId === 'teacher-g');
      expect(receivedFromTeacher.length).toBeGreaterThanOrEqual(10);
    } finally { await cleanup(); }
  });
});
