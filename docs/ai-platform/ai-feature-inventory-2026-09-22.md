# AI 功能盤點與加強建議(2026-09-22)

> 產出於 `feature/ai-live-teaching-3a`(領先 `main` 24 個 commit,全部未部署)。
> 唯讀盤點 + 加強清單。與規劃書 `architecture-and-cost-plan-2026-09-21.md`、
> `branch-reconciliation.md`、`l1-go-no-go.md` 搭配閱讀。
>
> 一句話結論:AI 基礎設施已相當完整,主要問題不是「沒建」,而是**「建了沒接」或「接了沒守」**。

---

## Part 1 — AI 功能總覽

### A. AI 平台基礎層(`lib/ai/**`)— 已建、部分未生效

| 模組 | 用途 | 狀態 |
|---|---|---|
| `lib/ai/gateway/gateway.ts` `runModel` | 單一計費入口:policy 鏈、每請求成本上限、租戶預算、timeout、retry ≤1、跨供應商 fallback、熔斷、寫 ledger | 接線(lessonAI) |
| `gateway/router.ts` | task→tier→model,env 可覆寫 | `resolvePolicy(task, override)` 的 override 無人傳入 |
| `gateway/providers/*` | GEMINI / OPENAI / ANTHROPIC / OPENROUTER(raw HTTP) | 只有 OpenAI adapter 支援 tool calling;Gemini adapter 丟掉 tools;Anthropic 無 tools/JSON mode |
| `gateway/keys.ts` | 金鑰:`/apps` DynamoDB integrations → env fallback | 接線 |
| `gateway/ledger.ts` | `ai-usage-ledger` + `cost-rollups`(整數 micro-USD、TransactWrite、冪等) | 無 AWS 憑證時靜默退記憶體陣列 |
| `gateway/pricing.ts` | 10 chat + 3 embedding + 音訊單價 | OpenRouter 命名空間 id 查不到 → 用預設價 |
| `lib/ai/entitlements.ts` | 7 層旗標 + tri-state + `locked:off` kill switch,13 個 seed | 回傳的 `limits / maxCostPerRequestMusd / pointCost / modelPolicy` 無消費者 |
| `lib/ai/budget.ts` + `budgetStore.ts` | GLOBAL / TENANT 月預算、hardStop | 只在 `ctx.orgId` 有值時檢查 → B2C 不受 GLOBAL 約束;`dailyCapMusd` 未評估 |
| `featureConfigStore / agentsStore / skillsStore / aiModelsService` | code seed + DB override + 60s cache | 接線 |
| `lib/ai/transcribe.ts` | Gemini 音訊→文字(class summary) | 繞過 gateway |
| `lib/embeddings.ts` / `knowledge-base.ts` / `qdrant.ts` | Gemini embedding、Markdown→Qdrant | `knowledge-base.ts` 零 importer;Qdrant 只被 workflow 用,且維度不符(1536 vs 768) |

後台 UI:`/admin/ai-features`(只有 GLOBAL scope)、`/admin/cost`、`/admin/ai-chat`、`/apps` skills/agents。**無**預算頁、無每人用量頁。

### B. 對話型 AI

| 功能 | 檔案 | 狀態 / 問題 |
|---|---|---|
| 管理後台 AI 聊天室(agent + 7 工具) | `app/api/ai-chat/route.ts`、`lib/platform-{skills,agents}.ts` | 繞過 `runModel`(直連 SDK、事後計費);`promptCache` key 不含 userId → 跨使用者洩漏 + 無上限;ANTHROPIC 回「不支援」 |
| 全站 AI 小幫手 | `components/AIAssistantWidget.tsx` → `app/api/chat/route.ts` | 每則訊息 Scan 整張 courses+teachers 塞進 prompt(成本 + PII) |
| LINE Bot(文字 LLM、圖片 vision) | `app/api/line/webhook/[integrationId]/route.ts` | `x-simulation: true` 可跳過簽章驗證,無環境閘門 |
| AI 翻譯(老師簡介) | `app/api/translate` → `AutoTranslateText.tsx` | 接線 |
| 工作流 AI 節點 | `lib/workflowEngine.ts` | AI 節點內部 HTTP 回打 `/api/ai-chat`(雙跳、無 cookie) |
| ASK_PLAN_AGENT | `lib/platform-agents.ts:14-35` | 只有設定、無執行器(8 檔引用,暫留) |

### C. 直播教學 AI(`lib/lessonAI/**`)— API+UI 已接、AI 事件層未實作

| 功能 | 狀態 |
|---|---|
| Session id、Segmenter、Marker、system events、60s tick | 接線 end-to-end |
| Student Tutor 提示階梯 1→4 | 接線;`prevHintLevel` 來自 client,可反覆停第 1 級 |
| Teacher Copilot | 接線;取「最近 30 筆」實為最舊 30 筆(`lessonStore.ts:105` `ScanIndexForward:true`) |
| Assessment(出題/派發/作答/批改)、Timeline | 接線;但兩頁**無導覽入口** |
| L1 事件偵測 / L2 段落 / L3 課堂 / L4 檔案 | 未實作;只有 `l1Prompt/l1Verdict/wer` + `l1-go-no-go.mjs`;無 Lambda;錄音不進 lesson-events |
| 錄音 + 課後摘要(STT→逐字稿→JSON) | 接線;`presign/consent` 不檢查 `CLASS_SUMMARY_ENABLED`;同意文案為 placeholder;`GET /api/class-summaries` 無 UI |

