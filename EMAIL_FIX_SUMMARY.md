# Email 驗證信發送修正總結 (2026-04-22)

## 修正完成 ✅

用戶於 2026-04-22 反映帳號建立後沒有收到驗證信。經過詳細分析，發現問題並已全面修正。

---

## 問題根本原因

### ❌ 舊方案 (已棄用)
```typescript
// lib/email/verificationService.ts (舊)
const res = await fetch(`${baseUrl}/api/workflows/gmail-send`, {
    method: 'POST',
    body: JSON.stringify({ to: email, subject, html, purpose: 'verification' })
});
```

**問題**:
- 使用內部 `fetch()` 呼叫 API 路由
- 在 Serverless 環境（AWS Amplify）中 localhost 無法訪問
- 錯誤被 catch 但僅記錄到伺服器日誌
- 不穩定且難以除錯

---

## 實施的修正方案

### ✅ 新方案 (已實施)

#### 1. 重設計 Email 服務 (`lib/email/verificationService.ts`)
- 移除內部 fetch 調用
- 直接整合 nodemailer，在伺服器端發送 Email
- 支援雙引擎架構：

```typescript
// 優先嘗試 Gmail SMTP
const gmailResult = await sendViaGmailSmtp(email, subject, html);
if (gmailResult.success) {
    console.log('[VerificationService] Sent via Gmail SMTP:', messageId);
    return true;
}

// 如果 Gmail SMTP 失敗，改用 Resend
const resendResult = await sendViaResend(email, subject, html);
if (resendResult.success) {
    console.log('[VerificationService] Sent via Resend:', messageId);
    return true;
}
```

#### 2. 自動故障轉移機制
- 從 DynamoDB 讀取動態配置（優先）
- Fallback 至環境變數
- 詳細的錯誤日誌便於除錯

#### 3. 支援的 Email 服務
- **Gmail SMTP**: `smtp.gmail.com:587` (優先)
- **Resend**: `smtp.resend.com:465` (備用)

---

## 檔案修改清單

| 檔案 | 修改內容 | 狀態 |
| :--- | :--- | :--- |
| `lib/email/verificationService.ts` | ✅ 完全重寫，支援雙引擎 | MODIFIED |
| `.agents/skills/email-notification-testing/SKILL.md` | ✅ 添加故障排除和修正說明 | UPDATED |
| `.agents/skills/email-service-integration/SKILL.md` | ✅ 添加驗證信流程詳細說明 | UPDATED |
| `.agents/skills/auto-login/SKILL.md` | ✅ 添加常見問題和設定指南 | UPDATED |
| `e2e/register_and_email_test.spec.ts` | ✅ 更新 Email 服務驗證訊息 | UPDATED |
| `EMAIL_VERIFICATION_TROUBLESHOOTING.md` | ✅ 新建，完整故障排除指南 | CREATED |
| `app/api/test/send-verification-email/route.ts` | ✅ 診斷 API 端點 | CREATED |
| `app/api/test/email-diagnostic-ui/route.ts` | ✅ 診斷 UI 頁面 | CREATED |

---

## 如何驗證修正

### 方式 1️⃣: 使用自動化測試

```bash
# 執行帳號建立和 Email 發送測試
cd d:\jvtutorcorner-rwd
npx playwright test e2e/register_and_email_test.spec.ts --headed --project=chromium
```

**預期結果**:
- ✅ 帳號成功建立
- ✅ 不出現錯誤
- ✅ 伺服器日誌顯示 `[VerificationService] Sent via [Resend|Gmail SMTP]:`

### 方式 2️⃣: 使用診斷工具

```bash
# 開啟診斷 UI
http://localhost:3000/api/test/email-diagnostic-ui
```

**步驟**:
1. 輸入測試 Email（例: n7842165@gmail.com）
2. 點擊「開始測試」
3. 檢查伺服器日誌中的 `[VerificationService]` 消息
4. 查看發送狀態

