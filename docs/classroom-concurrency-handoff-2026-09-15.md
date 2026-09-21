# 教室同步併發容量：Session 交接知識庫

> **給新的 Claude**：本文件是「教室同步併發容量分析」session 的完整交接。讀完即可接手。
> 產生日期：2026-09-15。所有程式碼行號已在 HEAD `4dffce8`（分支 `integration/b2b-security-merge`）重新核對。
> **語言**：使用者用繁體中文，回覆與文件一律 zh-TW。
> **姊妹文件**：`docs/claude-session-handoff-2026-09-15.md`（另一個 session 寫的全專案交接，含本機測試環境規則、正式資料清理流程、禁跑清單）。本文件不重複那些內容，只在第 8 節引用。**不要覆蓋那份檔案。**

---

## 0. TL;DR

1. **使用者問題**：教室（1 老師 + 1 學生 = 1 組）用 Agora 時，同時上課的組數上限是：**有 PDF 約 5 組、無 PDF 約 7–8 組**。**MVP 要求 10 組**。
2. **MVP 驗收門檻是 10/10 全過**（`docs/MVP.md` §6.1，`SUCCESS_THRESHOLD=1`），不是 07 spec 預設的 75%，也不是 `merge-distributed-results.ps1` 實際預設的 90%（`docs/performance-test-report.md` 誤寫為 95%）。
3. **本 session 只做分析，沒有修改任何程式碼、沒有 commit、沒有跑測試。** 本文件是唯一產出。
4. **核心判斷**：目前量到的上限**主要是壓測機的瀏覽器資源上限**（單機 20 個 Chromium 各自做 720p30 編解碼 + PDF 渲染），**不是平台架構上限**。但有 3 個真實的平台／供應商問題會在正式上線時出現（第 5.2 節）。
5. **平台本身能撐幾組，至今沒有乾淨的量測**。EC2 結果在 `docs/performance-test-report.md` 仍是「待補充」。
6. **下一步建議**：先做第 7 節的 **P0 量測**（分散式或大規格機器 + 降低壓測影像規格），拿到數據再決定 P1 修正的優先順序。

---

## 1. 背景與目標

| 項目 | 內容 |
|---|---|
| 產品 | JV Tutor Corner，線上一對一家教（Next.js 16 App Router + AWS Amplify SSR + DynamoDB + S3） |
| 一組定義 | 1 老師 + 1 學生，壓測中 = 2 個 Chromium context |
| MVP 目標 G1 | 10 組同一時段完成 B2C 完整旅程，**10/10 通過**（`docs/MVP.md` §1.2、§6.1） |
| 主壓測 spec | `e2e/classroom/07_room_pdf_sync_stress.spec.ts`（`NO_PDF_MODE=1` 可跳過 PDF） |
| 使用者觀察 | 有 PDF ≈ 5 組；無 PDF ≈ 7–8 組 |
| RTC 供應商 | `NEXT_PUBLIC_RTC_PROVIDER`：`agora`（預設、正式）／`livekit`／`cloudflare-sfu`／`chime`。**使用者決定：保留 Agora，LiveKit 只是備援**（記憶 `project_livekit_migration.md`）。本分析全部針對 Agora 路徑。 |

---

## 2. 本 session 的工作歷程與狀態

| 步驟 | 內容 | 狀態 |
|---|---|---|
| 1 | 盤點教室相關程式：`ClientClassroom.tsx`、`BoardImpl.tsx`、`useAgoraClassroom.ts`、`useAgoraRTM.ts`、whiteboard／classroom API routes | 完成 |
| 2 | 讀既有壓測報告與根因文件（第 10 節清單） | 完成 |
| 3 | 查 commit `9aef405`（2026-07-17，為 t3.large 調 jitter） | 完成 |
| 4 | 產出分析結論並回報使用者 | 完成 |
| 5 | 產出本交接文件 | 完成 |
| — | 任何程式修改、測試執行、commit | **未做**，等使用者指示 |

**本 session 先前回報給使用者的內容，有兩點在本文件中更正：**
- 先前建議「統一 spec 75% 與 merge 腳本門檻」→ `docs/MVP.md` 已定為 100%，只需照 MVP 文件執行，並把 spec 預設值對齊。
- 先前建議「開 Agora dual stream」→ **撤回**。dual stream 會讓發送端多編碼一路小流，1 對 1 沒有多畫面切換需求，只會增加 CPU。改為建議降低預設影像規格（第 7 節 P1-1）。

---

## 3. 系統架構：一間教室開幾條線

每組教室在 `/classroom/room` 同時建立 4 條通道，**房間之間沒有共享的伺服器端狀態**，所以上限不是架構決定，而是由客戶端資源、供應商頻率限制、Lambda／DynamoDB 熱路徑決定。

```
瀏覽器（老師 / 學生，各一）
 ├─ Agora RTC      影音         agora-rtc-sdk-ng 4.23，mode rtc，VP8，預設 high = 1280x720@30fps 1.5Mbps
 ├─ Agora RTM      信令         agora-rtm-sdk 2.2.3，頻道 wb_<channel>：白板 UUID 廣播、翻頁、request-page-state
 ├─ Netless 白板   筆畫 + PDF   white-web-sdk（CDN 載入），region sg，房間由 /api/whiteboard/room 建立
 └─ Next.js API    Lambda       ready 輪詢 / 心跳、PDF 下載、Agora token、連線日誌 → DynamoDB / S3
```

### 3.1 關鍵程式碼位置（HEAD 4dffce8 已核對）

