# JV Tutor Corner — Production Readiness 工作交接（Session 2026-09-12）

> **給新的 Claude**：這份文件是「把專案推到首次上線（go-live）」這條工作線的完整交接。讀完即可從第 12 節「下一步」直接接手。
> - 語言：使用者用繁體中文溝通，回覆一律 zh-TW；程式識別字維持英文。
> - **姊妹文件（必讀）**：`docs/claude-session-handoff-2026-09-15.md` —— 另一個 session（09-09～09-12，`fix/b2b-data-structure` 的作者）的交接，涵蓋**本機驗證環境規則、禁跑清單、skill 系統、e2e helper、正式資料清理 SOP、未解決的測試失敗**。本文件**不重複**那些內容，只在第 1 節列出最低限度的安全規則。
> - 完整規劃原文：`C:\Users\Attlie\.claude\plans\claude-multi-agent-development-protocol-mighty-pillow.md`（新 session 可能讀不到；本文件第 7～9 節已收錄所有可執行內容）。

---

## 0. 目前狀態一覽（TL;DR）

| 項目 | 狀態 |
|---|---|
| 分支 | `integration/b2b-security-merge`（從 `origin/main` 切出），**領先 origin/main 11 個 commit、落後 0，未 push**（最後 fetch：2026-09-12） |
| Phase 0 整合合併 | ✅ 完成並驗證 — commit `5e6120e` |
| Phase 2 第一個 PR（CI 閘門） | ✅ 完成並驗證 — commit `4dffce8` |
| Phase 1 上線阻斷安全修補 | ⬜ 未開始（**下一步**） |
| Phase 2 其餘（Vitest、單元測試、hermetic e2e） | ⬜ 未開始 |
| Phase 3 殘留 stub 清除 | ⬜ 未開始 |
| Phase 4 可觀測性與維運 | ⬜ 未開始 |
| **等待使用者決定** | 是否 push／開 PR／合併到 `main` —— **`main` 推上去就會自動部署到 Amplify 正式環境** |

工作目錄中**不是本 session 產生**的異動（不要還原、不要順手 commit）：
- `M .agents/skills/SKILL_VERIFICATION_SUMMARY.md`
- `?? docs/MVP.md`、`?? docs/claude-session-handoff-2026-09-15.md`
- `?? scripts/create-dev-tables.mjs`（Phase 4 的 O7 會處理它的去留）

---

## 1. 最低限度安全規則（細節見姊妹文件第 3、9 節）

1. `.env.local` 是 `APP_ENV=production`，指向**正式 AWS**。本機跑 e2e 或腳本一律加前綴 `APP_ENV=local NEXT_PUBLIC_PAYMENT_MOCK_MODE=true DISABLE_RATE_LIMIT=true`。
2. **不要 push、不要 commit**，除非使用者當下明確要求。合併到 `main` 等於正式部署。
3. **不要批次清理正式資料**；只刪本次產生、能用 id 列出的資料，並先 dry-run。
4. 可能有其他 session 同時在同一個工作目錄開發。
5. 會碰正式環境的操作（寫入、寄信、金流、刪資料）要逐項確認。
6. 不要在 CI 放 AWS credentials（fork PR 會外洩，而且 `.env.local` 指向正式環境）。

---

## 2. 使用者需求與已確定的決策

### 2.1 使用者的「Claude Multi-Agent Development Protocol」

使用者只提需求，不手動切換模型、指定 Agent 或決定並行數。Master（本 session）負責分析、拆解、自動分派、控制並行、整合與最終驗證。原訊息在 Sonnet 段落的「大部分 Productio」處被截斷。

| 工作類型 | 模型 |
|---|---|
| 架構、API／DB contract、安全設計、任務拆解、驗收標準 | **Fable**（不寫一般程式） |
| 複雜 debug、跨模組重構、安全關鍵實作、DB migration、auth 相關的合併衝突 | **Opus** |
| 預設實作：UI、API、CRUD、DB、測試、一般 debug 與重構 | **Sonnet** |
| 文件、格式化、機械式修改、輕量分析 | **Haiku**（不得負責核心或正式環境關鍵的實作） |

執行慣例：
- 同時最多 3 個實作 agent，不分派重疊的檔案。
- 每個 phase 結束時由 Master 親自驗證：build、typecheck，以及當時已存在的閘門。
- **不採信 subagent 的摘要當作完成證據。**

### 2.2 使用者透過 AskUserQuestion 做的決定

| 問題 | 決定 |
|---|---|
| 正式環境現況 | **準備首次上線（go-live 前）**，尚無真實付費用戶，所以可接受 breaking change 與資料重建 |
| 優先處理 | **四條線全選**：品質防護網（CI／測試／型別）、安全缺口、殘留 stub 與假資料、可觀測性與維運 |
| 重構幅度 | **允許有測試保護的中度重構**；沒有測試保護的地方不重構 |
| Git 流程 | 先把 `fix/b2b-data-structure` 的 9 個未推送 commit **合入 origin/main**，再從該基底開新分支 |
| 部署分支 | **`main` 推上去就自動部署**（`amplify.yml`：`npm ci` → `npm run build` → prune，沒有測試閘門） |

---

## 3. 專案架構重點（本工作線需要的部分）

- Next.js `^16.0.10` App Router、React `^18.3.1` 加 `reactCompiler: true`、TypeScript `strict`、Tailwind v4、npm。`next.config.ts` 在非 Windows 時使用 `output: 'standalone'`。
- **DynamoDB 直接使用 AWS SDK v3**，沒有 ORM。
  - 共用 client：`lib/dynamo.ts`，只匯出 `ddbDocClient`。credential 延遲到第一次 `send()` 才解析，所以 import 時沒有 I/O。
  - **約 30 處自行 `new DynamoDBClient()`，繞過這個共用 client**（subagent 回報，未逐一確認）。
- 自製 session auth，不是 Cognito：`lib/auth/sessionManager.ts`，session 存在 DynamoDB，token 以 HMAC 簽章，TTL 24 小時。
- 守衛在 `lib/auth/apiGuard.ts`。合併後的行號：`withAuth:75`、`withHmac:132`、`withAdmin:172`、`withAnyAuth:185`、`withAdminOrHmac:251`。
  - **五個 wrapper 呼叫 handler 時都沒有 try/catch。**
  - `withHmac` 和 `withAnyAuth` 會先 `req.text()` 再重建 Request。任何會讀 body 的新 wrapper（例如 `withValidation`）**必須包在 auth wrapper 的內層**。
