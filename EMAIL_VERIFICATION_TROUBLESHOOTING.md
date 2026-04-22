# Email 驗證信發送故障排除指南

## 問題概述

**症狀**: 使用者在 `/login/register` 完成帳號建立後，沒有收到驗證信

**最後更新**: 2026-04-22 (驗證信發送邏輯已修正 ✅)

---

## 原因分析

### 舊方案的問題 (已修正)
- 使用內部 `fetch()` 呼叫 `/api/workflows/gmail-send` API
- 在 Serverless 環境（AWS Amplify）中 localhost 無法訪問
- 錯誤被 catch 但僅記錄於伺服器，前端無感

### 新方案 (2026-04-22 實施)
- 直接在 `lib/email/verificationService.ts` 使用 nodemailer
- 支援多種 Email 引擎（Resend、Gmail SMTP）
- 自動故障轉移機制

---

## 快速檢查清單

- [ ] **Email 服務配置**: 至少配置 Resend 或 Gmail SMTP
- [ ] **環境變數**: `SMTP_USER`、`SMTP_PASS` 或 `RESEND_API_KEY` 已設定
- [ ] **白名單**: EMAIL_WHITELIST 包含測試 Email
- [ ] **伺服器日誌**: 檢查 console 輸出中的 `[VerificationService]` 日誌
- [ ] **資料庫**: DynamoDB 中的 `jvtutorcorner-profiles` 表存在新帳號記錄

---

## 詳細故障排除步驟

### 1️⃣ 確認 Email 服務已配置

#### 檢查環境變數
```bash
# 檢查是否配置了 Gmail SMTP
echo "SMTP_USER: $SMTP_USER"
echo "SMTP_PASS: (已設定)" # 不要輸出密碼
echo "SMTP_HOST: $SMTP_HOST"
echo "SMTP_PORT: $SMTP_PORT"

# 或檢查 Resend
echo "RESEND_API_KEY: (已設定)" # 不要輸出密鑰
echo "RESEND_FROM: $RESEND_FROM"
```

#### 檢查 DynamoDB 配置
在 `/apps` 頁面檢查：
- [ ] GMAIL 整合是否存在且狀態為 ACTIVE
- [ ] RESEND 整合是否存在且狀態為 ACTIVE
- [ ] 驗證資訊（SMTP_USER、API Key 等）是否正確填寫

### 2️⃣ 確認 Email 白名單

```bash
# 檢查環境變數
echo "EMAIL_WHITELIST: $EMAIL_WHITELIST"
```

**應該包含**:
- 測試使用的 Email 地址（如 `n7842165@gmail.com`）
- 或通配符網域（如 `@gmail.com`）
- 或允許所有（`*`）

**範例有效配置**:
```
EMAIL_WHITELIST=n7842165@gmail.com, @jvtutorcorner.com, pro@test.com
```

### 3️⃣ 檢查伺服器日誌

進入開發工具或查看伺服器 console，找到 `[VerificationService]` 的日誌訊息：

**✅ 成功日誌**:
```
[VerificationService] Sent via Resend: <messageId>
```
或
```
[VerificationService] Sent via Gmail SMTP: <messageId>
```

**❌ 失敗日誌**:
```
[VerificationService] All email methods failed: {
  resendError: "Resend not configured",
  gmailError: "Gmail SMTP not configured"
}
```

### 4️⃣ 驗證資料庫記錄

檢查 DynamoDB `jvtutorcorner-profiles` 表：
- [ ] 應存在新建立的用戶記錄
- [ ] 欄位應包含 `emailVerified: false`
- [ ] 應包含 `verificationToken` 和 `verificationExpires`

---

## 常見錯誤與解決方案

### ❌ "Resend not configured"
**原因**: 
- RESEND_API_KEY 未設定
- DynamoDB 中無 ACTIVE 的 Resend 整合

**解決**:
1. 設定環境變數 `RESEND_API_KEY`
2. 或在 `/apps` 頁面新增 Resend 整合並標記為 ACTIVE

### ❌ "Gmail SMTP not configured"
**原因**:
- SMTP_USER 或 SMTP_PASS 未設定
- DynamoDB 中無 ACTIVE 的 Gmail 整合

**解決**:
1. 設定環境變數 `SMTP_USER` 和 `SMTP_PASS`
2. 或在 `/apps` 頁面新增 Gmail 整合並標記為 ACTIVE

