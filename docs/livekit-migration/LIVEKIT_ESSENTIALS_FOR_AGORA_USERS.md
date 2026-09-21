# LiveKit 快速入門：Agora 使用者必讀

## 1. 核心觀念差異

### Agora（你現在用的）
```
架構：SaaS 完全託管
  ├─ 你只負責：前端 SDK 連線 + token 認證
  ├─ Agora 負責：媒體轉發、服務器運維、自動擴縮
  └─ 模式：「黑盒」（不知道伺服器發生什麼）

費用：按分鐘計費（線性成長）
特點：全球 CDN、99.9% uptime、零運維
```

### LiveKit（自建版）
```
架構：自己部署、自己運維
  ├─ 你負責：EC2 伺服器 + 代碼部署 + 監控告警
  ├─ LiveKit 負責：媒體轉發算法（開源 + 官方支援）
  └─ 模式：「透明」（你掌控一切）

費用：固定 EC2 成本（月 $75-150）
特點：完全自主、可自定義、需運維負擔
```

**比喻**：Agora = 租飯店，LiveKit = 租房子自己煮飯

---

## 2. 三個最容易踩坑的地方

### 🔴 陷阱 1：Token 認證邏輯不同

#### Agora（簡單）
```typescript
// token 用於：識別用戶 + 授權進房間
const token = generateAgoraToken({
  appId: '你的 app id',
  channelName: 'room_123',
  uid: 12345,  // 使用者 ID
  role: 'PUBLISHER'
});
// 任何人有 token 就能進

特點：
  ✓ 簡單明快
  ✗ 需要自己加身分驗證（目前缺失）
```

#### LiveKit（複雜但安全）
```typescript
// token 用於：識別用戶 + 驗證身分 + 設定權限
const token = generateAccessToken({
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  grant: {
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    room: 'room_123',
    roomJoin: true,
    identity: 'teacher:userId_001',  // 帶有角色前綴
  }
});

特點：
  ✓ 身分內嵌在 token（teacher/student）
  ✓ 權限精細控制（誰能發佈視訊、誰只能看）
  ✗ 需要 apiSecret（不能在前端）
```

**你的項目**：已用 `withAuth` 保護 `/api/livekit/token`，符合最佳實踐 ✅

---

### 🔴 陷阱 2：房間狀態管理完全不同

#### Agora
```
房間狀態存在 Agora 服務器
  ├─ 你無法直接查詢（只能透過 REST API）
  ├─ 離線時誰在房間？不知道
  └─ 誰說了什麼？看不到（需要另外錄製）

時長計算：
  ├─ Agora 帳單說了算（延遲 24-48 小時）
  └─ 你無法精確控制退款邏輯
```

#### LiveKit
```
房間狀態存在你的 EC2 伺服器
  ├─ 你可以即時查詢所有房間
  ├─ 誰進來、誰出去、何時事件全掌握
  ├─ 可以自建「房間歷史」
  └─ 時長精確到秒（由你決定）

時長計算：
  ├─ Webhook：room_started/participant_joined/room_finished
  ├─ 你完全掌控結算邏輯
  └─ 可自己實作保守結算（不自動退款）
```

**你的項目**：已實作 `webhookHandler.ts` + 保守結算 ✅

---

### 🔴 陷阱 3：錯誤處理邏輯差異大

#### Agora 常見錯誤
```typescript
client.on("user-joined", (user) => { ... });
client.on("connection-state-change", (curState, prevState, reason) => {
  // curState: "CONNECTED" | "DISCONNECTED" | "RECONNECTING"
  // 通常自動重連，你只需顯示 UI 提示
});

特點：SDK 自動重連，很少失敗
```

#### LiveKit 常見錯誤（需要自己處理）
```typescript
const room = new Room();
room.on(RoomEvent.ConnectionLost, () => {
  // ⚠️  連線斷了！你需要決定：
  // 1. 自動重連？ → room.reconnect()
  // 2. 提示用戶？ → showErrorModal()
  // 3. 清理本地狀態？ → clearParticipants()
});

room.on(RoomEvent.ParticipantPermissionChanged, (participant) => {
  // ⚠️  伺服器改了你的權限（例如：禁止發佈）
  // 你需要：停止攝影機、顯示提示
});

特點：
  ✓ 細粒度控制
  ✗ 需要自己實作很多邏輯
```

