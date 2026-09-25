# LINE AI Chat — 五層架構、AI 分層策略與 TCO 成本規劃

> 版本：2026-09-25 ｜ 交付物：本文件 + `line-ai-chat-cost-model.xlsx`（同目錄，Inputs 驅動全公式）
> 相關文件：[`architecture-and-cost-plan-2026-09-21.md`](./architecture-and-cost-plan-2026-09-21.md)（平台總體規劃）、[`ai-feature-inventory-2026-09-22.md`](./ai-feature-inventory-2026-09-22.md)（AI 功能盤點）
> 定位：**純規劃交付**。本文件不改動任何功能程式碼、不部署、不呼叫付費 API。所有 file:line 引用皆已於 2026-09-25 對 `feature/ai-live-teaching-3a`（HEAD `c6b9227`）逐一開檔驗證。

---

## Context

系統為 LINE 官方帳號 AI Chat。使用者可能傳送：圖文選單點擊、Postback、文字訊息、FAQ、一般問題、複雜問題、圖片、真人客服需求。Webhook 建立於現有的 Next.js（App Router）+ Node.js，部署在 AWS Amplify SSR + DynamoDB。

**目標**：不讓每一則 LINE 訊息都呼叫大型 LLM，透過分層處理降低 AI 成本。核心原則——越前面的處理越便宜，越後面的 AI 才使用較高成本資源。

**前提（使用者指定）**
- 目前月訊息量 **< 1,000 則**，存在大量閒置時間。
- 從零評估，**完全不考慮既有硬體**；不因「本機模型 API token 成本為 0」就認定本機長期較便宜——必須把資本支出、電費、維護、折舊、升級、閒置納入 TCO。
- 低流量優先低前期成本與 Pay-as-you-go；**不為尚未存在的流量提前買 GPU**。
- Local AI 與 RunPod 必須保留為**未來可插拔**的成本最佳化方案。
- 部署基底沿用 Amplify + DynamoDB，本規劃只計算 AI 分層與向量搜尋的**增量成本**。

**設計原則（本規劃的兩條硬規矩）**
1. 每一層都要有兩個可量測指標：**命中率**（該層解決掉多少比例的訊息）與**單則成本**。分層的價值 = 把昂貴的 L4/L5 命中率壓低。
2. 成本要算**累積成本**：一則走到 L5 的訊息，已經先付了 L1+L2+L3+L4。單看「L5 每則多少錢」會低估，必須用 `blended = Σ 命中率 × 累積成本`。

---

## 1. 現況盤點

### 1.1 可直接沿用（不必重造）

| 能力 | 位置 | 說明 |
|---|---|---|
| AI Gateway | [`lib/ai/gateway/gateway.ts:102`](../../lib/ai/gateway/gateway.ts) `runModel` | 單一進入點：per-request 成本上限 → GLOBAL/租戶預算 → 模型鏈 fallback + circuit breaker → `recordUsage` micro-USD 帳本。`runWithIntegration`(:197) 是單模型無 fallback 版本，LINE 現用這條 |
| Task Router | [`lib/ai/gateway/router.ts:68`](../../lib/ai/gateway/router.ts) `TASK_SPECS` | tier `low/mid/high/vision/embedding`；`chat_fast`/`chat`/`chat_complex` 可直接對應 L4/L5；env `AI_TIER_<TIER>_MODEL`(:36) 可覆寫模型 |
| 定價 / 帳本 / 預算 | [`lib/ai/gateway/pricing.ts`](../../lib/ai/gateway/pricing.ts)、[`ledger.ts`](../../lib/ai/gateway/ledger.ts) `recordUsage`、[`lib/ai/budget.ts`](../../lib/ai/budget.ts)、[`lib/ai/limits.ts`](../../lib/ai/limits.ts) | 全部 micro-USD；帳本表 `ai-usage-ledger` / `cost-rollups`，含日/月 rollup key；預算 GLOBAL + 租戶、日/月上限 |
| 泛用 Provider adapter | [`gateway/providers/openai.ts:20`](../../lib/ai/gateway/providers/openai.ts)；[`types.ts:64`](../../lib/ai/gateway/types.ts) `baseUrl` | OpenAI-compatible，可帶 `baseUrl` → **Ollama / vLLM / RunPod vLLM endpoint 都能以 OPENAI 或 OPENROUTER + baseUrl 插入，不需新 provider 型別** |
| 向量層 | [`lib/qdrant.ts`](../../lib/qdrant.ts)、[`lib/embeddings.ts:7`](../../lib/embeddings.ts)、[`app/api/workflows/qdrant-knowledge-base/route.ts`](../../app/api/workflows/qdrant-knowledge-base/route.ts) | Qdrant client（cosine）已存在；embeddings 目前零 importer |
| LINE 設定儲存 | `jvtutorcorner-integrations` 表（[`lib/integrations/store.ts`](../../lib/integrations/store.ts)） | config 含 `channelSecret`/`channelAccessToken`/`linkedServiceId`；webhook URL `/api/line/webhook/<integrationId>` |
| 使用者綁定 | [`lib/profilesService.ts:58`](../../lib/profilesService.ts) `findProfileByLineUid` + `LineUidIndex` GSI | LINE Login 已獨立存在（`app/api/auth/line-login/*`） |

