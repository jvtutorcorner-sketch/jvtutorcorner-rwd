# JVTutorCorner 專案架構文件

**文件版本：** 2026-06-28  
**適用系統：** JV Tutor Corner（AWS Amplify Serverless）  
**撰寫範疇：** 現況架構 · 壓力測試發現 · 未來規劃  

> **閱讀提醒：** 本文件嚴格區分「現況」與「未來規劃」兩大區塊，不混入尚未實作的設計。  
> 未來規劃的程式碼骨架已存在 codebase 中（預設關閉），但生產行為不受其影響。

---

## 目錄

1. [系統定位](#一系統定位)
2. [技術棧](#二技術棧)
3. [現況架構（Production-Ready）](#三現況架構)
   - 3.1 整體分層
   - 3.2 教室即時通訊架構
   - 3.3 API 路由分類
   - 3.4 資料儲存層
   - 3.5 前端元件樹
4. [壓力測試發現的問題](#四壓力測試發現的問題)
   - 4.1 測試規格與通過門檻
   - 4.2 容量臨界點總表
   - 4.3 問題一：Thundering Herd（API 請求風暴）
   - 4.4 問題二：Agora Rate Limit 觸發
   - 4.5 問題三：白板 Runtime 初始化超時
   - 4.6 問題四：測試輔助工具問題（非產品功能）
   - 4.7 已完成的修正
   - 4.8 尚未解決的問題
5. [未來規劃架構（預留骨架，尚未啟用）](#五未來規劃架構)
   - 5.1 成本動機
   - 5.2 Provider 抽象層設計
   - 5.3 Phase 1：信令替換
   - 5.4 Phase 2：RTC 替換（Chime）
   - 5.5 Phase 3：RTC 替換（LiveKit）＋ 白板替換
   - 5.6 啟用方式（環境變數開關）
6. [監控指標與告警分級](#六監控指標與告警分級)
7. [環境變數索引](#七環境變數索引)

---

## 一、系統定位

JVTutorCorner 是一個**企業級線上家教平台**，核心功能是即時互動教室：

- 師生一對一視頻通話（Agora RTC）
- 即時白板協作與 PDF 教材同步（Netless Whiteboard）
- 頁面翻頁、畫筆操作、就緒狀態等即時信令（Agora RTM）
- 課程報名、點數管理、多元支付（PayPal / Stripe / LINE Pay / ECPay）
- AI 工作流自動化（Gemini）

---

## 二、技術棧

### 核心框架

| 技術 | 版本 | 用途 |
|------|------|------|
| Next.js | ^16.0.10 | App Router SSR / API Routes |
| React | ^18.3.1 | UI，React Compiler 啟用 |
| TypeScript | ^5 | 全專案強型別 |
| AWS Amplify | ^6.15.8 | Serverless 部署（Lambda + DynamoDB + S3） |

### 即時通訊

| 套件 | 版本 | 用途 |
|------|------|------|
| agora-rtc-sdk-ng | ^4.23.0 | 視頻 / 音訊 RTC |
| agora-rtm-sdk | ^2.2.3-1 | 信令（頁面同步、白板 UUID、PDF 通知） |
| white-web-sdk | 2.16.44 | Netless 協作白板（Singapore 節點） |

### AWS 服務

| 服務 | 用途 |
|------|------|
| Lambda | Next.js API Routes（Serverless） |
| DynamoDB | 白板狀態、PDF 資料、出席紀錄（PAY_PER_REQUEST） |
| S3 | PDF 檔案儲存（jvtutorcorner-uploads） |
| CloudWatch | 日誌、指標、告警 |

### 其他主要依賴

- 支付：`stripe`, `@paypal/react-paypal-js`
- AI：`@google/generative-ai`（Gemini）, `@qdrant/js-client-rest`（向量 DB）
- UI：`@xyflow/react`（流程圖）, `@monaco-editor/react`（程式碼編輯器）
- PDF：`pdfjs-dist`, `jspdf`

---

## 三、現況架構

### 3.1 整體分層

```
┌──────────────────────────────────────────────────────────────────────┐
│  L1  入口層                                                          │
│  Teacher / Student ──> Web Browser                                   │
├──────────────────────────────────────────────────────────────────────┤
│  L2  教室熱資料層（低延遲 / 即時）                                    │
│                                                                      │
│  Agora RTC ────── 視頻 / 音訊串流                                    │
│  Agora RTM ────── 即時信令（wb-uuid / page-change / pdf-available）  │
│  Netless WB ───── 白板畫筆協作事件                                   │
│                                                                      │
│  Hot APIs（Next.js Lambda）:                                         │
│    /api/classroom/ready   ← presence polling（每 15 秒，進教後）      │
│    /api/whiteboard/event  ← 白板事件寫入                             │
│    /api/whiteboard/state  ← 白板狀態讀取                             │
│    /api/agora/token       ← RTC Token 生成                           │
│    /api/agora/rtm-token   ← RTM Token 生成                           │
│                                                                      │
│  DynamoDB ─────── Presence / Whiteboard State / Sessions            │
├──────────────────────────────────────────────────────────────────────┤
│  L3  冷資料層（非即時，可委派 Make.com）                              │
│                                                                      │
│  課程管理、審核、報名、點數、支付、出席報表、CRM                      │
│  /api/workflows/execute → Make.com Webhook → Email / S3 / BI        │
├──────────────────────────────────────────────────────────────────────┤
│  L4  可觀測與保護層                                                  │
│                                                                      │
│  CloudWatch Metrics / Logs → Alarm → SNS → LINE Bot 通知            │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 教室即時通訊架構

```
ClientClassroom.tsx（app/classroom/ClientClassroom.tsx）
│
├── useRTC(agoraConfig)                    ← lib/providers/rtc/useRTC.ts
│   └── useAgoraClassroom()               ← lib/agora/useAgoraClassroom.ts
│       ├── 生成 RTC Token（/api/agora/token）
│       ├── 初始化 Agora RTC SDK
│       ├── join() / leave() / mute()
│       ├── 本地視頻軌道（localVideoTrack ref）
│       └── 遠端使用者管理（remoteUsers）
│
├── useSignaling(opts)                     ← lib/providers/signaling/useSignaling.ts
│   └── useAgoraRTMProvider()             ← lib/agora/useAgoraRTM.ts
│       ├── 生成 RTM Token（/api/agora/rtm-token）
│       ├── RTM login → join channel
│       ├── sendMessage(type, payload)
│       │   ├── 'wb-uuid-sync'            ← 教師廣播白板 UUID
│       │   ├── 'page-change'             ← PDF 翻頁指令
│       │   ├── 'pdf-available'           ← 教師通知 PDF 上傳完成
│       │   ├── 'ready-state-update'      ← 師生就緒狀態
│       │   └── 'ping'                    ← 心跳
│       └── onMessage(callback)           ← 接收以上訊息
│
└── [白板邏輯（useEffect，位於 ClientClassroom.tsx ~592–885 行）]
    ├── WhiteWebSdk.joinRoom()            ← Netless white-web-sdk
    ├── 接收 'wb-uuid-sync' 後加入白板房間
    ├── 接收 'pdf-available' 後渲染 PDF
    └── 接收 'page-change' 後翻頁
```

**RTM 訊息流（進教室後）：**

```
教師端                          學生端
  │                               │
  ├─ joinRoom()                   ├─ waitForUUID（輪詢或 RTM 訊號）
  ├─ 廣播 wb-uuid-sync ──────────>├─ joinRoom(uuid)
  ├─ 上傳 PDF → S3               │
  ├─ 廣播 pdf-available ─────────>├─ 載入 PDF 頁面
  ├─ 畫線（Netless 事件）─────────>├─ 即時同步畫線
  └─ page-change ───────────────>└─ 翻頁
```

### 3.3 API 路由分類

#### 教室熱路徑（即時敏感）

| 路由 | 說明 | 呼叫頻率 |
|------|------|---------|
| `POST /api/agora/token` | RTC Token 生成 | 進教室時 1 次 |
| `POST /api/agora/rtm-token` | RTM Token 生成 | 進教室時 1 次 |
| `POST /api/classroom/ready` | Presence 心跳 / 就緒通知 | 每 15 秒 |
| `POST /api/whiteboard/event` | 白板筆觸事件寫入 | 繪圖時每秒 ~8 次 |
| `GET /api/whiteboard/state` | 白板狀態讀取 | 加入白板時 |
| `POST /api/whiteboard/uuid` | 白板房間 UUID 生成 | 教師建立時 1 次 |
| `POST /api/whiteboard/pdf` | PDF 上傳 | 每次上傳 1 次 |
| `POST /api/signaling/token` | WebSocket 信令 Token | Phase 1 啟用後（預設關閉） |

#### 課程冷路徑（非即時）

| 路由群組 | 說明 |
|---------|------|
| `/api/courses/*` | 課程 CRUD |
| `/api/orders/*` | 訂單管理 |
| `/api/points*` | 點數系統 |
| `/api/enroll` | 課程報名 |
| `/api/admin/*` | 後台管理（定價、角色、日誌） |
| `/api/paypal/*`, `/api/stripe/*`, `/api/ecpay/*`, `/api/linepay/*` | 支付閘道 |
| `/api/workflows/*` | Make.com 工作流整合 |
| `/api/auth/*` | 身份驗證（LINE / Google / Email） |
| `/api/ai-chat/*` | AI 對話功能 |

### 3.4 資料儲存層

| DynamoDB Table | 主要欄位 | 用途 |
|----------------|---------|------|
| jvtutorcorner-whiteboard | sessionId, userId, state | 白板狀態 / Presence |
| jvtutorcorner-orders | orderId, courseId, userId | 訂單與課程報名 |
| jvtutorcorner-profiles | userId | 使用者資料 |
| jvtutorcorner-user-points | userId | 點數餘額 |
| jvtutorcorner-courses | courseId | 課程資訊 |
| jvtutorcorner-roles | userId | 角色與權限 |
| jvtutorcorner-sessions | sessionId | 教室 Session 紀錄 |
| jvtutorcorner-plan-upgrades | userId | 方案升級紀錄 |

S3 Bucket：`jvtutorcorner-uploads`（PDF 教材儲存，ap-northeast-1）

### 3.5 前端元件樹（教室相關）

```
app/classroom/room/page.tsx
└── ClientClassroom.tsx              # 主教室元件（Client Component）
    ├── EnhancedWhiteboard.tsx       # 白板容器
    │   └── AgoraWhiteboard/
    │       ├── BoardImpl.tsx        # Netless SDK 掛載點
    │       └── WhiteboardErrorBoundary.tsx
    ├── VideoControls.tsx            # 音視訊控制列
    ├── PdfViewer.tsx                # PDF 檢視器
    └── TroubleshootButton.tsx       # 疑難排除工具

app/classroom/wait/page.tsx
└── WaitClient.tsx                   # 等待室（含 PDF 上傳）
```

---

## 四、壓力測試發現的問題

> **本章節僅記錄事實**：測試數字、錯誤訊息、根本原因、已完成修正、未解決項目。  
> 未來的架構變動規劃記錄在第五章，本章不混入。

### 4.1 測試規格與通過門檻

| 項目 | 數值 |
|------|------|
| 測試規格 | N 組並發，各 1 教師 + 1 學生 |
| 主測試檔 | `e2e/classroom/07_room_pdf_sync_stress.spec.ts` |
| 成功門檻 | 75%（例：10 組需 ≥ 8 組通過） |
| 驗證流程 | 課程建立 → 報名 → 進 wait room → PDF 上傳 → 進教室 → PDF 翻頁同步 → 畫筆同步 |
| 測試環境 | 正式環境（production），headed Chrome browser |
| 課程時長 | 30 分鐘（fresh run），5 分鐘（no-PDF 補測） |

### 4.2 容量臨界點總表

#### PDF 同步壓力測試（含 PDF 上傳 + scene sync）

| 組數 | 前置流程 | PDF 上傳 | 進教室 | PDF 同步 | 結論 |
|----:|---------|---------|-------|---------|------|
| 1 | ✅ | ✅ | 1/1 | 1/1 | 穩定 |
| 2 | ✅ | ✅ | 2/2 | 2/2 | 穩定 |
| 3 | ✅ | ✅ | 3/3 | 3/3 | 穩定 |
| 4 | ✅ | ✅ | 4/4 | 重跑 4/4 | 曾一次 flaky，重跑通過 |
| 5 | ✅ | ✅ | 5/5 | 4/5 | 達到 75% 門檻，1 組失敗 |
| 6 | ✅ | ✅ | 6/6 | **0/6** | 全數失敗 |

#### 非 PDF 畫線同步壓力測試（不上傳 PDF，純白板畫線驗證）

| 測試日期 | 組數 | 進教室 | 畫線同步 | 成功率 | 結論 |
|---------|----:|-------|---------|-------|------|
| 2026-06-20 | 6 | 6/6 | 6/6 | 100% | 通過 |
| 2026-06-20 | 7 | 7/7 | **0/7** | 0% | 失敗（修正前） |
| 2026-06-20 | 10 | 10/10 | **0/10** | 0% | 失敗（修正前） |
| 2026-06-24 | 7 | 7/7 | 7/7 | 100% | 通過（修正後） |
| 2026-06-24 | 8 | 8/8 | 8/8 | 100% | 通過（修正後） |
| 2026-06-24 | 9 | 9/9 | 6/9 | 67% | **未達門檻，停止** |

**目前確認的安全上限（修正後）：** 8 組  
**臨界點：** 8 → 9 組

### 4.3 問題一：Thundering Herd（API 請求風暴）

**現象：**  
6 組（12 個瀏覽器）同時進入教室時，`/api/classroom/ready` 與 heartbeat 回傳 `500`。

**根本原因：**  
- 等待室的 presence polling（每 2 秒一次）在進入教室後**沒有停止**，與教室內的 heartbeat 同時運行
- 多組並發在同一毫秒時間點送出請求，形成 Lambda 並發尖峰
- Serverless Lambda 冷啟動導致 DynamoDB 連線排隊

**流量估算（修正前，10 組）：**

```
每組熱資料 RPS = (2 users × 1/2 polling) + (1 × 8 whiteboard/s) + 0.1 = 9.1 RPS
10 組總計   = 91 RPS（尖峰可達 2–3 倍 ≈ 200+ RPS 瞬間）
```

**觀察到的錯誤訊息：**
```
Failed to load resource: the server responded with a status of 500
page.waitForFunction: Target page, context or browser has been closed
```

### 4.4 問題二：Agora Rate Limit 觸發

**現象：**  
7 組以上（14 個瀏覽器）同時初始化，Agora RTM / Netless 白板登入觸發頻率限制。

**根本原因：**  
Agora RTM `login()` 與 Netless `joinRoom()` 對同一 App ID 有**毫秒級並發連線數限制**，所有組別幾乎同時建立 WebSocket 導致碰撞。

**觀察到的錯誤訊息：**
```
Presence operation failed
login too frequent
Kicked off by remote session
Agora whiteboard WhiteWebSdk not ready within 30 s
ERR_SOCKET_NOT_CONNECTED
ERR_CONNECTION_CLOSED
```

### 4.5 問題三：白板 Runtime 初始化超時

**現象：**  
高負載測試機同時跑 14–20 個 Chromium，JavaScript 執行緒排隊，白板 SDK 初始化超時。

**根本原因：**  
- 單機 CPU / 記憶體資源競爭
- 原始超時設定為 30 秒，不足以容納高負載下的調度延遲

**觀察到的錯誤訊息：**
```
Agora whiteboard WhiteWebSdk not ready within 30 s
Student canvas did not receive drawing
Timeout 45000ms exceeded while waiting on the predicate
```

### 4.6 問題四：測試輔助工具問題（非產品功能缺陷）

以下問題不屬於教室產品的缺陷，而是測試 helper 實作問題：

**4.6.1 課程列表選到錯誤課程**

- 表面現象：學生端「找不到課程」
- 實際原因：helper 使用過寬的 row/card matching，歷史壓測課程累積後選到錯誤項目
- 解決方向：優先使用 `data-course-id` 精準匹配；學生端用 `/api/orders?courseId=...` 取得 `orderId` 後直接組 wait room URL

**4.6.2 報名等待時間讓重複測試變慢**

- 實際原因：每次 fresh setup 都需要等待 enrollment propagation
- 解決方向：新增環境變數 `REUSE_STRESS_SETUP`、`REUSE_ENROLLMENTS`、`ENROLLMENT_PROPAGATION_WAIT_MS`，讓等待時間可配置

**4.6.3 復用舊壓測資料產生誤導性失敗**

- 實際原因：舊課程時間已過，導致進入已過期教室
- 解決方向：正式容量測試用全新 `STRESS_RUN_TS` + `STRESS_COURSE_DURATION_MINUTES=30`

**4.6.4 本機錄影輸出路徑失敗**

- 實際原因：helper 預設寫入 `D:\playwright-recordings`，沙箱環境無權限
- 解決方向：預設改為 `<repo>/test-results/playwright-recordings`，可覆寫 `PLAYWRIGHT_RECORDINGS_ROOT`

### 4.7 已完成的修正（2026-06-24 版本）

以下修正已 commit 並在正式環境驗證：

| # | 修正項目 | 檔案 | 效果 |
|---|---------|------|------|
| 1 | **進教室後立即停止等待室 polling** | `app/classroom/ClientClassroom.tsx` | `joined=true` 時清理 `clearInterval`，轉由 15 秒 heartbeat 維持 |
| 2 | **Heart beat 加入隨機延遲（Jitter）** | `app/classroom/ClientClassroom.tsx` | `Math.random() * 3000ms`，錯開 10 組的 API 呼叫尖峰 |
| 3 | **Agora RTC 初始化隨機延遲** | `lib/agora/useAgoraClassroom.ts` | `0–1500ms`，防止 WebSocket 握手碰撞 |
| 4 | **Agora RTM 初始化隨機延遲** | `lib/agora/useAgoraRTM.ts` | `0–2000ms`，規避 `login too frequent` |
| 5 | **Netless 白板 joinRoom 隨機延遲** | `components/AgoraWhiteboard/BoardImpl.tsx` | `0–2500ms`，避免同時觸發 Rate Limit |
| 6 | **測試超時放寬至 60 秒** | `e2e/helpers/whiteboard_helpers.ts` | 容納高負載測試機的調度延遲 |

**修正效果（2026-06-24 重測）：**
- 7 組畫線同步：0/7 → **7/7**（100%）
- 8 組畫線同步：**8/8**（100%）
- 新臨界點上移：6 → 7（修正前）→ **8 → 9**（修正後）

### 4.8 尚未解決的問題

| 問題 | 目前狀態 | 建議下一步 |
|------|---------|-----------|
| **9 組畫線同步 67%，未達門檻** | 最新臨界點，停止往上測 | 補測 9 組抓正式環境 CloudWatch 500 log，確認是哪個 endpoint |
| **PDF scene sync 在 6 組全失敗** | 修正後尚未針對 PDF 完整重測 | 執行 `07_room_pdf_sync_stress.spec.ts`，6 組 PDF 同步驗收 |
| **10 組 PDF + 畫線全目標** | 尚未達到 | 需先解決 9 組問題 |
| **缺少獨立的 no-PDF 壓測 spec** | 目前從 07 抽出，非獨立腳本 | 建立 `e2e/classroom/08_room_no_pdf_stress.spec.ts` |
| **白板事件 per-stroke 高頻寫入** | 每次畫圖都觸發 DynamoDB 寫入 | 批次化（100–200ms 聚合）可降低 80% WPS |

---

## 五、未來規劃架構

> **本章節與現況完全分離。** 以下所有設計已有對應的程式碼骨架（位於 `lib/providers/`），  
> 預設關閉，不影響任何現有 Agora 功能。啟用需明確設定環境變數。

### 5.1 成本動機

現況（50 堂/天，每堂 50 分鐘）月費分析：

| 服務 | 月費 | 佔比 |
|------|------|------|
| **Agora RTC** | **$559** | **93%** |
| Netless Whiteboard | $18.75 | 3% |
| AWS Lambda | ~$0.05 | 1% |
| DynamoDB | ~$5 | 0.5% |
| S3 | ~$1 | <0.5% |

**成本最大威脅：Agora RTC。** 替換後可省 54–73%。

### 5.2 Provider 抽象層設計

為了讓替代方案可以在不改動主業務邏輯的前提下切換，建立了三層 Provider 抽象：

```
lib/providers/
├── types.ts                            ← 三個 Provider 介面定義
│
├── rtc/
│   ├── useRTC.ts                       ← RTC 選擇器（讀取 NEXT_PUBLIC_RTC_PROVIDER）
│   ├── useAgoraRTCProvider.ts          ← 現況：委派給 useAgoraClassroom
│   ├── useChimeProvider.ts             ← Phase 2 Stub（預設關閉）
│   └── useLiveKitProvider.ts           ← Phase 3 Stub（預設關閉）
│
├── signaling/
│   ├── useSignaling.ts                 ← 信令選擇器（讀取 NEXT_PUBLIC_SIGNALING_PROVIDER）
│   ├── useAgoraRTMProvider.ts          ← 現況：委派給 useAgoraRTM
│   └── useAwsApigwSignaling.ts         ← Phase 1 完整實作（預設關閉）
│
└── whiteboard/
    ├── useWhiteboardProvider.ts        ← 白板選擇器（讀取 NEXT_PUBLIC_WHITEBOARD_PROVIDER）
    ├── useNetlessWhiteboard.ts         ← 現況 Stub（尚未從 ClientClassroom 抽出）
    └── useTldrawWhiteboard.ts          ← Phase 3 Stub（預設關閉）
```

**設計原則：Always-Both, Enabled-Gate Pattern**

React hook 規則禁止條件式呼叫。選擇器永遠同時呼叫所有子 hook，但每個子 hook 透過 `enabled` 參數自我封閉；選擇器依 env var（build-time 常數）回傳對應結果：

```typescript
// useSignaling.ts 示意
const isAgora = PROVIDER !== 'aws-apigw-ws';
const agora = useAgoraRTMProvider({ ...opts, enabled: isAgora });     // 永遠呼叫
const apigw = useAwsApigwSignaling({ ...opts, enabled: !isAgora });   // 永遠呼叫
return isAgora ? agora : apigw;                                        // 回傳有效者
```

### 5.3 Phase 1：信令替換（Agora RTM → AWS API Gateway WebSocket）

**目標：** 以 Serverless WebSocket 取代 Agora RTM，月費 $2 vs 目前 RTM 費用  
**狀態：** 程式碼完整實作，含完整 E2E 測試，**預設關閉**，未部署至正式環境

**主要功能（useAwsApigwSignaling.ts）：**

- 瀏覽器原生 `WebSocket` 連接 API Gateway WS endpoint
- 連線前從 `/api/signaling/token` 取得 HMAC-SHA256 短效 Token（60 秒有效）
- 訊息格式與 RTM 相同（5 種訊息類型），ClientClassroom 不需修改任何 handler
- 重連邏輯：最多 5 次，指數退避（`BASE_RETRY_MS × 2^retryCount`）
- 每筆訊息附遞增 `seq` 序號，供接收端偵測遺漏

**測試覆蓋（全部通過，24/24）：**

```
e2e/signaling/
├── phase1_token_api.spec.ts      ← 7 個測試，HTTP Token 端點（400 / 200 / HMAC 格式）
├── phase1_ws_signaling.spec.ts   ← 10 個測試，Hook 生命週期（連線 / 斷線 / 重連 / 訊息）
└── phase1_dual_browser.spec.ts   ← 7 個測試，雙瀏覽器 Fanout 模擬
```

**啟用步驟（生產環境，未來執行）：**

1. 在 AWS 建立 API Gateway WebSocket API（`$connect` / `$disconnect` / `$default` routes）
2. 部署 Lambda 授權器（驗證 HMAC Token）+ 訊息廣播 Lambda（讀 DynamoDB connections）
3. 設定環境變數：
   ```
   NEXT_PUBLIC_SIGNALING_PROVIDER=aws-apigw-ws
   NEXT_PUBLIC_AWS_APIGW_WS_URL=wss://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
   SIGNALING_TOKEN_SECRET=<隨機 64 位元密鑰>
   ```
4. 部署，觀察 CloudWatch 確認訊息正確流通

### 5.4 Phase 2：RTC 替換（Agora RTC → Amazon Chime SDK）

**目標：** 視頻 / 音訊費用從 $559 降至 $255（省 54%），不需要新伺服器  
**狀態：** Stub 骨架存在（`useChimeProvider.ts`），尚未實作  
**適合時機：** 每日 10–25 堂課規模

**待實作工作：**

```
1. npm install amazon-chime-sdk-js
2. 在 useChimeProvider.ts 實作 meeting 建立 / join / leave
3. 建立 /api/chime/meeting/ 端點（CreateMeeting + CreateAttendee）
4. 將 localVideoRef / remoteVideoRefs 對接 Chime MediaStream
5. 設定 NEXT_PUBLIC_RTC_PROVIDER=chime
```

**月費比較：**

| 每日堂數 | Agora | Chime SDK | 節省 |
|:-------:|:-----:|:---------:|:----:|
| 10 堂   | $80   | $51       | 36% |
| 50 堂   | $559  | $255      | 54% |
| 100 堂  | $1,157 | $510     | 56% |

### 5.5 Phase 3：RTC 替換（LiveKit）＋ 白板替換（tldraw）

**目標：** 費用封頂，每日 > 25 堂時比 Chime 更低；白板脫離第三方依賴  
**狀態：** Stub 骨架存在，尚未實作  
**適合時機：** 規模化後（每日 > 25 堂）

**LiveKit on ECS Fargate：**

```
月費（50 堂）：$150（vs Agora $559），省 73%
費用組成：~$100 compute + 每堂 $1–3 頻寬
需要：UDP port 50000–60000 透過 NLB 開放
SDK：@livekit/components-react（API 設計接近 Agora）
```

**tldraw + Hocuspocus 白板：**

```
tldraw（MIT）：完整協作白板，內建 Yjs CRDT 同步
Hocuspocus：Yjs WebSocket server，可跑在 LiveKit 同台
PDF 支援：pdf.js 渲染頁面為 Canvas，覆蓋在 tldraw 上層
保留：S3 PDF 上傳流程、/api/whiteboard/pdf 路由不動
```

**損益兩平點分析：**

| 每日堂數 | Agora | Chime | LiveKit Fargate |
|:-------:|:-----:|:-----:|:---------------:|
| 10 堂   | $80   | $51   | $110            |
| 22 堂   | ~$186 | ~$113 | ~$132           |
| 50 堂   | $559  | $255  | $150            |
| 100 堂  | $1,157 | $510 | $200            |

> 每日超過 **22 堂**，LiveKit 開始優於 Agora。

### 5.6 啟用方式（環境變數開關）

所有替代方案均為 **build-time 常數**（`NEXT_PUBLIC_*`），設定後需重新 build/deploy：

```bash
# 信令 Provider（預設 agora-rtm）
NEXT_PUBLIC_SIGNALING_PROVIDER=agora-rtm   # 現況（不設定即此值）
NEXT_PUBLIC_SIGNALING_PROVIDER=aws-apigw-ws  # Phase 1 啟用

# RTC Provider（預設 agora）
NEXT_PUBLIC_RTC_PROVIDER=agora             # 現況
NEXT_PUBLIC_RTC_PROVIDER=chime             # Phase 2
NEXT_PUBLIC_RTC_PROVIDER=livekit           # Phase 3

# 白板 Provider（預設 netless）
NEXT_PUBLIC_WHITEBOARD_PROVIDER=netless    # 現況
NEXT_PUBLIC_WHITEBOARD_PROVIDER=tldraw     # Phase 3

# Phase 1 啟用時必填
NEXT_PUBLIC_AWS_APIGW_WS_URL=wss://...
SIGNALING_TOKEN_SECRET=<64-char random key>

# Phase 3 啟用時必填
NEXT_PUBLIC_LIVEKIT_URL=wss://...
NEXT_PUBLIC_HOCUSPOCUS_URL=ws://...
```

**零風險保證：** 所有 `NEXT_PUBLIC_*_PROVIDER` 預設值指向 Agora/Netless，不設定任何新變數，行為與現況完全相同。

---

## 六、監控指標與告警分級

### 熱資料 API 指標

| 指標 | 🟢 正常 | 🟡 預警 | 🔴 危險 | 建議來源 |
|------|:-------:|:-------:|:-------:|---------|
| `/api/classroom/ready` p95 | < 200 ms | 200–500 ms | > 500 ms | CloudWatch Logs Insights |
| `/api/whiteboard/event` p95 | < 250 ms | 250–600 ms | > 600 ms | CloudWatch Logs Insights |
| 熱資料 API 5xx Rate | < 0.5% | 0.5–2% | > 2% | CloudWatch Metric Filter |
| 熱資料 API 總 RPS | < 300 | 300–600 | > 600 | API Gateway Metrics |
| Lambda ConcurrentExecutions | < 60% | 60–80% | > 80% | Lambda Metrics |
| Lambda Throttles | 0 | > 0 持續 1 min | 持續 > 3 min | Lambda Metrics |
| DynamoDB Write p95 | < 20 ms | 20–60 ms | > 60 ms | DynamoDB Metrics |
| DynamoDB ThrottledRequests | 0 | > 0 持續 1 min | 持續 > 3 min | DynamoDB Metrics |

### 第三方服務指標

| 服務 | 關鍵指標 | 🔴 危險門檻 |
|------|---------|-----------|
| Agora RTC/RTM | Join Success Rate | < 98% |
| Agora RTC/RTM | RTT p95 | > 400 ms |
| Netless Whiteboard | 事件遺失率 | > 1% |

### 告警分級

| 等級 | 觸發條件 | 處置時限 |
|------|---------|---------|
| P0（重大） | Join Success Rate < 95% 或 5xx > 5% 持續 5 分鐘 | 立即啟動事件指揮 + 功能降級 |
| P1（高優先） | 任一核心 API 進入 🔴 持續 3 分鐘 | 5 分鐘內啟動降載 |
| P2（預警） | 連續 5 分鐘 2 個以上指標進入 🟡 | 15 分鐘內降載，避免升 P1 |

---

## 七、環境變數索引

| 變數名 | 類型 | 用途 | 備註 |
|--------|------|------|------|
| `AGORA_APP_ID` | server | Agora 應用 ID | 必填（現況） |
| `AGORA_APP_CERTIFICATE` | server | RTC Token 簽發 | 必填（現況） |
| `AGORA_WHITEBOARD_APP_ID` | server | Netless 應用 ID | 必填（現況） |
| `AGORA_WHITEBOARD_AK` / `SK` | server | Netless API 金鑰 | 必填（現況） |
| `NEXT_PUBLIC_USE_AGORA_WHITEBOARD` | build | 白板後端切換 | `true`=Agora，`false`=Netless |
| `NEXT_PUBLIC_SIGNALING_PROVIDER` | build | 信令 Provider 選擇 | 預設 `agora-rtm` |
| `NEXT_PUBLIC_RTC_PROVIDER` | build | RTC Provider 選擇 | 預設 `agora` |
| `NEXT_PUBLIC_WHITEBOARD_PROVIDER` | build | 白板 Provider 選擇 | 預設 `netless` |
| `NEXT_PUBLIC_AWS_APIGW_WS_URL` | build | API GW WS 端點 | Phase 1 啟用時必填 |
| `SIGNALING_TOKEN_SECRET` | server | HMAC Token 簽發密鑰 | Phase 1 啟用時必填 |
| `NEXT_PUBLIC_LIVEKIT_URL` | build | LiveKit Server URL | Phase 3 啟用時必填 |
| `NEXT_PUBLIC_HOCUSPOCUS_URL` | build | Hocuspocus WS URL | Phase 3 啟用時必填 |
| `AWS_REGION` | server | DynamoDB / S3 區域 | `ap-northeast-1` |
| `AWS_ACCESS_KEY_ID` / `SECRET_ACCESS_KEY` | server | AWS 認證 | 必填 |
| `AWS_S3_BUCKET_NAME` | server | PDF 儲存 bucket | `jvtutorcorner-uploads` |
| `NEXT_PUBLIC_BASE_URL` | build | 應用基底 URL | 本機 `http://localhost:3000` |
| `LOGIN_BYPASS_SECRET` | server | E2E 測試自動登入 | 僅測試環境 |
| `GEMINI_API_KEY` | server | Google Gemini AI | AI Chat 功能 |