- 金流：Stripe、PayPal、LINE Pay、ECPay。付款成功後都匯流到 `lib/paymentSuccessHandler.ts`（冪等）。點數 escrow 在 `lib/pointsEscrow.ts`。
- RTC：`lib/providers/rtc/useRTC.ts` 以 build-time 常數 `NEXT_PUBLIC_RTC_PROVIDER` 切換，選項為 agora（預設）、livekit、cloudflare-sfu、chime。四個 hook 每次 render 都會無條件呼叫。**chime 是 65 行的 no-op stub。**
- 規模：約 159 支 API route、102 頁、126 個 `lib/*.ts`、82 支 Playwright spec；**沒有任何單元測試框架**。
- 巨型檔案（本計畫明確**不拆**）：`app/add-app/page.tsx` 172KB、`app/classroom/ClientClassroom.tsx` 164KB、`app/settings/pricing/page.tsx` 109KB、`app/workflows/page.tsx` 108KB。

---

## 4. 已完成：Phase 0 整合合併（commit `5e6120e`）

### 4.1 背景

- `fix/b2b-data-structure` 有 9 個只存在本機的 commit（439 檔）：
  - `bd85fe7`、`3948934`：API auth 強化
  - `12c668d`：B2B 資料結構修復
  - `8b1c00d`：rate limit 與帳號狀態
  - `ab042cc`：S3／R2
  - `7881bcb`：Cloudflare SFU
  - `25f411b`：admin 停權
  - `05430d8`、`3bbcb61`
- `origin/main` 有 15 個 branch 沒有的 commit（67 檔）：
  - i18n
  - AI avatar 試點（新增 `replicate` 依賴）
  - `a255dc2`：密碼外洩修補、audit log 補齊、dept_admin、手動帳單
  - `c4eec63`：驗證碼過期後卡住
  - `7b02bc6`：build 型別修正
- 分歧點是 `53408d7`（2026-08-09）。採用 **merge，不用 rebase**（`git merge --no-commit --no-ff`），實際有 25 個衝突檔。

### 4.2 衝突解決紀錄

每一項都附理由，之後有疑慮可以照此追查。

| 檔案 | 決定 | 理由／補回的內容 |
|---|---|---|
| `lib/auth/apiGuard.ts` | 採用 branch 版本 | branch 新增 `isE2eBypassAllowed()`／`tryE2eBypassSession()`：`x-e2e-secret` → `role:'system'` 的 bypass 在 production 預設關閉，除非設定 `ALLOW_E2E_BYPASS_IN_PRODUCTION=true`。handler 回傳型別放寬為 `Response`。兩邊都有同樣的 5 個 guard。 |
| `lib/auth/orgAccess.ts` | 採用 branch 版本 | 兩邊的 dept_admin 模型**互不相容**。main 使用 `profile.isDeptAdmin`、`deptAdminUnitId`、`requireOrgOrDeptAccess`、`resolveDeptScopeUnitIds`；branch 使用 `profile.role==='dept_admin'`、`orgUnitId`、`requireOrgUnitAccess`、`filterOrgUnitsForActor`、`requireMemberScopeAccess`、`filterMembersForActor`。branch 版把**已封存的部門視為沒有管理範圍**，並快取 scope。main 版的 4 個使用端本來就在衝突清單內，所以一起改用 branch 版。 |
| `lib/orgMembershipService.ts`、`components/org/OrgMembersPanel.tsx`、`app/api/org-units/route.ts`、`app/api/organizations/[id]/members/route.ts`、`.../members/[profileId]/route.ts`、`e2e/b2b_dept_admin_scope.spec.ts` | 採用 branch 版本 | branch 的 `setMemberDeptAdmin` 會拒絕把老師升為 dept_admin，因為 `role` 是單一值，升級會讓老師失去老師權限；同時保存 `previousRole`。members 路由的 audit 覆蓋範圍 branch ≥ main（`org.member.add/remove/update` 對上 `member.assign/remove`）。 |
| `app/api/org-units/[id]/route.ts` | 保留 main 的 `writeAuditLog` import | 呼叫點已經自動合併進來，拿掉 import 會讓 build 失敗。 |
| `app/api/org-units/[id]/move/route.ts` | 採用 branch 的邏輯，並**手動補回** main 的 `orgunit.move` audit 呼叫（放在 `moveOrgUnit` 之後） | branch 完全沒有這筆 audit。 |
| `app/api/register/route.ts` | 採用 branch 版本 | 回應中同時移除 `password` 與 `verificationToken`。main 只移除密碼；回傳 token 會讓註冊者能驗證不屬於自己的信箱。 |
| `app/api/auth/callback/google/route.ts` | 採用 branch 版本 | main 的做法是把路由整個停用，以關閉「任何 `?code=` 都算登入成功」的繞過。branch 實作了真正的 OAuth：state cookie（`g_oauth`）防 CSRF、code exchange、id_token 簽章與 nonce 驗證、網域白名單、停權檢查、server session。依賴的 `lib/auth/googleSSO.ts`、`lib/auth/accountStatus.ts` 已確認存在。 |
| `app/login/page.tsx` | 採用 branch 版本 | Google 登入成功後，身分只信任 `/api/auth/me`（session cookie），**不信任 URL 上的 email**；另外新增停權／封鎖訊息與 Google 登入按鈕。 |
| `app/login/register/page.tsx` | 採用 branch 版本，並**手動補回** main `c4eec63` 的驗證碼修正 | `data.message==='captcha_incorrect'` 時顯示 `register_error_captcha_incorrect` 並呼叫 `loadCaptcha()`；少了這段，使用者會卡在已失效的驗證碼。 |
| `app/login/register_enterprise/page.tsx` | 採用 branch 版本 | 只有 branch 修正了「CSV 批次註冊每列帶上 captchaToken」；main 版每一列都會被拒。 |
| `app/orders/page.tsx`、`app/plans/page.tsx`、`app/courses/[id]/page.tsx` | 採用 branch 版本 | 兩邊都已完成 i18n，只是 key 命名不同；branch 使用 `t(key, vars)` 插值與新的 `<T>` 元件。 |
| `components/IntlProvider.tsx` | 採用 branch 的 `<T>`，並**把 `ServerT` 放寬回 main 的完整簽章** `{k, fallback, s, vars}` | `app/teachers/[id]/page.tsx`（沒有衝突、來自 main）仍使用 `ServerT k=`；branch 的 shim 只接受 `s`，會讓它壞掉。 |
| `locales/{en,zh-TW,zh-CN}/common.json` | 用 Python 做 deep union（878 + 928 → 1117 個 key），**純量值衝突時 main 優先** | i18n 由 main 負責。已確認 `login_with_google`、`login_account_suspended`、`login_account_banned` 三種語言都有。 |
| `app/api/admin/settings/route.ts`、`app/api/classroom/ready/route.ts` | 採用 branch 版本 | 行為相同或更嚴謹。 |
| `app/api/test/send-verification-email/route.ts` | 接受 branch 的**刪除** | 這是 `bd85fe7` 刪掉的未驗證測試寄信端點，沒有任何引用。 |

