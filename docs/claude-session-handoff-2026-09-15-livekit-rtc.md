# JV Tutor Corner — 教室影音（Agora / LiveKit）Session 交接知識庫

> **給新的 Claude**：本文件涵蓋「Agora → LiveKit 自建」這條工作線（2026-09-08 起的 session），包含架構、程式邏輯、成本結論、**本 session 對話中說錯、已勘誤的內容**、以及待辦。
> 通用的 repo 規則（本機環境前綴、禁跑清單、身分識別、守衛、B2B、skill 系統）**不在此重複**，請一併讀 [claude-session-handoff-2026-09-15.md](./claude-session-handoff-2026-09-15.md)（另一條工作線：安全、B2B、Cloudflare SFU）。
> 文件產生日：2026-09-15；第 1、6 節已對照當下的 code 與 git 重新查證。語言：使用者用繁體中文，回覆一律 zh-TW。

---

## 0. TL;DR（開工前必讀）

1. **使用者決策（不可推翻）**：LiveKit 是**備援／替代方案**，**保留 Agora 為正式路徑**。兩者並存，以 `NEXT_PUBLIC_RTC_PROVIDER` 切換。不要移除 Agora 的程式碼或 API。
2. **LiveKit 目前「程式碼完成、從未部署」**：EC2 沒建、SSM 沒有參數、`.env.local` 沒有 `LIVEKIT_*`。**目前 LiveKit 的雲端成本是 $0**。本 session 曾說「EC2 c6i.large 每月浪費 $67」，那是錯的（見 §7）。
3. **MVP 規模 = 10 組（1 老師 + 1 學生）同時上課**。依 repo 內的成本文件，這個規模 Agora 幾乎落在每月 10,000 分鐘免費額度內，**MVP 階段繼續用 Agora 是正確選擇**。LiveKit 自建的損益兩平點約 **每天 22 堂**。
4. **壓測只跑到 5～7 組，瓶頸是「跑測試的那台機器」，不是 Agora**：每組 2 個 headless Chromium，用假裝置在本機編碼視訊，10 組約需 4 GB RAM 與 3 vCPU（`docs/performance-test-report.md`）。
5. **🔴 安全：Agora App Certificate 仍留在 git 歷史**（7 個 commit，見 §6.1）。程式碼已不再寫死，但憑證本身需要到 Agora Console **輪換**，這只能由使用者操作。
6. 我在本 session 寫的三份 docs（`WHY_EC2_NOT_LAMBDA.md`、`RTC_SOLUTIONS_COMPARISON.md`、`LIVEKIT_ESSENTIALS_FOR_AGORA_USERS.md`）**含有錯誤的 API 名稱、環境變數與未查證的價格**，不可當作事實來源。勘誤見 §7，修正列為待辦。
7. **不要 commit／push**，除非使用者當下明確要求。**不要 `cat` 任何 `.env*`**，只 grep 變數名稱；本 session 曾把 `.env.production.test` 的秘密值印進 transcript，不可轉抄。

---

## 1. Repo 現況（2026-09-15 查證）

| 項目 | 內容 |
|---|---|
| 分支 | `integration/b2b-security-merge`（主分支 `main`），領先 `origin/main`、尚未 push |
| Remote | `github.com/jvtutorcorner-sketch/jvtutorcorner-rwd` |
| LiveKit 相關檔案 | **全部已 commit**（在 `5e6120e` merge 之前進入歷史） |
| 未追蹤檔案 | `docs/MVP.md`、`docs/claude-session-handoff-2026-09-15.md`、`scripts/create-dev-tables.mjs`（其他 session 產生）＋本文件 |
| CI 檢查 | `npm run typecheck`、`npm run lint:ci`（改 lib 後要跑） |

---

## 2. 教室影音架構

### 2.1 Provider 抽象（`lib/providers/rtc/useRTC.ts`）

```
NEXT_PUBLIC_RTC_PROVIDER（build time 內嵌）
  agora（預設，正式） → useAgoraRTCProvider
  livekit             → useLiveKitProvider
  cloudflare-sfu      → useCloudflareSfuProvider（另一個 session 做的，見另一份交接 §4.5）
  chime               → useChimeProvider
```

