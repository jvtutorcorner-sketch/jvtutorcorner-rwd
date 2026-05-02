---
type: skill
name: env-check
description: 檢查本地開發環境變數 (.env.local) 是否正確配置，並確保沒有將機密資訊硬編碼在專案代碼中。
---

# 環境變數檢查與安全性規範 (Env Check & Security Guidelines)

本 Skill 負責檢查與驗證 `.env.local` 是否符合專案運行要求，並嚴格禁止將機密資訊寫入任何代碼、腳本或 Agent Skill。

## 安全性核心規範

1. **禁止硬編碼機密 (No Hardcoded Secrets)**：
   - 所有的密碼、API Key、Webhook Secret、Bypass Token (如密碼、登入繞過憑證) 絕對不可以出現在代碼中，也不可以寫在 Markdown (如 Agent Skill、README) 中。
   - 範例值必須使用佔位符：密碼使用 `<YOUR_PASSWORD>`，Token 類使用 `<YOUR_SECRET>`。

2. **完全依賴環境變數 (Strictly Env-Driven)**：
   - 開發流程或測試腳本呼叫 API/自動登入時，必須從 `.env.local`、`.env` 或執行環境 `process.env` 讀值。
   - 不允許任何 fallback 取用明文敏感字串的邏輯。

3. **Bypass 僅限測試環境 (Bypass Scope Control)**：
   - `LOGIN_BYPASS_SECRET` 僅能用於 local/e2e 測試。
   - 若正式環境可使用 bypass，必須視為重大安全缺陷並立即停用。

4. **禁止回顯機密值 (No Secret Echo)**：
   - 檢查腳本只回報「是否已配置」，不得輸出 Secret 原值。
   - 日誌、截圖、終端記錄不得包含完整金鑰或密碼。

## 預期環境變數清單 (Expected Environment Variables)

以下是主要模組依賴的配置，請使用本 Skill 驗證這些變數是否存在，而非詢問具體數值：

- **自動化測試與登入**：
  - `TEST_TEACHER_EMAIL`, `TEST_TEACHER_PASSWORD`
  - `TEST_STUDENT_EMAIL`, `TEST_STUDENT_PASSWORD`
  - `LOGIN_BYPASS_SECRET`（`NEXT_PUBLIC_LOGIN_BYPASS_SECRET` 僅舊版相容）
- **付款金流模組 (Payment)**：
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`
  - `LINEPAY_CHANNEL_ID`, `LINEPAY_CHANNEL_SECRET`
- **通訊與信件 (Email & Comms)**：
  - `RESEND_API_KEY`
  - `CRON_SECRET`
  - `SMTP_PASS`

## 驗證流程 (Verification Routine)

當被呼叫執行環境變數檢查時，請執行以下步驟：
1. 檢查 `.env.local` 是否存在（若不存在，引導建立最小可用模板）。
2. 驗證必要 Keys 是否存在（僅檢查 `KEY=`，不可輸出值）。
3. 掃描專案代碼與 Skill (`*.md`) 是否出現疑似機密資訊：
   - 真實 Token 前綴（例如 `sk_live_`, `ghp_`, `AKIA`）
   - 常見硬編碼 bypass 字串或固定密碼
4. 若偵測到疑似機密：
   - 立即停止後續自動化步驟
   - 回報檔案位置與風險等級
   - 提供替換方案（改用環境變數 + 佔位符）
5. 重新掃描確認修正已生效，再繼續其他任務。
