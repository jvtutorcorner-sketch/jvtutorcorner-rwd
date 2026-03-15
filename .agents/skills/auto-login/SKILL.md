---
name: auto-login
description: '自動登入驗證技能。讀取 .env.local 中的測試帳號資訊，並使用特有的 Bypass Secret 繞過驗證碼完成登入。支援 Teacher 與 Student 角色。'
argument-hint: '執行自動登入，並指定角色 (teacher/student)'
metadata:
  verified-status: ✅ VERIFIED
  last-verified-date: '2026-03-15'
  architecture-aligned: true
---

# 自動登入技能 (Auto-Login Skill - Secure Version)

此技能允許開發者或 AI 助手使用預設的測試憑據與 **安全的 Bypass Secret** 自動登入系統，並繞過圖形驗證碼。此實作會**查詢資料庫**以獲取真實的 User Profile。

## 安全性功能

- **Bypass Secret 認證**：不僅需要正確的測試帳號密碼，還必須在驗證碼欄位輸入正確的 `LOGIN_BYPASS_SECRET` 才能繞過 CAPTCHA。這防止了僅知道帳密的人輕易破解驗證碼。
- **自動憑據讀取**：從 `.env.local` 讀取 `TEST_TEACHER_EMAIL` 等變數。
- **真實資料載入**：根據輸入的 Email 去資料庫 (DynamoDB 或 Profiles.json) 抓取真實帳戶資訊。

## 配置項 (.env.local)

請確保 `.env.local` 中包含以下設定：

```bash
# 安全繞過金鑰 (必須填寫此金鑰至驗證碼欄位才能繞過)
LOGIN_BYPASS_SECRET=jv_secure_bypass_2024

# Teacher 測試帳號
TEST_TEACHER_EMAIL=teacher@test.com
TEST_TEACHER_PASSWORD=123456

# Student 測試帳號
TEST_STUDENT_EMAIL=student@test.com
TEST_STUDENT_PASSWORD=123456
```

## 使用方式

### 對於 AI 助手 (Antigravity)
當被要求登入系統進行測試時，AI 助手應：
1. **憑據讀取**：讀取 `.env.local` 中的憑據內容與 `LOGIN_BYPASS_SECRET`。
2. **導航與填寫**：使用 `browser` 工具前往 `/login` 並填入 Email、Password 與 `LOGIN_BYPASS_SECRET` (填入驗證碼欄位)。
3. **執行登入**：點擊提交按鈕。
4. **驗證狀態**：截圖或檢查 DOM 以確認已登入成功（應看到使用者姓名或首頁內容）。
5. **登出清理 (重要)**：驗證完畢後，**必須點擊「登出」按鈕**以登出系統，確保不留下活躍會話。
6. **結束任務**：關閉瀏覽器分頁或視窗以結束技能執行。

### 對於開發者
在開發環境下登入時，請在「驗證碼」欄位輸入您的 `LOGIN_BYPASS_SECRET`（而非圖片上的文字），即可成功進入。

## 程式碼實作細節

- **後端邏輯**：在 `app/api/login/route.ts` 中，比對 `captchaValue` 是否等於 `process.env.LOGIN_BYPASS_SECRET`。

## 注意事項

- 此環境變數與繞過功能僅限於開發與測試環境。
- 請勿將 `LOGIN_BYPASS_SECRET` 設為過於簡單的值。