| 功能 | 位置 | 行為 |
|---|---|---|
| 影像預設規格 | `app/classroom/ClientClassroom.tsx:331` | `defaultQuality: 'high'` |
| 規格表 | `lib/agora/useAgoraClassroom.ts:48-50` | low 320x240@15/200k、medium 640x480@15/500k、high 1280x720@30/1500k |
| RTC client | `lib/agora/useAgoraClassroom.ts:259` | `codec: 'vp8'`；全 repo 沒有 `enableDualStream` |
| RTC provider 切換 | `lib/providers/rtc/useRTC.ts:24` | `NEXT_PUBLIC_RTC_PROVIDER ?? 'agora'`（build time） |
| 白板開關 | `app/classroom/ClientClassroom.tsx:133` | `NEXT_PUBLIC_USE_AGORA_WHITEBOARD !== 'false'` → 預設 Netless；`false` 時才用 `EnhancedWhiteboard`（自製 SSE／輪詢白板，正式未使用） |
| Netless 白板 init | `app/classroom/ClientClassroom.tsx` 約 595–885 行的 useEffect | 老師建房並用 RTM 廣播 UUID；學生等 RTM 8 秒，再輪詢 `lookupOnly` 30 秒，外層 55 秒逾時顯示重試 |
| `useNetlessWhiteboard` / `useTldrawWhiteboard` | `lib/providers/whiteboard/*` | **都是空殼 stub**，真正邏輯仍在 ClientClassroom |
| joinRoom 分散 | `components/AgoraWhiteboard/BoardImpl.tsx:230`、`:246` | 先隨機 0–3 秒，再依 userId hash 分散到 0–10 秒；逾時 35 秒；最多 2 次（`:234`） |
| RTM login 分散 | `lib/agora/useAgoraRTM.ts:161` | 依 userId hash 分散到 0–15 秒 |
| **PDF 插入** | `components/AgoraWhiteboard/BoardImpl.tsx:564-620` | 老師端 pdf.js 逐頁渲染（scale 1.2）→ `canvas.toDataURL('image/jpeg', 0.6)` → `room.putScenes(dir, [{ppt:{src: base64}}])` 一頁一次；等 15 秒確認 scene commit |
| PDF 自動插入觸發 | `app/classroom/ClientClassroom.tsx:1029` 起 | 只有老師端執行；URL 為 `/api/whiteboard/pdf?uuid=...` |
| PDF metadata 拉取 | `app/classroom/ClientClassroom.tsx:898` 起 | 最多 8 次重試，連續 5 次找不到就停 |
| 白板 UI 狀態輪詢 | `app/classroom/ClientClassroom.tsx:218` | 每 1 秒讀 board state、套用待處理翻頁 |
| 進教室前 ready 輪詢 | `app/classroom/ClientClassroom.tsx:1762` | 每 2 秒 GET `/api/classroom/ready`，雙方都在就停 |
| 心跳 | `app/classroom/ClientClassroom.tsx:1914-1920` | 隨機延遲 0–3 秒後每 15 秒 POST ready |
| ready API | `app/api/classroom/ready/route.ts` | GET 有 1.5 秒 in-memory cache（`:48`）；POST 以 `version` 條件寫整份 participants 陣列，衝突最多重試 5 次（`:6`、`:84-103`），耗盡即 throw → **500**（`:160`） |
| 白板房間 API | `app/api/whiteboard/room/route.ts` | Netless region 寫死 `sg`（`:96`）；`ROOM_CACHE` in-memory（`:81`）；UUID 寫 DynamoDB，條件寫衝突回 500 |
| 自製白板 SSE | `app/api/whiteboard/stream/route.ts:69` | 正式網域直接回單次 `connected` 後結束，不做長連線 |
| DynamoDB 筆畫服務 | `lib/whiteboardService.ts` | 只給 `EnhancedWhiteboard` 路徑用；Netless 路徑不走這裡 |

### 3.2 Lambda 上 in-memory 快取的限制

`ROOM_CACHE`、ready 的 `readCache`、stream 的 `roomStates` 都是**每個 Lambda 實例各一份**，實例間不共享、冷啟動就消失。不會造成錯誤，但在高併發下命中率很低，**不能當成減壓手段計算**。

---

## 4. 實測數據彙整

### 4.1 正式環境、headed、單機（2026-06-20 ～ 06-24，來源 `docs/classroom-*-stress-test-results.md`）

**有 PDF（上傳 + scene 同步）**

| 組數 | 進教室 | PDF 同步 | 結論 |
|---:|---:|---:|---|
| 1–3 | 全過 | 全過 | 穩定 |
| 4 | 4/4 | 1/4，重跑 4/4 | flaky |
| 5 | 5/5 | 4/5 | 邊界 |
| 6 | 6/6 | **0/6** | 失敗 |

**無 PDF（老師畫線 → 學生 canvas 驗證）**

| 日期 | 組數 | 進教室 | 畫線同步 | 備註 |
|---|---:|---:|---:|---|
| 06-20 | 6 | 6/6 | 6/6 | 修正前 |
| 06-20 | 7 | 7/7 | 0/7 | 修正前 |
| 06-20 | 10 | 10/10 | 0/10 | 修正前 |
| 06-24 | 7 | 7/7 | 7/7 | 加 jitter 後 |
| 06-24 | 8 | 8/8 | 8/8 | 加 jitter 後 |
| 06-24 | 9 | 9/9 | 6/9 | 失敗組 5、6、7 |

### 4.2 本機（2026-09-11 ～ 12，來源姊妹文件 §7、§10）

- canary 4/4、sync_quality 1/1 通過（單組正常）。
- 04／07 **3 組並行 0/3**；07 的 Netless room 停在 `phase: Init, writable:false`。
- 06 PDF 1/3；白板斷線重連 300 秒逾時。
- 本機 Windows、Mac 過去估計上限約 7 組（`docs/performance-test-report.md`）。

### 4.3 共通事實

- **課程建立、審核、報名、進 wait room、進 `/classroom/room`：10 組都 100% 通過。** 瓶頸只在進教室之後。
- 失敗訊息分三類：
  - 客戶端崩潰：`Target page, context or browser has been closed`、`ERR_SOCKET_NOT_CONNECTED`、`ERR_CONNECTION_CLOSED`
  - 供應商限制：`login too frequent`、`Presence operation failed`、`Kicked off by remote session`、`WhiteWebSdk not ready within 30 s`
  - 伺服器：心跳附近的 API `500`／`504`
- 歷次測試**沒有記錄壓測機 CPU／RAM**，也沒有記錄 500 是哪個 endpoint。

---

## 5. 根因分析

### 5.1 主要瓶頸：壓測機（證據強）

1. **資源估算吻合**：每個 Chromium 在 RTC 中約 150–250 MB、0.1–0.4 vCPU；10 組 = 20 個 ≈ 4–5 GB RAM、~3 vCPU（`docs/performance-test-report.md` §3）。
2. **假攝影機一樣要編碼**：`--use-fake-device-for-media-stream` 產生的畫面仍以 720p30 VP8 編碼，另一端再解碼。20 個分頁 × 編碼 + 解碼是最大 CPU 來源。
3. **PDF 多扣 2–3 組的原因在瀏覽器端**：老師分頁要 pdf.js 渲染每一頁、canvas 轉 JPEG base64；學生分頁要解碼所有 scene 圖。這與「有 PDF 5 組、無 PDF 8 組」的差距一致。
4. **失敗型態**是 page/context 被關閉，屬於 renderer 被殺或卡死，不是伺服器拒絕。
5. **本機 3 組就 0/3**（09-11），而正式環境 headed 能到 8 組，差異只能用機器與網路解釋。

### 5.2 真實存在、上線也會遇到的平台問題

| # | 問題 | 位置 | 影響 |
|---|---|---|---|
| R-1 | **Agora RTM／Netless 同 App ID 短時間大量登入被限流** | `useAgoraRTM.ts:161`、`BoardImpl.tsx:230-246` | 目前靠 hash 分散 15 秒／10 秒閃避。代價：學生最長約 13 秒才看到白板。整點同時開課仍會集中。 |
| R-2 | **ready 心跳樂觀鎖衝突 → 500** | `app/api/classroom/ready/route.ts:84-103` | 老師與學生（以及同一人多分頁）同時寫同一 item 的整份 participants 陣列，重試 5 次耗盡就 throw。 |
| R-3 | **PDF 以 base64 塞進 Netless 房間狀態** | `BoardImpl.tsx:604-620` | 每頁接近 512KB WebSocket 上限；房間狀態膨脹，重連者要重播全部 scene；老師端 CPU 尖峰。 |

### 5.3 次要觀察

- 白板 UI 每 1 秒輪詢 `getState()` 並 `setWhiteboardState`，會觸發 React re-render（`ClientClassroom.tsx:218`）。在 3,400 行的元件上，這是每分頁固定的 CPU 成本。
- `docs/project-architecture-overview.md` §4.1 仍寫門檻 75%，與 `docs/MVP.md` 衝突，以 MVP.md 為準。
- 07 spec 的 `SUCCESS_THRESHOLD` 預設仍是 `0.75`（`07_room_pdf_sync_stress.spec.ts:56`）。

