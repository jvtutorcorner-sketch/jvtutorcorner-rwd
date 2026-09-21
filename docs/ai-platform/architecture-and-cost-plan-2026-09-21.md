# AI-Augmented Live Learning Platform — 架構與成本規劃

> 定位:Human-led + AI-powered。真人老師教學,AI 為增強層;Teaching Segment 為分析單位;50 分鐘只是課程/成本單位。
> 本文件是「規劃」而非實作。核准後第一步僅是把本文件落地到 `docs/ai-platform/` 並開始 Phase 0 成本稽核,不寫功能程式。
> 假設:US$1 = NT$32;售價 NT$600/堂、老師 70%(使用者指定);課型 1對1 為主 + 小班(1 師 4 生);Timeline 回放 = 音訊 + 白板快照 + 逐字稿(無雲端錄影)。

## Context

使用者要求在導入 AI 前先完成完整的產品/AI/RTC 成本/商業模式規劃,核心顧慮是「RTC 已佔成本 90%,導入 AI 不能讓 unit economics 惡化」。探索程式碼與既有文件後,有四個會改變規劃前提的發現:

1. **「RTC 90%」是技術成本的佔比,不是金額大小。** 我重算的結果與 `docs/mvp-cost-analysis-agora-alternatives.md` 的 93% 一致:Agora 現況每堂 1對1 約 NT$17.2(RTC $0.399 + Netless 白板 $0.14),其他基礎設施約 NT$1.3。但相對 NT$600 售價只佔 2.9%;真正的大項是老師分潤(70%)與金流手續費(約 2.8% = NT$16.8,與 RTC 同級卻沒被列入)。平台目前尚未有真實上架課程,Agora 用量仍在每月 10,000 分鐘免費額度內。
2. **RTC 降本方向已決定且大半已實作 — 但不在 `main` 上**:影音 → Cloudflare Realtime SFU($0.05/GB、每月 1TB 免費)、保留 Agora 回退、信令 → Centrifugo(已核准計畫 `3-5-redis-parsed-phoenix.md`、`ancient-swimming-hejlsberg.md`)。SFU provider、自癒、畫質自適應、runtime 回退都已寫好但**從未用真實 Cloudflare 憑證驗證、未部署**。本規劃不重新選型,只補上成本模型與驗收。
   **已驗證的分支現況**:`main` 與 `integration/b2b-security-merge` 分歧(main 領先 18、落後 21 commits)。`useCloudflareSfuProvider.ts`、`lib/realtime/{config,sfuApi,guard,…}`、`lib/courseSessionService.ts`、`scripts/lib/schema.mjs`、`lib/rateLimit.ts`、`app/api/classroom/complete`、`lib/livekit/*`、escrow TransactWrite 修正、`stripTabId` 修正、ready `members` 修正 —— **全部只在 integration 分支或 `stash@{0}`**。`main` 工作樹上的 untracked 檔(`app/rtc-harness`、`lib/realtime/ice.ts`、`app/api/realtime/ice` 等)import 不到相依模組、無法編譯。→ **分支收斂是一切的前置**(記取先前 force-merge 事故:逐批合併,不 force)。
3. **比 RTC 更危險的 unit-economics 漏洞在計費層**(main 分支現況,已驗證):
   - `lib/pointsEscrow.ts:205` 老師拿 **100%** 點數,平台抽成不存在 → 「老師 70%」目前無法成立。
   - `lib/pointsStorage.ts:61-76` `deductUserPoints` 是 read→Put,非原子、可雙花;沒有點數帳本表;`releaseEscrow` 先加餘額才翻狀態。
   - 完全沒有 token/成本紀錄(repo 內無任何 `usage` 讀取);沒有 rate limit(`lib/rateLimit.ts` 不存在);`/api/chat`、`/api/translate`、`/api/points-escrow` 無驗證 → AI 成本敞口無上限。
   - 方案權益只在 client 檢查(`components/EnrollButton.tsx:264`);`profile.activeAppPlanIds` 有寫入無讀取。
4. **你描述的現有架構與 repo 不符**:repo 內**沒有** OpenRouter、RunPod、Redis、圖生圖/圖生影片。現有的是 Gemini/OpenAI/Anthropic 直連(金鑰在 `/apps` 的 integrations 表)、`lib/ai/llmClient.ts`(只有 2 個 consumer,另有約 8 處各自複製呼叫)、Replicate 數位人原型(admin only、不扣點、不落地)。若 OpenRouter/RunPod 在別的專案,本規劃定義的 Gateway 介面就是它們接進來的位置;否則視為 Phase 2/5 的新整合。

5. **RTC 成本有一個未設防的敞口**:`main` 的 `app/api/agora/token/route.ts:38-48` 硬編 Agora App ID/Certificate 且**無 `withAuth`** — 任何人可替任意頻道簽 PUBLISHER token,用你的帳單燒分鐘數(`rtm-token` 同)。修正在 integration 分支(`bd85fe7`);Certificate 已在 git 歷史中,**無論如何都須到 Agora Console 輪替**。

**結論**:優先順序應為 **分支收斂 + 堵住成本敞口 → P0 計費地基(原子點數+帳本+抽成+用量帳本+守門)→ RTC 驗證上線 → AI Gateway → AI 功能**。沒有 P0,任何「依點數/方案動態開關 AI」都無法安全計費。

---

## 1. Current Architecture Assessment

| 面向 | 現況(檔案) | 缺口 | 嚴重度 |
|---|---|---|---|
| Hosting | Amplify SSR(Next.js 16),Lambda 無長連線/長任務;SSR 憑證問題(memory:computeRoleArn) | 長任務需獨立 Lambda;AI 分析不可放 SSR | 高 |
| DB | DynamoDB;表定義 DSL `scripts/lib/schema.mjs` + `setup-db --only=`/`--dry-run` **只在 integration**(main 的 `setup-db.mjs` 是舊版,`--dry-run` 會被忽略而真的執行);prod 缺 `class-summaries`、`rate-limits`、`questionnaires` 等表 | 無 usage/cost/ledger 表 | 高 |
| Redis | **不存在**(僅 Centrifugo spike 用 Valkey) | 計數/冪等先用 DynamoDB 原子操作;Redis 隨 Centrifugo 上 Render 才有,且不跨雲給 Lambda 用(沿用前計畫決策) | 中 |
| 分支狀態 | `main` ↔ `integration/b2b-security-merge` 分歧 18/21;關鍵模組只在 integration/stash | 逐批收斂;untracked 檔在 main 無法編譯 | **阻斷** |
| RTC(main 現況) | 只有 Agora 為真;`useLiveKitProvider.ts`/`useChimeProvider.ts` 是 stub;`useRTC.ts:22` 為 build-time 常數。預設 `high` = **1280×720@30、1.2–1.8Mbps**(`lib/agora/useAgoraClassroom.ts:47-52`、`ClientClassroom.tsx:329`);**學生預設上行視訊**(`:378`);無螢幕分享、無 dual-stream、無雲端錄影;`isOneOnOne:false`(`:328`)小班已開但**房間人數無上限**;`setLogLevel(0)` DEBUG 留在正式 | CF SFU(integration)真實憑證驗證矩陣 V1–V12、結算 cron、灰度;token 路由守門 | 高 |
| RTC 用量量測 | 訂單每 60s PATCH `remainingSeconds`(per order、client 驅動);`/api/agora/session` PATCH 無呼叫者 → **Agora 路徑下課不釋放 escrow**(驗收報告 P0-7);只有 join 事件、無 leave/時長 | `course-sessions` presence/`billableSec`(integration)= Cost Meter 的 RTC 來源 | 高 |
| 白板 | 正式預設 Netless(`white-web-sdk` CDN;PDF 以 base64 進房間狀態);自製 canvas 在 main 為 DynamoDB 輪詢版(寫入放大 O(N²));P2P DataChannel 版在 `stash@{0}` | 白板握手仍靠 Agora RTM;回放需快照留存 | 中 |
| 錄音/STT/總結 | `lib/classroom/useClassAudioRecorder.ts`(各錄各的麥克風、60s 分段上傳 S3)、`lib/ai/transcribe.ts`、`lib/classSummary/*`、`lib/classSummaryService.ts`、`/api/class-summaries/*`、`/api/cron/class-summaries`(皆 untracked、prod 未建表)。**零接線**:recorder 無人 import、`markClassEnded`/`setBoardArtifacts` 無呼叫者、無同意 UI | **timeslice 分段第 2 段起無法獨立解碼(`:95`)**;同意 UI、接進 ClientClassroom、Lambda 化 | 高 — 這是 L1/L3 的種子 |
| LLM | `lib/ai/llmClient.ts` + 8 處重複呼叫;無 timeout/retry/fallback/usage;in-process cache 無效 | AI Gateway | 高 |
| GPU | Replicate 數位人原型 `lib/replicate/aiAvatarPipeline.ts`;無 RunPod | RunPod 整合 + job 表 + 扣點 | Phase 5 |
| 點數/金流 | 見 Context 3;4 家金流匯入 `lib/paymentSuccessHandler.ts` | 原子化、帳本、抽成、reserve/settle | **阻斷** |
| Feature flag | 無。可複製的模式:`lib/integrations/catalogStore.ts`(DB 覆寫)、`lib/ai/agentsStore.ts`(code seed + DB override + 60s cache) | 7 層旗標解析 | 高 |
| 觀測 | `lib/keyLogger.ts`(date 分區+GSI+TTL)、`lib/auditLogService.ts`、`/api/realtime/telemetry` | cost 類別、rollup | 中 |
| Session 資料 | **沒有 Lesson 實體**:剩餘堂數/秒數掛在**訂單**(`orders.remainingSessions/remainingSeconds`);`course-sessions` 表 prod 已建(4 GSI)但 0 筆,service 只在 integration;summary 以 `courseId#orderId#分鐘桶` 為鍵;「50 分鐘」只是 UI 常數(API 預設 60,兩個編輯頁不一致) | Session 實體要在進教室時建立;`PATCH /api/orders/[orderId]` 無驗證(R4) | 高 |
| 多租戶 | 無 `tenantId`;租戶 = `profile.orgId`;session payload 只有 `{userId,email,role,plan}` | 新表一律以 `orgId` 當租戶鍵(個人用戶 = 省略屬性,不寫 null) | 中 |
| 平台限制 | Amplify 上 **SSE/串流無效**(`app/api/whiteboard/stream/route.ts:62-83` 只回一個 frame);repo 無 SQS;新表 env 必須加進 `next.config.ts` `env` 區塊否則 prod 靜默用預設名;無單元測試框架(以 `scripts/verify-*.mjs` 離線驗證);`apiGuard` 的 `x-e2e-secret` bypass 未以環境閘門 | Tutor 不能靠 SSE;非同步觸發用 S3 event / DynamoDB Streams | 中 |

