---
name: payment-simulation-linepay
description: '模擬 LINE Pay 支付流程，驗證從結帳頁面導向 LINE Pay 模擬環境並成功返回的完整邏輯。'
argument-hint: '執行 LINE Pay 模擬支付測試'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-04-17'
  architecture-aligned: true
---

# LINE Pay 整合模擬技能 (LINE Pay Integration Simulation Skill)

此技能用於驗證 LINE Pay 的支付流程。透過啟用平台的「模擬模式 (Mock Mode)」，可以繞過真實的 LINE Pay 伺服器與 QR Code 掃描流程，模擬支付成功的重定向邏輯。

## 功能特點

1. **模擬模式支援**：搭配 `NEXT_PUBLIC_PAYMENT_MOCK_MODE=true`，自動重定向至模擬的 Confirm API。
2. **自動化驗證**：檢查從 `/pricing/checkout` 到 `/api/linepay/confirm` 再回到成功頁面的流程。
3. **資產檢查**：驗證支付完成後點數或方案是否正確入帳。

## 環境準備

在 `.env.local` 中建議設定（⭐ 2026-04-30 更新）：
```bash
# 🔐 環境開關 (所有金流依據此決定 sandbox/live)
APP_ENV=local  # local = LINE Pay sandbox, production = LINE Pay live

# LINE Pay 配置 (由 lib/envConfig.ts 控制)
LINEPAY_CHANNEL_ID=<YOUR_LINEPAY_CHANNEL_ID>
LINEPAY_CHANNEL_SECRET_KEY=<YOUR_LINEPAY_CHANNEL_SECRET_KEY>
# URL 自動依據 APP_ENV 選擇：
# APP_ENV=local  → LINEPAY_SITE_URL_SANDBOX (https://sandbox-api-pay.line.me)
# APP_ENV=production → LINEPAY_SITE_URL_PROD (https://api-pay.line.me)

# 啟用支付模擬模式
NEXT_PUBLIC_PAYMENT_MOCK_MODE=true
```

## 測試流程

### 1. 使用現有測試腳本
執行以下指令來驗證 LINE Pay 模擬流程：
```bash
npx playwright test e2e/line_pay_simulated.spec.ts
```

### 2. 手動模擬步驟
1. 登入 Student 帳號。
2. 進入 `/pricing` 頁面。
3. 點擊「購買點數」或選擇方案。
4. 在結帳頁面選擇 **LINE Pay**。
5. 點擊 「LINE Pay」按鈕。
6. 若模擬模式開啟，頁面會自動跳轉至 `/api/linepay/confirm?transactionId=MOCK_TX_...` 並隨即跳回 `/settings/billing?success=true`。

## 相關檔案
- `app/api/linepay/checkout/route.ts`: 處理結帳並在模擬模式下指向模擬 Confirm URL。
- `app/api/linepay/confirm/route.ts`: 處理重定向並驗證 `MOCK_TX_` 前綴。
- `e2e/line_pay_simulated.spec.ts`: 自動化測試腳本。

## 故障排除
- **未跳轉至 Confirm API**：檢查 `NEXT_PUBLIC_PAYMENT_MOCK_MODE` 是否確實為 `true`。
- **返回後未顯示成功**：檢查 `confirm` route 是否正確處理了 `orderId` 並更新了資料庫狀態。
