# 視訊通訊核心替換計畫：Agora → 自建 LiveKit

> 目標：把 B2C 1 對 1 長時間視訊從 Agora 按量計費，遷移到固定成本的自建 LiveKit。
> 成本比較與損益兩平點見 [mvp-cost-analysis-agora-alternatives.md](../mvp-cost-analysis-agora-alternatives.md)。

## 0. 與現有程式碼的對應

專案早已為這次遷移預留抽象層，所以本計畫是「填入實作」而非「重寫教室」：

| 既有元件 | 角色 | 本計畫的動作 |
|---|---|---|
| `lib/providers/rtc/useRTC.ts` | 以 `NEXT_PUBLIC_RTC_PROVIDER` 切換 agora / chime / livekit | 不改，最後切換 env 即可 |
| `lib/providers/rtc/useLiveKitProvider.ts` | 目前是 stub | Phase 3 實作 |
| `lib/courseSessionService.ts` + `jvtutorcorner-course-sessions` | 一場課的排程、`roomId`、`status`、`startedAt/completedAt` | Phase 2 用來授權，Phase 4 用來寫回時長 |
| `lib/enrollmentService.ts` | 學生報名（`PAID` / `ACTIVE` 才有存取權） | Phase 2 學生授權來源 |
| `lib/auth/apiGuard.ts` (`withAuth`) | 平台 session 驗證 | Phase 2 token route 的第一道關卡 |
| `lib/pointsEscrow.ts` | 點數暫存，`releaseEscrow` 需要 `COMPLETED` 訊號 | Phase 4 由 webhook 觸發 |

> **身分驗證說明**：需求書寫的是 Cognito，但目前程式碼的 API 驗證走 `jvtutorcorner-sessions` 表的自訂 session（cookie `session=` 或 `Authorization: Bearer`）。Phase 2 因此提供兩個入口共用同一套核心邏輯：
> * `app/api/livekit/token/route.ts`：Next.js route，用現有 `withAuth`（Amplify Hosting 本身就在 Lambda 上執行）。
> * `lambda/livekit-token/handler.ts`：獨立 Lambda，接 API Gateway HTTP API + Cognito JWT Authorizer，若未來把驗證換回 Cognito 可直接用。

## 1. 整體資料流 (Data Flow)

```
┌──────────────┐  ①POST /api/livekit/token      ┌─────────────────────────┐
│  Next.js UI  │  {courseSessionId}             │  Token endpoint          │
│  (teacher /  │ ─────────────────────────────▶ │  (Next route on Lambda   │
│   student)   │                                │   or standalone Lambda)  │
└──────┬───────┘                                └──────────┬──────────────┘
       │                                                   │ ② withAuth → session
       │                                                   │ ③ authorizeJoin():
       │                                                   │    course-sessions (status, time window, roomId)
       │                                                   │    profiles (老師身分) / enrollments (學生報名)
       │                                                   │ ④ setSessionRoom() 若 roomId 為空
       │                                                   │ ⑤ RoomServiceClient.createRoom (maxParticipants)
       │ ⑥ {token, url, roomName}                          │ ⑥ AccessToken(identity=role:userId).toJwt()
       │ ◀─────────────────────────────────────────────────┘
       │
       │ ⑦ Room.connect(wss://livekit.jvtutorcorner.com, token)
       ▼
┌──────────────────────────┐          ⑧ room_started / participant_joined /
│  LiveKit Server (EC2)    │             participant_left / room_finished
│  Caddy TLS :443          │ ──────────────────────────────────────────▶ ┌────────────────────────┐
│  UDP 50000-60000 / TURN  │                                              │ Webhook Lambda (Phase 4)│
└──────────────────────────┘                                              │ WebhookReceiver 驗簽    │
                                                                          │ → markSessionStarted    │
                                                                          │ → markSessionCompleted  │
                                                                          │ → attendance / duration │
                                                                          │ → releaseEscrow         │
                                                                          └────────────────────────┘
```

關鍵決策：

1. **Room 名稱由伺服器決定**：`courseSession.roomId`，缺省為 `cs_<courseSessionId>`。前端只能傳 `courseSessionId`，拿不到別人的教室。
2. **Token 有效期綁課程**：到 `endTime + graceMinutes` 為止，且上限 3 小時，避免排程資料錯誤簽出長效 token。
3. **identity = `role:userId`**：LiveKit 用 identity 去重（換分頁會踢掉舊連線），Webhook 也能從 identity 反推平台使用者與角色。
4. **老師 roomAdmin、學生 publish、管理員 hidden 旁聽**：權限在 JWT grant 裡，伺服器強制執行，前端無法提升。
5. **時長以 Webhook 為準**，不信任前端回報：`participant_joined/left` 的 server 時間戳寫進 DynamoDB，作為薪資與扣點依據。