**已知殘留（刻意未處理）**：`lib/types/b2b.ts` 仍宣告 main 模型的 `isDeptAdmin`、`deptAdminUnitId`（約第 179～187 行）。合併後已經沒有程式使用，只剩型別。刪除前先確認正式資料有沒有這兩個欄位。

### 4.3 驗證結果

- `npm ci`：合併後 `replicate` 還沒安裝，必須重跑。
- `npx tsc --noEmit`：**0 錯誤**。
- `npm run build`：**成功**。
- `npm run check:bundle-secrets`：**通過**。
- **guard 存活檢查**：使用 apiGuard 的 route 數量，origin/main 為 24、branch 為 106、合併後為 **110**，兩個 parent 的聯集**沒有任何遺失**。
- **module matrix 稽核**：在拋棄式 worktree 量測合併前的 baseline，與合併後**完全相同**：15 個 critical 模組未達 COVERED；COVERED 15／PARTIAL 19／BLOCKED 1／NOT_IMPLEMENTED 1。唯一的差異是 main 新增的 `ai-avatar`、`translate` 兩個 API domain 尚未對應，不影響 exit code。
- **尚未執行**：
  - `npm run db:verify`（需要正式 AWS）。
  - B2B、auth、報名相關 Playwright spec 的本機回歸（原計畫要求在合併前跑）。

---

## 5. 已完成：Phase 2 第一個 PR（commit `4dffce8`）

### 5.1 lint 積欠其實是假象

- ESLint 9 flat config **不會讀 `.gitignore`**，而 `eslint.config.mjs` 的 `.next/**` 只錨定 repo 根目錄，所以 `.claude/worktrees/**/.next/` 裡的 build 產物全都被 lint。
- 量測結果：全部 114,848 個問題中，`.claude/` 佔 110,678 個；`public/pdf.worker.min.mjs`（第三方壓縮檔）佔 1,520 個。
- 修正 `globalIgnores`：改成 `**/.next/**` 等寫法，並加入 `.claude/**`、`tmp/**`、`test-results/**`、`playwright-report/**`、`coverage/**`、`public/pdf.worker*.mjs`、`public/**/*.min.{js,mjs}`。
- 修正後：檔案數 9,030 → 814，問題數 114,848 → 約 2,625，執行時間從數分鐘降到 26 秒。
- 另外新增 override：`types/**/*.d.ts` 關閉 `no-explicit-any`（這些是第三方模組 shim）。

### 5.2 各目錄的 lint 基線（修正 ignores 之後）

| 目錄 | errors | warnings |
|---|---|---|
| lib | 2 → **0**（已修） | 110 → **109** |
| types | 2 → **0**（override） | 0 |
| scripts | 85（約 80 個是 `.mjs/.js` 的 `no-require-imports`） | 31 |
| components | 287 | 159 |
| app | 1018 | 470 |
| e2e | 234 | 130 |
| **全 repo** | **1662** | **963** |

### 5.3 新增的腳本與設定

```jsonc
// package.json scripts
"lint:ci":     "eslint lib types --max-warnings 109",   // 阻斷
"typecheck":   "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.e2e.json", // 阻斷
"lint:report": "eslint --max-warnings 963"               // 只報告
```

- 新檔 `tsconfig.e2e.json`：`extends ./tsconfig.json`，include `e2e/**/*.ts` 與兩個 playwright config，設定 `incremental:false`、`types:["node"]`。
- **`tsconfig.json` 保留 `exclude: ["e2e"]`**，讓 `next build` 不去型別檢查測試。
- **不要把 `npm test` 改指向 Vitest**：repo 裡約有 275 處 `npx playwright test`、42 處 `npm test` 的引用，還有 `verify-skills.yml:100`。

### 5.4 `.github/workflows/ci.yml` 改寫為平行 job

| job | 阻斷？ | 內容 |
|---|---|---|
| `typecheck` | ✅ | `npm run typecheck` |
| `lint` | ✅ | `npm run lint:ci` |
| `build` | ✅ | `npm run build`（使用 dummy `SESSION_SECRET`／`API_HMAC_SECRET`），再跑 `check:bundle-secrets` |
| `lint-full` | ❌ `continue-on-error` | `npm run lint:report` |
| `audit` | ❌ `continue-on-error` | 兩個 `:strict` 稽核（目前一定會失敗，見第 6 節修正 1） |

### 5.5 e2e 型別錯誤（16 個，已全部修正）

這些錯誤全部來自 `e2e/helpers/whiteboard_helpers.ts` 改簽章後遺留的呼叫點：
- `goToWaitRoom(page, courseId, role)` 被多傳了 `orderId, BYPASS_SECRET`。
- `waitAndEnterClassroom(page, role)` 被寫成 `(page, courseId, role)`，role 實際收到的是 courseId。
- `clickReadyButton(page, 3000)` 把 timeout 當成 role。
- `drawOnWhiteboard(page, 5)` 多了一個參數。

`role` 只用在 log，所以執行期的影響是**標籤錯誤**；但這些 escrow spec 一直在打正式 AWS。其他 spec 早已使用新簽章。

修改的檔案：
- `e2e/points-escrow-midway-exit.spec.ts`
- `e2e/points-escrow-production.spec.ts`（另外補上 `localISO(timestamp: number|string|Date)`）
- `e2e/helpers/auth-helpers.ts:117`（`auth: Record<string,string>`）
- `e2e/scheduled_jobs_verification.spec.ts:38-39`（`as Record<string,string>`）

### 5.6 lib 裡的兩個真實修正

