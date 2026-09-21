---
name: payment-refund-gateway
description: '技術面：金流商（Stripe, PayPal, LINE Pay, ECPay）實體金額退回。目前一律由管理員至金流商後台手動退款，系統只記錄退款編號，不呼叫任何金流退款 API。'
argument-hint: '查詢金流退款的手動處理流程與 order.gatewayRefund 紀錄格式'
metadata:
  verified-status: '⚠️ PARTIAL'
  last-verified-date: '2026-09-17'
  architecture-aligned: true
  notes: '沒有任何金流退款 API 整合（先前文件列出的 app/api/orders/[orderId]/refund/route.ts 從未存在）。金流退款為人工作業，平台端只記錄 order.gatewayRefund。'
---

# 金流退款技術工具技能 (Payment Refund Gateway Skill)

> [!WARNING]
> **系統不會自動把錢退回金流。** 管理員在 `/admin/refunds` 核准退款後，必須到各金流商後台手動退款，再把退款編號回填到系統。
> 業務層的完整退款流程（申請 → 審核 → 資產反轉）見 [payment-refund-orchestration](../payment-refund-orchestration/SKILL.md)。

## 目前的實作：手動金流退款

核准退款時（`app/api/admin/refunds/refundService.ts` 的 `approveRefund`），只要訂單 `paymentMethod !== 'points'`，就會在訂單寫入：

```ts
order.gatewayRefund = {
  mode: 'manual',
  status: 'PENDING_MANUAL' | 'DONE', // 有回填退款編號才是 DONE
  reference: string | null,          // 金流後台的退款編號
  paymentMethod: string | null,
  gatewayTransactionId: string | null, // 從 payments[] 找到的交易編號（目前只有 LINE Pay 會存 transactionId）
  updatedAt: string,
  updatedBy: string,                 // 管理員 userId
}
```

回填或更正退款編號：`POST /api/admin/refunds { orderId, action: 'gateway_ref', manualGatewayRefundRef }`（只接受已 REFUNDED 的非點數訂單，會寫 audit log `order.refund.gateway_reference`）。

## 各金流商手動退款指引

| 金流 | 訂單上可用的識別資訊 | 後台操作 |
| --- | --- | --- |
| Stripe | 訂單未儲存 PaymentIntent / Charge id，需以 orderId（metadata）或金額時間在 Dashboard 搜尋 | Payments → 選取付款 → Refund |
| PayPal | 訂單未儲存 capture id，需以 orderId / 金額時間在後台搜尋 | Activity → 交易明細 → Refund |
| LINE Pay | `payments[].transactionId`（`gatewayRefund.gatewayTransactionId` 會帶出） | 商家後台 → 交易查詢 → 退款 |
| ECPay | 以訂單編號在綠界後台查詢 | 信用卡收單 → 交易查詢 → 退刷 |

## 未來若要自動化（尚未實作）

1. Stripe/PayPal 付款成功時需要先把 PaymentIntent id / capture id 存到訂單，否則無法呼叫退款 API。
2. 參考 API：Stripe `stripe.refunds.create({ payment_intent })`、PayPal `POST /v2/payments/captures/{id}/refund`、LINE Pay `POST /v3/payments/{transactionId}/refund`。
3. 自動化後應把 `gatewayRefund.mode` 改為 `'api'`，並保持 `approveRefund` 的冪等條件（`refundStatus = PROCESSING`）。

## 相關檔案
- `app/api/admin/refunds/refundService.ts`：`approveRefund` / `setGatewayRefundReference`。
- `app/api/admin/refunds/refundPolicy.ts`：`buildGatewayRefund`、`findGatewayTransactionId`、`needsManualGatewayRefund`（純函式）。
- `app/admin/refunds/page.tsx`：管理員審核與回填退款編號介面。
- `lib/envConfig.ts`：金流 sandbox/live 環境切換（付款用，退款不經過）。