### 1.2 現況缺口（本規劃的 Phase 0 就是修這些）

現有 webhook [`app/api/line/webhook/[integrationId]/route.ts`](../../app/api/line/webhook/[integrationId]/route.ts)：

- **L1 不存在**：事件迴圈(:430-440) 只處理 `message`/`postback`，但 **postback `data` 從不解析**；沒有 `customScript` 時 postback 直接落到「請綁定帳號」文案(:849-857)。無 rich menu、Flex、quick reply。
- **每則都是 L5 級成本**：文字訊息(:478-498) 直送 `runWithIntegration`，模型釘死在 `LINE_TEXT_MODEL`(:318) 的 `gemini-2.5-flash` / `gpt-4-turbo` / `claude-3-5-sonnet`，`maxTokens 4096`，**無 system prompt、無對話歷史、無 FAQ、無快取，ctx 也不帶 userId**。
- **安全**：簽章比對用 `!==`(:416-421)（非 timing-safe）且失敗時把期望 hash 寫進 log；無 `webhookEventId` 去重（LINE redelivery 會重送同一事件、reply token 會保留）。部分路徑對同一 replyToken 呼叫 reply 多次（LINE 只接受一次）。
- **設定黑洞**：`customScript` 讀 `appInfo.config.customScript`，但新 store 把它存在紀錄頂層（[`store.ts:36`](../../lib/integrations/store.ts)）→ 新 UI 存的腳本不會執行；`scriptEnabled` 被忽略。webhook 也從未呼叫 workflowEngine，`trigger_line_webhook` 只存在 UI。
- **效能**：webhook 內 `findProfileByLineUid`(:187) 是**全表 scan**，未用 `LineUidIndex`。

其他缺口：
- **無 FAQ 表、無規則表、無 intent 分類**。可借用的邏輯：[`lib/platform-agents.ts`](../../lib/platform-agents.ts) 的 keyword 打分（`searchAgentsByKeyword`/`quickDispatch`）、[`lib/smartRouterService.ts:15`](../../lib/smartRouterService.ts) 的複雜度啟發式。
- **向量維度不一致**：[`qdrant-knowledge-base/route.ts:72`](../../app/api/workflows/qdrant-knowledge-base/route.ts) 用 `embedding-001`（768 維）但 collection 預設 `vectorSize 1536`(:39, [`workflowEngine.ts:784`](../../lib/workflowEngine.ts)) → upsert 會失敗；`lib/embeddings.ts` 又用另一顆 `gemini-embedding-2-preview`。**L3 落地前必須先統一 embedding 模型與維度**。
- **無 AI 回應快取**：唯一的快取是 [`app/api/ai-chat/route.ts:93`](../../app/api/ai-chat/route.ts) 的行程內 exact-match Map（10 分鐘、200 筆），LINE 沒有。
- **本機模型 / Ollama / vLLM**：repo 零命中；RunPod 只有 501 stub（[`app/api/webhooks/runpod/route.ts:20`](../../app/api/webhooks/runpod/route.ts)）。

### 1.3 前置依賴（非本規劃範圍，但會阻塞上線）

- Amplify SSR 目前**無 AWS 憑證**，部署後所有 DynamoDB 呼叫仍會失敗；AI 相關表在 prod 尚未建；24+ commit 未進 `main`。這些屬於平台部署議題，見 [`ai-feature-inventory-2026-09-22.md`](./ai-feature-inventory-2026-09-22.md) §E，須先解決才談得上把 LINE AI 上 prod。

---

## 2. 五層目標架構

```text
                         LINE Platform
                              │  (webhook POST)
                              ▼
        ┌──────────────────────────────────────────────┐
   L0   │ Webhook 邊界：timing-safe 簽章 → webhookEventId │
        │ 去重 → 解析事件 → 60s reply token 計時          │
        └──────────────────────────────────────────────┘
                              ▼
   L1   Postback / 圖文選單  ── 命中 ─▶ 查表固定回覆（0 AI）
                              │ 未命中
                              ▼
   L2   Keyword / Regex / Rule ─ 命中 ─▶ 固定答案 / Flex（0 AI）
                              │ 未命中
                              ▼
   L3   Semantic FAQ 向量搜尋 ─ 相似度≥高門檻 ─▶ FAQ 答案（1 次 embedding）
                              │ 中門檻：帶 RAG 進 L4；低門檻：不帶
                              ▼
   L4   Cheap LLM (RAG)      ─ confidence 高 ─▶ 回覆（小模型）
                              │ needs_escalation
                              ▼
   L5   Advanced / Fallback  ── 圖片 vision / 高階模型 / 真人客服轉接
                              ▼
                         LINE 回覆（reply；逾時走 push）
```