---

## 6. 已經套用過的修正（不要重做）

| 時間 | 修正 | 位置 |
|---|---|---|
| 06-20 | 進教室後停止 2 秒 ready 輪詢；心跳加 0–3 秒 jitter | `ClientClassroom.tsx` |
| 06-20 | RTC／RTM／白板 init 前加隨機延遲 | `useAgoraClassroom.ts`、`useAgoraRTM.ts`、`BoardImpl.tsx` |
| 06-20 | e2e 白板等待逾時 30 → 60 秒 | `e2e/helpers/whiteboard_helpers.ts` |
| 07-17 `9aef405` | RTM jitter 6 → 15 秒；白板 hash 分散 4 → 10 秒 | `useAgoraRTM.ts`、`BoardImpl.tsx` |
| 07-17 `9aef405` | ready GET 1.5 秒 cache；雙方都在就停輪詢；樂觀鎖重試 8 → 5 次、指數退避 + jitter | `app/api/classroom/ready/route.ts`、`ClientClassroom.tsx` |
| — | 壓測資料復用旗標（`REUSE_STRESS_SETUP` 等）、錄影路徑改到 `test-results/playwright-recordings` | 07 spec、recording helper |
| — | 分散式壓測：`GROUP_OFFSET` + `SYNC_START_TIME` 多機同步 | `e2e/scripts/run-distributed-stress.ps1`、`merge-distributed-results.ps1` |

**繼續加大 jitter 不是解法**：已經拉到 15 秒，再加會直接傷害上課體驗。

---

## 7. 行動計畫（依優先順序，均未開始）

### P0：先把「平台上限」和「壓測機上限」分開量

目的：取得平台真實可承載組數，決定 P1 要修到什麼程度。

1. **壓測時降低影像規格**。目前沒有任何可從測試端覆寫的開關，`NEXT_PUBLIC_*` 是 build time，改了要重新部署。建議實作二選一：
   - 在 `ClientClassroom.tsx:331` 讀取 URL query（例如 `?vq=low`）或 `localStorage`，只影響 `defaultQuality`；e2e helper 進教室時帶上。
   - 或直接執行 P1-1（正式預設改 medium），壓測一起受益。
2. **分散壓測機**：用 `run-distributed-stress.ps1` 兩台各 5 組，或單台 8 GB 以上機器跑 10 組 headless。
3. **每次壓測記錄**：壓測機 CPU／RAM 峰值；瀏覽器 console 的 4xx／5xx 以 method + URL + status + group 記錄（`docs/classroom-pdf-sync-stress-test-results.md`「下一步除錯目標」已列但未做）；Amplify／CloudWatch 對應時段的 Lambda error log。
4. **判讀**：
   - 分散後 10/10 → 瓶頸確認在壓測機，P1 只需做 P1-2、P1-3 保險。
   - 分散後仍在固定組數失敗，且錯誤是 `login too frequent`／Netless 逾時 → 瓶頸在供應商，聯絡 Agora 確認 App ID 限額，或做 P1-4。
   - 錯誤是 500 → 先做 P1-2。

### P1：產品修正

| # | 修正 | 做法 | 效益 |
|---|---|---|---|
| P1-1 | **預設影像改 medium（640x480@15fps／500k）** | `ClientClassroom.tsx:331` 改 `'medium'`；保留使用者手動切 high 的 UI | 1 對 1 家教足夠；編碼 CPU 大幅下降；真實學生低階筆電與行動網路受益；Agora 以解析度級距計費，也可能降成本（需查 Agora 定價確認） |
| P1-2 | **ready 心跳改成不衝突的寫入** | participants 由陣列改為 map，以 `SET participants.#uid = :p` 更新單一使用者，不帶 version 條件；或每個使用者一筆 item（PK=uuid, SK=userId）用 Query 讀。GET 回傳格式維持陣列，避免改前端 | 消除 R-2 的 500 |
| P1-3 | **PDF 改成 URL 型 scene** | 方案 A：老師端仍用 pdf.js 渲染，但把每頁 JPEG 上傳 S3（沿用 `/api/whiteboard/presign`），`ppt.src` 放 URL。方案 B：伺服器端轉檔（Netless 文件轉換服務，`.env.local` 已有 `NETLESS_SDK_TOKEN`；或 wait 頁上傳時在後端轉圖）。**方案 B 可以把渲染從教室階段移到上傳階段**，對併發最有利 | 消除 R-3；scene 狀態從數百 KB 降到數十 bytes；重連快 |
| P1-4 | **降低 RTM 依賴** | Netless 房間本身會同步 `scenePath`／index 給所有成員。先驗證學生端只靠 Netless state 就能跟上翻頁，再評估移除 RTM 的翻頁訊息；白板 UUID 可改由 `/api/whiteboard/room` 查詢取得 | 少一條 WebSocket、少一種限流；**未驗證，需先做實驗** |
| P1-5 | **門檻對齊** | 07 spec 預設 `SUCCESS_THRESHOLD`（0.75）與 merge 腳本 `-SuccessThreshold`（0.90）改 `1`，或驗收指令一律明確帶 1；更新 `docs/project-architecture-overview.md` §4.1 | 避免 8/10 被誤判為達標 |
| P1-6 | **白板 UI 輪詢降頻或改事件** | `ClientClassroom.tsx:218` 改用 Netless `onRoomStateChanged` callback，或只在值改變時 setState | 降每分頁常駐 CPU |

### P2：長期

- LiveKit／Cloudflare SFU 已在 repo 中作為備援 provider。若 Agora 限流確認是硬上限，才評估切換；**使用者已決定不移除 Agora**。
- `useNetlessWhiteboard` 仍是 stub，白板邏輯抽離 ClientClassroom 屬於重構，與 10 組目標無直接關係。

### 驗收條件

- `CONCURRENT_GROUPS=10 SUCCESS_THRESHOLD=1` 下，**有 PDF 與無 PDF 各跑一次 10/10**。
- 全程無 API 5xx（MVP.md §6.1 S4）。
- 同一組設定連續 2 次通過，排除 flaky。

---

## 8. 執行測試前必須知道的事

1. **環境規則完整版在姊妹文件 §3**。重點：`.env.local` 是 `APP_ENV=production` 且指向正式 AWS；本機跑要加 `APP_ENV=local NEXT_PUBLIC_PAYMENT_MOCK_MODE=true DISABLE_RATE_LIMIT=true`。
2. **07 壓測對正式環境跑，會在正式 DB 建立課程、訂單、報名、S3 PDF，並消耗 Agora 分鐘數**（10 組 × 10 分鐘約 USD 0.83，見 `docs/mvp-cost-analysis-agora-alternatives.md`）。這是對外、會寫正式資料的操作，**執行前一定要取得使用者當下的明確同意**。
3. 測完的正式資料清理，**只能刪本次 run 產生、可用 id 列出的資料，先 dry-run**（姊妹文件 §9）。不要跑任何批次清理腳本。
4. 不要 commit、不要 push，除非使用者當下要求。另一個 session 可能同時在同一工作目錄開發，不要還原別人的異動。