## 2. Phase 1：基礎設施部署

### 2.1 拓樸

* **單機 EC2（c6i.large）+ Elastic IP + Docker**：`cloudformation/livekit-ec2.yml`
* **Caddy** 自動申請 Let's Encrypt，終結 TLS，反向代理 7880 → `wss://livekit.jvtutorcorner.com`
* **不放在 ALB / NLB 後面**：WebRTC 需要 UDP port range 與固定公網 IP 當 ICE candidate；LB 只會增加成本與 ICE 失敗率。
* 容量：c6i.large 約可承載 40 間 1 對 1 720p 教室（每間約 2–3 Mbps 上下行）。超過 60 間同時上課再改 ECS 多節點 + Redis。

### 2.2 網路設定

| 方向 | 協定 / Port | 用途 |
|---|---|---|
| Ingress | tcp 443 | WSS 信令、REST API、Webhook 簽發來源 |
| Ingress | tcp 80 | ACME challenge |
| Ingress | tcp 7881 | ICE over TCP（UDP 被擋時） |
| Ingress | udp 3478 | TURN |
| Ingress | udp 50000–60000 | WebRTC media |
| Egress | all | Webhook 回呼、STUN、Docker pull |

VPC 建議：放在既有 VPC 的 **public subnet**（有 IGW 路由）。SSH 不開，用 SSM Session Manager 進機器。

### 2.3 部署步驟

```bash
# 1. 機密放 SSM（不進 repo）
aws ssm put-parameter --name /jvtutorcorner/livekit/api-key    --type SecureString --value "APIjvtc$(openssl rand -hex 4)"
aws ssm put-parameter --name /jvtutorcorner/livekit/api-secret --type SecureString --value "$(openssl rand -base64 48)"
aws ssm put-parameter --name /jvtutorcorner/livekit/webhook-url --type SecureString --value "https://example.invalid"   # Phase 4 再更新

# 2. 部署
aws cloudformation deploy --stack-name jvtc-livekit \
  --template-file cloudformation/livekit-ec2.yml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides VpcId=vpc-xxxx SubnetId=subnet-xxxx DomainName=livekit.jvtutorcorner.com

# 3. DNS：把 Output ElasticIp 設為 livekit.jvtutorcorner.com 的 A 記錄

# 4. 驗證
curl -s https://livekit.jvtutorcorner.com/          # → OK
npx livekit-cli room list --url wss://livekit.jvtutorcorner.com --api-key ... --api-secret ...
```

機器上的設定範本與 repo 的 `infra/livekit/{livekit.yaml,docker-compose.yml,Caddyfile}` 對應；CloudFormation UserData 內嵌了同一份內容，避免部署時還要另外拉 repo。

### 2.4 應用端環境變數

| 變數 | 放哪裡 | 值 |
|---|---|---|
| `LIVEKIT_URL` | Amplify env / Lambda env | `wss://livekit.jvtutorcorner.com` |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Amplify env（或 SSM 於啟動時讀） | 同 SSM |
| `NEXT_PUBLIC_LIVEKIT_URL` | Amplify env | 同 `LIVEKIT_URL`（Phase 3 前端用） |
| `NEXT_PUBLIC_RTC_PROVIDER` | Amplify env | 先維持 `agora`，Phase 3 驗證完再切 `livekit` |
| `LIVEKIT_EARLY_JOIN_MINUTES` / `LIVEKIT_GRACE_MINUTES` | 可選 | 預設 15 / 30 |

## 3. Phase 2：後端 Token API

檔案：

| 檔案 | 責任 |
|---|---|
| `lib/livekit/config.ts` | 讀取並驗證 env，延遲到首次使用才丟錯 |
| `lib/livekit/authorizeJoin.ts` | 純授權邏輯：查 course-sessions → 判角色 → 檢查時間窗 → 決定 room 名稱。回傳 discriminated union |
| `lib/livekit/token.ts` | 依角色產生 grant、簽 JWT、`ensureClassroomRoom` 預建房並鎖人數 |
| `app/api/livekit/token/route.ts` | Next.js 入口，`withAuth` 驗 session |
| `lambda/livekit-token/handler.ts` | 獨立 Lambda 入口，Cognito JWT claims |

授權矩陣：

| 呼叫者角色 | 檢查 | 結果 |
|---|---|---|
| `admin` / `system` | 無時間窗限制 | `admin`：hidden、只 subscribe |
| `teacher` | `courseSession.teacherId` ∈ {session.userId, profile.teacherId, profile.roid_id, profile.id} | `teacher`：roomAdmin + publish |
| 其他 | `findActiveEnrollment(userId, courseId)` 存在，且 `enrollment.courseSessionId` 為空或等於此 session | `student`：publish |

