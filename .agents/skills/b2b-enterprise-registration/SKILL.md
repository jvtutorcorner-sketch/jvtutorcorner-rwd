---
name: b2b-enterprise-registration
description: '企業自助註冊流程驗證技能。涵蓋 /login/register_enterprise（公開頁，單筆自助註冊）、企業管理後台的 CSV 批次匯入（/admin/organizations/[id] 成員分頁 → /api/register/batch，限企業管理員）、/api/register 的 orgId 分支（網域驗證、席次競態下的原子性 rollback）、/api/organizations/public 公開組織清單。API 層腳本 + headed 瀏覽器 UI 流程雙軌驗證。'
argument-hint: '驗證企業自助註冊：單筆註冊、CSV 批次匯入（限企業管理員）、網域檢查、席次競態 rollback'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-09-12'
  architecture-aligned: true
  notes: '驗證過程中發現並修復 4 個問題，其中一個（PermissionGuard 誤擋匿名訪客）讓整個企業註冊頁對真實訪客完全不可達。'
---

# 企業自助註冊驗證技能 (B2B Enterprise Registration Skill)

負責驗證企業戶最前端的入口——`/login/register_enterprise`（公開頁，單筆自助註冊）、企業管理後台的 CSV 批次匯入成員（`/admin/organizations/[id]` 成員分頁），與其背後的 `/api/register` orgId 分支、`/api/organizations/public` 公開組織清單。這是使用者從「聽過這個平台」到「變成企業帳號」的第一步，壞掉了後面的 `b2b-core-modules`（席次/授權/組織單位/存取閘門）再怎麼正確都沒有意義。

跟 `b2b-core-modules`（純 Node 腳本，無頭）不同，本技能延續 `b2b-admin-ui-flow` 的做法，用**兩層**驗證：

1. `scripts/verify-b2b-enterprise-registration.mjs` — 直接打 `POST /api/register`，深度驗證網域檢查、席次上限、併發競態下的原子性 rollback
2. `e2e/b2b_enterprise_registration_ui_flow.spec.ts` — 真實 headed 瀏覽器把「單筆註冊」與「CSV 批次匯入」兩條路徑都走一遍（**CSV 那段需改為先以企業管理員登入後進管理後台，尚未更新**）

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

## 2026-09-17 變更：CSV 批次匯入改為整批原子性、單筆 B2B 註冊不再有孤兒 profile

- **CSV 匯入改打 `POST /api/register/batch`（一次請求）**：先整批驗證（必填欄位、Email 格式、組織網域、批次內重複、已註冊、席次足夠），任何一列不合格就回 `400 batch_validation_failed` + `rowErrors[{index,email,errors}]`，**什麼都不寫**。舊版逐列打 `/api/register`，第 6 列起必吃 `registerPerIp`（5 次/時）429，且成功的列不會回滾。
- **寫入**：`orgMembershipService.createNewMembersWithLicenses` — profile Put + license Put + 席次遞增放在同一個 TransactWrite；≤ 49 筆 = 單一交易（真正 all-or-nothing）；50–200 筆分段交易，後段失敗時補償前段（條件式刪 profile/license、釋放席次）。補償失敗回 `500 batch_partial` + `partial.profileIds`，log 標記 `REGISTER_BATCH_PARTIAL`。
- **防濫用**：見下方 2026-09-19 變更（匯入已改為登入後限企業管理員）。單批上限 200 列、每列都檢查組織網域、已註冊檢查 fail-closed。
- **CSV 解析**：`lib/registerProfileCsv.ts`（RFC 4180：引號、`""`、欄位內換行、CRLF、BOM），錯誤訊息用檔案實際行號。
- **單筆 B2B 註冊**（`/api/register` 帶 orgId）也改用同一個交易（批次大小 1），不再「先 Put profile、join 失敗再 Delete」，因此不會留下孤兒 profile，也不會把已經拿到席次的 profile 刪掉。profile 在交易提交前 `isB2B=false`。
- `assignMemberWithLicense`（管理員加成員等仍在用）交易提交後若後續讀取失敗，改回傳剛寫入的值、不再 throw — throw 一律代表「沒提交」。
- 共用的 profile 建構（欄位白名單、scrypt、驗證信 token）抽到 `lib/registerProfile.ts`，單筆與批次一致。
- 離線回歸：`node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-register-batch.mjs`（假 DynamoDB，不連 AWS、不寄信）。

