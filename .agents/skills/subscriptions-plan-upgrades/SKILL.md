---
name: subscriptions-plan-upgrades
description: '訂閱方案設定（/api/admin/subscriptions）、公開定價（/api/shared/pricing）與方案升級單（/api/plan-upgrades）的建立、查詢、付款回調與座位計算。Use when: changing plans or pricing, the plan upgrade flow, seat accounting, or the payment success handler for upgrades.'
argument-hint: '描述要處理的方案或升級流程，例如：升級單卡在 PENDING'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-09-11'
  architecture-aligned: true
  related-skills: [payment-pricing-configuration, payment-infrastructure, payment-refund-orchestration, b2b-core-modules, server-auth-guards]
---

# 訂閱與方案升級 (Subscriptions & Plan Upgrades)

## 流程

1. 訪客在定價頁讀 `GET /api/shared/pricing`（公開）。
2. 登入者 `POST /api/plan-upgrades` 建立升級單（`userId` 一律取自 session；替別人建單 403）。
3. 付款完成後由付款權威（金流回調，HMAC 簽章 → `system` 身分）`PATCH /api/plan-upgrades/[id]` 設為 `PAID`；使用者自己不能設 `PAID`（403）。
4. [lib/paymentSuccessHandler.ts](../../../lib/paymentSuccessHandler.ts) 以冪等方式套用方案；B2B 的座位由 [lib/seatAccounting.ts](../../../lib/seatAccounting.ts) 計算。

`GET /api/plan-upgrades` 對非 admin 只回自己的單，即使 query 帶了別人的 `userId`。

## 端點與權限

| 端點 | 身分 |
|---|---|
| `GET /api/shared/pricing` | 公開 |
| `GET/POST/DELETE /api/admin/subscriptions` | admin |
| `POST /api/plan-upgrades`、`GET /api/plan-upgrades` | 登入者（只限本人） |
| `GET/PATCH/POST /api/plan-upgrades/[id]` | 本人／admin；`PATCH status=PAID` 限 admin 或 HMAC |

## 相關檔案

- [lib/subscriptionsService.ts](../../../lib/subscriptionsService.ts)、[lib/plans.ts](../../../lib/plans.ts)、[lib/seatAccounting.ts](../../../lib/seatAccounting.ts)、[lib/paymentSuccessHandler.ts](../../../lib/paymentSuccessHandler.ts)
- [app/api/plan-upgrades/](../../../app/api/plan-upgrades/)、[app/api/admin/subscriptions/](../../../app/api/admin/subscriptions/)、[app/api/shared/pricing/](../../../app/api/shared/pricing/)
- 測試：[e2e/subscriptions_plan_upgrades_verification.spec.ts](../../../e2e/subscriptions_plan_upgrades_verification.spec.ts)

## 測試指令

```bash
npx playwright test e2e/subscriptions_plan_upgrades_verification.spec.ts --project=chromium
```

spec 只操作不存在的升級單，或在寫入前被擋下；HMAC 正向測試對不存在的單回 404，證明簽章被接受但沒有資料被改。

## 環境驗證 (Environment Validation)

- `API_HMAC_SECRET`：金流回調的簽章；未設定時 HMAC 測試 skip。
- 金流變數見 [payment-infrastructure](../payment-infrastructure/SKILL.md)。

## 故障排除

- **升級單卡在 PENDING**：回調沒送到或簽章錯誤（401）；檢查金流 webhook 日誌與 `API_HMAC_SECRET` 是否一致。
- **重複套用方案**：確認 `paymentSuccessHandler` 的冪等鍵沒有被改掉。

## 相關技能

- [payment-pricing-configuration](../payment-pricing-configuration/SKILL.md)、[payment-infrastructure](../payment-infrastructure/SKILL.md)、[b2b-core-modules](../b2b-core-modules/SKILL.md)
