---
name: b2c-verification
description: 'B2C 端到端驗證技能。涵蓋公開頁渲染策略與 SEO、訪客可及性、完整轉換漏斗，以及 B2C/B2B 租戶邊界。'
argument-hint: '驗證 B2C 獲客漏斗、公開頁 SSR/SEO、訪客可及性與租戶隔離'
metadata:
  verified-status: '⚠️ PARTIAL'
  last-verified-date: '2026-07-31'
  architecture-aligned: false
  notes: 'M1 的失敗項為架構缺陷（middleware 全站 no-store + 缺 generateMetadata），非測試錯誤；M4 依賴 tenantId 導入後才能執行'
---

# B2C 驗證技能 (B2C Verification Skill)

負責驗證平台**面向一般消費者（B2C）那一側**的完整性。現有的 per-page skill（`homepage-verification`、`student-courses-page`、`payment-*`）各自驗證單一頁面，本技能補上兩件它們涵蓋不到的事：

1. **跨頁的轉換漏斗**是否接得起來（訪客 → 註冊 → 選課 → 購點 → 報名 → 進教室）
2. **公開頁的渲染策略與 SEO** 是否成立——這是獲客漏斗的最上游，壞掉就沒有流量進來

同時，隨著平台走向 B2B2C，B2C 使用者會成為 `tenantId='PUBLIC'` 的一種租戶，本技能持續驗證這條邊界沒有被打破。

## 核心職責

- 驗證公開頁是**伺服器渲染**且爬蟲讀得到實質內容
- 驗證每個公開頁有獨立的 `<title>` / `meta description` / Open Graph / canonical
- 驗證 `robots.txt`、`sitemap.xml` 存在
- 驗證公開頁可被 CDN 快取（非 `no-store`）
- 驗證未登入訪客能完整瀏覽獲客內容，且受保護頁確實被擋
- 驗證 B2C 轉換漏斗每一段交接不斷鏈、扣點正確
- 驗證 B2C 與 B2B 租戶資料互不可見（待 tenantId 導入）

## 為什麼 M1 現在會失敗（重要）

**M1 的多數失敗是「架構缺陷的量化結果」，不是測試寫壞了。請勿為了讓它變綠而調降門檻。**

| 根因 | 位置 | 影響的測試 |
|---|---|---|
| middleware 對 `'/:path*'` 一律送 `no-store` | [middleware.ts:8](../../../middleware.ts) | M1.6 |
| 除 root layout 外無任何 `generateMetadata` | `app/**/page.tsx` | M1.2、M1.5 |
| 無 `app/robots.ts`、無 `app/sitemap.ts` | — | M1.7 |

修復條件是主計畫的**階段 3：結構與渲染策略**（Route Group 切分 + middleware 收斂 + 補 metadata）。該階段完成後 M1 應全綠，屆時把 `verified-status` 改為 `✅ VERIFIED`、`architecture-aligned` 改為 `true`。

## 測試模組

### M1. 渲染策略與 SEO

| # | 驗證項 | 現況 |
|---|---|---|
| M1.1 | 公開頁皆回 200 | ✅ 通過 |
| M1.2 | 每頁有自己的 `<title>`，不得共用 root 預設值 | ❌ 全部共用 `Tutor Platform` |
| M1.3 | 每頁有 `meta description` | ✅ 通過（但均繼承 root，內容相同） |
| M1.4 | `/courses` 課程內容出現在初始 HTML | ❌ 待查（見「已知問題」） |
| M1.5 | 課程詳情頁有獨立 title + og:title + canonical | ❌ 缺 `generateMetadata` |
| M1.6 | 公開頁可被 CDN 快取 | ❌ middleware 全站 `no-store` |
| M1.7 | `robots.txt` / `sitemap.xml` 可取得 | ❌ 兩者皆 404 |

**M2 / M3 現況**：M2.1 完整漏斗 ✅ 通過；M3.1–M3.3 ✅ 通過；M3.4 見下方判定標準說明。

**關鍵設計**：所有 SEO 斷言都對 `request.get()` 取得的**初始 HTML** 進行，而非 `page.content()`。後者是 JS 執行後的 DOM，爬蟲看不到；只有伺服器輸出的原始回應才代表 Googlebot 實際讀到什麼。`expectInServerHtml()` 另會剝掉 `<script>` 區塊，避免命中 Next.js 的 RSC payload 造成假通過。

