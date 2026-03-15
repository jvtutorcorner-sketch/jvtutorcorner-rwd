---
name: payment
description: '支付系統相關修改指南，包括多個支付閘道整合（PayPal、Stripe、LINE Pay）、交易處理、Webhook 安全驗證，以及結帳流程優化。'
argument-hint: '記錄與標準化支付系統相關的變更'
metadata:
  verified-status: '❌ UNVERIFIED'
  last-verified-date: '-'
  architecture-aligned: false
  architecture-aligned: false
  last-verified-date: '-'
  verified-status: ❌ UNVERIFIED
  verified-status: ❌ UNVERIFIED
  last-verified-date: '-'
  architecture-aligned: false
---

# Payment Skill — 支付系統相關修改指南

此 skill 用來記錄與標準化支付系統相關的變更，包括多個支付閘道整合（PayPal、Stripe、LINE Pay）、交易處理、Webhook 安全驗證，以及結帳流程優化。

## 支援的支付方式

### 1. PayPal
- **Webhook 路由**：`app/api/paypal/webhook/route.ts`
- **Capture 路由**：`app/api/paypal/capture-order/route.ts`
- **校驗機制**：Webhook 簽名驗證、交易狀態追蹤
- **錯誤處理**：交易失敗重試機制、退款流程

### 2. Stripe
- **Webhook 路由**：`app/api/stripe/webhook/route.ts`
- **支援事件**：
  - `payment_intent.succeeded` - 支付成功
  - `payment_intent.payment_failed` - 支付失敗
  - `charge.refunded` - 退款完成
- **安全驗證**：Webhook 簽名 (whsec) 驗證

### 3. LINE Pay
- **Checkout 路由**：`app/api/linepay/checkout/route.ts`
- **Confirm 路由**：`app/api/linepay/confirm/route.ts`
- **功能**：LINE 支付發起與確認流程
- **集成**：LINE 支付服務庫 (`lib/linepay.ts`)

## 結帳流程

**文件**：`app/pricing/checkout/page.tsx`

支援功能：
- 多付款方式選擇（PayPal、Stripe、LINE Pay）
- 實時訂單預覽與金額計算
- 交易流程管理（pending → processing → completed/failed）
- 錯誤處理與用戶提示

## 開發檢查清單

- [ ] 新增支付方式時，確保 webhook endpoint 已註冊
- [ ] Webhook 簽名驗證應該優先執行（防止假冒請求）
- [ ] 交易狀態變更應該原子操作（避免 double charge）
- [ ] 退款流程應該記錄完整日誌
- [ ] 測試各支付閘道的沙箱環境
- [ ] 定價資料初始化（`scripts/init-pricing-data.mjs`）
- [ ] 定價資料合併（`scripts/merge-pricing-data.mjs`）
- [ ] 環境變數確認：`PAYPAL_CLIENT_ID`、`STRIPE_SECRET_KEY`、`LINEPAY_API_KEY` 等

## Commit 模板

使用 Conventional Commits 類型：
- `feat(payment):` 新增支付功能
- `fix(payment):` 修正支付流程或 webhook 錯誤
- `chore(payment):` 支付相關配置/依賴更新
- `refactor(payment):` 支付代碼重構

**Commit 範例**：
```
feat(payment): add LINE Pay integration with checkout and confirm flows

- 新增 LINE Pay API 整合（checkout/confirm routes）
- 實作 LINE Pay 服務庫 (lib/linepay.ts)
- 更新結帳頁面支援 LINE Pay 選項
- 補充定價資料初始化和合併腳本

相關環境變數：LINEPAY_API_KEY, LINEPAY_MERCHANT_ID
```

## PR 描述建議

- **Summary**：一句話說明新增/修正的支付功能
- **Testing**：沙箱環境測試結果（金額、退款、webhook 驗證等）
- **Security**：確認 webhook 簽名驗證已實現
- **Breaking Changes**：是否影響現有交易流程

## 相關文件結構

```
app/api/
├── paypal/
│   ├── webhook/route.ts
│   └── capture-order/route.ts
├── stripe/
│   ├── webhook/route.ts
│   └── ... (其他 Stripe 路由)
└── linepay/
    ├── checkout/route.ts
    └── confirm/route.ts

app/pricing/
└── checkout/page.tsx

lib/
├── linepay.ts            # LINE Pay 服務庫
└── types/                # 支付相關類型定義

scripts/
├── init-pricing-data.mjs    # 定價資料初始化
└── merge-pricing-data.mjs   # 定價資料合併
```