### ❌ "All email methods failed"
**原因**: Resend 和 Gmail SMTP 都配置失敗

**解決**:
1. 至少配置一個 Email 服務
2. 檢查認證資訊是否正確
3. 對於 Gmail：確認使用 16 位元應用程式密碼（非登入密碼）

### ❌ "Sending to [email] is blocked by whitelist"
**原因**: Email 不在白名單中且為非驗證信用途

**解決**:
1. 將 Email 地址添加到 `EMAIL_WHITELIST`
2. 或將 `EMAIL_WHITELIST` 設定為 `*`

---

## 手動測試流程

### 使用 Playwright 進行自動化測試

```bash
# 執行完整的帳號建立與 Email 發送測試
npx playwright test e2e/register_and_email_test.spec.ts --headed --project=chromium
```

### 手動測試步驟

1. **進入註冊頁面**
   ```
   http://localhost:3000/login/register
   ```

2. **填寫表單**
   - Role: Student
   - First Name: Test
   - Last Name: User
   - Email: `n7842165@gmail.com` (或你的測試 Email)
   - Password: 複雜密碼
   - Birthdate: 任意日期
   - Gender: 任選
   - Country: 台灣
   - Terms: 勾選
   - CAPTCHA: `jv_secret_bypass_2024`

3. **提交表單**
   - 點擊「建立帳戶」

4. **監控日誌**
   - 開發工具 Console 中應看到 `[VerificationService]` 的發送日誌
   - 檢查是否成功或失敗

5. **驗證結果**
   - 成功: 收到驗證信
   - 失敗: 檢查日誌訊息中的具體原因

---

## Amplify Hosting 設定

### 環境變數配置

在 **Amplify Console > Hosting > Environment variables** 中設定：

#### Gmail SMTP 方案
```
SMTP_USER=jvtutorcorner@gmail.com
SMTP_PASS=vitu otqp cmdu wxwd
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_FROM=JV Tutor Corner
```

#### Resend 方案
```
RESEND_API_KEY=re_xxxxxxxxxx
RESEND_FROM=noreply@yourdomain.com
```

#### Email 白名單
```
EMAIL_WHITELIST=n7842165@gmail.com, @jvtutorcorner.com, pro@test.com
```

### DynamoDB 配置

若使用動態配置（推薦）：
1. 進入平台 `/apps` 頁面
2. 新增 GMAIL 或 RESEND 整合
3. 填寫認證資訊
4. 標記為 ACTIVE 狀態

---

## 監控與日誌

### verificationService.ts 的日誌點

```typescript
// 成功日誌
console.log('[VerificationService] Sent via Resend:', messageId);
console.log('[VerificationService] Sent via Gmail SMTP:', messageId);

// 失敗日誌
console.error('[VerificationService] All email methods failed:', {
  resendError: '...',
  gmailError: '...'
});
```

### register/route.ts 的日誌點

```typescript
console.error('[register] Failed to send verification email', err);
```

---

## 相關檔案

- **驗證信服務**: [`lib/email/verificationService.ts`](lib/email/verificationService.ts)
- **註冊路由**: [`app/api/register/route.ts`](app/api/register/route.ts)
- **Gmail 發送 API**: [`app/api/workflows/gmail-send/route.ts`](app/api/workflows/gmail-send/route.ts)
- **Resend 發送 API**: [`app/api/workflows/resend-send/route.ts`](app/api/workflows/resend-send/route.ts)
- **白名單檢查**: [`lib/email/whitelist.ts`](lib/email/whitelist.ts)
- **自動化測試**: [`e2e/register_and_email_test.spec.ts`](e2e/register_and_email_test.spec.ts)

---

## 修正歷史

| 日期 | 問題 | 解決方案 | 狀態 |
| :--- | :--- | :--- | :--- |
| 2026-04-22 | Email 驗證信未發送 | 改用直接 nodemailer，支援 Resend/Gmail 雙引擎 | ✅ 已修正 |
| 2026-04-22 | 內部 fetch 不穩定 | 移除 fetch，在服務端直接發送 | ✅ 已修正 |

---

## 聯絡支援

若上述步驟都無法解決，請檢查：
1. 所有日誌輸出（包括伺服器端和客戶端）
2. DynamoDB 表是否存在和可訪問
3. AWS IAM 權限是否正確配置
4. Email 服務供應商的配額或限制

