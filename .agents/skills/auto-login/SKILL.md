---
name: auto-login
description: '自動登入驗證技能。讀取 .env.local 中的測試帳號資訊，並在 local/e2e 環境使用 Bypass Secret 繞過驗證碼。支援 Teacher 與 Student 角色。'
argument-hint: '執行自動登入，並指定角色 (teacher/student)'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-03-15'
  architecture-aligned: true
---

# 自動登入技能 (Auto-Login Skill - Secure Version)

此技能允許開發者或 AI 助手在 **local/e2e 測試環境** 使用測試憑據與 Bypass Secret 進行自動登入，並查詢資料庫取得真實的 User Profile。

## 安全性功能

- **Bypass Secret 認證**：不僅需要正確的測試帳號密碼，還必須在驗證碼欄位輸入正確的 `LOGIN_BYPASS_SECRET` 才能繞過 CAPTCHA。這防止了僅知道帳密的人輕易破解驗證碼。
- **自動憑據讀取**：從 `.env.local` 讀取 `TEST_TEACHER_EMAIL` 等變數。
- **真實資料載入**：根據輸入的 Email 去資料庫 (DynamoDB 或 Profiles.json) 抓取真實帳戶資訊。
- **大數據整合驗證**：支援在登入後驗證個人化課程推薦與訪客標籤（Guest Seeds）合併至正式帳號的正確性。

## 配置項 (.env.local)

請確保 `.env.local` 中包含以下設定：

```bash
# 安全繞過金鑰 (必須填寫此金鑰至驗證碼欄位才能繞過)
LOGIN_BYPASS_SECRET=<YOUR_BYPASS_SECRET>
# NEXT_PUBLIC_LOGIN_BYPASS_SECRET=<YOUR_BYPASS_SECRET>  # 僅舊版流程相容，預設不建議啟用

# Teacher 測試帳號
TEST_TEACHER_EMAIL=teacher@test.com
TEST_TEACHER_PASSWORD=<YOUR_PASSWORD>

# Student 測試帳號
TEST_STUDENT_EMAIL=student@test.com
TEST_STUDENT_PASSWORD=<YOUR_PASSWORD>

# Email 白名單 (用於帳號建立測試)
EMAIL_WHITELIST=qa-owner@example.com, @example.com, student@test.com

# SMTP 設定 (用於驗證信寄送)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<YOUR_SMTP_USER_EMAIL>
SMTP_PASS=<YOUR_SMTP_PASS>
```

## 使用方式

### 對於 AI 助手 (Antigravity)
當被要求登入系統進行測試時，AI 助手應：
1. **憑據讀取**：讀取 `.env.local` 中的憑據內容與 `LOGIN_BYPASS_SECRET`。
2. **導航與填寫**：前往 `/login` 填入 Email 與 Password。
3. **圖片載入驗證 (重要)**：必須**先等待驗證碼圖片 (`img[alt="captcha"]`) 呈現**。這確保了後端 `captchaToken` 已載入，且登入按鈕已解除 `disabled` 狀態。
4. **填寫驗證碼與點擊**：在驗證碼圖片出現且登入按鈕變為啟用 (Enabled) 狀態後，在驗證碼欄位填入 `LOGIN_BYPASS_SECRET`，並點擊提交按鈕。
5. **驗證狀態**：截圖或檢查 DOM 以確認已登入成功（應看到使用者姓名或首頁內容）。
6. **登出清理 (重要)**：驗證完畢後，**必須點擊「登出」按鈕**以登出系統，確保不留下活躍會話。
7. **結束任務**：關閉瀏覽器分頁或視窗以結束技能執行。

### 對於帳號建立註冊 (Registration via `/login/register`)
當進行帳號註冊測試時：
1. **進入註冊頁面**: 導航至 `/login/register`
2. **填寫表單欄位**:
   - Role: 選擇 Student 或 Teacher
   - First Name / Last Name: 任意英文名字
   - Email: 使用 EMAIL_WHITELIST 中的地址（如 `qa-owner@example.com`）
   - Password / Confirm Password: 任意複雜密碼
   - Birthdate: 任意有效日期（格式: YYYY-MM-DD）
   - Gender: 選擇 Male/Female
   - Country: 選擇台灣或其他
   - Terms Checkbox: 勾選同意
