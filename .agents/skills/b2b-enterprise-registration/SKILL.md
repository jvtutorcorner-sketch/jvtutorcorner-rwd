---
name: b2b-enterprise-registration
description: '企業自助註冊流程驗證技能。涵蓋 /login/register_enterprise（單筆註冊 + CSV 批次匯入）、/api/register 的 orgId 分支（網域驗證、席次競態下的原子性 rollback）、/api/organizations/public 公開組織清單。API 層腳本 + headed 瀏覽器 UI 流程雙軌驗證。'
argument-hint: '驗證企業自助註冊：單筆註冊、CSV 批次匯入、網域檢查、席次競態 rollback'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-08-08'
  architecture-aligned: true
  notes: '驗證過程中發現並修復 4 個問題，其中一個（PermissionGuard 誤擋匿名訪客）讓整個企業註冊頁對真實訪客完全不可達。'
---

# 企業自助註冊驗證技能 (B2B Enterprise Registration Skill)

負責驗證企業戶最前端的入口——`/login/register_enterprise`（單筆註冊 + CSV 批次匯入成員）與其背後的 `/api/register` orgId 分支、`/api/organizations/public` 公開組織清單。這是使用者從「聽過這個平台」到「變成企業帳號」的第一步，壞掉了後面的 `b2b-core-modules`（席次/授權/組織單位/存取閘門）再怎麼正確都沒有意義。

跟 `b2b-core-modules`（純 Node 腳本，無頭）不同，本技能延續 `b2b-admin-ui-flow` 的做法，用**兩層**驗證：

1. `scripts/verify-b2b-enterprise-registration.mjs` — 直接打 `POST /api/register`，深度驗證網域檢查、席次上限、併發競態下的原子性 rollback
2. `e2e/b2b_enterprise_registration_ui_flow.spec.ts` — 真實 headed 瀏覽器把「單筆註冊」與「CSV 批次匯入」兩條路徑都走一遍

## 測試模組

### API 層 — `scripts/verify-b2b-enterprise-registration.mjs`
- `GET /api/organizations/public`：有設網域的組織才會出現在公開清單（沒設網域＝不開放自助註冊）；`availableSeats` 計算正確
- `POST /api/register`（orgId 分支）：
  - 合法註冊成功、`isB2B=true`、`plan=null`、正確指派到 `orgUnitId`
  - Email 網域與組織網域不符 → 400，不留下 profile
  - `orgId` 不存在 → 400；組織被停用 → 400；`orgUnitId` 無效 → 400，不留下 profile
  - 重複 email → 409，且不動 `usedSeats`
  - `role: 'teacher'` 註冊會額外建立 Teachers 表記錄
  - **併發競態**：5 個併發註冊搶 3 個剩餘席次 → 恰好 3 個成功、2 個 409，且輸家**沒有任何殘留 profile**（`assignMemberWithLicense` 失敗後 `/api/register` 的 rollback 邏輯真的有刪掉剛建的 profile）

### UI 層 — `e2e/b2b_enterprise_registration_ui_flow.spec.ts`
- 單筆註冊：選組織、填完整表單、驗證碼 bypass、送出 → 導向 `/login`，DB 記錄正確
- CSV 批次匯入：上傳 2 筆合法 CSV → 顯示「成功 2 筆」、兩筆都真的寫進 DB

## 已發現並修復的問題

1. **CSV 批次匯入 100% 不能用** — `handleCsvImport` 對每一列送出的 `POST /api/register` 完全沒帶 `captchaToken`/`captchaValue`，導致每一列必定收到 `captcha_incorrect`。修復：沿用頁面頂部已解過的驗證碼狀態（`verifyCaptcha` 的 token 是無狀態的，同一個 token/value 可以驗證多次，不需要每列重新拿）。
2. **`PermissionGuard` 把匿名訪客誤判成 `student` 角色，導致整個企業註冊頁對真實訪客不可達** — `components/auth/PermissionGuard.tsx` 對未登入使用者預設 `role = user?.role || 'student'`，而 `/login/register_enterprise` 的頁面權限設定裡 Student 是 `pageVisible: false`（合理：不希望已登入學生在導覽選單看到這頁），連帶把**從未登入過的匿名訪客**也一併擋下、`router.replace('/')` 彈回首頁。手動點開這頁完全點不進去。修復方式**不是**改 `PermissionGuard.tsx` 的邏輯（改動範圍太大，可能影響其他頁面既有行為），而是照著 `/login`、`/login/register` 兩個姊妹頁面已經在用的既有慣例，把 `/login/register_enterprise` 的 Student 權限記錄改成 `pageVisible: true`。
3. **`/api/register` 回傳的 `profile` 是指派組織前的舊快照** — `orgMembershipService.assignMemberWithLicense` 自己會再對 Profiles 表下一次 `UpdateCommand`（設定 `orgId`/`orgUnitId`/`licenseId`/`plan`），但 route handler 回傳的還是交易前建立的那個 `profile` 物件，沒有把交易後的欄位合併回來。修復：`Object.assign(profile, assignResult.profile)`。
4. **`lib/profilesService.ts` 的 `findProfileByEmail` 對「查詢成功但查無資料」拋錯，而不是回傳 `null`** — 影響範圍不只企業註冊，還包括 `/api/login`（帳密錯誤時）、`/api/forgot-password`（未知 email）、`/api/admin/create-user`（新使用者的重複檢查一定會查無資料）、`/api/licenses/[id]/assign` 與 `/api/organizations/[id]/members`（用 email 加入不存在的成員）。修復：Query/Scan 成功但 `Count === 0` 時明確 `return null`，不落到最下面的 throw。