- 四個 hook **每次 render 都會被呼叫**（React hook 規則），只有被選中的 provider 真正連線，其他的必須完全不開連線。
- 呼叫端：`app/classroom/ClientClassroom.tsx:356` 的 `useRTC(agoraConfig)`。
- 信令（`NEXT_PUBLIC_SIGNALING_PROVIDER`）與白板（`NEXT_PUBLIC_WHITEBOARD_PROVIDER`，現行 Netless）是**獨立**抽象，切換 RTC 不影響它們。
- `useRTC.ts` 檔頭註解寫「LiveKit on ECS Fargate」是**過時的**，實際 infra 是單機 EC2。

### 2.2 LiveKit 端到端流程

```
學生/老師進教室
  └─ useLiveKitProvider.join()
       ├─ POST /api/livekit/token  body {roomId: channelName}  (cookie session)
       │    ├─ withAuth → session.userId / role
       │    ├─ getLiveKitConfig()         缺 env → 503 LIVEKIT_NOT_CONFIGURED
       │    ├─ authorizeJoin()            查 DynamoDB 決定能否進、房名、角色
       │    ├─ ensureClassroomRoom()      createRoom(maxParticipants, emptyTimeout)，失敗不阻擋
       │    └─ issueClassroomToken()      簽 JWT，identity = "<role>:<userId>"
       └─ new Room().connect(NEXT_PUBLIC_LIVEKIT_URL, token)
            └─ 媒體走 EC2 上的 LiveKit SFU（UDP 50000-60000 / TCP 7881 / TURN 3478）

LiveKit Server ──webhook(JWT 簽章)──► POST /api/livekit/webhook  或  lambda/livekit-webhook
  room_started        → setSessionRoomSid + markSessionStarted
  participant_joined  → recordPresenceEvent(join)   以 event uuid 為 key（冪等）
  participant_left    → recordPresenceEvent(leave)
  room_finished       → markSessionCompleted → computeDurations → settleEscrow → saveSessionSettlement
```

### 2.3 伺服器端檔案與職責

