# Navbar Verification Skill

負責驗證建立帳戶後的導覽列（Navbar）狀態與自動登入流程。

## 核心職責
- 驗證註冊後是否能正確自動登入。
- 驗證導覽列在登入前後的顯示差異（登入按鈕 vs 使用者頭像/Email）。
- 驗證導覽列下拉選單的功能與權限過濾。
- 驗證新戶導覽（Product Tour）是否在首次登入時觸發。

## 檢查清單

### 1. 註冊後自動登入驗證
- [ ] 前往 `/login/register`。
- [ ] 填寫完整資料並提交。
- [ ] 驗證是否自動導向首頁 `/`。
- [ ] 檢查導覽列是否顯示使用者 Email 或姓名。
- [ ] 檢查 `localStorage` 中是否有 `tutor_mock_user` 且 `jv_just_registered` 為 `true`。

### 2. 導覽列 UI 驗證
- [ ] 驗證「登入」按鈕已消失。
- [ ] 驗證「頭像按鈕」（Avatar Button）已顯示，且包含正確的首字母縮寫。
- [ ] 點擊頭像按鈕，驗證下拉選單是否顯示。
- [ ] 驗證選單中包含：設定、我的課程、我的方案、登出等選項。
- [ ] 點擊「登出」，驗證導覽列回歸 Guest 狀態（顯示「登入」按鈕）。

### 3. 新戶導覽與個人化
- [ ] 驗證首頁是否自動開啟 `Product Tour` 彈窗。
- [ ] 驗證 `Product Tour` 完成後，`jv_just_registered` 已從 `localStorage` 移除。

## 自動化測試
執行以下指令來驗證完整的 Navbar 變更流程：
```bash
npx playwright test e2e/navbar_verification.spec.ts
```

## 疑難排解
- ** Navbar 未更新**：檢查是否確實 Dispatch 了 `tutor:auth-changed` 事件。
- ** 未自動登入**：檢查 `app/login/register/page.tsx` 中的 `setStoredUser` 調用是否正確。
- ** Captcha 錯誤**：在自動化環境中，確保使用了 `NEXT_PUBLIC_LOGIN_BYPASS_SECRET` 中定義的 Bypass Code。