3. **驗證碼填寫**:
   - **重要**: 點擊「重新取得」按鈕加載驗證碼圖片
   - 在驗證碼輸入框填入 `<YOUR_BYPASS_SECRET>` (與 LOGIN_BYPASS_SECRET 相同)
   - **不需要**識別實際驗證碼圖片文字
4. **提交表單**: 點擊「建立帳戶」按鈕
5. **驗證結果**:
   - 帳號應成功建立（若 Email 已存在會顯示 "Email already registered"）
   - 驗證信應寄送至註冊 Email（需檢查 SMTP 或 Resend 日誌）
   - 登入時應能使用新帳號與密碼

### 對於開發者
在開發環境下登入時，請在「驗證碼」欄位輸入您的 `LOGIN_BYPASS_SECRET`（而非圖片上的文字），即可成功進入。

## 環境驗證 (Environment Validation)

### 1. 必要環境變數 (Required Environment Variables)
- [ ] `.env.local` 必須包含 `LOGIN_BYPASS_SECRET` (安全繞過金鑰)
- [ ] 若舊版流程仍在使用，`.env.local` 可選擇包含 `NEXT_PUBLIC_LOGIN_BYPASS_SECRET` (僅相容用途)
- [ ] `.env.local` 必須包含 `TEST_TEACHER_EMAIL` / `TEST_TEACHER_PASSWORD`
- [ ] `.env.local` 必須包含 `TEST_STUDENT_EMAIL` / `TEST_STUDENT_PASSWORD`
- [ ] `.env.local` 應包含 `EMAIL_WHITELIST` (用於註冊測試)
- [ ] `.env.local` 應包含 `SMTP_*` 設定 (用於驗證信測試)

### 2. 必要驗證檔案 (Required Validation Files)
- [ ] `e2e/classroom_flow.spec.ts` (基礎登入與教室流程驗證)
- [ ] `e2e/register_and_email_test.spec.ts` (帳號建立與 Email 驗證) ✅ 2026-04-22 新增

### 3. 執行驗證指令 (Validation Command)
- `npx playwright test e2e/classroom_flow.spec.ts --project=chromium`
- `npx playwright test e2e/register_and_email_test.spec.ts --project=chromium` (帳號建立 + Email 驗證)

## 程式碼實作細節

- **後端邏輯**：在 `app/api/login/route.ts` 和 `app/api/register/route.ts` 中，驗證碼值會透過 `lib/captcha.ts` 的 `verifyCaptcha()` 函數進行驗證。
- **Bypass 機制**：應僅接受 `process.env.LOGIN_BYPASS_SECRET`。
- **安全要求**：若程式碼存在硬編碼 fallback（固定字串或公開變數 fallback），必須視為安全缺陷並立即移除。
- **適用場景**: 開發、測試、自動化 E2E 測試可使用 bypass secret；正式環境禁止使用。

### 驗證碼實作路徑
- **生成**: `lib/captcha.ts` -> `generateCaptcha()`
- **驗證**: `lib/captcha.ts` -> `verifyCaptcha(token, value)`
- **API**: `app/api/captcha/route.ts`

## 環境切換 (Environment Switching)

此 skill 預設支援 **開發環境 (localhost:3000)** 與 **測試環境**。正式環境驗證應以人工 CAPTCHA 流程執行，不應使用 bypass。

```bash
# 開發環境（預設）
npx playwright test e2e/classroom_flow.spec.ts --project=chromium

# 測試環境（需由維運提供測試域名）
BASE_URL=https://staging.example.com npx playwright test e2e/classroom_flow.spec.ts --project=chromium
```

> ⚠️ **安全警示**：若在正式環境仍可用 `LOGIN_BYPASS_SECRET` 繞過 CAPTCHA，請視為 P0 安全事件並立即停用 bypass。

## 注意事項