拒絕原因（HTTP status）：`SESSION_NOT_FOUND`(404)、`SESSION_CANCELLED`/`SESSION_COMPLETED`/`TOO_EARLY`(附 `opensAt`)/`TOO_LATE`/`NOT_TEACHER_OF_SESSION`/`NOT_ENROLLED`/`ENROLLED_IN_OTHER_SESSION`(403)、`BAD_REQUEST`(400)、`LIVEKIT_NOT_CONFIGURED`(503)。

前端呼叫範例（Phase 3 會封裝進 `useLiveKitProvider`）：

```ts
const res = await fetch('/api/livekit/token', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ courseSessionId }),
});
const data = await res.json();
if (!data.ok) {
  // data.reason 對應 i18n 訊息；TOO_EARLY 時用 data.opensAt 倒數
  return;
}
await room.connect(data.url, data.token);
```

### 本機測試

```bash
# .env.local
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret_devsecret_devsecret_0000   # >= 32 chars

docker run --rm -p 7880:7880 -p 7881:7881 -p 50000-50100:50000-50100/udp \
  livekit/livekit-server:v1.8 --dev --keys "devkey: devsecret_devsecret_devsecret_0000"
```

```bash
curl -s -X POST http://localhost:3000/api/livekit/token \
  -H "content-type: application/json" \
  -H "x-e2e-secret: $LOGIN_BYPASS_SECRET" \
  -d '{"courseSessionId":"<existing session id>"}' | jq
```

## 4. Phase 3：前端 useLiveKitProvider（已完成）

檔案：`lib/providers/rtc/useLiveKitProvider.ts`，依賴 `livekit-client`（已加入 package.json）。

設計重點：

* **零改動切換**：回傳與 `lib/agora/useAgoraClassroom.ts` **完全相同的形狀**，`tsc` 對 `useRTC.ts` 的聯集型別與 `ClientClassroom.tsx` 皆 0 錯誤。切換只需 `NEXT_PUBLIC_RTC_PROVIDER=livekit`。
* **Agora 形狀的 track 包裝**：`remoteUsers[]` 每項是 `{ uid, hasVideo, hasAudio, videoTrack:{play(el),stop()}, audioTrack:{play(el),stop()} }`。`play(el)` 同時吃 `<video>`（`remoteVideoRef`）與容器 `<div>`（`RemoteParticipantVideo`），把 LiveKit 的 `attach()`/`detach()` 差異吸收掉。第一位遠端視訊自動接到 `remoteVideoRef`。
* **包裝物件以 `track.sid` 快取**：同一條 track 跨多次 rebuild 保持同一參考，避免 `RemoteParticipantVideo`（effect deps `[user, user.videoTrack]`）反覆 detach/reattach 造成閃爍；track 消失時清快取。
* **未啟用時零連線**：`useRTC` 無條件呼叫三個 provider hook，但 `join()` 只會被「當前啟用的 provider」呼叫，provider=agora 時本 hook 只是 ref/state。
* **斷線重連 UI**：監聽 `RoomEvent.Reconnecting`（設 error 提示）/ `Reconnected`（清 error + 重建遠端）/ `ConnectionStateChanged` / `Disconnected`；`AudioPlaybackStatusChanged` → `autoplayFailed`，配合 `triggerFix()` 呼叫 `room.startAudio()` 在使用者手勢下恢復自動播放。
* **控制對應**：`setLocalAudioEnabled`/`setLocalVideoEnabled` → `setMicrophoneEnabled`/`setCameraEnabled`；`setVideoQuality` → `LocalVideoTrack.restartTrack({resolution})`；`setAudioOutputDevice` → `switchActiveDevice('audiooutput')`。`adaptiveStream` + `dynacast` 開啟以省頻寬。

待接線（非本階段程式碼問題，屬佈建 / 資料面）：

* Token 目前以 `roomId: channelName` 反查 course-session，需在 session 佈建時把 `course-sessions.roomId` 設成教室的 `channelName`（或未來把 `courseSessionId` 一路帶進 RTC 層，直接走 `courseSessionId` 授權）。
* 設備測試頁沿用 `/classroom/wait` 現有權限檢查；白板仍走 Agora/Netless（`whiteboardMeta` 回 `null`），Phase 3b 再遷到 tldraw。
* 實機驗證需要 `NEXT_PUBLIC_RTC_PROVIDER=livekit` + 有效登入 + 已建立的 course session + 運行中的 LiveKit server；本階段以 `tsc`（全 repo 0 錯誤）、`eslint`（0 警告）與模組載入測試把關。

## 5. Phase 4：Webhook 與狀態寫入（已完成）

檔案：