**你的項目**：已實作 reconnect UI + triggerFix()，但需驗證 ⚠️

---

## 3. LiveKit 伺服器配置陷阱

### 需要設定這些環境變數（EC2 上）

```bash
# 1. API 認證（最重要！）
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret

# 2. Webhook 簽章驗證
LIVEKIT_WEBHOOK_API_KEY=devkey
LIVEKIT_WEBHOOK_API_SECRET=secret

# 3. 房間設定
LIVEKIT_MAX_PARTICIPANTS_PER_ROOM=100  # 預設無限
LIVEKIT_AUTO_CREATE_ROOM=true
LIVEKIT_EMPTY_TIMEOUT=300              # 房間空多久自動刪除？

# 4. 媒體設定
LIVEKIT_LOG_LEVEL=info
```

### ⚠️  常見配置錯誤

1. **API key/secret 用錯**
   ```
   ❌ 用 webhook key 當 API key → 認證失敗
   ✅ 區分 LIVEKIT_API_KEY 和 LIVEKIT_WEBHOOK_API_KEY
   ```

2. **Webhook URL 沒設**
   ```
   ❌ 沒告訴 LiveKit Server 去哪裡回呼 → 無法結算
   ✅ 在 LiveKit config 加：webhook.urls = ["https://your-app/api/livekit/webhook"]
   ```

3. **Webhook 簽章沒驗**
   ```
   ❌ 接收任意 POST → 安全漏洞（誰都能假裝 LiveKit）
   ✅ 驗簽：WebhookReceiver.receive(rawBody, authHeader)
   ```

**你的項目**：都已正確實作 ✅

---

## 4. 與 Agora 功能對應表

| 功能 | Agora | LiveKit | 備註 |
|---|---|---|---|
| **視訊/音訊** | 原生支援 | 原生支援 | 完全相同 |
| **螢幕分享** | `screenShare()` | `screenShare()` | API 略有不同 |
| **文字聊天** | RTM SDK | 需自建或 LiveKit Webhook | ⚠️  |
| **白板** | Netless 整合 | 需自建或第三方 | 你用 Netless ✅ |
| **錄製** | Agora 雲端錄製 | 需自建（ffmpeg）或 ECS | ⚠️  |
| **時長統計** | Agora 帳單 | 自己 Webhook 計算 | ✅ 你已實作 |
| **身分驗證** | 無（需自己加） | Token 內嵌 | ✅ LiveKit 勝 |
| **多房間** | 需多個連線 | 同一連線可多房間 | ✅ LiveKit 勝 |

**缺失項**：
- ⚠️  RTM（實時文字訊息）→ 你用 WebSocket 代替
- ⚠️  錄製功能 → 目前都沒（Agora 也沒部署）

---

## 5. LiveKit 部署檢查清單

你的項目已實作，但需驗證：

```
☐ EC2 伺服器已啟動（docker-compose.yml）
  └─ 檢查：docker ps | grep livekit
  
☐ API Key/Secret 已配進 SSM
  ├─ /jvtutorcorner/livekit/api-key
  ├─ /jvtutorcorner/livekit/api-secret
  └─ 檢查：aws ssm get-parameter --name /jvtutorcorner/livekit/api-key
  
☐ Webhook URL 已配進 LiveKit Server
  └─ 檢查：SSH EC2 → 看 docker-compose 的 webhook.urls
  
☐ Token API 端點可正常回應
  └─ 檢查：curl -X POST http://localhost:3000/api/livekit/token \
     -H "Content-Type: application/json" \
     -d '{"roomId":"test","userId":"123"}'
  
☐ Webhook 端點可正常接收
  └─ 檢查：CloudWatch Logs 看有沒有 room_started 事件
  
☐ 前端切換到 LiveKit（NEXT_PUBLIC_RTC_PROVIDER=livekit）
  └─ 檢查：進教室看 console.log("[useRTC] using provider: livekit")
  
☐ 時長記錄有進 DynamoDB
  └─ 檢查：查詢 course-sessions 表的 presenceLog / billableSec
```

