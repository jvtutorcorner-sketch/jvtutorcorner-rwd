---
name: b2b-admin-ui-flow
description: '用真實瀏覽器（非無頭）走一遍 B2B 企業管理後台的常見操作：建組織、建部門並巢狀、加入成員到席次上限、移除成員。跟 b2b-core-modules 的無頭 Node 腳本互補——這支是「看得到執行過程」的版本。'
argument-hint: '用 headed 瀏覽器驗證 /admin/organizations 的建組織、部門、成員操作流程'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-08-08'
  architecture-aligned: true
  notes: '單一 Playwright spec，headed 執行約 15 秒跑完。撰寫過程中發現並修正一個測試自身的清理 bug（見下方「常見坑」）。'
---

# B2B 管理後台真實瀏覽器操作流程

`scripts/verify-b2b-*.mjs` 系列（見 `b2b-core-modules` skill）直接呼叫 `lib/*.ts` 打 DynamoDB，驗證的是資料庫層的正確性（原子性、併發、GSI），但跑起來完全看不到畫面——純粹是終端機文字輸出，跟「一般使用者實際點滑鼠」的體驗完全不同。

這支技能反過來：用**真實瀏覽器**（Playwright 的 `chromium-headed` 專案，`headless: false`）一步步點開 `/admin/organizations`，做企業管理員真的會做的事——建組織、建部門、加成員到撞席次上限、移除成員——讓人可以**用眼睛看著整個流程跑**，而不是只信任終端機的 ✅/❌。

## 跟 b2b-core-modules 的分工

| | b2b-core-modules | b2b-admin-ui-flow（本技能） |
|---|---|---|
| 執行方式 | `node --import ...` 直接呼叫 lib 函式 | Playwright 真實瀏覽器點擊 |
| 看不看得到畫面 | 看不到（純文字輸出） | 看得到（headed 視窗） |
| 驗證深度 | 深——併發、樂觀鎖、路徑重寫、邊界案例 | 淺——只示範最常見的使用者路徑 |
| 適合場景 | 資料庫層邏輯回歸測試 | 展示/確認 UI 真的接得起後端邏輯 |

`moveOrgUnit` 的原子性、併發搶席次、路徑修復等邊界案例**已經**由 `scripts/verify-b2b-access-orgunits.mjs` 深度覆蓋，本技能的部門操作只示範一次成功的建立+移動，不重複那些邊界測試。

## 前置準備

1. **開發伺服器要自己先啟動**——`.env.local` 裡 `APP_ENV=production`，導致 `playwright.config.ts` 判定不是 local 環境而**不會**自動幫你 `npm run dev`。跑這支測試前先手動：
   ```bash
   npm run dev
   ```
   等 `http://localhost:3000` 有回應再繼續。
2. `.env.local` 需要 `ADMIN_EMAIL`/`ADMIN_PASSWORD`（或 `QA_ADMIN_PASSWORD`）與 `LOGIN_BYPASS_SECRET`（或 `NEXT_PUBLIC_LOGIN_BYPASS_SECRET`/`QA_CAPTCHA_BYPASS`）——沿用 `auto-login` skill 的驗證碼繞過機制。
3. 跟其他 B2B 驗證一樣，`.env.local` 目前指向正式環境 DynamoDB；測試建立的組織/部門/成員都會寫入正式環境，測試會在 `finally` 區塊清理，正常結束不留殘留。

## 執行方式

```bash
# 一定要帶 --project=chromium-headed，否則預設專案是 headless，還是看不到畫面
npx playwright test e2e/b2b_admin_ui_flow.spec.ts --project=chromium-headed
```

如果只想確認邏輯過關、不需要看畫面，也可以用任何一個 headless 專案（例如 `--project=chromium`）跑同一支測試，斷言完全一樣。

## 常見坑（寫這支測試時真的踩到的）

1. **`test('...', async ({ page, request }) => ...)` 拿到的 `request` 不會帶登入 cookie。** Playwright 頂層 `request` fixture 是獨立於 `page` 瀏覽器分頁的全新 `APIRequestContext`，不會共用 `page` 登入後拿到的 session cookie。清理步驟一開始用它打 `DELETE /api/organizations/...`，實際上每次都收到 401，但**Playwright 的 `APIResponse` 對非 2xx 狀態不會 throw**，`try/catch` 完全接不住，清理靜默失敗，正式環境累積了好幾筆測試殘留組織才發現。修法：改用 `page.context().request`（跟 `page` 共用同一個瀏覽器 context、同一組 cookie），並且明確檢查回傳的 `.ok()`、印警告，不要只靠 try/catch。
2. **`getByText('工程部')` 會撞兩個元素。** 部門一旦建立，名稱會同時出現在（a）部門樹的 `<strong>` 節點，和（b）「上層部門」下拉選單的 `<option>`。純文字定位一律會 strict-mode violation。改用 `page.locator('strong', { hasText: name })` 只鎖定樹狀節點。
3. **`selectOption({ label })` 不吃 regex，只吃字串。** 想用 `/工程部/` 這種寬鬆比對會直接丟型別錯誤，得算出下拉選單的確切 label（含 `OrgUnitTreePanel` 用全形空白 `　` 做的階層縮排前綴——根節點是空字串前綴，所以第一層部門的 label 就是純名稱本身）。
4. **登入後導向的 URL 不固定，不要死等 `/dashboard` 或 `/admin`。** 用 `page.waitForURL((url) => !url.pathname.includes('/login'))` 比較穩，只要離開登入頁就算成功。

## 相關檔案

- 測試：[e2e/b2b_admin_ui_flow.spec.ts](../../../e2e/b2b_admin_ui_flow.spec.ts)
- 受測 UI：`components/OrganizationsManager.tsx`、`components/OrganizationDetailManager.tsx`、`components/org/OrgUnitTreePanel.tsx`、`components/org/OrgMembersPanel.tsx`
- headed 專案定義：[playwright.config.ts](../../../playwright.config.ts) 的 `chromium-headed`/`chromium-headless` projects

## 相關技能
- `b2b-core-modules` — 同一批 B2B 功能的無頭資料庫層深度驗證，本技能不重複其邊界案例
- `auto-login` — 本技能沿用的登入/驗證碼繞過機制

## 故障排除

**測試卡住／連線失敗** — 先確認 `npm run dev` 真的起來了（`curl http://localhost:3000`），`.env.local` 的 `APP_ENV=production` 不會讓 Playwright 自動幫你啟動。

**沒有跳出瀏覽器視窗** — 忘了帶 `--project=chromium-headed`；預設專案是 `chromium`（headless）。

**清理後正式環境還留著測試組織** — 檢查是不是誰把清理步驟的 `page.context().request` 改回了頂層 `request` fixture（見上方「常見坑 1」），或檢查清理的 API 呼叫是不是回傳非 2xx（現在會印 `⚠️` 警告，不會再靜默吞掉）。

---

**最後更新**: 2026-08-08