- `lib/paymentSuccessHandler.ts:116`：`prefer-const`（`eslint --fix`）。
- `lib/providers/signaling/useAwsApigwSignaling.ts`：
  - **問題**：`connect()` 與 `scheduleRetry()` 互相遞迴，但 `scheduleRetry` 不在 `connect` 的 dependency array 裡，所以 `connect` 永遠抓著第一版的 `scheduleRetry`（stale closure）。
  - **修正**：改用 `scheduleRetryRef`。`onclose` 呼叫 `scheduleRetryRef.current()`，並在 `useEffect(() => { scheduleRetryRef.current = scheduleRetry }, [scheduleRetry])` 裡更新。在 render 中直接寫 ref 會觸發 `react-hooks/refs`。
  - 另一個 `react-hooks/set-state-in-effect`（`if (!enabled) setConnectionState('idle')`）以**附上理由的 `eslint-disable-next-line`** 處理。這是即時連線程式而且沒有測試，依計畫不重構。
  - **注意**：disable 指令必須緊貼在目標語句的上一行，說明文字要放在它上面。
- 修正後重新跑 `npm run build`，成功。

---

## 6. 執行中發現、推翻原計畫的修正（優先於第 7～9 節）

1. **兩個 `:strict` 稽核並不是 exit 0。** 合併前後都是 exit 1，有 15 個 critical 模組未達 COVERED（跨租戶隔離是 BLOCKED）。原計畫說「這是最便宜的閘門，第一個 PR 就加」是錯的，所以目前在 CI 中設為 advisory。要改成阻斷有兩個方向：修掉這 15 個模組，或把 `--strict` 改成「數量不得增加」的 ratchet（判斷位置在 `scripts/audit-enterprise-general-module-matrix.mjs:366` 的 `blocking`）。
2. **`eslint --max-warnings N` 不限制 errors**，原計畫的 `lint:ci` 在有 1,662 個 error 時永遠不會通過，因此阻斷範圍縮小為 `lib` 加 `types`。
3. `origin/main` 新增的 `/api/ai-avatar`、`/api/translate` 還沒登錄在 module matrix。
4. 姊妹文件寫「`npm run build` 會被作廢的 secrets 擋下」，但**本 session 在 2026-09-12 沒有加任何前綴，`npm run build` 就成功了兩次**。原因尚未調查（推測是 `.env.local` 覆寫了 `.env.production`，或值已經不同）。修改 `next.config.ts` 的 secret 檢查前，先確認實際行為。
5. subagent 曾聲稱 `:strict` 稽核會 exit 0、`ServerT` 沒有相容問題等 —— **subagent 的結論都要親自重新驗證。**

---

## 7. 待辦：Phase 1 — 上線阻斷的安全修補（下一步從這裡開始）

> 標記說明：**[已親驗]** 表示本 session 親自讀過原始碼確認；**[subagent]** 表示由規劃 subagent 回報，動手前要先重讀該行。
> 行號是在合併前讀取的。LINE webhook、rateLimit、ecpay 這些檔案沒有參與衝突，行號應該仍然有效。

### S1. LINE webhook 簽章繞過 **[已親驗]** — Opus

`app/api/line/webhook/[integrationId]/route.ts:560,570`

```ts
const isSimulation = request.headers.get('x-simulation') === 'true';
if (!isSimulation) { /* 驗簽 */ }
```

沒有 secret、沒有環境判斷、沒有限流。匿名請求只要帶這個 header 就能觸發：
- `executeWebhookScript()`（`:604`）：在 isolated-vm 中執行攻擊者提供的輸入。
- `analyzeImageWithVisionAPI()`（`:786`）：消耗租戶自己的 AI key。
- `updateUserProfileLineUid()`（`:204`）：覆寫整筆 profile。
- **驗簽之前就先跑 4 次 ScanCommand**（`:97,112,130,192`），其中一次掃 profiles 表。
- `:571` 用 `!==` 比對簽章，不是 constant-time。

**修法**：
- 刪除 bypass，改成與 `isE2eBypassAllowed()` 同樣形式的雙重閘門：非 production，而且 `x-simulation-secret === LOGIN_BYPASS_SECRET`。
- 把驗簽移到 `getAppIntegration()` 之前。
- 該處的 Scan 改為 `GetCommand`（integrationId 就是 PK）。
- 改用 `crypto.timingSafeEqual`，並先檢查長度。
- `findProfileByLineUid` 改為 GSI query（同一張表已有 `EmailIndex`）。

### S2. rate limit 可以用偽造的 header 繞過 **[已親驗]** — Sonnet

`lib/rateLimit.ts:145-154` 的 `getClientIp` 取的是 `x-forwarded-for.split(',')[0]`。CloudFront／Amplify 是把真實 IP **附加**在後面，所以第一段是攻擊者自己填的。

結果是所有以 IP 為 key 的規則（`RATE_LIMIT_RULES`，`:171-184`）全部失效，只有 `loginFailPerEmail` 仍然有效。

**修法**：
- 優先使用 `cloudfront-viewer-address`（去掉 port）。
- 否則從 XFF 的**右邊**往回數 `TRUSTED_PROXY_HOPS`（預設 1）。
- 最後才退回 `x-real-ip`。
- 加單元測試：`1.2.3.4, 9.9.9.9` 要解析成 `9.9.9.9`。
- **必須在 S5 之前完成。**

### S3. ECPay 在變數缺少時退回官方公開的測試金鑰 **[已親驗]** — Opus

`lib/ecpay.ts:4-6`：`ECPAY_MERCHANT_ID || '2000132'`、`ECPAY_HASH_KEY || '5294y06JbISpM5x9'`、`ECPAY_HASH_IV || 'v77hoKGq4kWxNNIS'`。

`app/api/ecpay/return/route.ts:30` 只靠 `verifyCheckMacValue` 驗證付款回呼。如果 Amplify 沒有設定這些變數，任何人都可以偽造 `RtnCode=1`，觸發 `handlePaymentSuccess()` 免費取得點數。

**[subagent]** `.env.local`、`.env.production` 目前存的就是這組測試金鑰。

### S4. `NEXT_PUBLIC_PAYMENT_MOCK_MODE` 會讓所有金流閘道短路 **[subagent]** — Opus（與 S3 一起處理）

約有 12 處使用。其中 `app/api/ecpay/return/route.ts:25` 在驗簽**之前**就回傳 `1|OK`。其他位置包括 `paypal/capture-order:11`、`linepay/confirm:19`、`paypal/return:17`、`stripe/checkout:16`、`ecpay/checkout:24`、`plan-upgrades/[upgradeId]:101`。`NEXT_PUBLIC_*` 會在 build 時被寫死。