- 此環境變數與繞過功能僅限於開發與測試環境。
- 請勿將 `LOGIN_BYPASS_SECRET` 設為過於簡單的值。
- 在帳號建立時，驗證碼 bypass 與登入流程中的 bypass 使用相同的 secret (`<YOUR_BYPASS_SECRET>`)。
- 請勿在日誌、終端輸出或錯誤訊息中回顯任何 Secret 實際值。
- 若 bypass secret 無效，系統會要求正確的驗證碼圖片文字，此時應檢查:
  - `.env.local` 中的環境變數是否正確配置
  - `lib/captcha.ts` 中的 `verifyCaptcha()` 邏輯是否被正確調用
  - 後端路由是否正確驗證該值

## 驗證清單 (Verification Checklist)

使用本技能前，請確認：
- [ ] 開發伺服器已啟動 (`npm run dev`)
- [ ] 網頁可訪問 (http://localhost:3000)
- [ ] `.env.local` 已配置所有必要變數
- [ ] Playwright 已安裝 (`npm install -D @playwright/test`)
- [ ] 驗證碼圖片在頁面加載後正確顯示

## 最近驗證記錄

| 日期 | 驗證項目 | 狀態 | 備註 |
| :--- | :--- | :--- | :--- |
| 2026-04-22 | 帳號建立 + Email 驗證信測試 | ✅ PASSED | 新增 `e2e/register_and_email_test.spec.ts` + 驗證信發送邏輯修正 |
| 2026-04-22 | Email 驗證信發送修正 | ✅ FIXED | 改用直接 nodemailer，支援 Resend/Gmail 雙引擎 |
| 2026-03-15 | 登入流程與驗證碼 Bypass | ✅ PASSED | 基礎測試已驗證 |

## 常見問題 (FAQ)

### Q: 帳號建立後沒有收到驗證信怎麼辦？

**A:** 請檢查以下項目：

1. **檢查 Email 配置**:
   ```bash
   # 僅檢查「是否已配置」，不要輸出 secret 值
   if ($env:RESEND_API_KEY) { "Resend: configured" } else { "Resend: missing" }
   if ($env:SMTP_USER -and $env:SMTP_PASS) { "Gmail SMTP: configured" } else { "Gmail SMTP: missing" }
   ```

2. **檢查 Email 白名單**:
   ```bash
   # 確認註冊的 Email 在白名單中
   echo $EMAIL_WHITELIST  # 應該包含 qa-owner@example.com 或對應測試網域
   ```

3. **查看伺服器日誌**:
   ```
   ✅ [VerificationService] Sent via Resend: ...
   ✅ [VerificationService] Sent via Gmail SMTP: ...
   ❌ [VerificationService] All email methods failed: ...
   ```

4. **測試發送功能**:
   - 執行自動化測試: `npx playwright test e2e/register_and_email_test.spec.ts`
   - 檢查測試輸出中的 Email 發送日誌

### Q: Resend 和 Gmail SMTP 優先級如何決定？

**A:** 系統採用自動故障轉移策略：
1. **首先嘗試 Gmail SMTP** (如果配置了)
2. **失敗時改用 Resend** (如果配置了)
3. **兩者都失敗時** 返回錯誤並記錄日誌

優先順序：
- DynamoDB `/apps` 中的 ACTIVE 配置 > 環境變數（不應存在硬編碼預設值）

### Q: 在 Amplify Hosting 中如何設定 Email 服務？

**A:** 有兩種方式：

**方式 1: 使用環境變數** (簡單)
```bash
# Amplify Console > Hosting > Environment variables
SMTP_USER=<YOUR_SMTP_USER_EMAIL>
SMTP_PASS=<YOUR_SMTP_PASS>  # 16 位元應用程式密碼
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

# 或 Resend
RESEND_API_KEY=<YOUR_RESEND_API_KEY>
RESEND_FROM=noreply@yourdomain.com
```

**方式 2: 使用動態配置** (推薦)
- 進入平台 `/apps` 頁面
- 新增 GMAIL 或 RESEND 整合
- 設定為 ACTIVE 狀態
- 系統會自動讀取並使用