每層規格：

| 層 | 輸入 | 判斷 / 逃逸條件 | 輸出 | 超時 | 每則成本 |
|---|---|---|---|---|---|
| **L0** Webhook | LINE POST rawBody | 簽章不符 → 401；重複 `webhookEventId` → 200 略過 | 標準化事件 | — | ~2.8 µ$（見 §7） |
| **L1** Postback | `postback.data` = `action=<key>&...` | 查 `line-rules`（type=postback）命中 | 固定文字 / Flex / 下一步選單 | 同步 | 併入 L1 |
| **L2** Rule | 訊息文字 | 依優先序試正則 / 關鍵字；命中即停 | 固定答案 / Flex | 同步 | 0（同 request 內） |
| **L3** Semantic | 訊息文字 | 1 次 embedding → 向量查 FAQ；`sim ≥ 0.82` 直接回、`0.70–0.82` 帶 RAG 進 L4、`< 0.70` 不帶 | FAQ 答案 或 RAG context | ~500ms | ~8 µ$ |
| **L4** Cheap LLM | 訊息 + RAG + last-N 歷史 | 小模型輸出 `{answer, confidence, needs_escalation}`；confidence 低或 escalation → L5 | 回覆文字 | 3s（`chat_fast`） | ~788 µ$ |
| **L5** Advanced | 訊息 / 圖片 / 升級請求 | 高階模型或 vision；偵測到真人需求 → 寫 `line-handoff` + 靜音 bot | 回覆 / 轉接通知 | 6–14s | ~4,563 µ$ |

**L0 Webhook 邊界（修 §1.2 缺口）**
- 簽章改 `crypto.timingSafeEqual`；失敗時不 log 期望 hash。
- **冪等**：對 `webhookEventId` 用 DynamoDB 條件寫入（`attribute_not_exists`）到 `line-webhook-dedupe`（TTL 1 天）；已存在則回 200 不重跑。這是必要的，因為 LINE 在收到非 2xx 前會重送同一事件，且**保留原 reply token**。
- **Reply token 時限**：LINE 文件標示 reply token 有時效（約 1 分鐘，**以官方文件為準**），且一個 token 只能 reply 一次。慢路徑（L4/L5 逾時）改為「先用 reply 回覆一則佔位/loading，再用 push 補正式答案」——**注意 push 會計入 LINE 方案配額**（見 §12），reply 則免費。

**L1 Postback / 圖文選單（0 AI）**
- 圖文選單每個區塊綁 `postback` action，`data` 用 `action=<key>` 格式。webhook 解析 `data` → 查 `line-rules`（type=`postback`）→ 回固定內容或進入下一層選單。
- 這是 LINE Bot 最便宜也最可控的一層；常見意圖（課程查詢、聯絡方式、營業時間）應盡量收斂到這裡。

**L2 Keyword / Regex / Rule（0 AI）**
- 後台可維護的規則表 `line-rules`（type=`keyword`）：欄位 `priority`、`pattern`（正則或關鍵字）、`response`（固定文字 / Flex JSON）、`enabledFrom/To`（生效區間）。
- 在同一個 webhook request 內執行，無外部呼叫 → 增量成本 0。可借用 `platform-agents` 的 keyword 打分把「像 FAQ」的訊息導向 L3、把明顯閒聊導向 L5。

**L3 Semantic Search（FAQ 向量）**
- FAQ 條目（問+答）先離線向量化存入 `line-faq`。進線訊息做 1 次 embedding → 相似度比對。
- **向量儲存三選一**（見 §8 成本對比）：
  1. **DynamoDB 暴力 cosine**（預設）：FAQ < 2,000 條時，把向量存 `line-faq`，query 時撈全部在記憶體算 cosine。**零額外基礎設施、零月費**，延遲可接受。
  2. Qdrant Cloud free（1 GB / ~100k 向量）：程式已接 `lib/qdrant.ts`，但需先修維度問題與部署 Qdrant。
  3. Upstash Vector free（150k queries/日）：serverless，另一個外部相依。
- **embedding 統一**：採 `text-embedding-3-small`（$0.02/M，最省）或 `gemini-embedding-001`（$0.15/M）；維度寫進 Inputs，L3 上線前把 `qdrant-knowledge-base` 與 `embeddings.ts` 的模型/維度對齊。