## 2026-09-19 變更：CSV 批次匯入改為登入後限企業管理員

公開頁上的批次匯入只靠驗證碼 + IP 限流把關，而 `verifyCaptcha` 的 token 在 5 分鐘內可重用，
所以匿名者用單一 IP 每小時就能灌入 5 批 × 200 = 1000 個帳號（席次足夠的組織都會中）。

- **入口搬家**：公開頁 `/login/register_enterprise` 只保留單筆自助註冊；批次匯入改在
  `/admin/organizations/[id]` 的「成員」分頁（`components/org/OrgCsvImportPanel.tsx`，
  以 `<details>` 收折，只有系統管理員與該組織 `isOrgAdmin` 看得到）。
- **API 授權**：`POST /api/register/batch` 改為 `withAuth` + `requireOrgAccess(orgId, 'write')`。
  未登入 401；一般成員、`dept_admin`、其他組織的企業管理員一律 403。授權跑在 body 與限流之前，
  所以權限不足時拿到的是 403（不會洩漏席次或網域資訊）。
- **驗證碼移除**：已登入的管理員不需要人機驗證。`registerBatchPerIp`（5 次/時/IP）保留為爆量上限。
- **不再計入 `registerPerIp`**：那個計數器是給公開註冊表單用的；共用會讓幾個員工在辦公室自助註冊
  就把自家管理員的匯入擋掉。
- **時區工具抽出**：`lib/countryTimezone.ts`（`COUNTRY_TIMEZONES`、`formatLocalIso`、
  `timezoneForCountry`），原本在三個頁面各有一份副本。
- 離線回歸：`node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-register-batch-authz.mjs`
  （14 項：401 / 403 各情境、授權早於 body 與限流、被拒時不寫入任何 profile）。

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
- [scripts/verify-register-batch.mjs](../../../scripts/verify-register-batch.mjs)（離線，假 DynamoDB）
- [scripts/verify-b2b-enterprise-registration.mjs](../../../scripts/verify-b2b-enterprise-registration.mjs)
- [e2e/b2b_enterprise_registration_ui_flow.spec.ts](../../../e2e/b2b_enterprise_registration_ui_flow.spec.ts)

### 受測程式碼
- `app/login/register_enterprise/page.tsx`（公開頁，單筆自助註冊 UI）
- `components/org/OrgCsvImportPanel.tsx`（企業管理後台的 CSV 批次匯入 UI，掛在 `components/org/OrgMembersPanel.tsx`）
- `app/api/register/route.ts`（orgId 分支：網域驗證、席次前置檢查、`createNewMembersWithLicenses` 單一交易）
- `app/api/register/batch/route.ts`、`lib/registerProfile.ts`、`lib/registerProfileCsv.ts`（CSV 批次）
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

**CSV 匯入回 403 / 401** — 匯入自 2026-09-19 起限企業管理員：確認登入的帳號 `profile.isOrgAdmin === true` 且 `profile.orgId` 等於要匯入的組織（企業管理員的 `role` 通常仍是 `student`，看 role 會誤判）；`dept_admin` 沒有匯入權限。舊的 `captcha_incorrect` 問題已不適用（該路由不再驗證碼）。

**手動點 `/login/register_enterprise` 又被彈回首頁** — 檢查 `/api/admin/settings` 裡 `/login/register_enterprise` 的 Student 角色 `pageVisible` 是否又被改回 `false`（見上方問題 2）。

---

**最後更新**: 2026-09-17