**S3 加 S4 的修法**：
- 新增 `lib/paymentMode.ts`：
  ```ts
  export const PAYMENT_MOCK_MODE =
    process.env.NEXT_PUBLIC_PAYMENT_MOCK_MODE === 'true' && process.env.NODE_ENV !== 'production';
  ```
  所有使用處改用它。
- 移除 ECPay 與 `lib/stripe.ts:6`（`|| 'sk_test_placeholder'`）的 fallback。
- 在 `next.config.ts` 的 `REQUIRED_PRODUCTION_SECRETS`（約 `:16`）加入 `ECPAY_HASH_KEY/IV/MERCHANT_ID`、`STRIPE_SECRET_KEY`、`LINEPAY_CHANNEL_SECRET`、`PAYPAL_CLIENT_SECRET`、`CRON_SECRET`。
- 在 `REVOKED_SECRET_VALUES`（約 `:22`）加入這些公開的測試值，讓它們變成 **build 失敗**。
- ⚠️ 這會讓缺少變數的 Amplify build 直接失敗。上線前需要使用者先在 Amplify 設好真實值。

### S5. 匿名寫入 DynamoDB 沒有上限，而且 partition key 由攻擊者決定 **[subagent]** — Sonnet（在 S2 之後）

涉及的路由：`app/api/tracking/{purchase,course-click,scroll-depth,feedback}`、`app/api/agora/{connection-event,connection-log,quality-event}`、`app/api/client-error`。

- `tracking/purchase/route.ts:17-89` 從 body 取 `userId`，每個 tag 寫一筆 BatchWrite，而 tags 沒有上限；還會污染推薦引擎的 `weight: 2.0` 購買訊號。
- `agora/connection-log` 還自己建立 DynamoDBClient。

**修法**：
- tracking 路由改用 `withAuth`，`userId` 取自 `req.session`，不再接受 body 傳入。
- agora 與 client-error 維持匿名，但加上新的 `lib/api/withRateLimit.ts`（組合 `checkRateLimit`、`getClientIp`、`rateLimitResponse`），並限制欄位長度。
- 新增規則 `anonWritePerIp: { scope:'anon-write:ip', limit:60, windowSeconds:60 }`。

### S6. 匿名請求觸發全表 Scan，而且無法被快取 **[subagent]** — Sonnet

- `app/api/teachers/route.ts:9`：沒有 guard、沒有 Limit、沒有分頁。
- `middleware.ts:59-63` 對所有 `/api/*` 設定 `no-store`，連 `app/api/organizations/public/route.ts:31` 的 `max-age=60` 也被蓋掉。
- `questionnaire/match` 也是同樣情況（2 次 Scan）。

**修法**：
- 在 middleware 加上明確的公開 API 前綴例外。**加入之前逐一確認這些路由不會回傳個人資料。**
- `teachers` 加上 `Limit`、`ProjectionExpression` 與分頁。

### S7. 完全沒有安全 header **[subagent；next.config.ts 沒有 headers() 已確認]** — Sonnet

在 `next.config.ts` 新增 `async headers()`。CSP 另外分階段處理，不在這一步。

```ts
{ key: 'X-Content-Type-Options', value: 'nosniff' },
{ key: 'X-Frame-Options', value: 'DENY' },
{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }, // 用 same-origin 會弄壞 Google SSO 與 PayPal popup
{ key: 'X-DNS-Prefetch-Control', value: 'off' },
{ key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(self), usb=(), serial=(), midi=(), interest-cohort=()' }, // 少了 display-capture 會弄壞分享螢幕
// 只在 production 加：Strict-Transport-Security: max-age=63072000; includeSubDomains（先不要 preload）
```

### S8. 公開的註冊頁會對使用者謊報成功 **[已親驗]** — Sonnet

`app/auth/register/page.tsx` 會 POST 到**不存在**的 `/api/auth/register`，然後無條件執行 `setSuccess(true)`。`app/auth/login/page.tsx` 也是同樣情況。這些是舊的 Cognito scaffold；真正的頁面是 `app/login/` 與 `app/login/register/`。

**修法**：
- 刪除 `app/auth/login/`、`app/auth/register/`。
- 在 `next.config.ts` 加 redirect：`/auth/login → /login`、`/auth/register → /login/register`（**先確認真正的註冊頁路徑**）。
- 修正 `docs/JVTutorCorner_使用者手冊.md:115-116`、`docs/page-permissions-matrix.md:84`。
- **保留 `app/auth/verify-email/`**：`app/api/auth/verify-email/route.ts` 有 6 處導向它。

### S9. 衛生項目 — Haiku

- 輪換 `SESSION_SECRET`、`API_HMAC_SECRET`（需要使用者處理）。
- `git rm app/classroom/wait/page.tsx.backup`（這個檔案被 git 追蹤，而且在 `app/` 裡）。

### Phase 1 收尾：建立不變式

新增 `scripts/audit-route-guards.mjs`，寫法參考 `scripts/audit-enterprise-general-test-coverage.mjs`：
- 掃描 `app/api/**/route.ts` 中每個匯出的 HTTP method。
- 每個 method 都必須被 apiGuard 包住，或列在 `PUBLIC_ROUTES` 白名單中**並附上書面理由**；否則 CI 失敗。
- 放在 Phase 1 的最後，把修補後的狀態固定下來。

### Phase 1 之後的重要項目（非阻斷）

- **zod**
  - 4.3.6 版已經存在於 node_modules（是 `eslint-plugin-react-hooks` 的依賴），加到 dependencies 不會新增套件。
  - 建立 `lib/validation/primitives.ts`，例如：`pointsAmount = z.number().int().finite().nonnegative().max(1_000_000)`、`userId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/)`。
  - 建立 `lib/api/withValidation.ts`，**包在 auth wrapper 內層**。
  - 漏洞範例：`app/api/points/route.ts:39,46` 中，`{"amount":1e999}` 會被解析成 `Infinity`，`typeof === 'number'` 與 `>= 0` 兩個檢查都會通過。這支路由已限定 admin，所以屬於權限受限的漏洞。
  - 第一批約 25 支：points、points-escrow、plan-upgrades、orders、四個金流、tracking、agora、client-error、organizations members、licenses、admin。