## 2. Target Architecture

```
Browser (teacher/student)
 ├─ RTC media ──────────► Cloudflare Realtime SFU (primary) ─┐  Agora (fallback, per-session sticky)
 ├─ Whiteboard ─────────► P2P DataChannel + CF TURN          │  LiveKit (dormant alt)
 ├─ 60s mic chunks ─────► S3 class-audio/  ──S3 event notification──► λ ai-l1-detector
 ├─ markers/system events ► /api/lessons/*  ──► DynamoDB lesson-events ──► Segmenter
 └─ Copilot/Tutor UI ◄── Centrifugo push(無則 10s 輪詢 /events?since=;Amplify 上 SSE 無效)

Amplify Next.js API (短請求)            Lambda workers (長任務, esbuild, 同 lambda/livekit-webhook)
 /api/ai/* ─► AI Gateway (lib/ai/gateway)   λ ai-l1-detector  (S3 event + DLQ)             Level 1
      │                                     λ ai-segment      (DynamoDB Streams: segment CLOSED) Level 2
      ▼                                     λ ai-lesson       (EventBridge,沿用 class-summaries 的 byStatus 佇列+原子 claim) Level 3
 Entitlement → Budget → Task Router         λ ai-profile      (Streams: summary READY)      Level 4
      → Cost/Quality Policy → Provider      λ gpu-webhook / poller          RunPod jobs
          ├─ OpenRouter (LLM / vision / audio-in)
          ├─ Gemini direct (STT fallback)
          └─ RunPod Serverless (AI Media)
      → Usage Ledger + Cost Rollups + Points Ledger (DynamoDB)

Governance: ai-feature-config(7 層)· plan/points · budget caps · model policy · audit log · Cost Dashboard
```

原則:OpenRouter 只是 provider adapter;商業邏輯(權益、預算、路由、計費、稽核)全在自家 Gateway。Gateway 核心寫成純 TS 模組(不 import `next/*`),讓 Amplify route 與 Lambda 共用。
非同步脊幹(一次講清楚):L1 = S3 event → Lambda;Segmenter 與 L2/L4 = DynamoDB Streams(integration 的 schema DSL 已有 `stream` 概念),避開「Amplify SSR 無法可靠 invoke Lambda / 無 IAM 憑證」的已知問題;L3 沿用既有 `claimForProcessing` DynamoDB-as-queue 模式。**SQS 只用於 DLQ**,不當主佇列。Streams 必備護欄:event filter 只放行 `OPEN→CLOSED` 轉換(用 NEW_AND_OLD_IMAGES;否則 L2 回寫與老師 PATCH 編修會自我觸發成迴圈)、`MaximumRetryAttempts`、bisect-on-error、on-failure destination(否則一筆毒訊息卡住 shard 24 小時)。
**缺口**:repo 沒有 Lambda 的建置/部署路徑(無 esbuild script、無 event-source mapping / S3 notification 的 CloudFormation;`lambda/livekit-webhook` 只是 integration 上的一支 handler)→ 列為 Phase 2 明確工項。

## 3. Teaching Segment / AI Event Architecture

**訊號來源與優先序**(高→低,高優先在 ±60s 內壓過低優先):
1. **Teacher Marker**:`[重要概念][開始新主題][開始練習][學生提問][開始測驗][結束本段]` — 零 AI 成本,永遠可用。
2. **System Event**:白板換頁/插入 PDF/清空、螢幕分享起訖、測驗開始/完成、canDraw 授權、Tutor 提問。
3. **AI Semantic Event**(Level 1):`topic_shift / explanation / exercise / qa / important_concept / confusion / common_mistake / objective_done`,需 confidence ≥0.7 且連續 2 個 buffer 才成為邊界(遲滯,防抖)。
4. **Time Fallback**:段長 >15 分強制軟邊界;段長 <90 秒不切(防碎片)。AI 關閉或預算用盡時仍能產出 Timeline。

**Segmenter = 純狀態機** `lib/lessonAI/segmenter.ts`(仿 `lib/realtime/connectionPolicy.ts`,可離線測):輸入事件流 → 輸出 open/close segment。邊界型 marker 立即切段;點狀 marker(重要概念/學生提問)只掛事件不切段;換頁需停留 ≥45s 才算邊界。每個邊界存 `source` 與 `confidence`;老師課後可合併/拆分/改名(編輯紀錄 = 未來調校資料)。
- **單一寫入者**:marker API、system-event API、L1 Lambda 三方都只 append 到 `lesson-events`;Segmenter 跑在**一個**消費 `lesson-events` stream 的 Lambda,以帶版本號的 session-state item 做條件更新(避免三方競寫 segment)。
- **事件會亂序/並發到達**(S3 event 不保序、師生兩軌分開分析):事件帶 `track`、`chunkSeq`、`offsetSec`;Segmenter 對「已排序的滑動視窗」判斷,`qa/confusion` 需合併兩軌視窗後才成立。
- **時鐘**:AI 關閉時沒有事件流,時間 fallback 不會自己觸發 → client 每 60s 送一個 `tick` system event,且下課 finalize 時補算一次。
- **Session 建立競態**:師生同時進教室 → `sessionId` 由(courseId, orderId, 表定開始)決定性推導 + `attribute_not_exists` 條件建立。

**⚠ L1 的前置修正(已驗證的既有 bug)**:`lib/classroom/useClassAudioRecorder.ts:95` 用 `rec.start(SEGMENT_MS)` timeslice 模式 → 只有第 0 段帶 WebM/fMP4 標頭,第 1 段起是裸 cluster、**無法獨立解碼**(現有 `processSummary.ts` 逐段轉錄同樣受害)。須改為**每 60s stop/start 輪替 recorder**(或兩個交疊 recorder)讓每段自足,才可能做 client VAD 丟棄靜音段;`startMs`(`:47`)改用 recorder 實際啟動時間戳(現式對最後短段錯誤且會漂移)。另須確認 provider 接受的音訊格式(webm/opus、iOS 的 mp4);若只收 wav/mp3,則音訊直送 Gemini 或在 Lambda 轉碼。→ 列為 **Phase 0b 的 go/no-go gate**:「一段自足 60s 音訊 → 模型 → transcript+events」在 Chrome 與 iOS Safari 走真實 provider 路徑跑通,且中英夾雜 WER 達標,L1 設計才成立;否則退回「STT 與事件偵測分離」。

**四層分析**

| Level | 觸發 | 模型級別 | 輸入 | 輸出 | 每堂次數 | 每堂成本 |
|---|---|---|---|---|---|---|
| L1 Event Detection | 每個 60s 音訊分段上傳(S3 event);client VAD 靜音段不上傳 | 低(Gemini Flash-Lite 級,音訊直入 = **STT + 事件偵測合併一次呼叫**) | 60s 音訊 + ≤600 tok 滾動脈絡(前 3 段摘要、目前主題、課程目標) | `{transcript, events[{type, offsetSec, confidence}]}` | 70(講述型)–100(對話型 1對1) | $0.056–0.080 |
| L2 Segment Analysis | segment 關閉 | 中(Flash 級) | 該段逐字稿 + 事件 + 教材脈絡 ~3.5k tok | 主題/目標/講解/問題/錯誤/理解度/是否補充 | ~6(上限 10) | ~$0.017 |
| L3 Lesson Analysis | `/api/classroom/complete`(沿用現有觸發) | 中(預設)/高(高階方案) | segment 摘要 + 精簡逐字稿 + 白板 PNG | 老師視角 + 學生視角 + Timeline 章節 | 1 | $0.011(高階 $0.045) |
| L4 Cross-Lesson | L3 READY 後,每位學生 | 中 | 既有 profile + 本堂分析 + 概念歷史 | Student Learning Profile 增量更新、長期未穩定概念判定 | 1/生 | ~$0.004 |

延遲(誠實版):**點狀事件**(提問/困惑/重要概念)說話後 ≤90s 出現在 Copilot(60s 分段 + ≤30s 處理);**AI 推得的邊界**因需連續 2 個 buffer 確認,約 150s 後才成立,但時間戳以模型回傳的 `offsetSec` **回溯標記**(精度目標 ≤30s);marker/system 邊界為 0 延遲、精確。分段改 30s:音訊 token 不變,只有脈絡與 JSON 開銷加倍,成本約 **+13%**,延遲減半 → 列為方案級參數,預設 60s。
L1 失敗不留洞:該段標 `transcript_pending`,於 L3 以純轉錄補跑(回放逐字稿不得有缺段)。L2–L4 模型一律**關閉/限制 reasoning(thinking)tokens**(Gemini Flash 的思考 token 以 $2.50/M 計為輸出,預設動態思考會讓成本 ×2–4),`estimateCost` 須計入 reasoning 上限。