**L4 Cheap LLM（RAG + 小模型）**
- 主模型 Gemini 3.1 Flash-Lite（$0.25/$1.50），備援 GPT-5.4 nano（$0.20/$1.25）——透過 router `chat_fast` 的 primary/fallback。
- system prompt 明確限定品牌範圍與「不知道就轉人工」；輸出 JSON `{answer, confidence, needs_escalation}`。
- 帶 last-N 對話歷史（`line-conversations`）+ L3 的 RAG context。加 exact + semantic 快取，重複問題不重打。

**L5 Advanced / Fallback + 真人客服**
- 高階模型（Claude Haiku 4.5 / Gemini Flash / Sonnet 級）處理複雜問題；圖片走 vision（沿用現有 `LEARNING_CONTENT_ANALYSIS_PROMPT` 派發）。
- **真人轉接**：LINE 官方帳號可設「聊天 + Webhook 並存」，並用「回應時間 / 非回應時間」切換自動與真人。偵測到真人需求（關鍵字、L4 標記 escalation、或連續低 confidence）→ 寫 `line-handoff`（狀態、指派、逾時）+ 通知客服（email / Make.com `triggerMakeComEvent`）→ **bot 對該使用者靜音 N 小時**，避免與真人搶答。

---

## 3. 可插拔介面（讓本機 / RunPod 是「換 provider」而非「改架構」）

三個介面把成本最佳化點與架構解耦：

- **`LlmProvider`** = 現有 gateway adapter + `baseUrl`。切到本機只需設 `AI_TIER_LOW_PROVIDER=OPENAI` + `AI_TIER_LOW_MODEL=<local>` + provider baseUrl 指向 Ollama / vLLM / RunPod endpoint。**架構不動**。（註：`ProviderName` 目前只有 4 值，若要在 router 明確分流本機流量，可加一個 `LOCAL` 名稱指到同一泛用 adapter。）
- **`VectorStore`**：`upsert(id, vec, meta)` / `query(vec, topK)`。實作 DynamoDB 暴力法 / Qdrant / Upstash 三選一，L3 只依賴介面。
- **`RuleStore`**：L1/L2 的規則與 FAQ CRUD，後台維護，與比對邏輯分離。

原則：**本機 AI 與 RunPod 是 `LlmProvider` 的實作，用 env + feature flag 切換，永遠不進主流程的 if/else**。

---

## 4. 部署方式

- **Webhook 留在 Amplify SSR**：現有路由即入口，低流量下不需要獨立服務。
- **為何低流量不上 Lambda/SQS**：< 1,000 則/月幾乎全在免費額度內，額外的 Lambda + 佇列只增加運維面與冷啟，不省錢。既有 CloudFormation 模板（`cloudformation/lambda-*.yml`）可在需要時啟用，不必現在建。
- **逾時策略**：Amplify SSR 對外有請求時限，L5 高階模型可能超過 reply token 視窗 → 用 §2 的「先 reply 佔位、再 push」。
- **何時該拆**：月訊息量 > 100k，或 L5 p95 延遲 > 20s，或需要把 L1/L2 與 LLM 呼叫分流到不同資源時，再把慢路徑抽到背景 worker（S3 event + DynamoDB Streams，SQS 只做 DLQ——與平台既有決策一致）。

---

## 5. 資料模型（DynamoDB，`jvtutorcorner-` 前綴）

| 表 | 鍵 | 用途 | TTL |
|---|---|---|---|
| `line-rules` | PK `integrationId` / SK `type#priority#id` | L1 postback 對照、L2 keyword/regex 規則 | — |
| `line-faq` | PK `integrationId` / SK `faqId`（含 `embedding` 欄） | L3 向量與 FAQ 答案；DynamoDB 暴力法時向量也存這 | — |
| `line-conversations` | PK `lineUid` / SK `ts` | L4 對話歷史 last-N | 30 天 |
| `line-webhook-dedupe` | PK `webhookEventId` | L0 冪等去重 | 1 天 |
| `line-handoff` | PK `lineUid` / SK `ts` | L5 真人轉接狀態、靜音到期 | — |

新表在**實作階段**才納入 [`scripts/lib/schema.mjs`](../../scripts/lib/schema.mjs) 的 `STEP_KEYS` + `setup-db --only=`（逐次徵得同意，不在本規劃執行）。計費沿用 `ai-usage-ledger` / `cost-rollups`，`feature` 維度用 `line-l3` / `line-l4` / `line-l5` 分開記，方便 3 個月後用真實 rollup 回填命中率。

---

## 6. 觀測與治理