### 常用指令（PowerShell，正式環境需先徵得同意）

```powershell
# 無 PDF，10 組，MVP 門檻
$env:APP_ENV='production'; $env:CONCURRENT_GROUPS='10'; $env:SUCCESS_THRESHOLD='1'
$env:NO_PDF_MODE='1'; $env:NO_PDF_STABILITY_MS='10000'
$env:STRESS_COURSE_DURATION_MINUTES='10'; $env:ENROLLMENT_PROPAGATION_WAIT_MS='0'
$env:SKIP_CLEANUP='1'; $env:HEADLESS='true'
npx.cmd playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium --reporter=line
```

```powershell
# 有 PDF：同上，移除 NO_PDF_MODE，STRESS_COURSE_DURATION_MINUTES 建議 30
Remove-Item Env:NO_PDF_MODE
```

```powershell
# 分散式：機器 A（會印出 SyncTime）
powershell -ExecutionPolicy Bypass -File e2e/scripts/run-distributed-stress.ps1 -MachineId A -GroupOffset 0 -GroupCount 5 -SyncDelaySec 300 -Headless
```

```powershell
# 分散式：機器 B（帶入 A 印出的 SyncTime）
powershell -ExecutionPolicy Bypass -File e2e/scripts/run-distributed-stress.ps1 -MachineId B -GroupOffset 5 -GroupCount 5 -SyncTime <A 的值> -Headless
```

```powershell
# 合併結果，MVP 門檻 100%
powershell -ExecutionPolicy Bypass -File e2e/scripts/merge-distributed-results.ps1 -ResultsGlob "results-machine-*.json" -SuccessThreshold 1
```

- 壓測帳號：`group-<N>-teacher@test.com`／`group-<N>-student@test.com`（`e2e/test_data/whiteboard_test_data.ts` 的 `getStressGroupConfigs`），密碼取自 `TEST_STRESS_*`／`TEST_*`／`QA_*` 環境變數。
- 復用前置資料可大幅縮短時間：`STRESS_RUN_TS=<固定值>` + `REUSE_STRESS_SETUP=1`。**課程時間過期的舊資料會造成假失敗**，容量結論要用 fresh setup。
- `playwright.config.ts`：`workers: 1`、`timeout: 60000`、已帶假媒體裝置旗標。07 spec 自己 `chromium.launch` 並為每人開 context，併發在單一 worker 內發生。

---

## 9. 待使用者決定的事項

1. **P0 用哪種壓測機**：兩台分散式（EC2 + 本機）或單台大規格 EC2？EC2 的啟停與費用由使用者控制。
2. **是否允許對正式環境跑 10 組壓測**（寫正式資料、耗 Agora 分鐘）。
3. **正式環境預設影像改 medium（P1-1）是否可接受**，這會影響所有真實上課畫質。
4. **PDF 轉檔方案**：前端渲染後上傳 S3（改動小），或伺服器端轉檔（改動大、併發效益最好）。
5. P1 各項要一次做完，還是等 P0 數據出來再排。

---

## 10. 參考文件

| 文件 | 內容 |
|---|---|
| `docs/MVP.md` | MVP 範圍與驗收，§6.1 為 10 組主驗收，§7 R3／R6 為教室相關風險 |
| `docs/claude-session-handoff-2026-09-15.md` | 全專案交接：環境規則、禁跑清單、正式資料清理、09-11 驗證結果 |
| `docs/classroom-pdf-sync-stress-test-results.md` | 有 PDF 1–6 組詳細紀錄 |
| `docs/classroom-no-pdf-stage-stress-test-results.md` | 無 PDF 6–10 組詳細紀錄（含 06-24 重測） |
| `docs/classroom-stress-test-root-cause-resolution-plan.md` | 06-20 根因與 jitter 修正說明（給甲方版） |
| `docs/performance-test-report.md` | 壓測機資源估算、分散式策略，EC2 欄位待補 |
| `docs/project-architecture-overview.md` §4 | 容量臨界點總表（門檻仍寫 75%，已過時） |
| `docs/classroom-hot-cold-path-architecture.md` | 熱資料 RPS 試算模型 |
| `docs/mvp-cost-analysis-agora-alternatives.md` | 10 組壓測成本、Agora 替代方案 |
| `docs/hybrid-architecture-plan.md` | Cloudflare SFU 等混合架構規劃 |
| `e2e/classroom/README.md` | 00–07 壓測套件用法與 SLO 環境變數 |
| `.agents/skills/classroom-room-whiteboard-sync/SKILL.md` | 白板同步 skill 與壓測指南 |
| 記憶 `project_livekit_migration.md` | LiveKit 為備援，保留 Agora |
| 記憶 `e2e-local-run-gotchas.md` | 本機測試前綴與禁跑清單 |

---

## 11. 更正（2026-09-16，local 實測）：發現阻斷性 access bug

**在本分支 `integration/b2b-security-merge` 上，第 4、5 節「上限主要卡在壓測機」的結論已被推翻。** 真正先擋住的是一個 access-control bug，容量根本測不到。

### 11.1 症狀

本機（`APP_ENV=local`，資料層仍是正式 DynamoDB）依序跑：

| 測試 | 帳號 | 結果 |
|---|---|---|
| `00_preflight` | — | 7/7 通過 |
| `01_canary`（單組） | QA `pro@`／`lin@` | 4/4 通過，畫線同步 525ms |
| `07`（1 組，NO_PDF） | `group-0-*` | **0/1 失敗**，學生一路 403 |
| `07`（2 組，NO_PDF） | `group-0/1-*` | 0/2 失敗，同樣 403 |

dev server log：`POST /api/whiteboard/room 403`、`POST /api/agora/token 403`，原因 `⛔ Access denied ... No active enrollment found`。

### 11.2 根因：`stripTabId` 截斷 canonical userId

- `lib/accessControl.ts:17` 的 `stripTabId(userId)` 在無 `@` 時，回傳 `userId.substring(0, lastIndexOf('_'))`。
- canonical 學生 id 形如 `u_1776606536043` 本身就含底線，於是被截成 `"u"`。
- `verifyCourseAccess`（`lib/accessControl.ts:44`）用 `stripTabId(userId)` 去查 enrollments 的 `byUserId` GSI，查 `"u"` → 查無 → 回 `No active enrollment found` → 403。
- 直接呼叫 `findActiveEnrollment('u_1776606536043', courseId)` 找得到 PAID 報名；`verifyCourseAccess('u_1776606536043', courseId)` 卻回 `granted:false`。同 process、同 id，差別只在 `stripTabId`。已用臨時腳本實證。

`stripTabId` 實測輸出：

```
"u_1776606536043"          => "u"          ← 壞掉
"u_1776606536043#tab_abc"  => "u_1776606536043#tab"
"pro-demo"                 => "pro-demo"
"u_177_tabXYZ"             => "u_177"
"user@x.com_tab9"          => "user@x.com"
```

### 11.3 影響範圍

