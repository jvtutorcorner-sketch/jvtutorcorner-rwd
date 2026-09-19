#!/usr/bin/env node
/**
 * 退款授權 / 欄位白名單回歸測試
 * ============================
 *
 * PATCH /api/orders/[orderId] 先前允許一般使用者直接把自己的訂單設成 REFUNDED
 * （自助退點、撤銷報名），也能附加任意 payment 紀錄；老師可以改任何人的訂單狀態。
 * 現在由 app/api/admin/refunds/refundPolicy.ts 的純函式決定每個角色能做什麼，
 * 管理員核准退款時的資產反轉計畫也由純函式產生。
 *
 * 本腳本只驗證這些純函式，不連網路、不碰資料庫。
 *
 * 用法：
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-refund-authz.mjs
 *
 * 退出碼：0 = 全部通過；1 = 有失敗。
 */

import assert from 'node:assert/strict';
import {
  decideOrderPatch,
  planAssetReversal,
  buildGatewayRefund,
  findGatewayTransactionId,
  parseAdminRefundAction,
  needsManualGatewayRefund,
} from '../app/api/admin/refunds/refundPolicy.ts';

const OWNER = 'u_owner';
const OTHER = 'u_other';
const paidOrder = { orderId: 'o1', userId: OWNER, status: 'PAID', paymentMethod: 'points', pointsUsed: 15, pointsEscrowId: 'e1' };
const completedOrder = { ...paidOrder, status: 'COMPLETED' };
const pendingOrder = { orderId: 'o2', userId: OWNER, status: 'PENDING', paymentMethod: 'stripe', amount: 100 };
const refundedOrder = { ...paidOrder, status: 'REFUNDED', refundStatus: 'APPROVED' };