- **CSRF**
  - 在 `middleware.ts` 中，針對 `/api/*` 的 POST/PUT/PATCH/DELETE，**只在帶有 `session` cookie 時**檢查 Origin（或 Referer）是否在允許清單中。允許清單包括 `NEXT_PUBLIC_BASE_URL` 的 origin、`https://${host}`、`CSRF_ALLOWED_ORIGINS`。
  - webhook 與 HMAC 內部呼叫不帶 cookie，所以會自動豁免。
  - **會寫入資料的 GET 端點**（`linepay/confirm`、`ecpay/client_return`）擋不住，需要改成驗證後交給冪等的 POST 處理。
- **`Access-Control-Allow-Origin: *`**：`ping`（刻意保留）、`speed-test`、`whiteboard/stream`。
- `admin/grant-points` 用 `?secret=` query 傳密鑰（會進 access log），改用 `withAdmin`；`admin/email-verification` 不是 constant-time 比對，也改用 `withAdmin`。
- `app/api/app-integrations/route.ts:68`：第三方憑證以明文存在 DB（GET 已經是 `withAdmin`），改用 KMS 加密。
- `lib/pdfUtils.ts:26` 從 unpkg 載入沒有鎖版本的 pdf.js worker；Monaco 預設走 jsDelivr。改成自架到 `public/`，之後 CSP 才不必放行這些 CDN。
- CSP 分階段：先 report-only（加 `/api/csp-report`）→ 用真實流量修剪 → enforce → 上線後改用 nonce（`app/layout.tsx` 有 inline script）。
- **不要**把 `tenantId` 放進 `SessionPayload`。`orgAccess` 每次請求都從 profile 解析（有 memo），而 session TTL 是 24 小時；放進 session 會讓被移除的成員保有權限最多一天。目前缺的是證明，應該寫 `e2e/cross_tenant_isolation.spec.ts`。
- 已**降級**、不必優先處理：`cron/process-reminders` 在 production 是 fail-closed；`SESSION_SECRET → API_HMAC_SECRET` 的 fallback 風險低，因為 token 仍然需要對應的 DB row。

---

## 8. 待辦：Phase 2 其餘 — 品質防護網

1. **`lib/dynamo.ts` 加上 endpoint 覆寫**（一行，越早做越好）：`...(process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {})`。這會讓 DynamoDB Local 可以用來做 hermetic 測試。
2. **導入 Vitest**（不用 Jest，因為 `jose@^6`、`query-string@^9`、`uuid@^13`、AWS SDK 都是 ESM-only）。
   - devDependencies：`vitest@^3`、`@vitest/coverage-v8@^3`、`vite-tsconfig-paths@^5`。
   - 單元測試檔名用 `*.test.ts`，Playwright 用 `*.spec.ts`（`playwright.config.ts:26`）。
   - `vitest.config.ts`：include `{lib,app,components,scripts,types}/**/*.test.{ts,tsx}`；exclude `e2e/**`、`.claude/**`、`.next/**`、`tmp/**`、`k6/**`、`.agents/**`；coverage 門檻從實測值開始往上 ratchet。
   - `vitest.setup.ts`：預設 `SESSION_SECRET`、`API_HMAC_SECRET`、`APP_ENV=local`。**不要設 `AWS_ACCESS_KEY_ID`**，因為 `lib/pointsEscrow.ts:17-21` 依它切換 Dynamo 與記憶體分支。
   - 腳本：`test:unit`、`test:unit:watch`、`test:unit:coverage`；CI 加 `unit` job。
3. **優先測試的模組**
   - Tier 1（不需要改程式）：
     - `lib/auth/hmac.ts`（`signedPathFromRequest` 必須包含 `url.search`）
     - `lib/recommendationEngine.ts`（沒有 import、沒有 I/O）
     - `lib/trackingUtils.ts`、`lib/surveyTagMap.ts`、`lib/auth/password.ts`、`lib/envConfig.ts`、`lib/identity.ts`
   - Tier 2（用 `vi.mock('@/lib/dynamo')`）：
     - `lib/pointsEscrow.ts`（狀態機，兩個分支都要測）
     - `lib/rateLimit.ts`（視窗邊界、Dynamo 失敗時退回 `memoryIncrement`）
     - `lib/auth/sessionManager.ts`、`lib/pointsStorage.ts`
     - `lib/payments/payableOrder.ts`（他人的訂單必須被拒絕）
     - `lib/plans.ts`（`SESSION_ONLY_PLAN_IDS=['system']` 不可以透過 `normalizePlanId` 取得）
     - `lib/seatAccounting.ts`
     - `lib/s3.ts`（`getS3KeyFromUrl` 的路徑穿越）
   - 暫緩 `lib/workflowEngine.ts`：先寫 characterization test，再抽出 dispatch table。
4. **hermetic `e2e-contract` CI job**（在 build 之後，不帶 AWS）
   - `next start` 之後跑 `e2e/enterprise_general_security_contract.spec.ts` 與 `e2e/server_auth_guards_verification.spec.ts`，加上 `--grep-invert "stays public|API_HMAC_SECRET|LOGIN_BYPASS_SECRET"`。
   - 沒有 AWS 時，500 會讓 `[401,403]` 的斷言失敗，正好證明 guard 在 AWS 呼叫之前就執行。
   - **加進 CI 之前，先在本機確認這組 grep 仍然對得上現行 spec 的標題。**
5. `verify-skills.yml`：只有 `workflow_dispatch` 會觸發，但 `:13,:46,:79` 判斷 `event_name == 'push'`，所以 `update-status` job 永遠不會執行。這個 job 有 `contents: write`，而且會 push 到 main —— 修正前先問使用者要不要恢復它。
6. 9 個 skip 的處理：
   - `e2e/navbar_verification.spec.ts:104,361` 是 `test.skip(true, …)`，而且會先註冊真實使用者 → 刪除。
   - `e2e/b2c_verification.spec.ts` 裡依賴資料的 skip → 等 dev 表的 fixture 準備好再處理。
   - `skip(!BYPASS_SECRET)` 這一類保留。
   - 稽核加上 skip 數量的 ratchet（起始值 9）。