- guard 由 `bd85fe7 security: ...classroom/whiteboard guards` 引入，套在 `app/api/agora/token`、`app/api/agora/session`、`app/api/whiteboard/room`（三個都呼叫 `verifyClassroomAccess` → `verifyCourseAccess` → `stripTabId`）。
- **06-24 量到的 5／8 組容量數字，全在這個 guard 之前**，因此不能代表本分支現況。
- 任何 id 形如 `u_<數字>` 且未帶 tab 後綴的已報名學生，都會被拒發教室 token 與白板房間。這不只擋壓測，正式環境同形 id 的真實學生也會中。
- QA 帳號 `pro@test.com`（canonical `pro-demo`）不含底線，所以 canary 不受影響、能過——這也是為何單組 canary 綠、07 壓測紅。

### 11.4 建議修法（未實作，屬 security 程式，待使用者確認）

`stripTabId` 用「最後一個底線」判斷 tab 後綴，與含底線的 canonical id（`u_<n>`）本質衝突，無法區分「`u_123` 無 tab」與「`u` + tab `123`」。可行方向：

1. 只剝除符合明確 tab 樣式的後綴（例如 `_tab<...>` 或 `#...`），而非任何最後底線；或
2. tab 後綴改用不會與 id 衝突的分隔符（如 `#`），並同步更新產生端與此函式；或
3. 若目前 session.userId 進到 access 檢查時本就不帶 tab 後綴（denied log 顯示是乾淨的 `u_...`），評估在此路徑不呼叫 `stripTabId`。

務必附回歸測試涵蓋 `u_<digits>`（無 tab）與帶 tab 兩種輸入。修好後，第 4、5 節的容量測試才有意義，需重新從單組往上量。

---

## 12. stripTabId 修正 + 本機 post-fix 壓測（2026-09-16）

### 12.1 已修正

- `lib/accessControl.ts` 的 `stripTabId` 重寫：只在「最後一個底線之前」的 base 是 email（含 `@`）或 bare role（`teacher`／`student`／`assistant`／`observer`）時才剝後綴；含底線的 canonical id（`u_1776606536043`）、slug（`pro-demo`、`teacher-demo2`）一律原樣返回。
- 新增回歸測試 `scripts/verify-strip-tabid.mjs`，15 例全過。跑法：
  `APP_ENV=local node --env-file=.env.local --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-strip-tabid.mjs`
- 函式層驗證：同一組 id，`verifyCourseAccess('u_1776606536043', courseId)` 由 `granted:false` → `granted:true (B2C)`。

### 12.2 本機 post-fix 壓測結果（無 PDF，門檻 100%，Windows 單機）

| 組數 | 進教室 | 畫線同步/穩定 | 結果 |
|---:|---:|---:|---|
| 1 | 1/1 | 1/1 | 通過 |
| 2 | 2/2 | 2/2 | 通過 |
| 5 | 5/5 | 5/5 | 通過 |
| 10 | — | — | **失敗**（測試在印出統計前中斷） |

- 修正前這台機器連 **07 單組壓測都 0/1**（全是 403）；修正後 5 組 100%。這直接證實舊文件「本機 3 組 0/3」與 06-24 之後的疑慮，主因是 `stripTabId`，不是機器資源。
- **10 組失敗是本機資源/網路耗盡，不是平台或程式**。錯誤特徵：`ERR_SOCKET_NOT_CONNECTED`（411 次）、`ERR_CONNECTION_CLOSED`（171 次）、Netless gateway `ERR_NAME_NOT_RESOLVED`（DNS 解不出有效 CDN 主機 = 本機 socket/DNS table 爆掉）、20 張 test-failed 截圖。403 只剩 4 次（殘留、非阻斷）。
- 5 與 10 之間未細測，本機無 PDF 上限落在 5–10 之間。

### 12.3 過程觀察（非阻斷）

- 老師端偶發 `AgoraRTCError UID_CONFLICT`（`useAgoraClassroom.ts` 老師 uid 寫死為 1），自動重試恢復。可考慮改隨機 uid。
- dev server 反覆出現 `[WB SSE Server] Failed to fetch fallback DynamoDB state during SSE connect: Invalid state: Controller is already closed`（`app/api/whiteboard/stream/route.ts:138` 附近），SSE 關閉後仍 enqueue，屬既有 teardown 噪音。

### 12.4 對第 4、5、7 節的修正

- 第 5.1 節「本機 3 組就 0/3」的證據**作廢**：那是 stripTabId 403 造成，不是資源。
- 「上限主要卡在壓測機」的結論**方向仍成立，但要重測**：post-fix 本機能穩定跑到 5 組，10 組才因單機資源崩潰。平台本身能否 10 組仍未有乾淨量測。
- **下一步建議（更新）**：本機 5 組穩定，用分散式 5+5（`run-distributed-stress.ps1`）或單台 8GB+ EC2 headless 跑 10 組，才能把「平台上限」與「單機上限」分開。跑之前先確認 stripTabId 修正已部署到目標環境。

---

## 13. R-2 心跳 500 修正（2026-09-16）

### 13.1 改了什麼

`app/api/classroom/ready/route.ts` 重寫：presence/ready 狀態從「單一 `participants` 陣列 + `version` 樂觀鎖 read-modify-write」改為 **`members` map，以 `role:userId` 為 key，每人只原子更新自己那一格**（`SET #m.#k = :p`）。

- DynamoDB 對 map 不同 key 的巢狀更新是 item 層原子操作，兩個不同 key 的寫入不會互相衝突 → 移除 `version` 樂觀鎖、移除 `MAX_UPDATE_RETRIES` 重試迴圈、消掉 conflict 造成的 500。
- 首寫競態：map 不存在時巢狀 SET 會丟 `ValidationException`，攔截後先 `SET #m = if_not_exists(#m, :empty)`（冪等，不會蓋掉別人剛建的 map）再重設該 key。
- `unready` = `REMOVE #m.#k`；`clear-all` = `SET #m = :empty` 並 `REMOVE participants, version`（順手清舊格式）。
- GET 維持回傳 `{participants:[...]}`，且**向後相容**：優先讀新的 `members` map，讀不到才 fallback 舊的 `participants` 陣列（舊房間 1 小時 TTL 內自然淘汰）。

### 13.2 驗證（本機 dev server，直接打 endpoint）

- 型別檢查 `tsc --noEmit`（含 e2e config）exit 0。
- 並發重現：6 輪 × 4 個同時寫入者（老師/學生各含第二分頁）= 24 個並發 POST → **全部 200，零 500**；dedupe 正確（多分頁同 `role:userId` 合併為一），unready、clear-all 正確。
- 首寫競態：12 個寫入者同時打一個全新空 item + 續 4 輪 = 60 個 POST → 全部 200，12 位參與者無遺失。
- 舊版在同一情境會因 version 衝突耗盡重試而回 500。

### 13.3 尚未做

- 未跑完整 07 壓測回歸（route 變更已隔離且單元層驗過；happy path 的 client 流程與此測試一致）。若要保險，跑一次 5 組 NO_PDF 確認端到端仍綠。
- 未 commit。

> 補記：§13.3 的 5 組 NO_PDF 回歸已於 2026-09-16 跑完，5/5 通過，`/api/classroom/ready` 全部 200、無 server error。6 組亦 6/6 通過；7 組以上被本機 dev server 崩潰與 socket/DNS 耗盡混淆，Agora 限流點仍未在乾淨環境量到。

---

## 14. MVP 上線後架構規劃 + 第一批實作（2026-09-16）