### M2. B2C 完整轉換漏斗

單一測試一氣呵成，逐段斷言交接未斷鏈：

```
首頁 → /courses → 課程詳情（訪客可見）
     → 註冊新帳號 → session 延續到瀏覽器
     → 備妥點數 → 報名扣點 → /student_courses
```

- 註冊走 `registerUserAndVerifyLogin()`（`/api/register` + `/api/login`，帶時間戳避免帳號衝突）
- 點數前置一律用 `setPointsAsSystem()` 帶 `x-e2e-secret`——`/api/points` 的 `add`/`set` 僅限 admin/system，**不可**用學生 session 自行加點
- 真實金流跳轉不在本技能範圍，請見 `payment-gateway-stripe-verification` 與 `payment-simulation-linepay`

### M3. 訪客（未登入）可及性

同一組測試同時驗「該開的開」與「該關的關」：

- 公開頁（`/`、`/courses`、`/teachers`、`/pricing`、`/about`、`/terms`）對訪客全部回 200，不得導向 `/login` 或回 401
- 訪客看得到課程詳情與點數方案（獲客資訊不可鎖）
- 受保護頁（`/student_courses`、`/settings`、`/admin`）不得把受保護內容渲染給訪客

**關於 M3.4 的判定標準**：本專案對受保護頁採「頁面照常渲染、內容區顯示『請先登入』空狀態」的設計，而非伺服器端轉址。實測確認 `/student_courses` 與 `/settings` 都會顯示「請先登入以檢視…」，**沒有任何受保護資料外流**。因此 M3.4 接受三種有效保護：轉址至登入頁、回 4xx、或顯示明確的登入提示空狀態；只有在三者皆無時才判定為洩漏。

### M4. B2C/B2B 租戶邊界（目前 skip）

`tenantId` 尚未進入 `SessionPayload`（[lib/auth/sessionManager.ts](../../../lib/auth/sessionManager.ts)），整組以 `test.skip` 標記，避免污染通過率。主計畫階段 2 完成後移除 skip 並補上實作：

- M4.1 B2C session 的 `tenantId === 'PUBLIC'`
- M4.2 B2C session 讀取企業租戶的 `courseId`/`orderId` → 須回 404/403
- M4.3 企業後台不得列出 `tenantId='PUBLIC'` 的 B2C 使用者

## 執行方式

```bash
# 全套
npx playwright test e2e/b2c_verification.spec.ts --project=chromium

# 分模組
npx playwright test e2e/b2c_verification.spec.ts -g "M1\."   # 渲染與 SEO
npx playwright test e2e/b2c_verification.spec.ts -g "M2\."   # 轉換漏斗
npx playwright test e2e/b2c_verification.spec.ts -g "M3\."   # 訪客可及性

# 單一測試
npx playwright test e2e/b2c_verification.spec.ts -g "M1\.6"

# 報告
npx playwright test e2e/b2c_verification.spec.ts --reporter=html && npx playwright show-report
```

**前置需求**

```bash
npx playwright install chromium        # 首次執行必須
npm run dev                            # 本技能需要可連線的伺服器
```

環境變數：`LOGIN_BYPASS_SECRET`（或 `QA_CAPTCHA_BYPASS`）用於繞過註冊/登入驗證碼；缺少時 M2 會自動 skip。

**M1 可用 curl 獨立佐證**（不需 Playwright）：

```bash
curl -s http://localhost:3000/courses | grep -o '<title>[^<]*'
curl -sI http://localhost:3000/courses | grep -i cache-control
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/robots.txt
```

## 相關檔案

### 測試
- **主測試**: `e2e/b2c_verification.spec.ts`
- **輔助函數**: `e2e/helpers/b2c-helpers.ts`（公開頁清單、原始 HTML 擷取、SEO 斷言、點數前置）
- **共用輔助**: `e2e/helpers/homepage-helpers.ts`（`registerUserAndVerifyLogin`、`clearLoginState`、`verifySEOMetadata`）

### 受測頁面
- `app/page.tsx`、`app/courses/page.tsx`、`app/teachers/page.tsx`（皆為 Server Component）
- `app/courses/[id]/page.tsx`、`app/teachers/[id]/page.tsx`（Server Component，缺 `generateMetadata`）
- `app/pricing/page.tsx`、`app/about/page.tsx`、`app/terms/page.tsx`（`'use client'`）
- `app/layout.tsx`（目前唯一定義 metadata 之處）