- **每層指標**：命中率、逃逸率（進到下一層的比例）、單則成本、p95 延遲。逃逸率上升 = 規則/FAQ 覆蓋不足，應補 L1/L2/L3 而非放任打 L5。
- **預算護欄**：`lib/ai/budget.ts` 的 GLOBAL `monthlyCap` 先設 **US$50**（約現況 1,000 則的 100 倍餘裕）、`dailyCap` **US$5**；超額 `hardStop` 直接擋在呼叫 provider 之前（既有機制）。
- **回填**：ledger 的 `feature = line-l3/l4/l5` 累積三個月後，用真實 rollup 取代 §7 的假設命中率，重算試算表。

---

## 7. TCO 成本模型

> 完整可調試算表見 `line-ai-chat-cost-model.xlsx`（Inputs 分頁驅動全表）。以下數字為**預設假設**下、由 Python 鏡射公式與 openpyxl 產出的一致結果。單位 µ$ = micro-USD（對齊 ledger）。FX = 32。

### 7.1 每則訊息成本（增量 inc、累積 cum、blended）

| 層 | inc µ$（該層新增） | cum µ$（到此累積） | 預設命中率 | 貢獻 µ$ |
|---|---|---|---|---|
| L1 Postback | 2.8（2 WRU + 1 RRU + Lambda 150ms） | 2.8 | 30% | 0.8 |
| L2 Rule | 0 | 2.8 | 25% | 0.7 |
| L3 Semantic | 8.0（60 emb tok + 向量查 + ledger 4 寫 + 500ms） | 10.8 | 20% | 2.2 |
| L4 Cheap LLM | 787.5（in 1,960 / out 180 @ $0.25/$1.50 + ledger + 3s） | 798.3 | 20% | 159.7 |
| L5 Advanced | 4,562.5（in 2,760 / out 350 @ $1/$5 + ledger + 6s） | 5,360.8 | 5% | 268.1 |
| **blended** | | | 100% | **431.4 µ$ ≈ NT$0.0138 / 則** |

**三個要看懂的結論**
1. **LLM 佔 blended ≈ 96%**（L4+L5 的 token 費 415.5 µ$），其中**只佔 5% 流量的 L5 就吃掉 62% 的 blended 成本**。→ 降成本最大的槓桿是**壓低 L5 命中率**（把複雜問題盡量在 L1–L4 解掉），其次才是換 L4 模型。
2. **L1–L3 幾乎免費**（合計 < 12 µ$）。分層的意義**不是**省 L1–L3 的錢，而是**把 L4/L5 的比例壓下來**。
3. 每則 NT$0.0138。方案 A（純雲）月費：

| 月訊息量 | A 月費 US$ | ≈ NT$ |
|---|---|---|
| 1,000（現況上限） | **0.43** | 14 |
| 10,000 | 4.31 | 138 |
| 100,000 | 43.14 | 1,380 |
| 1,000,000 | 431.42 | 13,805 |

現況 < 1,000 則 = **每月不到半塊美金**。任何自建/RunPod 方案在此流量都是浪費。

### 7.2 方案 B — RunPod Serverless 取代 L4

公式：`N4 = msgs × (hit4+hit5)`（到達 L4 的請求，L5 也先過 L4）；`λ = N4/(30×86400)`；`p_cold = EXP(−λ × idle_timeout)`；`每請求 = [t_active + p_cold×(t_cold+idle_timeout)] × $/s`。flex 與 always-on worker 並列取 MIN。預設 24 GB flex $0.69/hr、t_active 2.5s、t_cold 25s、idle 5s、always-on 折扣 30%。

**B/C 只把 L4 LLM 搬走，L1–L3 與 L5 仍在雲端**，所以誠實的比較是 `B 總成本 = A 總成本 − 雲端 L4 LLM(N4×unit_A4) + RunPod 費`：

| 月訊息量 | N4 | p_cold | RunPod 替代費 US$ | **B 總成本 US$** | A 總成本 US$ | 勝方 |
|---|---|---|---|---|---|---|
| 1,000 | 250 | 1.00 | 1.56 | 1.80 | 0.43 | **A** |
| 10,000 | 2,500 | 1.00 | 15.50 | 17.92 | 4.31 | **A** |
| 100,000 | 25,000 | 0.95 | 148.96 | 173.10 | 43.14 | **A** |
| 1,000,000 | 250,000 | 0.62 | 352.59 | 594.01 | 431.42 | **A** |

**結論：以 Flash-Lite 級的雲端價格，RunPod 在任何列出的流量都不贏 A。** 理論下限（100% warm、無 idle tail）= 2.5s × $0.000192 = $0.00048/req，只比雲端 unit_A4 $0.00076 便宜 37%；一旦有冷啟就被推到 5–8 倍貴。B 只在 L4 被迫升到 mini/Haiku 級（見 §7.4）才有機會。
隱藏成本（未計入表格、但必須知道）：冷啟 25s 期間 LINE 使用者無回應（需先 reply 佔位再 push，push 吃配額）；模型鏡像下載/儲存費；RunPod 無 SLA。