7. 17 個 `react-hooks/set-state-in-effect` 錯誤：在 `reactCompiler: true` 下是真實的無限 render 風險。即時連線程式如果修法不明顯，就用附理由的 disable。
8. `eslint.config.mjs` 中 `lib/**` 的 `no-explicit-any` 豁免，改成「只會縮小的 20 檔白名單」。不要整個打開，否則會瞬間出現 368 個 error。
9. `scripts/**/*.{js,cjs}` 加 override 關閉 `no-require-imports`（約 80 個 error），之後把 `scripts` 納入 `lint:ci`。
10. module matrix 補登 `ai-avatar`、`translate`。
11. 把 30 處自建的 `DynamoDBClient` 收斂到 `ddbDocClient` —— **等 Tier 2 測試寫好之後**才做。
12. 之後可開的 tsconfig 旗標（以下數字是合併前量測的）：
    - 可直接開：`noFallthroughCasesInSwitch`（0 個錯誤）、`noImplicitOverride`（2 個錯誤）。
    - 之後以 lib 為優先：`noUncheckedIndexedAccess`（306）、`exactOptionalPropertyTypes`（103）。
    - 不採用：`noPropertyAccessFromIndexSignature`（1447，幾乎都是 `process.env`）。

---

## 9. 待辦：Phase 3 殘留 stub 與 Phase 4 可觀測性

### Phase 3

- `components/CollaborativeWhiteboard.tsx` **沒有任何 import [已親驗]**。真正使用的白板是 `EnhancedWhiteboard`（`app/classroom/ClientClassroom.tsx:9,3018`），所以刪除它；`components/SimpleWhiteboard.tsx` 同樣處理。刪除前先用 `NEXT_PUBLIC_USE_AGORA_WHITEBOARD=false` 確認 canvas 模式不會用到它。
- `components/NewCourseForm.tsx:65` 的 TODO 是過時的註解（`:103` 已經 POST `/api/courses`），只要刪掉註解。
- **workflow stub 會在學生的請求中執行**：`app/api/enroll/route.ts:155`、`app/api/points/route.ts:88` 都會呼叫 `triggerWorkflow`。
  - 刪除 `app/api/workflows/notebooklm-create`（引擎沒有對應的 actionType）。
  - 刪除 `context7-retrieve`、引擎中的 case（`lib/workflowEngine.ts:802-814`）與範本（`app/workflows/page.tsx:309`）。
  - 刪除 `figma-export`、引擎中的 case（`:861-873`）與範本（`:309`、`:430`）。
  - **實作** `export-file`：引擎送出 `{format, fileName, data}`（`workflowEngine.ts:896`），路由卻要求 `dataField`（`:20`），所以永遠回 400。改成接收 `data`（保留 `dataField` 作為別名）、真正序列化並透過 `lib/s3.ts` 上傳，刪除 `mockData`（`:38-41`）。
  - `internalWorkflowFetch` 的呼叫點（`:807,866,896`）加上 `res.ok` 檢查。
  - 新增 `lib/stubGuard.ts`：production 回 501 並呼叫 `keyLog.critical`，其他環境回 mock 並加上 `__stub: true`。
- 刪除 `lib/providers/rtc/useChimeProvider.ts`，連同 `useRTC.ts` 的 chime 分支；檔頭的成本分析移到 `docs/mvp-cost-analysis-agora-alternatives.md`。
- `app/admin/whiteboard_agora/page.tsx`：`:69` 是 `setTimeout` 後跳出「已儲存」的 alert，`:25-35` 塞了假 log。改為透過 `app/api/admin/settings/route.ts:13-20` 的 `classroom` 設定真正保存，或直接刪除該分頁。
- B2B billing 的 `NOT_IMPLEMENTED` 是誠實的標記，保留。
- 完成後把 `test:audit-module-matrix:strict` 改為阻斷（前提見第 6 節修正 1）。

### Phase 4

- **O1（最先做）[已親驗]**：`lib/keyLogger.ts:189` 把 `sk >= :startSk` 放在 `FilterExpression`，但 `sk` 是 range key，DynamoDB 會丟出 `ValidationException`，被 `:226` 的 catch 吞掉，結果 `/api/admin/key-logs` 永遠回傳空陣列。改放到 `KeyConditionExpression`（與 `#dt = :date` 並列）。同時確認正式帳號有 `jvtutorcorner-key-logs` 表（它由獨立的 `scripts/setup-key-logs-table.ts` 建立，不在 `scripts/lib/schema.mjs` 裡）。
- **O2**：在 apiGuard 加共用的 `invoke()`，用 try/catch 包住 handler，出錯時寫結構化 log、`keyLog.error`、（之後的）Sentry，並回傳帶 correlation id 的通用 500。一次覆蓋所有受保護的路由。由 Opus 負責。
- **O3**：Sentry 負責例外，keyLogger 負責業務事件。**先花半天驗證 `@sentry/nextjs` 與 Next 16、reactCompiler、standalone 是否相容。** 需要手動埋點的地方：`lib/paymentSuccessHandler.ts`、各 webhook、`lib/pointsEscrow.ts`（扣了款卻沒有報名紀錄 → CRITICAL）、`app/api/enroll/route.ts`（`:155` 是 fire-and-forget，沒有 `.catch()`）、login／register、進入教室。
- **O4**：處理 2,210 個 console 呼叫。
  - 不做 codemod。
  - `no-console` 設為 warn，只在 PR diff 範圍內阻斷。
  - 新增沒有外部依賴的 `lib/logger.ts`：輸出單行 JSON，用 `AsyncLocalStorage` 帶 requestId。
  - 只遷移 `lib/` 與 `app/api/**` catch 區塊中約 400 處。
  - **不要**自動把 `console.error` 導進 keyLog，會造成 DynamoDB 成本事故。
- **O5**：`/api/health` 分三層。**不要動 `/api/ping`**：`components/NetworkSpeedMonitor.tsx:39` 在使用它，`e2e/server_auth_guards_verification.spec.ts:188` 也斷言它是公開的。
  - 預設：公開、零 I/O，不洩漏表名、bucket、region。
  - `?deps=1`：公開，data-plane 各呼叫一次（GetItem sentinel、HeadObject），30 秒快取加 single-flight，失敗回 503。
  - `?full=1`：用 `withAdminOrHmac`，跑現有的 `runHealthCheck()`（約 14 次 control-plane 呼叫），60 秒快取。
  - **不要用 `lib/rateLimit.ts` 限流它**（每次都會寫 DynamoDB），改用記憶體 token bucket。