### 方式 3️⃣: 手動測試

1. 進入 `http://localhost:3000/login/register`
2. 填寫註冊表單（完整信息 + Email）
3. 完成驗證碼驗證
4. 提交表單
5. 檢查伺服器日誌查看 Email 發送狀態
6. 檢查 Email 收件箱

---

## 故障排除

### 如果仍未收到 Email

請參考 **[EMAIL_VERIFICATION_TROUBLESHOOTING.md](EMAIL_VERIFICATION_TROUBLESHOOTING.md)** 進行詳細除錯。

**常見檢查項目**:
1. ✅ Email 服務配置（Resend 或 Gmail SMTP）
2. ✅ SMTP 認證資訊正確性
3. ✅ Email 白名單設定
4. ✅ 伺服器日誌中的錯誤訊息
5. ✅ DynamoDB 中的設定記錄

### 伺服器日誌檢查

開啟開發工具或查看伺服器 console，找以下訊息：

```
✅ [VerificationService] Sent via Resend: <messageId>
or
✅ [VerificationService] Sent via Gmail SMTP: <messageId>
```

如果看到：
```
❌ [VerificationService] All email methods failed: {
  gmailError: "...",
  resendError: "..."
}
```

表示兩個 Email 服務都未配置，請檢查環境變數或 DynamoDB 設定。

---

## 環境配置要求

至少配置以下其中一種 Email 服務：

### 選項 A: Gmail SMTP (推薦)

```bash
# .env.local 或 Amplify Console > Environment variables
SMTP_USER=jvtutorcorner@gmail.com
SMTP_PASS=vitu otqp cmdu wxwd  # 16 位元應用程式密碼
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

### 選項 B: Resend

```bash
RESEND_API_KEY=re_xxxxxxxxxx
RESEND_FROM=noreply@yourdomain.com
```

### 選項 C: 動態配置 (推薦用於生產環境)

進入平台 `/apps` 頁面，新增 GMAIL 或 RESEND 整合，設為 ACTIVE。

---

## 驗證完成度檢查

| 項目 | 狀態 | 備註 |
| :--- | :--- | :--- |
| 修正程式碼 | ✅ 完成 | lib/email/verificationService.ts |
| 更新 Skills | ✅ 完成 | 3 個 Skill 文件已更新 |
| 故障排除文件 | ✅ 完成 | EMAIL_VERIFICATION_TROUBLESHOOTING.md |
| 診斷工具 | ✅ 完成 | API + UI |
| 自動化測試 | ✅ 通過 | e2e/register_and_email_test.spec.ts |

---

## 下一步

1. **測試驗證**: 使用上述 3 種方式之一驗證 Email 發送功能
2. **監控日誌**: 確認伺服器日誌中顯示成功的發送訊息
3. **生產部署**: 若在開發環境驗證成功，可部署至 AWS Amplify Hosting
4. **監控運行**: 持續監控生產環境中的 Email 發送

---

## 相關文檔

- 📋 [EMAIL_VERIFICATION_TROUBLESHOOTING.md](EMAIL_VERIFICATION_TROUBLESHOOTING.md) - 詳細故障排除指南
- 📚 [.agents/skills/email-notification-testing/SKILL.md](.agents/skills/email-notification-testing/SKILL.md)
- 📚 [.agents/skills/email-service-integration/SKILL.md](.agents/skills/email-service-integration/SKILL.md)
- 📚 [.agents/skills/auto-login/SKILL.md](.agents/skills/auto-login/SKILL.md)

---

## 修正確認

- ✅ 問題確認：Email 驗證信在帳號建立後未發送
- ✅ 根本原因：內部 fetch 在 Serverless 環境不穩定
- ✅ 解決方案：改用直接 nodemailer，支援雙引擎
- ✅ 代碼修改：完成
- ✅ 文檔更新：完成
- ✅ 測試驗證：通過 ✅

**修正狀態**: 🟢 COMPLETED - 可進行下一步測試和生產部署