### 14.1 已核准的架構計畫

完整計畫檔：`C:\Users\Attlie\.claude\plans\3-5-redis-parsed-phoenix.md`。使用者決定：

| 決策 | 內容 |
|---|---|
| 影音 | Cloudflare Realtime SFU（Render 無法開 UDP，自架 SFU 不可放 Render） |
| Render 範圍 | 只放新的常駐即時服務：WS presence/信令、Hocuspocus 白板、Redis（Render Key Value）。Next.js 留 Amplify，資料留 DynamoDB/S3 |
| 順序 | 穩定性（WS 推播 + Redis）→ 成本（SFU）→ 白板（tldraw + Hocuspocus） |
| 回退 | 保留 Agora 全部程式路徑 |

重要事實：**tldraw SDK 商業使用需付費授權**（repo 文件寫的「MIT」過時），Phase 3 開工前須先取得報價；Cloudflare Realtime 的 SFU 與 TURN **共用** 每月 1TB 免費額度。

### 14.2 本批已實作（計畫 §8「立即可做」，全部未 commit）

| 項目 | 檔案 | 說明 |
|---|---|---|
| escrow 並發雙重入帳修正 | `lib/pointsEscrow.ts`、`lib/pointsStorage.ts` | `releaseEscrow`/`refundEscrow` 改為單一 `TransactWriteCommand`：狀態 HOLDING→RELEASED/REFUNDED 條件 + 餘額 `ADD`。每次呼叫寫唯一 `settlementToken`，SDK 重試已提交的交易時能辨認「是自己提交的」。新增 `addUserPoints`（原子 ADD） |
| escrow 回歸測試 | `scripts/verify-escrow-settlement.mjs` | 假 DynamoDB、假憑證，絕不連 AWS。23 項：50 並發 release 恰一次成功、release/refund 互搶守恆、同老師兩筆不互蓋、SDK 重試、對手搶先、對照組重現舊 bug。連跑 15 次穩定 |
| SFU 離開改 beacon | `lib/providers/rtc/useCloudflareSfuProvider.ts` | teardown 先 `navigator.sendBeacon('/api/realtime/room')`，失敗才 `fetch keepalive` |
| 白板 pointermove 修正 | `components/AgoraWhiteboard/BoardImpl.tsx` | `refreshViewSize()` 不再掛在 `pointermove`/`touchmove`（每個筆畫點都強制 layout），只留 `pointerdown`/`touchstart`/`scroll`/`resize` |
| 壓測畫質覆寫 | `app/classroom/ClientClassroom.tsx` | `?vq=low|medium|high|ultra` 或 localStorage `jv_video_quality`；正式預設仍 `high` |
| 真實畫線壓測 | `e2e/helpers/draw_plan.ts`（純函式）、`canvas_probe.ts`（墨跡探針）、`draw_workload.ts`（主體） | Bézier 手寫筆畫、目標 pps、畫圖與驗證並行、網格避免重疊、回合間清空、baseline 排除 PDF 背景、兩點校正老師→學生座標、逐筆延遲/掉筆/半筆、清空/橡皮擦/翻頁同步、API 5xx、主執行緒 CPU |
| 舊探針整併 | `e2e/helpers/whiteboard_helpers.ts`、`streaming_monitor.ts` | 三份重複像素檢查改用 `canvas_probe.hasAnyInk`（行為相容，tainted 時印警告）；`measureSyncLatency` 改為先檢查再等待 |
| 07 串接 | `e2e/classroom/07_room_pdf_sync_stress.spec.ts` | `DRAW_DURATION_SEC>0` 時 NO_PDF 模式用 workload 取代 smoke；PDF 模式加 Phase 7b；`TEST_VIDEO_QUALITY` 注入；結果 JSON 帶 `draw` 摘要與 `drawLatenciesMs` |
| 分散式 | `e2e/scripts/merge-distributed-results.ps1`、`run-distributed-stress.ps1`、新 `sample-host-metrics.ps1` | 合併腳本用所有組的原始延遲算真正全域 p95；修正 PS 5.1 單筆 `.Count` 為空導致「1 組通過算成 0%」的既有 bug；主機取樣用 CIM（中文 Windows 相容） |
| 純函式測試 | `scripts/verify-draw-plan.mjs` | 39 項 |

### 14.3 驗證結果

| 檢查 | 結果 |
|---|---|
| `tsc` app / e2e | exit 0 / exit 0 |
| `npm run lint:ci`（CI 阻擋閘門） | 0 errors、109 warnings（上限 109，未增加） |
| verify-strip-tabid / escrow / draw-plan / realtime-sfu-guards | 15 / 23 / 39 / 19 全過 |
| draw_workload 端到端（假白板，老師 0.9、學生 0.62 縮放 + 位移，BroadcastChannel 注入延遲） | clean：31 筆零掉筆 p95 257ms、校正 scale 0.689（理論 0.689）、清空/橡皮擦同步；drop20：抓到 lost 9/28 且 SLO 失敗；partial30：抓到 partial 11/30；slow（1.2–1.6s）：p95 1595ms 且 SLO 失敗 |
| merge 腳本 | 兩台假結果：全域 p95=95（平均各組會錯算成 73）、loss 2%、1/2 通過正確顯示 |
| sample-host-metrics | 本機 zh-TW Windows 正常輸出 CSV |

### 14.4 尚未驗證 / 未做

- **draw_workload 尚未在真實 Netless 白板上跑過**（只在假白板驗證）。使用者先前主動停掉 dev server 並表示不重跑壓測，故未自行啟動。首次真跑建議：1 組、`NO_PDF_MODE=1 DRAW_DURATION_SEC=60 TEST_VIDEO_QUALITY=low`，重點看校正是否成功（`calibration: …` 錯誤訊息會指出原因）。
- **本機實際點密度約 58 pps**（目標 80）：每次 `mouse.move` 一趟 CDP 往返約 17ms。報告據實列出 `achievedPpsMean`，計畫 T2 的「≥60」門檻在此機器上會差一點。
- beacon 與 pointermove 兩項只過型別檢查，未在真實 SFU（無 CF 憑證）與真實 Netless 行動裝置上驗證。
- 計畫 §4.3 的 02/03/04 spec 串接、`DRAW_INPUT=synthetic` 模式未做（§8 範圍只含 07）。
- `lib/pointsStorage.ts` 的 `deductUserPoints` 仍是「讀→Put」，學生同時報名兩堂時有類似競態，未改（不在本批範圍）。
- Phase 1–3（Render WS + Redis、Cloudflare SFU 上線、tldraw + Hocuspocus）皆未開始。
- 以上全部**未 commit**。

### 14.5 真實環境跑法

```powershell
# 1 組、60 秒真實畫線（需先啟動 next-dev-e2e；會寫正式 DynamoDB 測試資料並耗少量 Agora 分鐘）
$env:APP_ENV='local'; $env:NEXT_PUBLIC_PAYMENT_MOCK_MODE='true'; $env:DISABLE_RATE_LIMIT='true'
$env:NEXT_PUBLIC_BASE_URL='http://localhost:3000'
$env:CONCURRENT_GROUPS='1'; $env:NO_PDF_MODE='1'; $env:SUCCESS_THRESHOLD='1'; $env:SKIP_CLEANUP='1'; $env:HEADLESS='true'
$env:DRAW_DURATION_SEC='60'; $env:DRAW_STROKES_PER_MIN='12'; $env:DRAW_PPS='80'; $env:TEST_VIDEO_QUALITY='low'
npx playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium --reporter=line
```