**Timeline 回放(已選:音訊+白板+逐字稿)**:章節 = segment;點擊 → 音訊跳至 offset、顯示該時點白板快照、逐字稿捲動。需要:(a) 課後 Lambda 把**每一軌各自**串接成單檔(**不混音** — 混成一檔就無法單獨刪除某人的聲音;播放端同步播放兩軌);(b) 白板快照每 15s 及每個 segment 邊界留存至 S3(現有 offerer 每 4–5s 快照,抽稀保存)。
⚠ 保存期與同意:與前計畫「總結完成即刪音訊、7 天保底」衝突 → 保存期改為依方案(30/90/365 天),S3 以 **retention class 為 prefix** 對應 lifecycle;**同意須版本化**(舊版同意承諾刪除,不得溯及延長);方案降級/撤回同意 → 立即縮短/刪除;小班有人不同意 → 不錄該員軌道,課堂層分析只用老師軌 + 已同意者。L1 送的是**原始音訊(含未成年人聲音),無法去識別化**,且 OpenRouter 是額外的受託處理者 → 鎖定 provider、`data_collection: deny`(或音訊直送 Gemini),並寫入同意條款;**條款文字須經法務確認**。

**預算降級階梯**(單堂 AI 成本觸頂時依序):L1 改 120s/只分析老師軌 → Tutor 限流 → L3 降用中階模型 → 關 L1,只留 marker + system event + 時間 fallback。

## 4. AI Feature Matrix

| Feature | 類別 | 觸發 | 同步 | 模型級別 | 估計成本/次 | 計費 | 預設 | Phase |
|---|---|---|---|---|---|---|---|---|
| Teacher Marker / Segmenter | Learning | 手動/事件 | sync | 無 | 0 | 免費 | ON | 3 |
| AI Event Detection (L1, 含 STT) | Learning | 60s 分段 | async | 低 | $0.0008/段 | 含於方案 | 方案 | 3 |
| Segment Analysis (L2) | Learning | 段落結束 | async | 中 | $0.003 | 含於方案 | 方案 | 3 |
| Teacher Copilot | Learning | 讀 L1/L2;按需「推薦講法」 | sync | 中 | $0.002/按需 | 含於方案 | 方案 | 3 |
| Student Tutor(提示階梯 1→4) | Learning | 學生提問 | sync(非串流) | 中 | $0.0016/則 | 每堂 N 則內含,超量扣點 | 方案 | 3 |
| Assessment(出題+批改) | Learning | 老師觸發/AI 建議、老師確認 | sync | 中/低 | $0.006/份 | 含於方案 | 方案 | 4 |
| Lesson Analysis (L3) + Timeline | Learning | 下課 | async | 中/高 | $0.011–0.045 | 含於方案 | 方案 | 4 |
| AI Review(個人複習) | Learning | L3 後 | async | 中 | $0.004 | 含於方案 | 方案 | 4 |
| Learning Profile (L4) | Learning | L3 後 | async | 中 | $0.004/生 | 含於方案 | 方案 | 4 |
| AI Image / Img2Img | Media | 手動 | async | RunPod 24GB | NT$0.2–0.5 | **點數** | OFF | 5 |
| Image-to-Video(5s) | Media | 手動 | async | RunPod 80GB | NT$6–12 | **點數** | OFF | 5 |
| Digital Human / Lip Sync(60s) | Media | 手動 | async | RunPod 24–80GB | NT$1.2–29(依模型) | **點數** | OFF | 5 |
| AI Voice (TTS) | Media | 手動 | async | RunPod/API | NT$0.1–0.2/分 | **點數** | OFF | 5 |

Media 成本為估計值(RunPod flex 約 $0.0003–0.0012/s,含冷啟動),**Phase 0 須以實測校準後才能定點數**。每項皆可獨立 Enable/Disable。

## 5. RTC Cost Optimization Analysis

**每堂 1對1(100 participant-min)成本**

| 模式 | Agora | Cloudflare SFU | LiveKit Cloud(Ship 超量) | Daily/100ms/Twilio |
|---|---|---|---|---|
| 雙方 720p(1.16GB) | $0.399 | $0.058 | $0.189 | $0.40 |
| 師 720p + 生 360p(0.78GB) | $0.399(**同價**) | $0.039 | $0.144 | $0.40 |
| 雙方 360p(0.40GB,前計畫預設 medium) | $0.399(**同價**) | $0.020 | $0.098 | $0.40 |
| 師 720p + 生純音訊(0.59GB) | **$0.249** | $0.030 | $0.121 | ~$0.25 |
| + Netless 白板 | +$0.14 | 自製 canvas $0 | — | — |
| 免費/內含額度可撐 | ~50–100 堂/月 | **~860–2,500 堂/月** | $50 內含的 250GB 先用完:約 216 堂(720p)–617 堂(360p) | 100 堂 |

小班 1 師 4 生:Agora **現況寫法 ~$4.0**(全員 720p 互訂,見下方事實 2)+ 白板 $0.35;訂閱優化後 ~$1.0;CF ~$0.12–0.16。

**現況基準(main)**:預設 `high` 720p30、學生預設上行視訊、無螢幕分享、無 dual-stream、無雲端錄影 → 目前每堂就是表中第一列 $0.399 + Netless。

**Agora 計費的三個關鍵事實**(決定在回退路徑上該優化什麼):
1. 依「每位訂閱者的**聚合解析度**」分級;≤921,600px 一律 HD 價 → **720p 以下降解析度在 Agora 省不到錢**(只省 CPU/頻寬,對弱網與壓測有益),只有「只訂閱音訊」($0.99)才便宜。→ Audio-first:老師端預設只訂閱學生音訊,學生發言/老師點選才開視訊,省 37%。
2. **小班是聚合解析度陷阱**:現況 `isOneOnOne:false` + 全員 720p 互訂 → 1 師 4 生時每人訂閱 4×921,600 = 3,686,400 px → **2K 級 $15.99/1k(HD 的 4 倍)**,一堂 250 participant-min ≈ $4.0;1 師 5 生以上即跨入 **2K+ 級 $35.99/1k(9 倍)**,一堂 ≈ $10.8。→ 小班必須:學生只訂閱老師(+當前發言者)、學生上行 ≤640×360(4 路合計 ≤921,600)、房間人數上限入 token 簽發邏輯。未來若加螢幕分享同理:分享 ≤1280×720 且分享期間不訂閱相機。
3. 買套餐即失去每月 10k 免費分鐘 → 低量期不要買套餐。

**成本敞口(先堵)**:token/rtm-token 路由加 `withAuth` + `verifyClassroomAccess`、移除硬編憑證、輪替 Certificate;token 有效期 = 表定下課 + 10 分;正式環境關閉 `setLogLevel(0)`。

**其餘使用模式控制**(兩條路徑皆適用):等候室不進 RTC 頻道,雙方 ready 才 join;下課/表定結束 +10 分自動離開(防殭屍分頁累積分鐘);錄製只錄音訊(已實作,無雲端錄影費);CF 路徑預設 `medium` 360p(每 GB 計價,降碼率線性省錢;1TB 免費額度在 `medium` 約 83 堂/日、`high` 約 29 堂/日用完)。
**待校準**:Netless 每堂成本,官方價目推得 $0.14,但 repo 兩份文件分別寫 $0.0125 與 $0.38 → Phase 0 以實際帳單為準。

**方案比較(非單價面)**

| | Agora | Cloudflare SFU | LiveKit 自架 EC2 | LiveKit Cloud | Daily/100ms/Twilio |
|---|---|---|---|---|---|
| 計價 | 分鐘×解析度級 | GB 出流 | EC2 固定 + AWS 出流 $0.114/GB(**比 CF 貴**) | 月費+分鐘+GB | 分鐘 |
| TURN | 內含 | 內含(與 SFU 共用 1TB) | 自管 | 內含 | 內含 |
| 雲端錄影 | $5.99/1k(HD) | **無**(不需要,已選音訊回放) | Egress 自架 | $0.02/min(= 每堂 $1,比 RTC 還貴) | ~$0.0135/min |
| SDK/瀏覽器/iOS | 最成熟 | 原生 WebRTC,iOS/對稱 NAT **待驗證** | 成熟 | 成熟 | 成熟 |
| SLA/可靠度 | 有 SLA、弱網最佳 | 無公開併發/速率上限,**試課前須問 CF** | 自負 | 有 | 有 |
| 工程成本 | 0(現行) | provider+自癒+畫質+回退已完成;剩驗證矩陣、結算 cron、灰度 ≈3–4 人週 | infra+ops 持續成本 | 已有 provider ≈1–2 人週 | 全新整合 4–6 人週,無價格優勢 |
| 維運 | 低 | 低 | **高** | 低 | 低 |

**建議**:維持既定決策 — CF SFU 為主、Agora 為 per-session sticky 回退(並套用上述三項 Agora 優化)、LiveKit 保持休眠。1對1 純 P2P provider(只付 TURN 中繼 ~20%)可再省,但在 CF 價格下每堂已 <NT$1.3 且 1TB 免費,**月流量 >1TB 再評估**。Daily/100ms/Twilio 與 Agora 同價,淘汰。

## 6. AI Cost Architecture

**Gateway 管線**(`lib/ai/gateway/`,擴充 `lib/ai/llmClient.ts`,並把 8 處重複呼叫遷入):
`resolveFeature(entitlement)` → `checkLimits(日/月/每堂)` → `estimateCost`(input tok×單價 + (max_tokens + reasoning 上限)×單價;> `max_cost_per_request` 直接拒絕)→ `commitBudget` → `route(task → model policy)` → `call`(timeout、同模型 retry ≤1、fallback 鏈 ≤2、每模型 circuit breaker、`requestId` 冪等:同 key 回放結果不重打)→ `record`(以 provider 回傳的實際 usage/cost 入帳)→ `audit`。
- **同步呼叫有總時限**:Tutor/Copilot 整條鏈(含 retry+fallback)總 deadline 12–15s,剩餘時間不足就不試下一個模型(Amplify SSR 回應上限約 30s,Phase 0b 實測確認)。
- **預算/帳務的正確做法**(DynamoDB 條件式無法表達 `spent + reserved + x <= cap`):每堂/每人預算用單一 `committed` 屬性,條件 `committed <= :cap_minus_est` 原子遞增;**一次 TransactWrite** = ledger `Put`(`attribute_not_exists(requestId)`)+ 各 rollup `ADD`,避免重試重複累加;金額一律存**整數 micro-USD**。Learning 的同步呼叫用「每堂有上限的後付計數」即可,不做 reserve/settle;reserve/settle 只留給 Media。