| 檔案 | 責任 |
|---|---|
| `lib/livekit/webhookHandler.ts` | 驗簽、事件分派、時長計算、escrow 結算（純邏輯，route 與 lambda 共用） |
| `app/api/livekit/webhook/route.ts` | Next.js 入口，讀 raw body 驗簽 |
| `lambda/livekit-webhook/handler.ts` | 獨立 Lambda 入口（API Gateway，無 authorizer，靠簽章） |
| `lib/courseSessionService.ts` | 新增 `recordPresenceEvent` / `setSessionRoomSid` / `saveSessionSettlement` |
| `lib/types/courseSession.ts` | 新增 `presenceLog` / `actualDurationSec` / `teacherPresenceSec` / `studentPresenceSec` / `billableSec` / `escrowSettlement` |

事件對應：

| 事件 | 動作 |
|---|---|
| `room_started` | `setSessionRoomSid` + `markSessionStarted`（設 `startedAt`，冪等） |
| `participant_joined` / `participant_left` | 以 identity 前綴（`role:userId`）分 teacher/student，`recordPresenceEvent` 寫入 `presenceLog`（key = 事件 uuid，天生冪等） |
| `room_finished` | `markSessionCompleted`（設 `completedAt`）→ 讀最新 `presenceLog` 算時長 → 保守結算 escrow → `saveSessionSettlement` |

時長計算（`computeDurations`，已用 6 組單元案例驗證，含 no-show / 重連 / 缺 leave / 時段不重疊）：

* `actualDurationSec` = `completedAt - startedAt`。
* `teacherPresenceSec` / `studentPresenceSec` = 各角色在場區間**聯集**（支援重連、多裝置）。
* `billableSec` = 師生在場區間的**交集** = 課真正在進行、雙方都在的時間。薪資與扣點以此為準。
* 缺 `leave` 的 `join`（當機、或結束時仍在線）收在 `room_finished` 時間。

**保守結算（防呆重點）**：只有 `teacherPresenceSec ≥ LIVEKIT_MIN_TEACHER_PRESENCE_SEC`（預設 60）**且** `billableSec ≥ LIVEKIT_MIN_BILLABLE_SEC`（預設 300）才釋放 escrow。老師沒到 / 課太短 → escrow 維持 `HOLDING` 交人工判斷，**絕不自動付款，也不自動退款**（退款是 admin 決策）。`releaseEscrow` 只動 `HOLDING`，webhook 重送不會重複付款。

冪等性：LiveKit 是 at-least-once 投遞。`markSessionStarted/Completed` 是條件式單寫入、`presenceLog` 以事件 uuid 為 key、`releaseEscrow` 只動 `HOLDING` —— 事件重送不會重複計算或重複付款。

安全：房間 → 課程對應一律由 DynamoDB 反查（`findSessionByRoomId`，或 `cs_<id>` 前綴 fallback），不看 webhook body 裡的 metadata 決定付誰錢。對不到 session 的房間回 200 不動作，讓 LiveKit 停止重送；簽章失敗回 401；DynamoDB 掛掉回 500 讓 LiveKit 重送。

部署接線：

```bash
# 1. webhook URL（二選一）
#    Next.js:  https://<app>/api/livekit/webhook
#    Lambda :  https://<api-id>.execute-api.<region>.amazonaws.com/livekit/webhook
aws ssm put-parameter --name /jvtutorcorner/livekit/webhook-url --type SecureString \
  --overwrite --value "https://<app>/api/livekit/webhook"

# 2. 重啟 LiveKit 容器讓新的 webhook.urls 生效
aws ssm start-session --target <instanceId>   # 進機器後：
#   cd /opt/livekit && docker compose restart livekit
```

Lambda 版 IAM 需額外授權：`points-escrow`、`user-points` 表的讀寫（`releaseEscrow` 會加老師點數），其餘同 token lambda。course-sessions 需有 `byRoomId` GSI（`scripts/setup-db.mjs` 已建立）。

## 6. 切換與備援
* **切換（兩邊並存，可隨時切回）**：LiveKit 是**備援方案**，不移除 Agora。透過 Amplify env `NEXT_PUBLIC_RTC_PROVIDER` 在 `agora` / `livekit` 之間切換，哪個穩定 / 成本好就用哪個；`useRTC.ts` 的抽象讓兩套實作長期並存，切換不需改程式碼。
  * 建議先小流量灰度：部分課程 / 特定 org 切 `livekit` 觀察，其餘維持 `agora`。若要做到「逐課切換」而非全站 env，可在 Phase 3 讓 `useLiveKitProvider` 依 courseSession 上的旗標決定 provider。
  * **獨立的安全待辦（與切換無關，兩邊都留的前提下仍要處理）**：`app/api/agora/token/route.ts` 目前硬編碼 Agora App ID / Certificate 且無身分驗證，任何人都能拿到 publisher token。既然 Agora 要留作備援，這條 route 應該補上 `withAuth` + 把憑證移到 env / SSM，而不是下線。