### 相關後端
- `app/api/register/route.ts`、`app/api/login/route.ts`（支援 `X-E2E-Secret` 繞過驗證碼）
- `app/api/courses/route.ts`、`app/api/orders/route.ts`、`app/api/points/route.ts`
- `middleware.ts`（快取標頭來源）

## 已知問題

### ⚠️ 待修（皆為架構缺陷，非測試問題）

1. **全站共用同一組 SEO metadata** — 所有頁面 title 均為 `Tutor Platform`，搜尋結果無法區分。需在各 `page.tsx` 補 `export const metadata` 或 `generateMetadata`。
2. **公開頁無法被 CDN 快取** — `middleware.ts` 的 `matcher: '/:path*'` 對全站送 `no-store`。需縮小到 `/api` 與已登入頁面。
3. **缺 `robots.txt` 與 `sitemap.xml`** — 兩者皆 404。Next.js App Router 原生支援 `app/robots.ts` / `app/sitemap.ts`。
4. **M1.4 課程內容未出現在初始 HTML** — `app/courses/page.tsx` 確實是 Server Component 且從 DynamoDB 取資料，但斷言未通過。需釐清是「該課程不在第一頁分頁範圍內」還是「內容確實只在 RSC payload 中」。排查前不要調整斷言。
5. **`app/teacher/[id]` 與 `app/teachers/[id]` 路由重複** — 前者是 `'use client'`、後者是 Server Component。需釐清何者為正、另一者應移除或轉址，否則 SEO 會有重複內容問題。
6. **受保護頁對訪客回 HTTP 200** — `/student_courses`、`/settings` 雖然正確顯示「請先登入」空狀態（無資料外流），但仍以 200 回應。這代表爬蟲會索引到一批內容單薄且重複的頁面。建議在階段 3 一併處理：對這些路由加上 `noindex`，或改為伺服器端轉址。

### 🔧 環境配置陷阱（實測踩到，值得記錄）

`.env.local` 中設有 `APP_ENV=production`。`playwright.config.ts` 以 `process.env.APP_ENV || 'local'` 決定要載入哪個 `.env` 檔，父行程判定為 `local`（因為此時 `.env.local` 尚未載入），但 `dotenv` 隨後把 `APP_ENV=production` 注入 `process.env`，**由 globalTeardown 衍生的子行程於是繼承到 `production`**，改去載入 `.env.production`。

目前之所以沒出事，只是因為 `NEXT_PUBLIC_BASE_URL` 已先被 `.env.local` 設為 `localhost:3000`，而 dotenv 不覆寫既有變數。**但 `e2e/cleanup-test-data.spec.ts` 會刪除課程、訂單與教師帳號**——若哪天這個變數的載入順序改變，清理腳本就會對著 `https://www.jvtutorcorner.com` 執行。

建議修法：在 `playwright.config.ts` 讀取 `APP_ENV` 前先不要讓 `.env.local` 覆寫它，或在 cleanup spec 開頭加上「BASE_URL 必須是 localhost，否則 abort」的硬性防護。

### ✅ 已修

- **`registerUserAndVerifyLogin()` 是空殼** — 原函式體只有一個游離的 `6`，沒有執行任何註冊就回傳 email，任何依賴它的測試都會假通過。已補上完整的 `/api/register` → `/api/login` 流程並回傳 `{ email, password }`。

## 故障排除

**全部測試 connection refused** — 伺服器沒起來。`playwright.config.ts` 只在 `APP_ENV=local` 時自動啟動 webServer；先手動 `npm run dev` 最保險。

**`browserType.launch: Executable doesn't exist`** — 執行 `npx playwright install chromium`。

**M2 被 skip** — 缺 `LOGIN_BYPASS_SECRET` / `QA_CAPTCHA_BYPASS`，請確認 `.env.local` 已設定。

**M2 報名失敗且回 403** — 檢查是否誤用學生 session 呼叫 `/api/points` 的 `add`/`set`。該權限已收斂為 admin/system 專用，前置資料必須帶 `x-e2e-secret`。

**M1.4 / M3.2 被 skip** — `pickFirstCourse()` 找不到非 `test-course-` 開頭的課程，代表環境沒有可用課程資料。

---

**最後更新**: 2026-07-31
**相關技能**: homepage-verification、student-enrollment-flow、student-courses-page、recommendation-onboarding、payment-flow-validation