- **O6**：環境變數單一來源。程式用到約 164 個 `process.env` 名稱，`.env.local.example` 只列了 37 個。
  - **已經存在 split-brain [subagent]**：`WHITEBOARD_TABLE`（`lib/whiteboardService.ts:4`、`app/api/whiteboard/room/route.ts:179`、`uuid/route.ts:46`）與 `DYNAMODB_TABLE_WHITEBOARD`（`app/api/classroom/ready/route.ts:5`、`session/route.ts:8`）。
  - 做法：
    - 建立 `scripts/lib/env-manifest.mjs`（仿照 `scripts/lib/schema.mjs`，包含 `aliases`）。
    - 建立 `lib/env.ts` 做驗證。
    - 新建 `instrumentation.ts`，做 runtime 驗證與 Sentry init。
    - 由 manifest 產生 `next.config.ts` 的 `env:` 區塊與 `.env.local.example`。
    - 用 `scripts/verify-env-usage.mjs` 做雙向比對，並加進 CI。
- **O7**：`scripts/lib/schema.mjs` 只宣告了 7 張 B2B 表，但 app 用到約 30 張。
  - 擴充到全部的表（用 `create-dev-tables.mjs` 的 `DescribeTable` 抄錄實際結構）。
  - 刪除零散的建表腳本。
  - `create-dev-tables.mjs` 改成從 schema 建表，並加上 `--verify-against-schema`。
  - **不要寫 `scripts/write-dev-env.mjs`**，改用 `--emit-env` 印到 stdout，並移除 `create-dev-tables.mjs:21,147` 對它的引用。
- **O8**：文件。
  - 新增 `docs/runbooks/{go-live-checklist,rollback,incident-response,backup-restore-dynamodb,oncall}.md` 與 `docs/slo.md`。
  - 根目錄 65 個被追蹤的 `.md` 用 `git mv` 歸檔到 `docs/archive/`，不要刪除。
  - 新增 `scripts/check-doc-placement.mjs` 並加進 CI。
- **O9**：衛生。
  - `large_file.csv`、log、`.pem`、`.env.local.bak` 本來就沒有被 git 追蹤，本機刪除即可。
  - **不要刪 `.env.production`**（`playwright.config.ts:7` 會載入它），也不要刪 `src/`（Amplify 設定）。
  - `dev-https-proxy.js` 被 `package.json` 的 `dev:proxy` 引用。
  - `.gitignore` 的 `*.png/*.txt/*.csv` 全域規則會吞掉 `public/` 裡的新圖片，應該縮小範圍。
  - Python 藥品 API（`main.py` 等）沒有人呼叫；確認 Make／LINE 整合沒有用到之後，把它拆出去。
- **明確延後**：不拆四個巨型檔案。

---

## 10. 本 session 踩過的操作地雷

- **auto mode 分類器會擋下複合的 git 指令**（例如 `git checkout --theirs X && git add X && grep ...`）；拆成單一的簡單指令就能執行。
- Git Bash 的 `/tmp` 對 Windows 原生的 node／eslint 不可見：`npx eslint -o /tmp/x.json` 會寫到別的地方。改成輸出到相對路徑，用完刪除。
- 在 Python heredoc 裡寫 `'\\'` 容易變成未結束的字串，改用 `os.sep`；heredoc 分隔字要加引號（`<<'PY'`），避免 shell 展開。
- **很長、含大量引號的 Markdown 用 Bash heredoc 寫入會失敗**（`unexpected EOF`），改用 Write 工具。
- 合併後如果依賴有變動（例如 `replicate`），要先跑 `npm ci`，否則 tsc 會誤報 TS2307。
- 修正 ignores 之前，`eslint -f json` 的輸出高達 127MB。
- `npm run build` 會印出 `Failed to obtain server version`（Qdrant client 的版本檢查），這沒有影響。
- `.claude/worktrees/` 下有 3 個舊的 Claude worktree（停在 `bd85fe7`）。要量測 baseline 時，用 `git worktree add --detach <scratchpad路徑> <ref>` 建立拋棄式 worktree，用完再 `git worktree remove --force`。
- ESLint 的 `eslint-disable-next-line` 必須緊貼在目標行的上一行。
- 測量類的結論（exit code、錯誤數）一律自己跑，不要沿用 subagent 的數字。

---

## 11. 驗證指令清單（每個 phase 結束時）

```bash
npm ci                                   # 依賴有變動時
npm run typecheck                        # 阻斷：app 與 e2e 皆 0 錯誤
npm run lint:ci                          # 阻斷：lib 與 types 0 個 error、warnings ≤ 109
npm run build                            # 阻斷
npm run check:bundle-secrets             # 阻斷（本機要檢查實際 secrets 時，改用 node --env-file=.env.local scripts/check-bundle-secrets.mjs）
node scripts/audit-enterprise-general-module-matrix.mjs --json   # 比較 blocking 數量（目前 15），不得增加
node scripts/audit-enterprise-general-test-coverage.mjs --strict # 目前 exit 1，屬於既有狀態
```

Phase 1 的每個 S 項目都要有「修正前失敗、修正後通過」的測試：
- 帶 `x-simulation: true` 必須回 401。
- 隨機的 `X-Forwarded-For` 不能重置計數。
- 沒有設定 `ECPAY_HASH_KEY` 時，production build 必須失敗。
- 帶他人 `userId` 呼叫 `tracking/purchase` 不能寫入資料。

完成後，`scripts/audit-route-guards.mjs` 要通過。

上線前還要：在 prod-like 環境跑完整的 Playwright、用真實金流完成一次付費報名與退款、演練一次 rollback，並記錄日期。

---

## 12. 下一步（依序執行）

1. 用 `git status`、`git log --oneline -3` 確認仍在 `integration/b2b-security-merge`，HEAD 是 `4dffce8` 或更新的 commit。如果有其他人的新 commit，先讀懂再動手。
2. 詢問或確認使用者是否要 push／開 PR。**合併到 main 就是正式部署**，需要使用者明確同意。不論答案為何，都可以在同一個分支，或從它切出的新分支繼續做 Phase 1。
3. 開始 Phase 1，建議分 3 條平行進行（檔案不重疊）：
   - α（Opus）：S1 LINE webhook → S3 加 S4 金流 fail-open。
   - β（Sonnet）：S2 client IP（含單元測試）→ S7 安全 header。
   - γ（Sonnet／Haiku）：S8 刪除 scaffold 頁面並加 redirect → S9 衛生項目 → S6。
   - S2 完成之後才做 S5；最後做 `scripts/audit-route-guards.mjs`。
4. 每一項都用第 11 節的指令驗證。只有在使用者要求 commit 時才 commit，commit 訊息結尾加上 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。
5. 如果發現實際情況與本文件不一致，以原始碼為準，並更新本文件的第 6 節。