- **Task Router**:`l1_detect→low`、`l2_segment→mid`、`l3_lesson→mid|high(依方案)`、`l4_profile→mid`、`tutor→mid`、`assessment_gen→mid`、`grading→low`、`vision→vision`。模型 ID 不寫死在程式,存 `ai-feature-config.model_policy`(primary/fallback1/fallback2、max_tokens、timeout_ms)。
- **OpenRouter adapter**:新增 `OPENROUTER` 至 `lib/integrations/registry/providers/ai.ts`(金鑰進 `/apps`,零 UI 工作);請求帶 usage accounting 取回實際 cost。STT 走音訊輸入模型;備援 = Gemini 直連(現有 `transcribe.ts`);Deepgram($0.0058/min,約貴 10 倍)只作品質備案,Phase 0 以真實中英夾雜教學錄音做 WER 對比後定案。
- **RunPod adapter**:submit → webhook(備援輪詢);使用者看到並支付的是**固定價(以 p90 實測成本定)**:reserve → 成功即以該固定價 settle → 失敗/逾時全額 refund;`gpu_seconds×單價` 只記為 `actual_cost` 供毛利監控與每週調價提案,不向使用者浮動收費。**reservation 有到期時間 + sweeper**(webhook 遺失/當機時釋放卡住的點數);worker scale-to-zero、job timeout、retry ≤1;每 job 寫 `gpu-jobs` + usage ledger。
- **兩個 Cost Center**:`platform`(rtc/storage/cdn/db/hosting)與 `ai`(llm/stt/gpu)。RTC 用量來源 = 現有 `/api/realtime/telemetry` 下課摘要(participant-min、bytes → 估 GB)寫入同一 usage ledger;固定費(Amplify/DynamoDB/Render)每月由帳單輸入,按堂數分攤。
- **每堂 AI Learning 成本**(thinking 關閉):
  - 基準(講述型、70 段):L1 $0.056 + L2 $0.017 + L3 $0.011 + L4 $0.004 + Tutor(8 則)$0.013 + Assessment $0.006 + Copilot 按需 $0.006 = **$0.112 ≈ NT$3.6**(§10–§11 表格採用此值 + 儲存 NT$0.05 = NT$3.65)。
  - 對話型 1對1(90–100 段)+ AI Review $0.004 + Lambda 運算 ≈ **NT$4.6**。
  - 各功能上限加總(§15):L1 4.6 + L2 1.6 + L3 1.6 + L4 0.2 + Tutor 2.9 + Assessment/Review 0.6 ≈ NT$11.5 → 故**硬上限 NT$12/堂**(觸頂走 §3 降級階梯),p95 目標 ≤NT$8。
  - 小班 1 師 4 生 ≈ NT$6.7/堂(NT$1.7/生);L1 段數上限改為 `50 + 25×學生數`。

## 7. Point / Plan / Feature Flag Architecture

**旗標解析** `lib/ai/entitlements.ts` `resolveFeature(featureId, ctx)`:一次 BatchGet 最多 7 個精確鍵(Global/Tenant/Plan/Teacher/Course/Lesson/User)。
- `enabled` 每層為三態 **`on | off | inherit`** + 可選 **`locked`**:由上而下解析,下層可覆寫上層(這樣才能「只對某位老師/某門課試點」而不必先對所有方案開啟);只有 `locked: off`(含 Global kill switch)是終局,下層不可翻。個人用戶沒有 Tenant 層 → 視為 `inherit`。
- **成本相關參數**(`model_policy / limits / max_cost_per_request / daily・monthly_limit`):取**最嚴格值**,除非該層紀錄由 admin 寫入(否則老師可在 Course/Lesson 層自行調高模型等級 = 成本升級漏洞)。非成本參數(`point_cost` 顯示、`sync_or_async`)才用最近層覆寫。User 層只能關閉或收緊。
- **付款者規則**(小班必要):課堂層產物(L1–L3、Timeline、Copilot)依**付款者** = 老師/租戶/課程的方案解析;個人功能(Tutor、Review、L4)依**各學生**自己的方案解析。
- 伺服端強制;60s 快取**只快取設定,不快取 `remaining` 計數**;回傳 `{enabled, reason, pointCost, remaining, modelPolicy}` 供 UI 顯示「為何不可用/要多少」。
- 設定欄位(自足列出):`feature_id, enabled, locked, tenant_enabled, plan_enabled, teacher_enabled, course_enabled, lesson_enabled, user_enabled, required_plan, point_cost, daily_limit, monthly_limit, model_policy, fallback_policy, sync_or_async, max_cost_per_request, updatedBy(role)`;後台頁 `/admin/ai-features`,模式複製 `lib/integrations/catalogStore.ts`。

**Plan × Feature × 預算矩陣(初版,Phase 2 開工前定案;現有方案 ID 取自 `lib/mockAuth.ts`)**

| | viewer | basic | pro | elite | B2B 租戶 |
|---|---|---|---|---|---|
| Marker + Timeline(無 AI) | ✔ | ✔ | ✔ | ✔ | ✔ |
| L3 課後摘要 + AI Timeline | — | ✔ | ✔ | ✔(高階模型) | 依合約 |
| L1/L2 + Copilot | — | — | ✔ | ✔ | 依合約 |
| Tutor(每堂內含則數) | — | 5 | 15 | 30 | 依合約 |
| Assessment / Review / L4 | — | — | ✔ | ✔ | 依合約 |
| 每堂 AI 預算上限(NT$) | 0 | 2 | 8 | 12 | 租戶月預算 |
| AI Media | 點數 | 點數 | 點數 | 點數 + 每月贈 media 額度 | 租戶預算 |

**點數定價(由真實成本推導,不拍腦袋)**:`price = p90_actual_cost × (1+overhead 15%) ÷ (1 − target_margin)`;Learning 目標毛利 ≥70%、Media ≥60%。每週由 usage ledger 重算 p90 → 產生「調價提案」→ **admin 核准才生效**(不靜默改價);使用前 UI 必顯示價格。
- **粒度問題(已驗證)**:現行點數包 1 點 = NT$10–58(`app/settings/pricing/page.tsx:470-522`)。Tutor 超量一則約 NT$0.2、一張圖約 NT$1.4,若 `ceil()` 成 1 點等於加價 7–300 倍,違反「由真實成本推導」。→ 引入 **AI credits**(1 點 = 100 credits,帳本以 credits 為最小單位;或以「組合包」販售,如 50 則 Tutor = 1 點)。Phase 0b 定案。
- **「NT$600/堂、老師 70%」目前無法落地**:學生以點數付課、老師收到的是點數、且沒有點數→現金的提領路徑。P0 必須先定義:每點對老師的結算匯率、平台抽成在哪一步扣、折扣/贈點由誰吸收。
- **AI Learning**:含於方案,每堂有 AI 預算與各功能限額;超量才扣點或停用。
- **AI Media**:一律點數;獨立 `media` 日/月限額與預算;方案可贈「media 點數桶」(帳本 `bucket: general|media_grant`,單一錢包、雙桶)。
- 非同步任務(GPU):reserve → settle/refund。冪等靠**同一個 TransactWrite 內的 idempotency-key item**(`attribute_not_exists`),不靠 GSI(GSI 最終一致,擋不住重複);`TransactWriteItems` 不回傳更新後的值 → `balanceAfter` 以樂觀條件 `balance = :expected` 寫入,或不存該欄改由帳本重算。

**P0 前置(不做就不能上任何扣點 AI)**(escrow 的 TransactWrite + `settlementToken` 修正已存在於 integration 分支,先收斂再補其餘):`pointsStorage` 改 `UpdateExpression ADD` + `ConditionExpression balance >= :n`;新增 `addUserPoints`;`releaseEscrow/refundEscrow` 改 `TransactWriteCommand`;新增點數帳本;`releaseEscrow` 加入 `platformFeeRate`(老師 70%/平台 30%,分錄入帳本);伺服端方案權益檢查(讀 `activeAppPlanIds`)。

## 8. Database Schema(DynamoDB,皆 `jvtutorcorner-` 前綴,定義於 `scripts/lib/schema.mjs`(收斂自 integration),prod 用 `setup-db --only=<key>`)

對應:Course = 現有 `courses`;**Lesson 實體目前不存在**(剩餘堂數掛在訂單)→ 不新造 Lesson 表,以 `course-sessions`(integration 的 `lib/types/courseSession.ts` 已有 `sequence/startTime/endTime/status/presenceLog/billableSec/escrowSettlement/sfuSessions`)同時承擔「排定的一堂」(status=SCHEDULED)與「實際發生的一次上課」(LIVE→COMPLETED);**進教室時必建/認領**(補上 `createCourseSession` 呼叫者),以 `sessionId` 串起以下各表;訂單的 `remainingSessions` 過渡期雙寫。現有 `class-summaries` 擴充為 L3 儲存。
硬性規則(來自既有事故):GSI 鍵屬性**不得寫 null**(省略屬性);**先部署程式、再建 GSI**;存取判斷一律 GSI Query 分頁到底,**不用 Scan+Filter**;每張新表的 env 名稱要加進 `next.config.ts` 的 `env` 區塊;租戶鍵一律用 `orgId`;不要複製 `lib/keyLogger.ts:190` 把 sort key 放進 FilterExpression 的 bug。