### 7.3 方案 C — 自建 RTX 5090 級主機取代 L4

固定成本（NT$/月）：

| 項目 | 公式 | NT$/月 |
|---|---|---|
| 設備折舊 | 245,000 / (3×12) | 6,806 |
| 待機電費 | 90W × 730h × 4.5 | 296 |
| **維護工時** | **4 hr × 1,200** | **4,800** |
| UPS / 備援折舊 | 6,000 / 36 | 167 |
| 故障 / 升級準備金 | 245,000 × 10%/12 | 2,042 |
| **固定合計** | | **14,110 ≈ US$440.92/月** |

| 月訊息量 | 單卡利用率 | C 替代費 US$ | **C 總成本 US$** | A US$ | 勝方 |
|---|---|---|---|---|---|
| 1,000 | 0.0% | 440.9 | 441.2 | 0.43 | **A** |
| 100,000 | 2.4% | 442.1 | 466.3 | 43.14 | **A** |
| 1,000,000 | 23.8% | 452.8 | 694.2 | 431.42 | **A** |

**維護工時佔固定成本 34%，是最大單項**（比折舊以外全部都大）；試算表把「工時單價」列為可調 knob，並註明**設 0 就是自欺**。
**可用性 caveat（必讀）**：單機無 HA、家用電/網路中斷不在 UPS 涵蓋、3 年折舊期內 GPU 跌價不退錢。故障期間所有 L4 流量必須 fallback 到雲端 → 程式要同時維護兩條 provider 路徑（gateway 的 provider 抽象是唯一讓 C 可行的前提）。電價改採商業尖峰 NT$9.39/kWh 對 C 的影響 < 3%（因負載電費佔比極小）。

### 7.4 損益兩平與敏感度

閉式解（不需 goal seek，方便 Python 鏡射驗證）：

| 比較 | 損益兩平 L4 請求/月 | ≈ 月訊息量 | 備註 |
|---|---|---|---|
| **C 勝 A** | 618,721 | **≈ 2,475,000** | 此時單卡利用率 ≈ 59% |
| **B(always-on) 勝 A** | 463,934 | **≈ 1,856,000** | B flex 模式**永遠不勝** |

也就是說：**要到每月約 250 萬則訊息，自建 GPU 才開始比純雲便宜；現況是那個數字的 2,500 分之一。**

會翻盤的 knobs（Sensitivity 分頁）：

| Knob | 變動 | 對結果的影響 |
|---|---|---|
| **L4 模型等級** | Flash-Lite → mini / Haiku | C 勝 A 降到 **~790k / ~627k 則/月**；blended 升到 811 / 956 µ$ |
| L4 模型 → GPT-5.4 nano | 更便宜 | blended 降到 396 µ$；C 勝 A 推到 ~310 萬則 |
| L5 命中率 5% → 10% | L4 吸收差額 | blended **431 → 660 µ$**（+53%）——再次證明 L5 是主槓桿 |
| L4 tokens/則 ×2 | RAG chunk / 歷史加長 | C 勝 A 門檻減半 |
| 維護工時 4h → 0 | 自欺情境 | C 勝 A 降到 ~163 萬則 |
| 電價 4.5 → 9.39 | 尖峰 | C 幾乎不動（< 3%） |
| L5 prompt cache 命中 50% | 90% 折扣 | blended 431 → 369 µ$（−14%） |

命中率組合對 blended 的影響（µ$/則）：**預設 431 ／ 平均各 20% 為 1,235 ／ 悲觀（規則層弱）1,394 ／ 樂觀（規則層強）175**。→ **把訊息趕進 L1/L2 的價值，遠大於在 L4/L5 換模型。**

### 7.5 決策門檻（寫死進治理）

1. **留在方案 A（純雲）**：直到月訊息量 > **500k** 或 AI 月費**連續 3 個月 > US$200**。現況 < 1k = US$0.43/月，別碰 B/C。
2. **重新評估 B（RunPod active worker）**：當 L4+L5 請求 > **5,000/日（≈150k/月）** 且雲端 L4 單價 ≥ US$0.002/req（品質要求已迫使 L4 升到 mini/Haiku 級），或需要 API 沒有的模型（微調、私有資料）。**B flex 不作為成本選項，只作為「零 CAPEX 試跑本地模型品質」的實驗環境。**
3. **只有以下三條同時成立才考慮 C**：(a) 預估單卡持續利用率 > 30%（≈1.3M 則/月）；(b) gateway 的雲端 fallback 路徑已上線並演練過故障切換；(c) 有人真的承擔每月維護工時。任一不成立就留在 B。
4. **合規例外**：資料落地 / 隱私法遵要求可直接跳 C，但要標明這是**合規成本，不是省錢**。

---