### D. 產品端 AI / 資料層

| 功能 | 狀態 |
|---|---|
| 推薦引擎(規則式:tag 累積+時間衰減+MMR+10 槽位) | 候選池是 bundled 5 筆靜態課程,非 DynamoDB → 首頁只顯示 3 筆、槽位邏輯無用;popularity 是 `seatsLeft` placeholder |
| 行為追蹤(click/purchase/like/dislike/scroll) | 後端有、前端從未呼叫(`trackingUtils.ts` 零 importer);4 route 未驗證、userId 取自 body;同批多 tag 的 interactionId 相同 → BatchWrite 整批失敗 |
| 問卷 / seeds(lite/full/8 步 + Make.com) | 接線;`ENABLE_ONBOARDING_QUESTIONNAIRE` 與 `showRecommendations` 預設皆關;註冊合併 guest seeds 未實作 |
| 學習內容影像分析、image-analysis、scan-product | 接線 |
| ONNX 商品偵測 `lib/detection.ts` | 死碼(零 importer、模型不存在、回 mock) |
| 每日報告 | Gemini 直連;「新聞搜尋」無 grounding → 易幻覺 |
| AI 數位人(Replicate TTS→lipsync) | admin 原型;在權益/點數/ledger 之外 |
| AI Media 引擎(reserve/settle、gpu-jobs、sweeper) | 引擎完整,只有 stub provider、無 UI;RunPod webhook 回 501 |
| 風險分析 / 老師審核 / 稽核 / Email / SEO / 白板 / 課程建立 | 皆無 AI(課程描述/tag 無 AI 生成) |

### E. 未部署 / 環境面
- 24 commit 未進 main;AI 表已在 `schema.mjs` + `next.config.ts` env,prod 尚未建表;Amplify SSR 無 AWS 憑證 → 部署後 DynamoDB 呼叫仍失敗。
- `app/api/shared/ai-models{,/sync}` 無任何 auth,零程式引用(正版是有守門的 `app/api/admin/ai-models`)。

---

## Part 2 — 可加強之處(依優先序)

### 第 1 層:安全 / 成本敞口
1. 刪除無守門的 `app/api/shared/ai-models{,/sync}`。
2. `/api/tracking/*` 加 `withAuth`、userId 取 session、修 interactionId 碰撞。
3. `ai-chat` promptCache 加 userId 進 key + 容量上限。
4. LINE webhook `x-simulation` 加環境閘門(比照 `apiGuard.ts` 的 e2e bypass)。
5. (後續)`GET /api/recommendations?userId=` 未驗證;`/api/cron/class-summaries` 非 prod 無 `CRON_SECRET` 可匿名觸發。

### 第 2 層:讓已建的治理機制生效
6. 權益輸出接進 gateway:`modelPolicy` → override、`maxCostPerRequestMusd` → `policy.maxCostMusd`、`limits` → rollup `requests` 計數強制。
7. 預算:永遠檢查 GLOBAL;評估 `dailyCapMusd`(新增 `yyyymmdd` rollup key)。
8. ledger 寫入失敗 `console.error` + 回 `metered:false`;記憶體 fallback 警告一次。
9. pricing 對 OpenRouter id 正規化。
10. Copilot 取**最新** 30 筆事件。
11. Tutor 提示階梯改伺服端追蹤(以 lesson event 存狀態)。
12. (後續)`ai-chat`/`chat`/`transcribe`/`dailyReport` 遷入 `runModel`(先補 Gemini adapter tools)。
13. (後續)`/api/chat` 以檢索取代整表塞 prompt(重用 `embeddings.ts` + `course-knowledge`)。

### 第 3 層:推薦系統接線
14. 候選池改 `listPublishedCourses()`;popularity 改用 `seatsOccupied`。
15. 行為訊號真正產生:購買在 `paymentSuccessHandler.ts` 伺服端寫入;點擊在 `CourseCard` onClick(登入才送);刪 `TrackingBatcher`。
16. (後續)`user-interactions` 登記進 `schema.mjs`;推薦/問卷旗標預設值(產品決策);課程建立 AI 自動產 tag。

### 第 4 層:缺失功能(需使用者決策 / 付費 / prod)
17. L1 go/no-go 真實錄音 + `--go` 付費呼叫。
18. L1–L4 Lambda、Timeline AI 章節、學生視角、Learning Profile。
19. Timeline / Assessments / 課後摘要的產品導覽入口。
20. AI Media RunPod adapter + UI;Replicate 數位人納入權益/點數。
21. 後台預算頁、每人用量頁、`/admin/ai-features` 支援 TENANT/PLAN/TEACHER scope。
22. prod 建 AI 表、Amplify computeRoleArn。
23. 清死碼 `detection.ts`、`knowledge-base.ts`。

---

## 已實作(第一批,本次 session)
見 commit `Commit 1–4`:安全敞口(A1–A4)、Gateway 正確性(B3/B4/B5)、
治理生效(B1/B2/B6)、推薦接線 + 死碼(C1/C2/D)。詳見計畫檔與各 commit 訊息。