| 表 | PK / SK | GSI | 主要欄位 |
|---|---|---|---|
| `lesson-events` | `sessionId` / `ts#eventId` | — | type, source(marker\|system\|ai\|time), confidence, actorRole, payload, segmentSeq, ttl |
| `lesson-segments` | `sessionId` / `seq` | `byCourseId`(courseId, startTime) | start_time, end_time, topic, objective, transcriptKey(S3), teacher_actions, student_interactions, whiteboardSnapshotKey, questions[], mistakes[], ai_summary, learning_analysis, boundarySource, confidence, ai_cost, model_used, editedBy |
| `class-summaries`(擴充) | `summaryId` | 既有 byStatus/byOrderId/byCourseId | + sessionId, teacherView, timeline[], audioTrackKeys{role→key}, consentVersion, retentionClass, retentionUntil, costBreakdown |
| `lesson-student-views` | `sessionId` / `studentId` | `byStudent`(studentId, createdAt) | 學生視角(今天學了什麼/哪裡不熟/複習/推薦練習)— **每位學生一筆**,避免同一 item 內含他人視角造成外洩 |
| `student-learning-profiles` | `studentId` / `SUBJECT#s` 或 `CONCEPT#id` | `byTenant` | mastery 歷史(近 20 堂)、status(mastered\|unstable\|weak)、repeatedMistakes, learningSpeed, questionPatterns, recommendedTopics |
| `course-knowledge` | `courseId` / `CHUNK#id` | — | 共用教材知識 + embedding(沿用 `lib/embeddings.ts`);**不得寫入任何學生資料** |
| `ai-feature-config` | `featureId` / `scope`(GLOBAL\|TENANT#\|PLAN#\|TEACHER#\|COURSE#\|LESSON#\|USER#) | — | §7 的 17 欄 |
| `ai-usage-ledger` | `date` / `ts#requestId`(沿用 keyLogger 形狀) | `bySession`、`byUser`、`byTenantMonth` | `orgId, user_id, teacher_id, course_id, session_id, segment_id, feature, model, provider, input_tokens, output_tokens, reasoning_tokens, gpu_type, gpu_seconds, image_count, video_seconds, rtc_participant_minutes, rtc_gb, credits_consumed, estimated_cost_musd, actual_cost_musd, costCenter(platform\|ai), status, requestId, created_at` |
| `cost-rollups` | `scopeKey`(LESSON#id \| TENANT#id#yyyymm \| TEACHER#… \| COURSE#… \| STUDENT#… \| FEATURE#… \| GLOBAL#yyyymm) | — | rtc/llm/stt/gpu/storage/credits/requests 累加 + `committed`(預算條件用);**與 ledger Put 同一個 TransactWrite**;尖峰約 7 writes/s,遠低於單分區上限,不需分片 → Dashboard 與預算檢查只讀這張,不掃 ledger |
| `point-transactions` | `userId` / `ts#txId`;另有 `IDEMP#<key>` item | `byRef`(refId,僅查詢用) | type(purchase\|enroll_hold\|escrow_release\|platform_fee\|ai_reserve\|ai_charge\|ai_refund\|reserve_expired)、amount(credits)、bucket(general\|media_grant)、refType/refId、reservationExpiresAt |
| `gpu-jobs` | `jobId` | `byUser`、`byStatus` | `workflow, gpu_type, gpu_seconds, start_time, end_time, user_id, teacher_id, course_id, session_id, quoted_price, reserved_credits, estimated_cost, actual_cost, status, attempts, outputKey(S3), expiresAt` |

**Memory 邊界**:Shared(`course-knowledge`、course/lesson 層摘要)vs Student-specific(`student-learning-profiles`、該生的 events/segments 視圖)。Gateway 的 prompt 組裝需帶 `memoryScope`;Tutor = 共用課程知識 + 當前 segment 脈絡 + **僅該生** profile。送 LLM 前去識別化(以「老師/學生」代稱,沿用前計畫)。
**計數/冪等/熔斷**:v1 用 DynamoDB 條件寫入與 `ADD`(符合「Lambda 不跨雲連 Redis」既有決策);Redis(Valkey on Render)只服務 Centrifugo 與其旁的即時元件。

## 9. API Design(慣例:`withAuth`/`withAdmin`(`lib/auth/apiGuard.ts`)、`verifyClassroomAccess`、cron 用 `CRON_SECRET`;新增後同步 `docs/api_registry.md`)

| Method / Path | 用途 | 守門 |
|---|---|---|
| POST `/api/lessons/[sessionId]/markers` | 老師斷點 `{type, note?, clientTs}` | 老師 + classroom access |
| POST `/api/lessons/[sessionId]/events` | client 批次上報 system events | classroom access |
| GET `/api/lessons/[sessionId]/events?since=` | Copilot 輪詢備援 | classroom access |
| GET `/api/lessons/[sessionId]/timeline` · PATCH `…/segments/[seq]` | Timeline 讀取 / 老師課後編修 | 師生 / 老師 |
| GET `/api/lessons/[sessionId]/copilot` · POST `…/copilot/suggest` | 即時洞察 / 按需推薦講法 | 老師 |
| POST `/api/ai/tutor`(一次回應 JSON;Amplify 上 SSE 無效,串流列為日後以 Lambda Function URL 實作) | 學生提問,`hintLevel` 1–4 伺服端遞增 | 學生 + feature |
| POST `/api/ai/assessment/generate` · `/submit` | 出題(老師確認後派發)/ 批改 | 老師 / 學生 |
| GET `/api/lessons/[sessionId]/analysis?view=teacher\|student` | L3 結果 | 師生(學生只見自己) |
| GET `/api/students/[id]/learning-profile` | L4 | 本人/其老師/機構管理員 |
| POST `/api/ai/media/jobs` · GET `…/[id]` · POST `/api/webhooks/runpod` | GPU 任務 | feature + 點數 / 簽章 |
| GET `/api/ai/features/resolve` | UI 查可用性/點數/剩餘額度 | 登入 |
| GET/PUT `/api/admin/ai-features` · `/api/admin/ai-pricing`(提案/核准) | 旗標與定價後台 | admin |
| GET `/api/admin/cost/summary?groupBy=tenant\|teacher\|course\|lesson\|student\|segment\|feature` · `/api/admin/cost/lessons/[sessionId]` | Cost Dashboard / 每堂 Cost Meter | admin |
| 內部:S3 event→λ L1;DynamoDB Streams→λ L2/L4;EventBridge→λ L3(擴充 `/api/cron/class-summaries`) | 非同步分析 | IAM / CRON_SECRET |

回應格式統一 `{ ok:false, error }` + HTTP status(沿用 `app/api/class-summaries/route.ts` 的寫法:`runtime='nodejs'`、`dynamic='force-dynamic'`、`handleX(req: AuthedRequest)` + `export const X = withAuth(handleX)`;動態路由 `params` 為 Promise 需 `await`)。`node_modules/next/dist/docs/` 在本機不存在,Next 16 慣例以 repo 內既有路由為準。

## 10. 50-minute Lesson Unit Economics(1對1,NT$)

| 項目 | A 現況:Agora、無 AI | A′ CF SFU、無 AI | **B CF SFU + AI Learning** | B-Agora:Agora + AI |
|---|---|---|---|---|
| Revenue | 600 | 600 | 600 | 600 |
| Teacher share 70% | −420 | −420 | −420 | −420 |
| 金流手續費 ~2.8% | −16.8 | −16.8 | −16.8 | −16.8 |
| RTC(含白板) | −17.2 | −1.25 | −1.25 | −17.2 |
| LLM + STT | 0 | 0 | −3.6 | −3.6 |
| GPU(Media 由點數另收,不計入) | 0 | 0 | 0 | 0 |
| Storage(音訊/逐字稿/快照) | 0 | 0 | −0.05 | −0.05 |
| DB/Lambda/Hosting 變動 | −1.3 | −1.3 | −1.3 | −1.3 |
| **Platform Contribution** | **144.7(24.1%)** | 160.7(26.8%) | **157.0(26.2%)** | 141.1(23.5%) |
| 技術成本佔營收 | 3.1% | 0.4% | 1.0% | 3.7% |
| 技術成本內 RTC 佔比 | **93%** | 49% | 20% | 78% |

解讀:B(換 CF + 開 AI)比 A(現況、沒 AI)每堂多 NT$12 — **但這是 CF 省下的錢蓋過了 AI 的花費,不是 AI 自己賺的**。單看 AI:在任何 RTC 路徑上它都讓每堂貢獻減少 NT$3.65–4.6(A′ 160.7 → B 157.0;Agora 路徑 144.7 → 141.1),必須靠續課率/客單/老師生產力賺回來(§12)。AI 會成為技術成本最大項(58%),但總額從 NT$18.5 降到 NT$6.2。護欄:**技術 COGS ≤ 營收 3%、AI Learning ≤ NT$8/堂(p95)、硬上限 NT$12**。

**基準表未含、須進試算表當參數的校正項**(多數比 RTC+AI 加總還大):

| 校正項 | 對每堂貢獻的影響 |
|---|---|
| Agora 回退比例 f(B 假設 0%) | 混合 RTC = (1−f)×1.25 + f×17.2 → f=5%:NT$2.05;f=10%:NT$2.85 |
| Netless 尚未移除(B 的 1.25 假設已換自製白板;該程式仍在 `stash@{0}` 且握手靠 Agora RTM) | −NT$4.5 |
| 對話型課堂 L1 段數、AI Review、Lambda 運算 | −NT$0.95 |
| 未關閉 thinking tokens | −NT$1.6 ~ −4.8 |
| 365 天音訊保存(累積儲存) | −NT$0.3 |
| 營業稅 5%(若 NT$600 為含稅價) | 營收 −NT$28.6 |
| 平台吸收的 10% 點數包折扣/贈點 | −NT$60(貢獻 157 → 97) |
| 退款、no-show、免費試教 | 依實際比率,Phase 0b 取數 |

**小班 1 師 4 生(假設每生 NT$300、老師 70% — 售價為我方假設,待確認)**:營收 1,200 − 老師 840 − 金流 33.6 − 基礎設施 2.5 − AI 6.7 = RTC 前 317.2。RTC:CF NT$5 → 貢獻 **312(26.0%)**;Agora 訂閱優化後 NT$43 → 274(22.8%);**Agora 現況寫法 NT$139 → 178(14.8%)**。小班才是 RTC 真正咬利潤的地方。
敏感度:若售價 NT$400、老師 80%(平台實拿 ~NT$69),現況 Agora + AI 的 NT$22 會吃掉 32% — 此時 RTC 才是真威脅,CF 遷移變成必要條件。
AI Cost / Saved Teacher Hour:若 AI 每堂省老師 10 分鐘行政(摘要/出題/錯題整理),NT$3.6 ÷ (10/60) = **NT$22/省下的老師工時**。

## 11. 規模模型(1對1;每生每月堂數 = 週堂數 × 4.33;固定技術費 NT$3,200→16,000 階梯)

**每週 2 堂的明細(NT$/月)**

| 學生 | 堂數 | Revenue | Teacher | 金流 | RTC-Agora | RTC-CF | AI | 基礎設施 | GP 情境A | GP 情境B | B 毛利率 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 20 | 173 | 103,800 | 72,660 | 2,906 | 2,122 | 0 | 631 | 3,425 | 22,687 | 24,177 | 23.3% |
| 50 | 433 | 259,800 | 181,860 | 7,274 | 6,607 | 0 | 1,580 | 3,763 | 60,296 | 65,322 | 25.1% |
| 100 | 866 | 519,600 | 363,720 | 14,549 | 14,076 | 0 | 3,161 | 4,326 | 122,929 | 133,845 | 25.8% |
| 500 | 4,330 | 2,598,000 | 1,818,600 | 72,744 | 73,830 | 3,803 | 15,805 | 12,029 | 620,797 | 675,020 | 26.0% |
| 1000 | 8,660 | 5,196,000 | 3,637,200 | 145,488 | 148,523 | 9,208 | 31,609 | 20,858 | 1,243,931 | 1,351,637 | 26.0% |

**情境 B 月毛利(NT$)— 學生數 × 週堂數**

| 學生 | 1 堂/週 | 2 堂/週 | 4 堂/週 | 8 堂/週 |
|---|---|---|---|---|
| 20 | 10,568 | 24,177 | 51,555 | 106,467 |
| 50 | 31,140 | 65,322 | 133,845 | 267,127 |
| 100 | 65,322 | 133,845 | 267,127 | 539,055 |
| 500 | 335,109 | 675,020 | 1,351,637 | 2,704,874 |
| 1000 | 675,020 | 1,351,637 | 2,704,874 | 5,424,150 |

1000 生×2 堂/週時:Agora 每月 NT$148k vs CF NT$9k;AI NT$32k。Agora 大量時可談折扣,但數量級差距不變。GPU/Media 不在表內:以點數向使用者收費且毛利 ≥60%,永遠為正貢獻。

## 12. Break-even Analysis

- 公式:`Break-even 學生數 = 月固定成本 ÷ (每堂貢獻 × 每生每月堂數)`;情境 B 每堂貢獻 ≈ NT$157。
- 只算技術固定費(NT$3,200):21 堂/月 ≈ 3 位學生即打平 — **技術成本不是損益關鍵**。
- 含團隊+行銷固定費,例 NT$300,000/月(需 ~1,950 堂/月,此量級技術固定費已升至 NT$6,400 階):1 堂/週 **451 生**、2 堂/週 **226 生**、4 堂/週 113 生、8 堂/週 57 生(無條件進位)。
- 固定技術費階梯(假設):≤1,000 堂/月 NT$3,200(Amplify + DynamoDB 基本量 + Render 2×Starter+KV $24 + 網域/郵件);≤5,000 堂 NT$6,400;≤10,000 堂 NT$9,600(Render Standard、HA);以上 NT$16,000。
- AI 的**營運**損益:AI 每堂 NT$3.65–4.6 = 平台貢獻的 2.3–2.9%。只要 AI(Timeline/複習/學習檔案)讓續課率或客單提升超過此比例(相對)即回本;以 `AI Cost vs Retention` 做 A/B(AI on/off 課程的 4 週續課率)驗證。
- AI 的**真正**損益門檻是建置成本:Phase 2–4 約 15–19 人週。以每堂貢獻 NT$157 計,需靠 AI 帶來的**增量**堂數回收(例:人週成本 NT$50,000 → 約 NT$85 萬 → 約 5,400 堂增量)。這是決定 Phase 3–4 範圍深淺的依據,也是「先上零 AI 切片驗證需求」的理由。
- **前提警告**:以上全部建立在「平台抽 30%」。程式現況老師拿 100%,貢獻 = −金流−技術成本 < 0。

## 13. Implementation Roadmap

總量約 35–44+ 人週;其中 0a→2 約 13–17 人週是任何 AI 上線前的地基。排程原則:**Day 0 熱修不等合併;0b 與 1 互不相依、平行進行;第一個使用者可見的版本是「零 AI 切片」(3a)**,用來在投入 L1/L2 前先驗證老師會不會用 Marker、學生會不會看 Timeline。日曆時間 = 人週 ÷ 投入人數(團隊規模待你提供)。

| Phase | 內容 | 出口條件 | 估工 |
|---|---|---|---|
| **Day 0 熱修**(獨立於合併) | 在 `main` 直接修:`/api/agora/token`、`/api/agora/rtm-token` 加 `withAuth` + `verifyClassroomAccess`、移除硬編憑證(可嘗試 cherry-pick `bd85fe7` 的對應部分,衝突則手動套用);你到 Agora Console 輪替 Certificate + 設用量告警 | 未登入請求拿不到 token;舊 Certificate 失效 | 1–2 天 |
| **0a 分支收斂 + 堵敞口**(新增,阻斷項) | 盤點 `main` ↔ `integration/b2b-security-merge`(18/21)與 `stash@{0}`;**逐批**合併(安全修正 → schema.mjs/setup-db → courseSession/escrow/classroom-complete → rate limit → realtime/SFU → whiteboard RTC → class-summary),每批 `tsc`+build+verify 腳本全綠才進下一批,**不 force**;輪替 Agora Certificate、token 路由守門;補 `PATCH /api/orders/[orderId]`、`/api/points-escrow`、`/api/chat`、`/api/translate` 驗證 | main 可 build;untracked 檔可編譯;`verify-escrow-settlement`、`verify-strip-tabid` 全過;無未驗證的計費/AI/RTC-token 端點 | 2–3 人週 |
| **0b Cost Audit + 計費地基**(與 1 平行) | 成本基準表(本文件數字落成試算表,含 §10 校正項參數,填入實際 Agora/AWS/Netless 帳單);**L1 go/no-go gate**(自足 60s 音訊 → 模型 → transcript+events,Chrome + iOS Safari,中英夾雜 WER;需同意動用付費 API);RunPod 各 workflow 實測 gpu_seconds;定義老師每點結算匯率與 AI credits 粒度;**P0:原子扣點(`deductUserPoints`)、點數帳本、平台抽成、`ai-usage-ledger` + `cost-rollups`、prod 建 `rate-limits` 表** | 每堂成本可由 ledger 重建;點數並發測試 0 雙花 | 3–4 人週 |
| **1 RTC Optimization** | Agora 路徑優化(audio-first、小班訂閱/上行解析度規則與人數上限、等候室不入頻道/自動離開、下課釋放 escrow);CF SFU 真實憑證驗證矩陣 V1–V12;結算 cron;per-session 灰度 + kill switch(沿用既有計畫);`course-sessions` presence → RTC 用量寫入 ledger | Agora 回退率 ≤3%(目標)/≤10%(出口)、**混合** RTC ≤NT$3/堂(純 CF session ≤NT$1.5)、回退演練通過 | 4–5 人週 |
| **2 AI Infrastructure** | AI Gateway(遷移 8 處呼叫)、OpenRouter adapter、Task Router/model policy、7 層 feature flag + 後台、AI Cost Meter、AI credits + Media reserve/settle + sweeper、Cost Dashboard v1、**Lambda 建置/部署工具鏈**(esbuild script + CloudFormation:S3 notification、Streams event-source mapping + filter、DLQ) | 任一 AI 呼叫皆有 ledger 列;旗標解析表格測試通過;預算觸頂會降級;可一鍵部署一支 stream-triggered Lambda | 5–6 人週 |
| **3a 零 AI 切片**(第一個使用者可見版本;只依賴 0a + Session 建立,可與 2 平行) | Session 建立(決定性 id)、Teacher Marker UI、system events 上報、Segmenter(單一寫入者)、由 marker/system/time 產生的 Timeline 頁 + 錄音同意 UI + recorder 輪替修正 + 既有 L3 課後摘要接線 | 老師 marker 使用率、學生 Timeline 開啟率有數據;Timeline 在 AI 全關時仍完整 | 3–4 人週 |
| **3b AI Live Teaching**(gate:0b 的 L1 go/no-go 通過) | L1 Lambda、L2、Copilot 面板、Student Tutor | 點狀事件 ≤90s;marker 永遠優先;L1+L2 ≤NT$4/堂(p95) | 4–5 人週 |
| **4 AI Learning** | L3 雙視角(老師/每位學生一筆)+ AI 章節併入 Timeline、Assessment、AI Review、L4 Learning Profile、跨堂趨勢 | AI 章節可跳轉;AI Learning p95 ≤NT$8/堂 | 5–6 人週 |
| **5 AI Media** | RunPod adapter + `gpu-jobs` + webhook;Image → Img2Img → Voice → Lip Sync/Digital Human → Img2Video;Media 限額/點數桶;Replicate 原型遷移 | 每 job 有實際成本;Media 毛利 ≥60%;失敗全額退點 | 5–7 人週 |
| **6 Enterprise** | Tenant 級旗標/預算/報表、RBAC 擴充、用量計費匯出、Audit、Model/AI Governance、Enterprise API(HMAC 已有) | 租戶成本報表與帳單對得上 | 6+ 人週 |

## 14. Detailed Task Breakdown(功能規格矩陣)

完整 19 欄模板(Feature/Purpose/User Story/…/Rollback)於各 Phase 開工時逐功能寫入 `docs/ai-platform/specs/<feature>.md`;此處為濃縮版。所有功能共通:Monitoring = ledger + keyLog + rollup 告警;Rollback = 該功能旗標關閉(Global kill switch),資料表只增不改。

| Feature | Frontend | Backend / API | DB | Model / Provider | 依賴 | 主要風險 |
|---|---|---|---|---|---|---|
| 原子點數+帳本+抽成 | 點數明細頁 | `lib/pointsStorage.ts`、`lib/pointsEscrow.ts`、`lib/paymentSuccessHandler.ts` | `point-transactions` | — | 無 | 既有餘額遷移;老師端抽成溝通 |
| Usage Ledger + Cost Meter | `/admin/cost` | `lib/ai/gateway/ledger.ts`、`/api/admin/cost/*` | `ai-usage-ledger`、`cost-rollups` | — | 無 | 重試重複累加、check-then-act 預算 → ledger+rollup 同一 TransactWrite、`committed` 條件遞增 |
| AI Gateway | — | `lib/ai/gateway/*`(擴充 `llmClient.ts`);遷移 ai-chat、chat、image-analysis、line webhook、workflowEngine、learningContentAnalysis、translate | `ai-feature-config` | OpenRouter + Gemini 直連備援 | Ledger | 遷移回歸;SMART_ROUTER 欄位名不一致的既有 bug |
| Feature Flag 7 層 | `/admin/ai-features` | `lib/ai/entitlements.ts`、`/api/ai/features/resolve` | `ai-feature-config` | — | 伺服端方案權益 | 解析規則被誤解 → 文件 + 表格測試 |
| Session 建立 + 同意 + 錄音接線 | 等候頁同意、教室「錄音中」 | 補 `createCourseSession` 呼叫、`/api/class-summaries/*` | `course-sessions`、`class-summaries` | — | 法務確認條款 | 未成年同意;iOS MediaRecorder |
| Teacher Marker + Segmenter | 教室 marker 列(6 鈕) | `/api/lessons/*/markers|events`、`lib/lessonAI/segmenter.ts` | `lesson-events`、`lesson-segments` | 無 | Session | 老師不按 → 靠 system/AI/time 補 |
| L1 Event Detection | — | `lambda/ai-l1-detector`(S3 event + DLQ);recorder 輪替修正 | `lesson-events` | Flash-Lite 級音訊輸入 | Gateway、錄音 | 中英夾雜 STT 品質;60s 延遲 |
| L2 / Copilot | 老師側欄 | `lambda/ai-segment`、`/api/lessons/*/copilot` | `lesson-segments` | Flash 級 | L1 | 干擾教學 → 預設收合、只提示不指揮 |
| Student Tutor | 學生側欄 | `/api/ai/tutor`(一次回應,總 deadline 12–15s) | ledger | Flash 級 | Gateway、course-knowledge | 直接給答案 → hintLevel 伺服端控管 |
| L3 + Timeline | 課後頁(重用 `app/learning-content/page.tsx` 版面)+ 播放器 | `lambda/ai-lesson`(擴充現有 cron)、每軌各自串接(不混音) | `class-summaries`、`lesson-student-views` | Flash / 高階 | L2、快照留存 | 音訊保存期 vs 隱私 |
| Assessment / Review / L4 | 測驗 UI、複習頁、學習檔案頁 | `/api/ai/assessment/*`、`lambda/ai-profile` | `student-learning-profiles` | Flash / Flash-Lite | L3 | 概念 ID 正規化(同概念不同說法) |
| AI Media | 生成頁 + 任務列 | `/api/ai/media/*`、RunPod adapter、webhook | `gpu-jobs` | RunPod Serverless | 點數 reserve/settle | 冷啟動成本、內容安全審核 |

**近期階段的工單級拆解**(Day 0 / 0a / 0b / 1;其後各 Phase 開工時以同樣粒度補)

| # | 工單 | 主要檔案 | 驗證 |
|---|---|---|---|
| D0-1 | Agora token / rtm-token 加 `withAuth`+`verifyClassroomAccess`,移除硬編憑證,憑證改讀 env | `app/api/agora/token/route.ts`、`app/api/agora/rtm-token/route.ts` | 未登入 401;已報名學生可取 token;e2e classroom canary |
| D0-2 | (你)輪替 Agora Certificate、設用量告警 | Agora Console | 舊 token 失效 |
| 0a-1 | 唯讀盤點:逐檔差異 + 合併批次提案 | `docs/ai-platform/branch-reconciliation.md` | 你確認批次 |
| 0a-2 | 先開 `backup/main-<date>`;untracked 檔分批入版控 | — | `git status` 乾淨 |
| 0a-3…8 | 依批次合併:安全 → schema/setup-db → courseSession+escrow+classroom/complete → rateLimit → realtime/SFU → whiteboard RTC+class-summary | 各批對應檔 | 每批 `tsc`、`next build`、相關 `verify-*.mjs` 全綠 |
| 0a-9 | 補守門:`PATCH /api/orders/[orderId]`、`/api/points-escrow`、`/api/chat`、`/api/translate`、`/api/classroom/session`;`x-e2e-secret` bypass 限 `APP_ENV=local` | 各 route、`lib/auth/apiGuard.ts` | 未授權 401/403 的 verify 腳本 |
| 0b-1 | 成本試算表(含校正項參數) | `docs/ai-platform/cost-model.xlsx` | 與本文件基準表逐格相符 |
| 0b-2 | 原子扣點 `deductUserPoints`(`ADD` + 條件)、`addUserPoints`;`paymentSuccessHandler` 改用 | `lib/pointsStorage.ts`、`lib/paymentSuccessHandler.ts` | 假 DDB 並發 50× 無雙花(仿 `verify-escrow-settlement`) |
| 0b-3 | `point-transactions` 帳本 + idempotency item;所有餘額異動寫帳本 | `scripts/lib/schema.mjs`、`lib/pointsLedger.ts`(新) | 帳本重算餘額 = 實際餘額 |
| 0b-4 | 平台抽成:`releaseEscrow` 拆老師/平台兩筆分錄;老師每點結算匯率設定 | `lib/pointsEscrow.ts`、`lib/pricingService.ts` | 70/30 分錄正確;既有 HOLDING escrow 的遷移規則明確 |
| 0b-5 | `ai-usage-ledger` + `cost-rollups` 表與寫入函式(TransactWrite、micro-USD) | `scripts/lib/schema.mjs`、`lib/ai/gateway/ledger.ts`(新)、`next.config.ts` env | 重試不重複累加;預算條件遞增測試 |
| 0b-6 | prod 建 `rate-limits`、`class-summaries` 表(`setup-db --only=`,逐次徵得同意) | — | `verify-schema --live` |
| 0b-7 | L1 go/no-go:recorder 輪替原型 + 真實錄音跑 provider 路徑(付費 API,先徵得同意) | `lib/classroom/useClassAudioRecorder.ts`、scratch script | 每段可獨立解碼;WER 與成本報表 |
| 1-1 | Agora:老師端預設只訂閱學生音訊(audio-first)+ UI 切換 | `lib/agora/useAgoraClassroom.ts`、`ClientClassroom.tsx` | Agora 用量報表 audio 分鐘出現 |
| 1-2 | 小班規則:學生只訂閱老師+發言者、學生上行 ≤640×360、房間人數上限入 token 簽發 | 同上 + token route | 1 師 4 生聚合解析度 ≤921,600 |
| 1-3 | 等候室不入頻道、表定下課 +10 分自動離開、token 短效、關 `setLogLevel(0)` | 同上 | 殭屍分頁不再累積分鐘 |
| 1-4 | CF SFU 真實憑證驗證矩陣 V1–V12(付費/對外,先徵得同意)+ 先向 CF 詢問配額 | integration 的 `useCloudflareSfuProvider.ts` 等 | 矩陣報告 |
| 1-5 | 結算 cron + per-session sticky 灰度 + kill switch(設定存 DynamoDB) | 依 `3-5-redis-parsed-phoenix.md` §2.2 | 回退演練 |
| 1-6 | `course-sessions` presence → RTC participant-min/GB 寫入 ledger(costCenter=platform) | `lib/courseSessionService.ts`、ledger | 每堂 Cost Meter 顯示 RTC 列 |

## 15. Acceptance Criteria(每個 AI 功能九項;數值為初始門檻,Phase 0 校準)

| Feature | Functional | Cost(p95) | Latency(p95) | Quality | Failure / Fallback | Limit | Points | Audit |
|---|---|---|---|---|---|---|---|---|
| L1 | 每個上傳分段產生 transcript+events(含 `offsetSec`) | ≤$0.0012/段;≤NT$4.6/堂(= 上限段數 × 單段上限) | 上傳後 ≤30s;AI 邊界於 ≤150s 內確認並回溯標記 | 邊界 F1 ≥0.7、時間誤差 ≤30s(對老師 marker 標註集);中英夾雜 WER 達 0b 門檻 | 失敗重試 ≤1,仍失敗標 `transcript_pending` 由 L3 補轉錄;熔斷後走時間 fallback | 每堂 ≤ `50 + 25×學生數` 段(1對1 = 100…120) | 含方案 | ledger 每段一列 |
| L2 | 每 segment 一份分析 | ≤$0.005/段 | 段結束後 ≤60s | 老師抽樣可用率 ≥80% | fallback 模型 → 失敗則標 `pending` 併入 L3 | ≤10 段/堂 | 含方案 | ✔ |
| Tutor | 提示階梯 1→4 不跳級 | ≤$0.003/則 | 完整回應 ≤6s(無串流,輸出 ≤350 tok) | 不直接給答案(紅隊題組通過率 ≥95%) | provider 失敗 → fallback;皆失敗回固定訊息不扣額度 | 每堂 N 則(方案);超量提示扣點 | 超量才扣,失敗不扣 | ✔ |
| L3 + Timeline | 下課後產生雙視角 + 章節 | ≤$0.05/堂 | ≤10 分鐘 | 章節時間:marker/system 邊界精確、AI 邊界誤差 ≤30s;內容不足時標示而非硬湊(沿用現有防幻覺) | 3 次失敗 → FAILED,Timeline 仍由 marker/system 事件產生 | 1/堂,重生成 ≤2 | 含方案 | ✔ |
| L4 | 連續 ≥3 堂才下「未穩定」判定 | ≤$0.006/生/堂 | 非即時 | 與老師評估一致率 ≥75% | 失敗不影響 L3 | 1/生/堂 | 含方案 | ✔ |
| Media(每項) | 產物落 S3、任務狀態正確 | 實際成本 ≤ 報價 ×1.2 | 依 workflow 公告 | 內容安全檢查通過 | 逾時/失敗 **全額退點**;retry ≤1 | 日/月 + media 預算 | reserve→settle 一致,帳本可對帳 | ✔ |
| 全域 | 任一層旗標關閉即 403 + reason | 每堂 AI ≤NT$8(p95)、硬上限 NT$12 會觸發降級 | — | — | Global kill switch ≤60s 生效 | — | 並發 50× 無雙花 | 每次呼叫皆可由 ledger 重建成本 |

驗收不只「功能有跑」:每個功能上線前須在 staging 跑 ≥20 堂錄音回放樣本,輸出「預估 vs 實際成本」報表,偏差 >20% 不得上線。

## 16. Risks and Mitigation

| 風險 | 影響 | 緩解 |
|---|---|---|
| 平台抽成未實作(老師拿 100%) | 所有 unit economics 為負 | P0 第一項;與老師條款同步 |
| 點數非原子、無帳本 | AI 扣點雙花/無法對帳 | P0;並發測試用假 DDB(沿用 `verify-escrow-settlement` 作法) |
| CF SFU 未經真實驗證(iOS、對稱 NAT、TURN 443、無公開配額) | 換了卻不穩 | 驗證矩陣 + per-session 灰度 + Agora sticky 回退 + kill switch;先問 CF 配額 |
| 錄音/逐字稿/未成年個資、送第三方 LLM | 法遵 | 雙方同意才錄(已實作邏輯)、去識別化、保存期依方案、條款經法務;不同意 → 只有 marker Timeline |
| L1 設計的兩個未驗證前提:分段音訊可獨立解碼(現況不行)、最便宜的模型同時當 L2–L4 的逐字稿來源且中英夾雜品質足夠 | L1–L4 全部失準或根本跑不起來 | 0b 的 go/no-go gate(不是備註);不過 → STT 與事件偵測分離、provider 可換(介面已抽象);老師可修 Timeline;3a 零 AI 切片不受影響 |
| Gemini Flash 思考 token 以輸出價計費 | L2–L4、Tutor 成本 ×2–4 | `model_policy` 關閉/限額 reasoning;`estimateCost` 與 ledger 記 `reasoning_tokens` |
| 點數粒度(1 點 = NT$10–58)無法表達 AI 微額成本 | 定價失真或無法超量計費 | AI credits(1 點 = 100 credits)或組合包;0b 定案 |
| 「老師 70%」缺結算定義(點數→現金、折扣誰吸收、營業稅) | unit economics 表只是假設 | 0b-4 先定義結算匯率與分錄;試算表納入校正項 |
| AI 成本失控(retry 風暴、無驗證端點、長 context) | 毛利侵蝕 | 冪等鍵、retry ≤1、熔斷、每請求/每堂/每日上限、端點守門、rate limit |
| Amplify SSR 長任務/憑證限制 | 分析中斷 | 分析一律在獨立 Lambda;SSR 只做短請求 |
| AI 干擾老師教學 | 體驗變差、老師反彈 | Copilot 只建議不控制、預設收合、marker 永遠優先、老師可逐課關閉 |
| 60s 延遲讓「即時」感不足 | Copilot 價值打折 | 方案級 30s 選項;marker/system event 為 0 延遲 |
| RunPod 冷啟動拉高單次成本 | Media 定價失準 | 以 p90 實測定價、每週重算提案、active worker 只在尖峰 |
| **main ↔ integration 分歧 18/21**,RTC/結算/schema/rate-limit 全在另一分支;先前 force-merge 曾丟 15 commits 並破壞 build | 重工、遺失修正、或再次破壞 main | Phase 0a 逐批合併、每批全綠、不 force;先開 `backup/` 分支;untracked 檔先入版控再動 |
| Agora token 路由無驗證 + 憑證外洩於 git 歷史 | 他人盜用頻道、帳單暴增 | 立即輪替 Certificate、加守門、短效 token;Agora Console 設用量告警 |
| 小班在 Agora 現況寫法下落入 2K/2K+ 計費級 | 每堂 RTC 由 $0.4 變 $4–11 | 小班訂閱規則/上行解析度上限/人數上限;或小班一律走 CF SFU |
| `apiGuard` 的 `x-e2e-secret` bypass 未以環境閘門 | 可鑄造 `system` 角色呼叫 AI/計費端點 | 正式環境停用 bypass 或改為僅 `APP_ENV=local` |
| 範圍過大 | 什麼都做不完 | 嚴守 Phase 出口條件;Phase 3 的最小可上線切片 = Marker + Segmenter + L3 Timeline(零即時 AI 也成立) |

---

## 核准後的第一步(仍不寫功能程式)

1. 將本文件存為 `docs/ai-platform/architecture-and-cost-plan-2026-09-21.md`,並把 §10–§12 做成可調參數的試算表(`docs/ai-platform/cost-model.xlsx`:售價、分潤、堂數、碼率、各模型單價、免費額度)。
2. Phase 0a 盤點(唯讀):產出 `main` ↔ `integration/b2b-security-merge` ↔ `stash@{0}` 的逐檔差異與建議合併批次清單(`docs/ai-platform/branch-reconciliation.md`),**不執行任何 merge**,由你確認批次順序。
3. Phase 0b 稽核清單:取得實際 Agora/Netless/AWS 帳單填入基準;列出 STT 對比與 RunPod 實測所需的付費 API 預算,**逐項徵得同意後**才執行。
4. 為 Phase 0a 合併與 Phase 0b 計費地基各開一份實作計畫(含檔案級變更與測試),經你確認後才進入 implementation。
5. 你需要親自做的一件事(我不能代做):到 Agora Console **輪替 App Certificate**(已外洩於 git 歷史),並設定用量告警。
6. 唯一建議**不要等**的程式變更是 Day 0 熱修(D0-1:token 路由守門,1–2 天、範圍極小)。它仍是程式變更,需要你明確說「做」才會動手;其餘一律等對應的實作計畫核准。

## Verification(本規劃本身的驗證方式)

- 數字可重算:§5、§6、§10、§11 每個數字都由文首定價表 + 明列假設推得;試算表完成後以公式取代手算並交叉比對。
- 與既有文件一致性:RTC 93% 佔比與 `docs/mvp-cost-analysis-agora-alternatives.md` 吻合;RTC/信令/白板方向與兩份已核准計畫一致。
- 程式現況主張皆附檔案:行號;分支分歧(18/21、六個關鍵檔只在 integration)與 Agora token 路由硬編憑證已於本次規劃以 `git rev-list`/`git cat-file`/grep 親自驗證。
- 實作階段的驗證慣例:repo 無單元測試框架 → 純邏輯(segmenter、entitlements、cost estimator、point pricing)一律寫成可離線的 `scripts/verify-*.mjs`(`node --import ./scripts/lib/register-ts-resolve.mjs`),假 DynamoDB 不打 AWS;e2e 用 Playwright(`APP_ENV=local`、port 3005、mock payments);任何打到 prod AWS 或付費 API 的測試逐次徵得同意。

## 已查證的定價基準(2026-09-21,官方頁面)

| 項目 | 單價 | 免費額度 |
|---|---|---|
| Agora RTC Audio / HD / Full HD / 2K | $0.99 / $3.99 / $8.99 / $15.99 每 1k min(訂閱聚合解析度分級) | 10,000 min/月(買套餐即失效) |
| Agora Whiteboard (Netless) | $1.40 / 1k min | 併入 10k |
| Cloudflare Realtime SFU + TURN | $0.05/GB(僅 CF→client 出流) | 1,000 GB/月(SFU+TURN 共用) |
| LiveKit Cloud Ship | $50/月含 150k min + 250GB;超量 $0.0005/min + $0.12/GB;Egress $0.02/min | Build 5k min |
| Daily / 100ms / Twilio | $0.004/participant-min(Daily 大量 $0.0015);錄影 ~$0.0135/min | 10k min(Daily/100ms) |
| Gemini 2.5 Flash-Lite(OpenRouter) | in $0.10/M、audio-in $0.30/M、out $0.40/M(音訊 32 tok/s) | — |
| Gemini 2.5 Flash(OpenRouter) | in $0.30/M、audio-in $1.00/M、out $2.50/M | — |
| Deepgram Nova-3 multilingual | $0.0052/min batch、$0.0058/min stream | — |
| RunPod Serverless | 未能自官方頁取得逐 GPU 單價;文中以 $0.0003–0.0012/s 估算,**Phase 0 校準** | — |