```bash
# 離線回歸（不連網、不寫資料）
node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-escrow-settlement.mjs
node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-draw-plan.mjs
```

### 14.6 真實 Netless 白板首跑（2026-09-16，本機 1 組 60 秒）

| 項目 | 第一次 | 修正可見區域後 |
|---|---|---|
| 可用格子 | 5／10 | 10／10 |
| 筆畫 | 12，全同步 | 11，全同步 |
| 掉筆／半筆 | 0／0 | 0／0 |
| 延遲 p50／p95 | 219／519 ms | 189／448 ms |
| 清空同步 p95 | 413 ms | 295 ms |
| 實際點數/秒 | 46 | 43 |
| API 5xx | 0 | 0 |
| 主執行緒 CPU 老師／學生 | 6%／4% | 6%／4% |
| 校正 | scale 1.000、殘差 0（學生白板比老師高 61px，因老師有工具列） | 同左 |

- 修正：老師端白板底部超出 1280×720 視窗，下排格子點不到。`draw_workload.ts` 校正時改為只在兩端可見範圍內排格子。
- 橡皮擦兩次都沒觸發（每回合 10% 機率，60 秒只有約 1 回合），真實 Netless 上的橡皮擦驗證尚未涵蓋；要測可設 `DRAW_ERASER_RATIO=1 DRAW_CLEAR_EVERY=4`。
- 真實頁面點密度只有 43–46 點/秒（模擬頁 58），CDP 每次 `mouse.move` 需等 Netless 事件處理完。
- 報名步驟出現既有 fallback 警告「點數不足」，改走 subprocess 後成功，與本次改動無關。

---

## 15. course-sessions `byStatus` 索引（2026-09-17，已在正式環境建立）

### 15.1 為什麼

依課表預先擴容 Render 服務，需要「跨所有課程、依時段查教室」。原本只有 `byCourseId`／`byTeacherId`／`byRoomId`。計畫見 `C:\Users\Attlie\.claude\plans\3-5-redis-parsed-phoenix.md` 附錄 A。

### 15.2 設計

- **`byStatus` = hash `status`、range `startTime`、投影 ALL**。不用日期桶合成鍵：`status` 在 `lib/courseSessionService.ts` 四條寫入路徑都是非空字串，無 null 鍵風險、無回填、不需決定時區。
- 一個索引三種用途：預先擴容（`SCHEDULED` 且 startTime 在視窗內）、目前負載（整個 `LIVE` 分區）、結算（`LIVE` 分區小，`endTime` 在程式端過濾）。
- `status` 是 DynamoDB 保留字，查詢一律用 `#status`。

### 15.3 變更

| 檔案 | 內容 |
|---|---|
| `scripts/lib/schema.mjs` | `attributes` 加 `status: S`、`indexes` 加 `byStatus` |
| `scripts/lib/setup-steps.mjs`（新） | `STEP_KEYS`、`parseOnlyArg`、`parseDryRunArg`、`selectSteps`、`unknownArgs`（純函式） |
| `scripts/setup-db.mjs` | `--only=<key>[,<key>]`、`--dry-run`；旗標與 key 在建立 AWS client 前驗證，拼錯直接 exit 1；**hardening**：索引存在但仍 CREATING 時重跑會等待，不再誤報「已存在」 |
| `scripts/verify-schema.mjs` | 索引非 ACTIVE 視為 drift；缺漏提示改為 `--only=<該表> --dry-run`（原本提示的裸 `setup-db` 在正式環境不安全） |
| `lib/types/courseSession.ts` | `COURSE_SESSION_STATUSES`、`isCourseSessionStatus`、`SessionStatusQueryOptions`、`UpcomingAndLiveSessions` |
| `lib/courseSessionService.ts` | `queryAll(params, maxItems?)`；`listSessionsByStatus(status, {from,to,limit})`（四種 KeyCondition，非法 status 不發請求）；`listUpcomingAndLiveSessions({withinMinutes, earlyJoinMinutes?, lookbackMinutes?, now?})` |
| `lib/livekit/config.ts` | `readJoinWindowMinutes()`（不需 LiveKit 憑證），`getLiveKitConfig()` 改用它，行為不變 |
| `scripts/audit-course-sessions.mjs`（新，唯讀） | 審核 status/startTime 型別；`--probe-index` 以索引 COUNT 對照 Scan |
| `scripts/verify-course-sessions-index.mjs`（新，離線） | 73 項：schema 通用守門（每個索引鍵都在 attributes、無未使用 attribute）、查詢式、分頁與上限、`--only` 選擇、schema 表 key = 步驟 key。npm：`verify:course-sessions-index` |
| 文件 | `.agents/skills/db-ops-migrations/SKILL.md`（`--only`／`--dry-run`、規則 5「正式環境不要跑沒有 `--only` 的 db:setup」、逾時排除）、`scripts/SETUP_DB_README.md`、`docs/claude-session-handoff-schema-remediation-2026-09-15.md` |

### 15.4 正式環境執行紀錄

| 步驟 | 結果 |
|---|---|
| 1 審核 | 正式表 **0 筆**，hard failures 0 |
| 2 `--only=courseSessions --dry-run` | 1/9 步，只會新增 `byStatus` |
| 3 dev 表演練 | **略過**：帳號內沒有任何 dev 表，`create-dev-tables.mjs` 會複製全部約 30 張表，超出需求；正式表為空、索引可刪除 |
| 4 建立 | 第一次 300 秒逾時（空表建 GSI 也超過 5 分鐘）；重跑時 hardening 顯示 `exists but is CREATING; waiting for ACTIVE`，之後 `is now ACTIVE`，1/1 成功 |
| 6 `verify-schema --live` | `GSI byStatus [status:PK, startTime:SK]` 通過；其餘問題恰為既知 4 個（enrollments 3、courses 1），無新增 |
| 7 `--probe-index` | 4 個 status 索引計數 = Scan 計數（皆 0），索引可讀 |
| 實查 | 對正式表跑 `listUpcomingAndLiveSessions` 與 `listSessionsByStatus('COMPLETED',{to,limit})`，語法有效、皆回 0 筆 |

未碰 enrollments／courses 的 4 個缺漏索引（正式環境仍跑會寫 null 鍵的舊程式）。

### 15.5 注意

- **表是空的**：`createCourseSession` 仍零呼叫者，所以預先擴容目前查不到任何課。要有資料，得在報名或排課流程建立 session（另案，未做）。
- 程式變更**未 commit**；正式環境只多了索引，現有程式都不讀它，向後相容。
- 回退：`UpdateTable` Delete `byStatus`，同時撤回 `schema.mjs` 條目。

## 16. Centrifugo Phase-1 spike（2026-09-18，本機，決策閘門通過）

計畫附錄 B 新增：Phase 1 的信令／presence 是否用 **Centrifugo**（Apache-2.0、單一 Go binary、可跑 Render）取代自寫的 `ws` + Valkey 伺服器。通過此 spike 估可省 Phase 1 約 1.5–2 人週（rooms／presence／bus／heartbeat／shutdown 都不用自寫）。

