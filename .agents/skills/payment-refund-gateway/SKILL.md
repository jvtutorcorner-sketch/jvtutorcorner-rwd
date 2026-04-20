---
name: payment-refund-gateway
description: '技術面：專注重於金流商（Stripe, PayPal, LINE Pay）實體金額金流退回 API 集成與呼叫技術細節。'
argument-hint: '調用 Stripe/PayPal/LINE Pay API 執行技術面退款'
metadata:
  verified-status: '🏗️ IN PROGRESS'
  last-verified-date: '2026-04-06'
  architecture-aligned: true
---

# 金流退款技術工具技能 (Payment Refund Gateway Skill)

> [!TIP]
> 此技能為技術性的「開發工具集」 (Utility Skill)，供業務層（如 `purchase-refund-flow`）調用，不單獨處理業務端的資產連動扣除。

此技能負責處理平台上的「實體金錢」退款技術細節。主要存放不同金流商的 API 串接指南與退款實體操作方法。

## 金流串接核心技術

1.  **Stripe 退款實作**：
    - 使用 `stripe.refunds.create({ payment_intent: PI_ID })` 執行原路退款。
    - 注意 Webhook 監聽 `charge.refunded` 等非同步事件。
2.  **PayPal 退款實作**：
    - 呼叫 PayPal REST API `/v2/payments/captures/{id}/refund`。
3.  **LINE Pay 退款實作**：
    - 呼叫 LINE Pay API `/v3/payments/{transactionId}/refund`。
4.  **銀行轉帳/手動記錄**：
    - 手動標記為 `REFUNDED` 並附上相關記錄筆記。

## 使用場景 (Scenarios)
- 開發新的金流端點時參考。
- 處理 Webhook 驗證與非同步處理邏輯時參考。
- **注意**：若需執行包含「扣回學員點數/撤銷訂閱」在內的完整退款業務，應優先參閱 `purchase-refund-flow` 技能。

## 相關檔案
- `lib/stripe.ts`: Stripe 初始化與工具。
- `lib/paypal.ts`: PayPal 整合工具。
- `app/api/orders/[orderId]/refund/route.ts`: 外部金流 API 調用端點。