let failed = 0;
let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${name}\n     ${err?.message || err}`);
  }
}

const decide = (role, sessionUserId, order, body) => decideOrderPatch({ role, sessionUserId, order, body });
const expectDenied = (d, httpStatus) => {
  assert.equal(d.ok, false, `expected denial, got ${JSON.stringify(d)}`);
  if (httpStatus) assert.equal(d.httpStatus, httpStatus, `expected ${httpStatus}, got ${d.httpStatus}: ${d.error}`);
};
const expectMode = (d, mode) => {
  assert.equal(d.ok, true, `expected allow (${mode}), got ${JSON.stringify(d)}`);
  assert.equal(d.mode, mode);
};

console.log('\n[1] 一般使用者（擁有者）不能直接退款或改資產相關欄位');
check('student 設 REFUNDED → 403', () => expectDenied(decide('student', OWNER, paidOrder, { status: 'REFUNDED' }), 403));
check('student 設 PAID → 403', () => expectDenied(decide('student', OWNER, pendingOrder, { status: 'PAID' }), 403));
check('student 設 COMPLETED → 403', () => expectDenied(decide('student', OWNER, paidOrder, { status: 'COMPLETED' }), 403));
check('student 附加 payment → 403', () =>
  expectDenied(decide('student', OWNER, paidOrder, { payment: { action: 'refund', amount: 15 } }), 403));
check('student 附加 payments[] → 403', () => expectDenied(decide('student', OWNER, paidOrder, { payments: [] }), 403));
check('student 帶 amount / userId 欄位 → 400', () =>
  expectDenied(decide('student', OWNER, paidOrder, { remainingSeconds: 10, amount: 0, userId: OTHER }), 400));
check('student 帶 refundStatus 欄位 → 400', () =>
  expectDenied(decide('student', OWNER, paidOrder, { refundStatus: 'APPROVED' }), 400));
check('student 扣堂數（deduct）→ 403', () => expectDenied(decide('student', OWNER, paidOrder, { action: 'deduct' }), 403));
check('student 空 body → 400', () => expectDenied(decide('student', OWNER, paidOrder, {}), 400));
check('student 未知 action → 400', () => expectDenied(decide('student', OWNER, paidOrder, { action: 'refund_now' }), 400));

console.log('\n[2] 退款申請');
check('擁有者申請已付款訂單 → request_refund', () => {
  const d = decide('student', OWNER, paidOrder, { action: 'request_refund', reason: '  不想上了  ' });
  expectMode(d, 'request_refund');
  assert.equal(d.reason, '不想上了');
});
check('COMPLETED 訂單可申請', () =>
  expectMode(decide('student', OWNER, completedOrder, { action: 'request_refund', reason: 'x' }), 'request_refund'));
check('原因過長會截斷到 500 字', () => {
  const d = decide('student', OWNER, paidOrder, { action: 'request_refund', reason: 'a'.repeat(900) });
  expectMode(d, 'request_refund');
  assert.equal(d.reason.length, 500);
});
check('沒填原因 → 400', () => expectDenied(decide('student', OWNER, paidOrder, { action: 'request_refund' }), 400));
check('非擁有者申請 → 403', () =>
  expectDenied(decide('student', OTHER, paidOrder, { action: 'request_refund', reason: 'x' }), 403));
check('老師（非擁有者）申請 → 403', () =>
  expectDenied(decide('teacher', OTHER, paidOrder, { action: 'request_refund', reason: 'x' }), 403));
check('未付款訂單申請 → 409', () =>
  expectDenied(decide('student', OWNER, pendingOrder, { action: 'request_refund', reason: 'x' }), 409));
check('已退款訂單申請 → 409', () =>
  expectDenied(decide('student', OWNER, refundedOrder, { action: 'request_refund', reason: 'x' }), 409));
for (const rs of ['REQUESTED', 'PROCESSING', 'MANUAL_REVIEW', 'APPROVED']) {
  check(`已有 ${rs} 申請 → 409`, () =>
    expectDenied(decide('student', OWNER, { ...paidOrder, refundStatus: rs }, { action: 'request_refund', reason: 'x' }), 409));
}
check('REJECTED 後可重新申請', () =>
  expectMode(decide('student', OWNER, { ...paidOrder, refundStatus: 'REJECTED' }, { action: 'request_refund', reason: 'x' }), 'request_refund'));
check('申請夾帶 status → 400', () =>
  expectDenied(decide('student', OWNER, paidOrder, { action: 'request_refund', reason: 'x', status: 'CANCELLED' }), 400));

console.log('\n[3] 取消訂單');
check('擁有者取消未付款訂單 → cancel_unpaid', () =>
  expectMode(decide('student', OWNER, pendingOrder, { status: 'CANCELLED' }), 'cancel_unpaid'));
check('擁有者取消 PENDING_PAYMENT 訂單 → cancel_unpaid', () =>
  expectMode(decide('student', OWNER, { ...pendingOrder, status: 'PENDING_PAYMENT' }, { status: 'CANCELLED' }), 'cancel_unpaid'));
check('擁有者取消已付款訂單 → 403', () => expectDenied(decide('student', OWNER, paidOrder, { status: 'CANCELLED' }), 403));
check('非擁有者取消 → 403', () => expectDenied(decide('student', OTHER, pendingOrder, { status: 'CANCELLED' }), 403));
check('老師（非擁有者）取消 → 403', () => expectDenied(decide('teacher', OTHER, pendingOrder, { status: 'CANCELLED' }), 403));

console.log('\n[4] 課程時間進度（教室倒數）');
check('擁有者同步 remainingSeconds → timer（不需課程老師驗證）', () => {
  const d = decide('student', OWNER, paidOrder, { remainingSeconds: 1200 });
  expectMode(d, 'timer');
  assert.equal(d.requiresCourseTeacher, false);
  assert.equal(d.remainingSeconds, 1200);
  assert.equal(d.deduct, false);
});
check('負數 remainingSeconds 會被夾到 0', () => assert.equal(decide('student', OWNER, paidOrder, { remainingSeconds: -5 }).remainingSeconds, 0));
check('非數字 remainingSeconds → 400', () => expectDenied(decide('student', OWNER, paidOrder, { remainingSeconds: '99' }), 400));
check('非擁有者學生同步 → 403', () => expectDenied(decide('student', OTHER, paidOrder, { remainingSeconds: 10 }), 403));
check('老師（非擁有者）同步 → timer 且需課程老師驗證', () => {
  const d = decide('teacher', OTHER, paidOrder, { remainingSeconds: 10 });
  expectMode(d, 'timer');
  assert.equal(d.requiresCourseTeacher, true);
});
check('老師扣堂數 + 重設秒數 → timer 且需課程老師驗證', () => {
  const d = decide('teacher', OTHER, paidOrder, { action: 'deduct', remainingSeconds: 3600 });
  expectMode(d, 'timer');
  assert.equal(d.deduct, true);
  assert.equal(d.requiresCourseTeacher, true);
});
check('老師設 REFUNDED → 403', () => expectDenied(decide('teacher', OTHER, paidOrder, { status: 'REFUNDED' }), 403));
check('老師附加 payment → 403', () => expectDenied(decide('teacher', OTHER, paidOrder, { payment: {} }), 403));
check('已退款訂單同步秒數 → 409', () => expectDenied(decide('student', OWNER, refundedOrder, { remainingSeconds: 10 }), 409));

console.log('\n[5] admin / system');
check('admin 設 REFUNDED → refund 流程', () => expectMode(decide('admin', 'admin1', paidOrder, { status: 'REFUNDED' }), 'refund'));
check('system（HMAC）設 PAID → privileged', () => expectMode(decide('system', 'system', pendingOrder, { status: 'PAID' }), 'privileged'));
check('admin 附加 payment + 狀態 → privileged', () =>
  expectMode(decide('admin', 'admin1', paidOrder, { status: 'CANCELLED', payment: { note: 'x' } }), 'privileged'));
check('admin 改已退款訂單狀態 → 409', () => expectDenied(decide('admin', 'admin1', refundedOrder, { status: 'PAID' }), 409));
check('admin 送 request_refund → 400', () =>
  expectDenied(decide('admin', 'admin1', paidOrder, { action: 'request_refund', reason: 'x' }), 400));
check('admin 空 body → 400', () => expectDenied(decide('admin', 'admin1', paidOrder, {}), 400));

console.log('\n[6] 資產反轉計畫');
check('點數報名 + escrow → escrow_refund', () =>
  assert.deepEqual(planAssetReversal(paidOrder), { kind: 'escrow_refund', escrowId: 'e1', points: 15 }));
check('點數報名、無 escrowId（舊資料）→ points_credit_legacy', () =>
  assert.deepEqual(planAssetReversal({ ...paidOrder, pointsEscrowId: null }), { kind: 'points_credit_legacy', points: 15 }));
check('金流購買點數套餐 → points_takeback', () =>
  assert.deepEqual(planAssetReversal({ status: 'PAID', paymentMethod: 'linepay', itemType: 'POINTS', points: 100 }), {
    kind: 'points_takeback',
    points: 100,
  }));
check('方案訂單 → manual', () =>
  assert.equal(planAssetReversal({ status: 'PAID', paymentMethod: 'stripe', itemType: 'PLAN', planId: 'pro' }).kind, 'manual'));
check('金流課程訂單 → none', () => assert.equal(planAssetReversal(pendingOrder).kind, 'none'));
check('點數訂單不需金流退款', () => assert.equal(needsManualGatewayRefund(paidOrder), false));
check('stripe 訂單需人工金流退款', () => assert.equal(needsManualGatewayRefund(pendingOrder), true));

console.log('\n[7] 金流退款紀錄');
const now = '2026-09-17T00:00:00.000Z';
check('沒有退款編號 → PENDING_MANUAL', () => {
  const gw = buildGatewayRefund(pendingOrder, '   ', 'admin1', now);
  assert.equal(gw.mode, 'manual');
  assert.equal(gw.status, 'PENDING_MANUAL');
  assert.equal(gw.reference, null);
});
check('有退款編號 → DONE', () => {
  const gw = buildGatewayRefund(pendingOrder, ' re_123 ', 'admin1', now);
  assert.equal(gw.status, 'DONE');
  assert.equal(gw.reference, 're_123');
});
check('LINE Pay transactionId 會被帶出', () =>
  assert.equal(findGatewayTransactionId({ payments: [{ status: 'PAID' }, { transactionId: 2026091700001 }] }), '2026091700001'));

console.log('\n[8] POST /api/admin/refunds 輸入驗證');
check('缺 orderId → error', () => assert.equal(parseAdminRefundAction({ action: 'approve' }).ok, false));
check('未知 action → error', () => assert.equal(parseAdminRefundAction({ orderId: 'o1', action: 'refund' }).ok, false));
check('approve 解析 assetsHandledManually 必須是 true', () => {
  const a = parseAdminRefundAction({ orderId: 'o1', action: 'approve', assetsHandledManually: 'true' });
  assert.equal(a.ok, true);
  assert.equal(a.assetsHandledManually, false);
});
check('gateway_ref 缺編號 → error', () => assert.equal(parseAdminRefundAction({ orderId: 'o1', action: 'gateway_ref' }).ok, false));
check('reject 正常解析', () => assert.deepEqual(parseAdminRefundAction({ orderId: ' o1 ', action: 'reject', note: 'n' }), {
  ok: true,
  action: 'reject',
  orderId: 'o1',
  note: 'n',
}));

console.log('\n[9] B2B 席次訂單（paymentMethod=b2b_seat）');
const seatOrder = { orderId: 'o9', userId: OWNER, status: 'PAID', paymentMethod: 'b2b_seat', amount: 0, pointsUsed: 0, enrollmentId: 'en9' };
check('擁有者申請退款 → 409', () =>
  expectDenied(decide('student', OWNER, seatOrder, { action: 'request_refund', reason: 'x' }), 409));
check('擁有者自行取消 → 403（只有管理員能取消）', () => expectDenied(decide('student', OWNER, seatOrder, { status: 'CANCELLED' }), 403));
check('admin 設 REFUNDED → 409', () => expectDenied(decide('admin', 'admin1', seatOrder, { status: 'REFUNDED' }), 409));
check('admin 設 CANCELLED → privileged（只取消報名）', () =>
  expectMode(decide('admin', 'admin1', seatOrder, { status: 'CANCELLED' }), 'privileged'));
check('資產反轉計畫 → none', () => assert.equal(planAssetReversal(seatOrder).kind, 'none'));
check('不需金流退款', () => assert.equal(needsManualGatewayRefund(seatOrder), false));
check('擁有者同步 remainingSeconds 仍可用', () => expectMode(decide('student', OWNER, seatOrder, { remainingSeconds: 60 }), 'timer'));

console.log(`\n結果：${passed} 通過，${failed} 失敗`);
process.exit(failed > 0 ? 1 : 0);
