#!/usr/bin/env node
/**
 * 課程結束結算判斷回歸測試
 * ========================
 *
 * Agora 路徑先前沒有任何呼叫會在老師結束課程時撥款，暫存點數永遠停在 HOLDING。
 * /api/classroom/complete 以 lib/classroomCompletion.ts 的 decideCompletion
 * 決定要不要 releaseEscrow。本腳本只驗證這個純函式，不連網路、不碰資料庫。
 *
 * 用法：
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-class-completion.mjs
 *
 * 退出碼：0 = 全部通過；1 = 有失敗。
 */

import assert from 'node:assert/strict';
import { decideCompletion, COMPLETION_EARLY_WINDOW_MS } from '../lib/classroomCompletion.ts';

const NOW = Date.parse('2026-09-17T10:00:00Z');
const courseId = 'course-1';
const order = (over = {}) => ({
  orderId: 'order-1',
  courseId,
  status: 'PAID',
  startTime: '2026-09-17T09:55:00Z',
  ...over,
});
const escrow = (over = {}) => ({ escrowId: 'esc-1', status: 'HOLDING', courseId, ...over });

const cases = [
  ['HOLDING 且已開課 → 撥款',
    { courseId, order: order(), escrow: escrow(), now: NOW },
    { action: 'release', escrowId: 'esc-1' }],
  ['開課前 10 分鐘內 → 允許撥款',
    { courseId, order: order({ startTime: new Date(NOW + COMPLETION_EARLY_WINDOW_MS - 1000).toISOString() }), escrow: escrow(), now: NOW },
    { action: 'release', escrowId: 'esc-1' }],
  ['距開課超過 10 分鐘 → 拒絕',
    { courseId, order: order({ startTime: new Date(NOW + COMPLETION_EARLY_WINDOW_MS + 60_000).toISOString() }), escrow: escrow(), now: NOW },
    { action: 'reject', status: 409, error: 'Class has not started yet' }],
  ['訂單不存在 → 404',
    { courseId, order: null, escrow: null, now: NOW },
    { action: 'reject', status: 404, error: 'Order not found' }],
  ['訂單屬於別堂課 → 400',
    { courseId, order: order({ courseId: 'other' }), escrow: escrow(), now: NOW },
    { action: 'reject', status: 400, error: 'Order does not belong to this course' }],
  ['訂單未付款 → 409',
    { courseId, order: order({ status: 'PENDING_PAYMENT' }), escrow: escrow(), now: NOW },
    { action: 'reject', status: 409, error: 'Order is not payable (status=PENDING_PAYMENT)' }],
  ['已退款訂單 → 409',
    { courseId, order: order({ status: 'REFUNDED' }), escrow: escrow({ status: 'REFUNDED' }), now: NOW },
    { action: 'reject', status: 409, error: 'Order is not payable (status=REFUNDED)' }],
  ['非點數付款沒有暫存 → noop',
    { courseId, order: order(), escrow: null, now: NOW },
    { action: 'noop', reason: 'NO_ESCROW' }],
  ['已撥款 → noop（冪等）',
    { courseId, order: order(), escrow: escrow({ status: 'RELEASED' }), now: NOW },
    { action: 'noop', reason: 'ALREADY_RELEASED' }],
  ['暫存已退回學生 → 409',
    { courseId, order: order({ status: 'PAID' }), escrow: escrow({ status: 'REFUNDED' }), now: NOW },
    { action: 'reject', status: 409, error: 'Escrow is REFUNDED' }],
  ['暫存屬於別堂課 → 400',
    { courseId, order: order(), escrow: escrow({ courseId: 'other' }), now: NOW },
    { action: 'reject', status: 400, error: 'Escrow does not belong to this course' }],
  ['沒有開始時間 → 不擋時間，照暫存狀態判斷',
    { courseId, order: order({ startTime: null }), escrow: escrow(), now: NOW },
    { action: 'release', escrowId: 'esc-1' }],
  ['無時區的牆上時間視為台北時間（18:05 台北 = 10:05Z，在開課前 10 分鐘內）',
    { courseId, order: order({ startTime: '2026-09-17T18:05' }), escrow: escrow(), now: NOW },
    { action: 'release', escrowId: 'esc-1' }],
  ['無時區的牆上時間視為台北時間（18:30 台北 = 10:30Z，尚未開課）',
    { courseId, order: order({ startTime: '2026-09-17T18:30' }), escrow: escrow(), now: NOW },
    { action: 'reject', status: 409, error: 'Class has not started yet' }],
  ['狀態小寫 paid 也接受',
    { courseId, order: order({ status: 'paid' }), escrow: escrow(), now: NOW },
    { action: 'release', escrowId: 'esc-1' }],
];

let failed = 0;
for (const [name, input, expected] of cases) {
  try {
    assert.deepEqual(decideCompletion(input), expected);
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${name}\n     ${err.message.split('\n').join('\n     ')}`);
  }
}

console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