## 已知限制

- 不重複驗證 `b2b-core-modules` 已覆蓋的席次/授權/組織單位邊界案例——本技能只驗「進得來」這一段。
- `POST /api/admin/settings`（修復問題 2 用的那支 API）完全沒有認證保護，任何人都能改頁面權限矩陣——這是另一個獨立的安全問題，不在本技能範圍內，值得另外開一個安全性驗證追蹤。

## 執行方式

```bash
# 前置：dev server 要自己起（.env.local 的 APP_ENV=production 會讓 Playwright 不自動幫你起）
npm run dev

# API 層（不需要瀏覽器）
node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2b-enterprise-registration.mjs

# UI 層（headed，會跳出瀏覽器視窗）
npx playwright test e2e/b2b_enterprise_registration_ui_flow.spec.ts --project=chromium-headed
```

`.env.local` 目前指向正式環境 AWS 帳號，兩支都會對正式環境寫入/清理測試資料，正常結束不留殘留。

## 相關檔案

### 驗證
- [scripts/verify-b2b-enterprise-registration.mjs](../../../scripts/verify-b2b-enterprise-registration.mjs)
- [e2e/b2b_enterprise_registration_ui_flow.spec.ts](../../../e2e/b2b_enterprise_registration_ui_flow.spec.ts)

### 受測程式碼
- `app/login/register_enterprise/page.tsx`（單筆 + CSV 批次匯入 UI）
- `app/api/register/route.ts`（orgId 分支：網域驗證、席次前置檢查、`assignMemberWithLicense` + rollback）
- `app/api/organizations/public/route.ts`
- `components/auth/PermissionGuard.tsx`（本次修復頁面權限設定，非改此檔案邏輯）
- `lib/profilesService.ts`（`findProfileByEmail` 修復）

## 相關技能
- `b2b-core-modules` — 席次/授權/組織單位/存取閘門的無頭深度驗證
- `b2b-admin-ui-flow` — 管理後台端（建組織/加成員/建部門）的 headed 瀏覽器流程
- `auto-login` — 驗證碼 bypass 機制的共同基礎

## 故障排除

**Playwright 測試卡在「element was detached from the DOM, retrying」或 timeout** — `/login/register_enterprise` 掛載時有 3 個獨立 fetch（組織清單、角色清單、驗證碼）幾乎同時 resolve，各自觸發一次 re-render；在這些都穩定前互動容易撞到元素被換掉。`page.goto()` 後先 `await page.waitForLoadState('networkidle')` 再開始填表單。

**checkbox / submit 按鈕點了沒反應，或莫名其妙跳回首頁** — 不要對這頁用 `.click({force:true})`：坐標式的強制點擊在版面還在微調時可能點到別的元素（曾經意外點中導覽列的首頁 logo 連結）。改用 `locator.dispatchEvent('click')` 直接對目標 DOM 節點觸發點擊，不依賴螢幕座標。

**CSV 匯入又出現 `captcha_incorrect`** — 確認 `app/login/register_enterprise/page.tsx` 的 CSV payload 是否還帶著 `captchaToken`/`captchaValue`（見上方問題 1）；也確認測試腳本在 CSV 匯入的那次頁面載入時，真的有先填過一次驗證碼欄位——CSV 匯入沿用的是「這次頁面載入」的 `captchaValue` 狀態，不是全域的。

**手動點 `/login/register_enterprise` 又被彈回首頁** — 檢查 `/api/admin/settings` 裡 `/login/register_enterprise` 的 Student 角色 `pageVisible` 是否又被改回 `false`（見上方問題 2）。

---

**最後更新**: 2026-08-08