---

## 6. 常見問題排查

### Q1：進房間後黑屏（沒有視訊）

```
可能原因：
  1️⃣  Token 過期 → 重新取 token
  2️⃣  WebRTC ICE 失敗 → 檢查 EC2 防火牆（UDP 50000-60000 要開放）
  3️⃣  媒體轉碼失敗 → 看 EC2 日誌 (docker logs livekit)
  4️⃣  前端沒訂閱 track → 檢查 useLiveKitProvider 裡的 videoTrack.attach()

排查：
  1. 檢查瀏覽器 console error
  2. 看 EC2 docker logs
  3. 看 CloudWatch 日誌
  4. 用 LiveKit 官方客户端测试（排除前端問題）
```

### Q2：時長記錄不准（billableSec 為 0）

```
可能原因：
  1️⃣  Webhook 沒到達 → 檢查 webhook URL 和防火牆
  2️⃣  presenceLog 沒有 join/leave 事件 → 檢查前端連線
  3️⃣  participant_joined event 有延遲 → LiveKit 內部問題

排查：
  1. CloudWatch 查 /api/livekit/webhook 日誌
  2. 看 course-sessions 的 presenceLog 是否有記錄
  3. 檢查 computeDurations() 邏輯（會不會算錯）
  4. 確認 teacher 和 student 的 identity 是否正確帶上 role:
```

### Q3：EC2 上 Docker 容器一直重啟

```
可能原因：
  1️⃣  API Key 錯誤 → 驗證 SSM 參數
  2️⃣  連接埠已被佔用 → lsof -i :7880
  3️⃣  磁碟滿 → df -h
  4️⃣  記憶體不足 → free -h

排查：
  1. docker logs livekit 看具體錯誤
  2. aws ssm get-parameter 驗證 credentials
  3. 檢查 docker-compose.yml 的 env 設定
```

---

## 7. 性能預期 vs 現實

### Agora
```
優勢：
  ✅ 一鍵起動（SDK 做好一切）
  ✅ 99.9% uptime（全球 CDN）
  ✅ 自動擴縮（無需考慮容量）

劣勢：
  ❌ 成本隨規模線性增長
  ❌ 黑盒系統（無法自定義）
  ❌ 時長依賴第三方帳單
```

### LiveKit
```
優勢：
  ✅ 固定成本（EC2 $75/月）
  ✅ 完全自主（想改什麼就改）
  ✅ 精確時長控制
  ✅ 規模越大越便宜

劣勢：
  ❌ 需要自建運維
  ❌ SLA 由你負責
  ❌ 需要懂 WebRTC + 伺服器配置
  ❌ 初期部署複雜
```

---

## 8. 你的專案當下狀態

| 項目 | 狀態 | 說明 |
|---|---|---|
| **Phase 1（基礎設施）** | ✅ 完成 | EC2 + docker-compose + SSM 參數 |
| **Phase 2（Token API）** | ✅ 完成 | `/api/livekit/token` + 身分驗證 |
| **Phase 3（前端切換）** | ✅ 完成 | `useLiveKitProvider` + Agora 形狀兼容 |
| **Phase 4（Webhook 結算）** | ✅ 完成 | `webhookHandler` + 保守結算邏輯 |
| **整合測試** | ⚠️  需驗證 | 真實教室測試（10 組並發） |
| **運維文檔** | 📝 需完善 | 故障排查、監控、升級指南 |

**立即需做**：
1. EC2 實測 10 個房間是否穩定
2. 驗證 Webhook 時長記錄準確性
3. 驗證前端 reconnect 邏輯
4. 寫運維文檔（故障排查、告警設定）

---

## 9. 回到你的問題：為什麼改 LiveKit？

```
Agora：
  按分鐘計費 × 50 堂課/天
  = $559/月（成本隨規模線性增長）
  
LiveKit：
  固定 EC2 成本
  = $75/月（成本封頂）
  
損益兩平點 = 22 堂課/天
現況 10 堂課 = Agora 更便宜
未來 50+ 堂課 = LiveKit 便宜 5.6 倍
```

**簡言之**：不是為了現在省錢，是為了**未來不會被成本綁架**。