## 8. Roadmap（每階段可獨立交付、可獨立回退）

| 階段 | 範圍 | 驗收 / 成本門檻 |
|---|---|---|
| **Phase 0** 修 webhook + L1/L2（0 AI） | timing-safe 簽章、`webhookEventId` 去重、解析 postback、`line-rules` + 後台 CRUD、rich menu、修 `findProfileByLineUid` 用 GSI | L1+L2 命中率可量測；此階段 AI 成本 = 0 |
| **Phase 1** L3 FAQ 向量 | 統一 embedding 模型/維度、`line-faq`、DynamoDB 暴力 cosine、相似度門檻 | L3 命中率 > 15%；每則 < 15 µ$ |
| **Phase 2** L4 + 治理 | `chat_fast` 小模型 + RAG + last-N 歷史、JSON confidence、exact/semantic 快取、GLOBAL 預算護欄、ledger `line-l4` | blended 對齊試算表；日費在 dailyCap 內 |
| **Phase 3** L5 + 真人轉接 | 高階模型、vision、`line-handoff`、Make.com/email 通知、bot 靜音 | L5 命中率 < 8%；p95 < 20s |
| **Phase 4** 可插拔評估 gate | 用 §7.5 門檻決定是否 RunPod 試跑 → 本機；先只做 provider 接線與影子流量，不轉正式流量 | 僅在門檻達標時啟動；預設不做 |

---

## 9. 風險與緩解

| 風險 | 緩解 |
|---|---|
| **模型退役**：Gemini 2.5 Flash-Lite 2026-10-16~20 退役 | L4 預設直接用接替的 Gemini 3.1 Flash-Lite；router 靠 env 覆寫，換模型不改碼；試算表模型單價為 Inputs 可調 |
| **Reply token 逾時 / 重用** | L0 冪等去重 + 「先 reply 佔位再 push」；每 token 只 reply 一次 |
| **幻覺 / 範圍外回答** | L4/L5 system prompt 限定品牌範圍 + 「不知道就轉人工」；低 confidence → L5 → 真人 |
| **PII / 對話保存** | `line-conversations` TTL 30 天；ledger 不存訊息內容；LINE userId 不外流到 URL |
| **Prompt injection** | 規則層（L1/L2）先擋已知攻擊字串；LLM 輸出經 JSON schema 驗證再回覆 |
| **單機 GPU 無 HA（方案 C）** | 保留雲端 fallback provider 並定期演練；C 只在 §7.5 三條件成立才上 |
| **LINE 方案配額** | Reply 免費、push 計費；監控 push 量，優先用 reply；超量前升方案 |
| **既有環境阻塞** | Amplify SSR 憑證、prod 建表、分支收斂屬前置依賴，須先解決（見 §1.3） |
| **定價表更新** | [`lib/ai/gateway/pricing.ts`](../../lib/ai/gateway/pricing.ts) 已於 2026-09-25 補上 Gemini 3.1（Flash-Lite/Pro）、GPT-5.4（nano/mini）、Claude Haiku 4.5，及一批中國模型（DeepSeek / Qwen / Kimi / GLM，以 OpenRouter bare id 為 key）。中國模型價格為概略快照，正式計費前於 Phase 0b 以真實帳單校準；未列出的模型仍落到 `DEFAULT_PRICE` 1.0/5.0 |

---

## 10. Verification（本規劃的驗證方式）

- **試算表**：`line-ai-chat-cost-model.xlsx` 的每條公式都有對應的 Python 鏡射函式（同一份 inputs dict），產出時比對一致：blended = 431.4 µ$、C 固定成本 = NT$14,110、C 勝 A ≈ 247 萬則、B 勝 A ≈ 186 萬則。改 Inputs 的 hit_L5（5%→10%）後 blended 由公式鏈傳導到 660 µ$。本機無 LibreOffice，檔案**無快取值**，Excel / Google Sheets 開啟即自動重算（與既有 `cost-model.xlsx` 相同）。
- **文件**：§1 每個 file:line 已於 2026-09-25 對 HEAD `c6b9227` 開檔驗證；§11 定價每列附來源 URL。
- 純文件交付，**不跑 build / tests、不部署、不呼叫付費 API**。

---

## 11. 已查證定價基準（2026-09-25，官方 / 公開頁面）