Spike 位於 `scripts/spike-centrifugo/`（README 有跑法）。**純本機、不動正式程式與正式環境**；client 依賴（`centrifuge@5`、`ws`）以 ad-hoc 安裝，未寫入 root `package.json`。

### 16.1 拓樸

- 1× `valkey:8` 引擎，2× `centrifugo:v5`（v5.4.9）共用該引擎，host port `:8801`／`:8802`。
- Node 兩個 client：teacher 連 A、student 連 B → student 收到的每一則都跨過引擎（即跨實例 fan-out 證明）。
- 連線 token 為本機自簽 HS256 JWT（同一把 `token_hmac_secret_key`）。

### 16.2 結果（3/3 次全綠）

| 條件 | 結果 | 數據 |
|---|---|---|
| C3 JWT(HS256) 連線 | PASS | 兩 client 僅憑自簽 token 連上 A／B |
| C1a presence bothPresent | PASS | `presence()` 跨實例列出 teacher + student |
| C1b 被殺的對端移除 ≤45s | PASS | ungraceful RST（模擬分頁被殺）後 leave 事件 **2–5ms** |
| C2 訊框原樣轉發 | PASS | `wb-uuid-sync`／`page-change`／`request-page-state`／`pdf-available` 皆逐位元一致 |
| C2 `info.user` 伺服器強制 | PASS | 每則 publication 的 `info.user` == 發送者 JWT `sub` |
| C4 跨實例 fan-out | PASS | 200/200 送達，**p50 1ms、p95 3–5ms、max 6ms** |

### 16.3 判讀與注意

- **啟用的關鍵 namespace 選項**：`allow_subscribe_for_client`（否則 client 無 token 不能訂閱，第一次 spike 就卡在 subscribe timeout）、`presence`、`join_leave` + `force_push_join_leave`（所有訂閱者都收 join/leave）、`allow_publish_for_subscriber`、`allow_presence_for_subscriber`。
- **leave 2–5ms 是「socket RST 被偵測」的最佳情況**（等同 OS 在分頁被殺時關閉 TCP）。真正的網路斷線（無 RST）走 server ping 逾時，Centrifugo 預設 ping ≈25s，仍在 45s 預算內；presence TTL 為 backstop。上線前應以「拔網路」情境再量一次此最壞值。
- **client 需換 `centrifuge-js`**：訊框格式與現有 raw-WS JSON 不同，`useRenderWsSignaling` 內部改包 centrifuge，`e2e/helpers/signaling_test_helpers.ts` 要改；但 `usePresence`／`useSignaling` 的 provider 閘門與回退設計不變。
- **v5 vs v6**：spike 用 v5（config 為扁平鍵 `engine`／`redis_address`）。v6 config 結構不同（`engine: {type, redis:{}}`），採用時需依當時版本重寫 config——client `centrifuge@5` 與伺服器 v5 相容即可。
- Render 費用不變（仍 2×Starter + KV Starter）。

### 16.4 結論

**閘門通過**。Phase 1 建議採 Centrifugo，`services/realtime-ws` 的 rooms/presence/bus/heartbeat/shutdown 免自寫。上線前補一次「真實網路斷線」的 leave 最壞值量測，並確認採用版本的 config 鍵。

## 17. Canvas 白板 WebRTC DataChannel 傳輸補齊（2026-09-19，本機驗證）

把 canvas 白板(EnhancedWhiteboard)的即時同步補到與 Agora 等效:筆畫走 **WebRTC DataChannel(UDP、P2P)**,資料平面不進 DB;由 `NEXT_PUBLIC_WHITEBOARD_RTC=1` 閘門控制,未設定時行為不變。

### 17.1 補了哪些(對照 Agora 的缺口)
- **NAT 穿透**:新增 `GET /api/whiteboard/ice`,重用 `lib/realtime/sfuApi.ts` 的 `generateIceServers`(Cloudflare TURN,和 SFU 共用 1TB);未設 CF TURN 時退回 Cloudflare STUN。`NEXT_PUBLIC_WHITEBOARD_RTC_FORCE_RELAY=1` 可強制走 relay 驗證。
- **雙通道**:`wb-ctl`(可靠有序)送控制與最終筆畫;`wb-pts`(不可靠、maxRetransmits:0)送繪製中的**增量點**,丟包不重傳,由最終筆畫修復缺口。
- **角色選舉**:`lib/whiteboard/rtcProtocol.ts` 的 `electOfferer`(老師 offer;同角色以 id 字典序),取代 `editable` 推導 → 老師+助教/學生可畫時不再雙方都 offer。
- **事件覆蓋**:抽出共用 `applyRemoteEvent`,BC/SSE/DataChannel 共用 → undo/redo/清空/翻頁也經 DataChannel 同步。
- **晚進/重連**:開通時以 `chunkState` 分塊補板面(依 id 合併);連線失敗以指數退避重握手,`seen` 跨重連保留避免重放舊 offer。
- **持久化**:僅 offerer 每 ~5s 寫一次快照(單一 item/房)作為重整/晚進/冷啟動的回退;實測 RTC 開通後每房只有 ~1 put/4–5s。
- **多餘讀取**:DataChannel 開通時跳過 `/state` 輪詢。
- **訊令**:教室走既有 RTM `custom` 訊息(`ClientClassroom` 以 `wbRtcSignal` 接入,傳 `rtcRole`/`rtcSelfId=presenceId`);DB mailbox 僅 demo/dev 回退,已加固(**atomic list_append** 避免併發丟訊、10 分 TTL、`since`、非 demo channel 需 `verifyClassroomAccess`)。

### 17.2 驗證(本機、headless、localhost loopback)
- 離線 `scripts/verify-whiteboard-rtc.mjs` 18/18;tsc app+e2e 0;lint 0 錯誤。
- e2e `e2e/whiteboard-demo/canvas_demo.spec.ts`:**3 passed** —
  - 5 組:每組 DataChannel 雙向開通、13/13 同步、canvas 有墨;
  - 晚進:學生後進即取得既有板面;
  - 重連:`__wb_rtc_debug.drop()` 後恢復(studentOpens=2)。
- 1~5 組先前已逐組驗證同步;延遲 0–1ms(loopback,非真實網路)。

### 17.3 邊界(上線前)
- 0–1ms 是 loopback;真實網路 = RTC RTT,且需 STUN/TURN。~15–30% 連線走 TURN 中繼。
- **重連的坑(自己踩的)**:mailbox 改成 read-modify-write 會併發丟 ICE candidate、`reduceMailbox` 的 reset-on-offer 會刪掉握手訊息 → 已改回 atomic list_append。
- **單機視窗上限**:headed 超過約 5 組(~10+ 視窗)會撞資源上限;多組用 headless。leaked browser context 會拖垮下一測的握手 → e2e 已 `afterEach` 關閉 context。
- 全部**未 commit**;dev server(:3005)開著 `NEXT_PUBLIC_WHITEBOARD_RTC=1`+`SNAPSHOT=1`+`WB_CAP_LOG=1`;append-only POC 表 `jvtutorcorner-whiteboard-strokes` 仍在(未用,可刪)。