| 檔案 | 職責 |
|---|---|
| `lib/livekit/config.ts` | 延遲驗證的 env 讀取（首次呼叫才檢查，避免 build 失敗）。必要：`LIVEKIT_URL`（須 `ws(s)://`）、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`（≥32 字元）。選用（預設值）：`LIVEKIT_EARLY_JOIN_MINUTES`(15)、`LIVEKIT_GRACE_MINUTES`(30)、`LIVEKIT_MAX_TOKEN_TTL_SEC`(10800)、`LIVEKIT_ROOM_EMPTY_TIMEOUT_SEC`(300)、`LIVEKIT_MIN_BILLABLE_SEC`(300)、`LIVEKIT_MIN_TEACHER_PRESENCE_SEC`(60)、`LIVEKIT_WEBHOOK_CLOCK_TOLERANCE_SEC`(300)。錯誤類別 `LiveKitConfigError`。 |
| `lib/livekit/authorizeJoin.ts` | 純邏輯，不碰 HTTP/SDK。回傳 discriminated union。見 §2.4。 |
| `lib/livekit/token.ts` | `buildIdentity` / `parseIdentity`、`grantFor(role)`、`issueClassroomToken`、`ensureClassroomRoom`。 |
| `lib/livekit/webhookHandler.ts` | `verifyWebhook(rawBody, authHeader)`、`handleWebhookEvent`、`computeDurations`、`settleEscrow`。Next route 與 Lambda 共用。 |
| `app/api/livekit/token/route.ts` | `withAuth` + 上述流程。回應 200/400/403/404/503/500。 |
| `app/api/livekit/webhook/route.ts` | **不套 withAuth**（呼叫方是 LiveKit Server，簽章即認證）。必須讀 raw body 驗簽。簽章錯 401；已知但不處理的事件回 200（避免無限重送）；DynamoDB 錯誤回 500（讓 LiveKit 重送）。 |
| `lambda/livekit-token/handler.ts` | Cognito authorizer 版本（repo 實際用自建 DynamoDB session，非 Cognito，所以正式走 Next route）。 |
| `lambda/livekit-webhook/handler.ts` | API Gateway HTTP API 版，處理 base64 body 與 header 大小寫。IAM 需要 course-sessions、enrollments、points-escrow、user-points、profiles。 |
| `lib/courseSessionService.ts` | `findSessionByRoomId`（GSI `byRoomId`）、`setSessionRoom`、`setSessionRoomSid`、`markSessionStarted/Completed`（條件式單寫）、`recordPresenceEvent`、`saveSessionSettlement`、`SessionDurations` 型別。 |
| `lib/types/courseSession.ts` | 新增欄位：`presenceLog`、`actualDurationSec`、`teacherPresenceSec`、`studentPresenceSec`、`billableSec`、`escrowSettlement`、roomSid。 |

### 2.4 `authorizeJoin` 規則

1. 找課：優先 `courseSessionId`，否則用 `roomId` 查 GSI `byRoomId`。都沒有 → 400；找不到 → 404 `SESSION_NOT_FOUND`。DynamoDB 例外往上丟（5xx，不偽裝成 403）。
2. 狀態：`CANCELLED` / `COMPLETED` → 403。
3. 角色：`admin`/`system` → admin（可跳過時間窗）；`teacher` 必須是該堂老師（比對 `userId`、`profile.teacherId`、`roid_id`、`id`，與 `courseOwnership.ts` 一致）；其他角色必須有 active enrollment，且 enrollment 若指定 `courseSessionId` 必須相同（null 視為相容）。
4. 時間窗：`startTime - earlyJoin` ～ `endTime + grace`，否則 `TOO_EARLY`（附 `opensAt`）/ `TOO_LATE`。
5. 房名**由伺服器決定**：`session.roomId`，沒有則 `cs_<sessionId>` 並回寫 DB（回寫失敗不阻擋，webhook 有 `cs_` 前綴 fallback）。
6. Token TTL = `min(maxTokenTtlSec, 距 closesAt 秒數)`，最少 60 秒。

### 2.5 權限與 identity

| 角色 | Grant |
|---|---|
| teacher | `roomJoin`、`canSubscribe`、`canPublish`、`canPublishData`、`roomAdmin` |
| student | `roomJoin`、`canSubscribe`、`canPublish`、`canPublishData` |
| admin | `roomJoin`、`canSubscribe`、`hidden:true`，不可發布（隱形稽核） |

- identity = `<role>:<userId>`。**同 identity 重連會踢掉舊連線**，這是換分頁／重連需要的行為。webhook 靠此前綴對回角色。
- token metadata：`{role, userId, courseSessionId, courseId}`。
- `ensureClassroomRoom`：1 對 1（`capacity ≤ 1`）時 `maxParticipants = 3`（老師＋學生＋隱形 admin），否則 0（不限）。

### 2.6 時長計算與保守結算（`webhookHandler.ts`）

- 每個角色：依時間排序 join/leave，以「在場連線數」計數（支援多裝置／重連）。0→>0 開區間，>0→0 關區間。沒有 leave 的區間收在 `room_finished` 時間。最後合併重疊區間。
- `teacherPresenceSec` / `studentPresenceSec` = 各自聯集總長。
- **`billableSec` = 老師聯集 ∩ 學生聯集 的總長**（師生同時在場）。
- `actualDurationSec` = `room_finished` − `startedAt`。
- **結算門檻**：只有 `teacherPresenceSec ≥ 60` **且** `billableSec ≥ 300` 才對該堂的 PAID/ACTIVE enrollment 呼叫 `releaseEscrow`。**未達門檻 → escrow 保持 HOLDING 交人工審核；絕不自動付款給缺席老師，也絕不自動退款**（退款是 admin 決策）。
- 冪等性：LiveKit webhook 是 at-least-once。`markSession*` 條件式寫入、presenceLog 以 event uuid 為 key、`releaseEscrow` 只處理 HOLDING，所以重送不會重複付款。
- 課程對應**只信 DynamoDB**（`findSessionByRoomId` 或 `cs_` 前綴），不看 webhook metadata 決定付誰錢。
- ⚠️ `computeDurations` 在 session 中以 6 個案例手動驗證過，但 **repo 裡沒有對應的測試檔**。

### 2.7 前端 `useLiveKitProvider.ts`

- 回傳形狀與 `useAgoraClassroom` **完全相同**（tsc 對 union 0 錯誤）。把 LiveKit track 包成 Agora 形狀的 `remoteUsers[]`：`{uid, hasVideo, hasAudio, videoTrack:{play(el),stop()}, audioTrack:{play(el),stop()}}`，`play(el)` 接受 `<video>` 或 `<div>`。
- 包裝物件以 `track.sid` 快取，避免 `RemoteParticipantVideo` 每次 rebuild 都重新 attach 造成閃爍。
- 事件：`ParticipantConnected/Disconnected`、`TrackSubscribed/Unsubscribed/Muted/Unmuted`、`Reconnecting`/`Reconnected`（重連 UI）、`ConnectionStateChanged`、`Disconnected`、`AudioPlaybackStatusChanged`、`MediaDevicesError`。
- 自動播放被擋：`triggerFix` 內呼叫 `room.startAudio()`。
- Room 選項：`adaptiveStream`、`dynacast`。
- 前端需要 **`NEXT_PUBLIC_LIVEKIT_URL`**（build time），缺少時 join 丟錯。

### 2.8 Infra（`infra/livekit/*`、`cloudformation/livekit-ec2.yml`）

- **EC2 單機**：預設 `InstanceType=c6i.large`（參數可覆寫），AMI AL2023，region ap-northeast-1。
- Docker Compose：`livekit/livekit-server:v1.8` + `caddy:2-alpine`，**兩者都 `network_mode: host`**（WebRTC 要直接綁 host UDP 範圍，不可改 bridge）。Log 走 awslogs → `/jvtutorcorner/livekit`。
- `livekit.yaml`：`port 7880`、`rtc.tcp_port 7881`、`port_range 50000-60000`、`use_external_ip: true`；`room.auto_create`、`empty_timeout 300`、`departure_timeout 20`；codecs opus/vp8/h264/vp9；內建 TURN（UDP 3478，TLS 由 Caddy 終結）；`prometheus_port 6789`。
- **Webhook 用同一組 `api_key` 簽章**（`webhook.api_key: ${LIVEKIT_API_KEY}`），沒有另一組 webhook 專用金鑰。
- 秘密不進 repo：開機時從 SSM 讀取，再用 `envsubst` 代入。SSM SecureString：`/jvtutorcorner/livekit/api-key`、`/api-secret`（`openssl rand -base64 48`）、`/webhook-url`。另需 `LIVEKIT_DOMAIN`。
- Security Group：TCP 80（ACME）、443（wss）、7881（ICE/TCP）、UDP 3478（TURN）、UDP 50000-60000（media）、22（限 `AllowedSshCidr`，建議改用 SSM）。
- Caddy：`${LIVEKIT_DOMAIN}` 反代到 `localhost:7880`，`/healthz` 回 200，自動 Let's Encrypt（DNS A 記錄須指向 Elastic IP）。

---

## 3. 成本與部署形態結論

### 3.1 為什麼媒體伺服器不能放 Lambda / Amplify serverless（結論正確）

- Lambda 無法監聽 UDP、無法綁定 port 範圍、最長執行 15 分鐘、沒有固定公網 IP 可作 ICE candidate。
- API Gateway WebSocket **只能承載信令，不能承載媒體**。
- 所以混合架構是：**token API 與 webhook 放 serverless（Amplify SSR / Lambda）＋ 媒體 SFU 放常駐主機**。

### 3.2 成本數字的唯一可信來源

**以 `docs/mvp-cost-analysis-agora-alternatives.md` 為準**（有公式）。本 session 聊天中給過的其他數字多為估算、未查證，不要引用。

| 項目 | 數值（出自上述文件） |
|---|---|
| Agora RTC 公式 | `(user-min − 10,000 免費) × $3.99 / 1,000` |
| MVP 10 組驗收 | 幾乎落在免費額度內 ≈ 近乎免費 |
| Agora 月費 10 / 50 / 100 堂/天 | $80 / $559 / $1,157（隨用量無上限） |
| LiveKit 自建損益兩平 | 每天約 **22 堂** |
| Amazon Chime SDK | `$0.0017/attendee-minute` |

### 3.3 部署形態建議（依規模）

| 規模 | 建議 |
|---|---|
| MVP（10 組） | **Agora**。LiveKit 只做單組備援驗證（`docs/MVP.md` 第 381 行）。若要實際架 LiveKit 驗證，用 CFN 參數覆寫較小機型，或驗完就停機，不需改程式碼 |
| 22 堂/天以上 | 評估切換 LiveKit 自建 EC2 |
| 單機不夠時 | 多節點需要 Redis + 各節點 `node_ip`（`livekit.yaml` 有註解）。**不要假設 Fargate 可行**：LiveKit 需要 host networking 與 1 萬個 UDP port，Fargate awsvpc 模式下不實際，需另外查證 |

---

## 4. 「教室只能 5～7 組」診斷

- 來源：`docs/performance-test-report.md`（2026-07-17）、壓測 `e2e/classroom/07_room_pdf_sync_stress.spec.ts`（`CONCURRENT_GROUPS`）、`04_load_escalation.spec.ts`。
- 每組 = 2 個 headless Chromium，使用 `--use-fake-device-for-media-stream`，**每個瀏覽器都在本機編碼上傳視訊**。每進程 150～250 MB，10 組約 4 GB RAM、約 3 vCPU 峰值，加上 OS 與 Node 超過本機可用資源 → OOM／CPU 飽和 → timeout。
- **結論：瓶頸在測試機，不在 Agora**。真實使用者各自用自己的裝置，伺服器端不會有這個問題。
- **尚未排除 Agora 端因素**（本 session 聊天說「Agora 免費帳號支援 20+ 並發房間」是未查證的說法）。確認方式：換更大的測試機（EC2 t3.large 8 GB）或分散式跑（`e2e/scripts/merge-distributed-results.ps1`，5+5）。如果可達組數隨機器規格上升 → 確認是 client 端瓶頸；同時查 `/api/admin/agora-logs` 有沒有 Agora 端錯誤。
- 報告的 EC2 t3.medium 欄位仍是 `[待補充]`。
- **MVP 驗收要求 10/10 全過**：07 壓測預設 `SUCCESS_THRESHOLD=0.75`，驗收必須設 `SUCCESS_THRESHOLD=1`（`docs/MVP.md` §6.1、R3）。

---

## 5. 開發與驗證指令

```bash
# LiveKit / 其他 provider 的授權 contract（未設定的 provider 必須回 503）
npx playwright test e2e/classroom_rtc_providers_verification.spec.ts --project=chromium

# 型別與 lint（CI 會擋）
npm run typecheck
npm run lint:ci

# 10 組壓測（本機會卡在 5～7 組，請在 EC2 或分散式跑；前綴規則見另一份交接 §3）
CONCURRENT_GROUPS=10 SUCCESS_THRESHOLD=1 npx playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium

# 切到 LiveKit（需 build time 生效，改完要重新 build/部署）
NEXT_PUBLIC_RTC_PROVIDER=livekit
```

Webhook Lambda 打包：

```bash
npx esbuild lambda/livekit-webhook/handler.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist/livekit-webhook/index.js --alias:@=. --external:@aws-sdk/*
```

---

## 6. 已查證的阻塞問題與風險

### 6.1 🔴 P0 — Agora App Certificate 在 git 歷史中

- 現況：`app/api/agora/token/route.ts` 與 `rtm-token/route.ts` 已加 `withAuth`、改讀 env，缺值時丟錯，**不再寫死**。
- 但 `git log -S <certificate>` 仍命中 7 個 commit（`77de9cd` "Emergency fix: Add hardcoded credentials fallback" 等），repo 有 GitHub remote。
- **動作（使用者本人）**：Agora Console 輪換 App Certificate → 更新 Amplify 環境變數 `AGORA_APP_CERTIFICATE`。是否改寫 git 歷史由使用者決定。Claude 不可自行輸入憑證。

### 6.2 🔴 P0（切 LiveKit 前必修）— Amplify 執行期讀不到 `LIVEKIT_*`

- Amplify Gen1 SSR 必須把 server 端變數列在 `next.config.ts` 的 `env` 區塊，執行期才讀得到。
- 目前 `env` 區塊有 `AGORA_*`、`CF_REALTIME_*`，**沒有 `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_*` 門檻值**。在 Amplify 上 token 與 webhook route 會一律 503。
- 修正：把這些變數加入 `env`，並把 `LIVEKIT_API_SECRET` 加入 `scripts/check-bundle-secrets.mjs` 的檢查清單（比照 `CF_REALTIME_APP_SECRET`）。

### 6.3 🟠 P1（未驗證）— 前端傳的 `roomId` 可能對不到 course session

- `useLiveKitProvider` 送出 `{ roomId: channelName }`。
- `ClientClassroom.tsx:226`：`effectiveChannelName = sessionParam || channelName || \`classroom_session_ready_${courseId}\``；`/classroom/room` 的 channel 取自 `?channel=`，預設 `'testroom'`。
- `authorizeJoin` 用這個值查 GSI `byRoomId`。如果 Agora 時代的 channel 名稱不等於 `courseSession.roomId`，會一律 404 `SESSION_NOT_FOUND`，而且因為沒有 session id，也不會回寫 `cs_<id>`。
- 待辦：追查教室 URL 帶的 `session` 參數是否就是 course session 的 `roomId` 或 id。必要時讓前端改傳 `courseSessionId`。這是 LiveKit 單組驗證的第一個卡點。

### 6.4 其他

- `computeDurations` 沒有自動化測試（§2.6）。
- `docs/MVP.md` R6：教室相關 skill 仍是 ⚠️ PARTIAL；`classroom-rtc-providers` 在 LiveKit 已設定時的分支需要真實憑證才能驗。
- `docs/livekit-migration/README.md` 與 `ARCHITECTURE_COMPARISON.md` 把 LiveKit 寫成「新架構主力、Agora 為備援」，與使用者決策相反，閱讀時以本文件 §0 為準。

---

## 7. 勘誤：本 session 對話中說錯或未查證的內容

新 session **不要**重複以下說法，也不要從那三份 docs 複製。

| 錯誤說法 | 事實 |
|---|---|
| 「EC2 c6i.large 對 MVP 過度設計，每月浪費 $67」 | LiveKit **從未部署**，目前沒有任何 EC2 費用。c6i.large 只是 CFN 參數預設值 |
| 「MVP 可改 Lambda + API Gateway WebSocket，$38/月完全可行」 | API GW WebSocket **不能承載媒體**，這個選項對 RTC 無效 |
| 「Agora MVP 約 $50/月」 | 依成本文件，10 組驗收 ≈ 免費額度內；10 堂/天 ≈ $80 |
| 「Agora 免費帳號支援 20+ 並發房間」 | 未查證 |
| `LIVEKIT_WEBHOOK_API_KEY` / `LIVEKIT_WEBHOOK_API_SECRET` | **不存在**。webhook 用同一組 API key/secret 簽章 |
| `LIVEKIT_MAX_PARTICIPANTS_PER_ROOM`、`LIVEKIT_AUTO_CREATE_ROOM`、`LIVEKIT_EMPTY_TIMEOUT` 環境變數 | 不存在。這些是 `livekit.yaml` 的 `room:` 設定，或由 `createRoom` 逐房指定；app 端對應的是 `LIVEKIT_ROOM_EMPTY_TIMEOUT_SEC` |
| `RoomEvent.ConnectionLost`、`room.reconnect()` | 不存在。SDK 會自動重連，用 `Reconnecting` / `Reconnected` / `Disconnected` 事件處理 |
| 「LiveKit 同一連線可加入多個房間」 | 錯，一個 `Room` 就是一條連線 |
| token 範例把 `identity` 放在 grant 內 | 錯，`identity` 是 `AccessToken` 的選項（見 `token.ts`） |
| curl 範例 body `{"roomId","userId"}` | 錯，需要 session cookie，body 是 `{courseSessionId}` 或 `{roomId}`，userId 取自 session |
| 「console 會印 `[useRTC] using provider: livekit`」 | `useRTC.ts` 沒有這行 log |
| 「LiveKit 無 RTM，用 WebSocket 代替」 | 已有信令 provider 抽象（Agora RTM / AWS API GW WebSocket）；LiveKit 另可用 data message（`canPublishData`） |
| Twilio「$45,000/月」與同文件表格「$550」、Chime「$1000+」與表格「$250」 | 自相矛盾的估算，全部未查證；Twilio Video 的產品存續狀態也需另查 |
| 「150 堂以上改 ECS Fargate 自動擴縮」 | 見 §3.3，LiveKit 在 Fargate 上不實際，未查證 |
| Lightsail $40（4 GB）、Lambda 預留並發 $3.50/並發 | 未查證的價格 |
| 「Agora 時長帳單延遲 24～48 小時」 | 未查證 |

**仍然成立的結論**：媒體伺服器必須常駐主機（§3.1）；5～7 組是測試機瓶頸（§4）；LiveKit webhook + 保守結算的設計（§2.6）；LiveKit 自建在約 22 堂/天以上才比 Agora 便宜。

---

## 8. 待辦（依優先順序）

| # | 優先 | 項目 | 誰做 |
|---|---|---|---|
| 1 | P0 | 輪換 Agora App Certificate，更新 Amplify env（§6.1） | 使用者 |
| 2 | P0 | MVP 10 組驗收：在 EC2 t3.large 或分散式環境跑 07 壓測，`SUCCESS_THRESHOLD=1`，結果填回 `performance-test-report.md` 的 `[待補充]` | Claude 可準備指令，使用者開機器 |
| 3 | P1 | 修正三份 docs 的錯誤，或在檔頭加警語指向本文件 §7；並修正 README / ARCHITECTURE_COMPARISON 的「LiveKit 為主」敘述 | Claude（使用者同意後） |
| 4 | P1 | `next.config.ts` 的 `env` 加入 `LIVEKIT_*`，並加入 bundle-secrets 檢查（§6.2） | Claude |
| 5 | P1 | 追查 `channelName` 與 `courseSession.roomId` 的對應（§6.3） | Claude |
| 6 | P2 | 為 `computeDurations` 加單元測試（重疊、重連、多裝置、無 leave、無交集、老師缺席） | Claude |
| 7 | P2 | 真正做 LiveKit 單組備援驗證：建 SSM 參數 → CFN 部署（可覆寫小機型）→ DNS A 記錄 → 設 webhook-url → Amplify 設 `LIVEKIT_*` + `NEXT_PUBLIC_LIVEKIT_URL` + `NEXT_PUBLIC_RTC_PROVIDER=livekit`（或僅 preview 環境）→ 驗 token、連線、presenceLog、`billableSec`、escrow → 停機 | 使用者部署；Claude 協助 |
| 8 | P3 | 修正 `useRTC.ts` 檔頭的 Fargate 過時註解 | Claude |

---

## 9. 相關文件與記憶

- 本工作線：`docs/livekit-migration/README.md`（部署步驟最完整）、`ARCHITECTURE_COMPARISON.md`、`docs/mvp-cost-analysis-agora-alternatives.md`（成本唯一來源）、`docs/performance-test-report.md`、`docs/MVP.md`（§6.1 驗收、§7 風險）
- 含錯誤、待修：`docs/livekit-migration/{WHY_EC2_NOT_LAMBDA,RTC_SOLUTIONS_COMPARISON,LIVEKIT_ESSENTIALS_FOR_AGORA_USERS}.md`
- Skill：`.agents/skills/classroom-rtc-providers/SKILL.md`
- 另一條工作線交接：`docs/claude-session-handoff-2026-09-15.md`
- 記憶：`project_livekit_migration.md`（LiveKit 為備援、保留 Agora）、`e2e-local-run-gotchas.md`

## 10. 使用者偏好（本工作線觀察）

- 重視成本，會追問「MVP 規模真的需要嗎」，要求依實際規模（10 組）而非假想規模下結論。
- 對不熟悉的技術（LiveKit）會要求說明注意事項，偏好比較表。
- 決策權在使用者：保留 Agora、LiveKit 做備援。建議可以提，不可擅自改變方向。