| 項目 | 數值 | 來源 |
|---|---|---|
| LINE OA 台灣 輕 / 中 / 高用量 | NT$0（200 則）/ NT$800（3,000）/ NT$1,200（6,000，超量 NT$0.2 起）；Reply 與 1:1 聊天免費，只有 Push/群發計費 | [LINE Biz TW](https://tw.linebiz.com/faq/oa-price/message-price-list/)、[Sky Digital](https://skydigital.com.tw/posts/line-official-account-pricing/) |
| LINE reply token / redelivery | reply token 一次性、有時效；redelivery 保留原 token，用 `webhookEventId` 去重、`deliveryContext.isRedelivery` 判斷 | [LINE Developers — Receiving messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/) |
| LINE 聊天 + Webhook 並存 / 真人轉接 | 2022 起原生後台可「聊天與 Webhook 並存」，回應時間切換真人/自動 | [no8.io](https://blog.no8.io/2022-line-chat-and-webhook) |
| Gemini 2.5 Flash-Lite | $0.10 / $0.40 per M；2026-10-16~20 退役 | [pricepertoken](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash-lite)、[Google Cloud lifecycle](https://gcpstudyhub.com/blog/google-is-retiring-gemini-2-5-on-agent-platform-what-you-need-to-know-and-do-before-october-2026) |
| Gemini 3.1 Flash-Lite | $0.25 / $1.50 per M（官方接替） | [Google blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-lite/)、[OpenRouter](https://openrouter.ai/google/gemini-3.1-flash-lite) |
| GPT-5.4 nano / mini | $0.20 / $1.25；$0.75 / $4.50 per M（cache 9 折） | [DataCamp](https://www.datacamp.com/blog/gpt-5-4-mini-nano)、[TechCompare](https://www.techcompare.app/llm-pricing-calculator/gpt-5-4-mini-vs-claude-haiku-4-5-pricing) |
| Claude Haiku 4.5 | $1.00 / $5.00 per M | [Portkey](https://portkey.ai/blog/gpt-5-nano-vs-claude-haiku-4-5/) |
| text-embedding-3-small / gemini-embedding-001 | $0.02 / $0.15 per M（皆有 batch 5 折） | [TokenMix](https://tokenmix.ai/blog/openai-embedding-pricing)、[EmbeddingCost](https://embeddingcost.com/google) |
| Qdrant Cloud free / Upstash Vector free | 1 GB ~100k 向量永久免費 / 150k queries/日 | [agentdeals](https://agentdeals.dev/vector-database-pricing) |
| RunPod Serverless flex | 16GB $0.58、24GB $0.69、48GB $1.22、A100 $2.72、H100 $4.79 /hr，每秒計費 | [Hivenet](https://www.hivenet.com/post/runpod-pricing-complete-guide-to-gpu-cloud-costs)、[RunPod](https://www.runpod.io/pricing) |
| AWS Lambda / DynamoDB on-demand | $0.20/M req + $0.0000166667/GB-s（免費 1M+400k GB-s）；$0.125/M RRU、$0.625/M WRU、$0.25/GB-月（免費 2.5M/2.5M） | [CloudZero Lambda](https://www.cloudzero.com/blog/lambda-pricing/)、[CloudZero DynamoDB](https://www.cloudzero.com/blog/dynamodb-pricing/) |
| RTX 5090 台灣 | NT$165,990（促銷）~ 200,000；575 W TGP | [DailyHW](https://dailyhw.com/en/posts/rtx-5090-price-surge-taiwan/) |
| 台電營業用電 | 預設 NT$4.5/度；尖峰最高 ~NT$9.39/度 | [Taipower 電價表](https://www.taipower.com.tw/)、[陽光花園](https://www.solargarden.com.tw/press/2524) |
| 既有 repo 定價表 | `lib/ai/gateway/pricing.ts` 尚無 Gemini 3.1 / GPT-5.4 / Haiku 4.5，實作時需補 | 本 repo |

---

## 12. 附錄：試算表結構（`line-ai-chat-cost-model.xlsx`）

7 個分頁，沿用既有 `cost-model.xlsx` 的「Inputs 驅動」風格（只用 SUM/MIN/MAX/EXP/ROUNDUP/INDEX/MATCH/IF，無陣列公式）：

1. **Inputs** — 所有可調參數（黃底），含 `CHECK_hit_sum` 驗證命中率合計 100%。
2. **LayerCost** — 每層 inc / cum / 命中率 / 貢獻；blended（US$ / µ$ / NT$）；unit_A4 / unit_A5（LLM-only 單價）。
3. **Scenarios** — 現況/1k/10k/100k/1M：N4、N5、A/B/C 總成本、LINE 方案費、最便宜方案。
4. **TCO-RunPod** — λ、p_cold、每請求費、flex vs always-on、所需 worker、warm 理論下限。
5. **TCO-Local** — 固定成本拆解、各情境利用率 / 負載電費 / 所需 GPU 數 / C 總成本、可用性註記。
6. **Breakeven** — C 勝 A、B 勝 A 的閉式解；2-D 表（L4 模型單價 × tokens 倍率 → C 勝 A 的月訊息門檻）。
7. **Sensitivity** — 命中率四組、單一 knob −50%/預設/+100% 對 blended 與 C 損益兩平的影響。
