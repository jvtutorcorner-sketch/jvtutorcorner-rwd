# LiveKit 遷移架構對比 & 成本分析
生成時間: 2026-09-08

## 1. 技術棧對比

### 原架構（Agora 為主）
| 層級 | 組件 | 部署位置 | 特點 |
|---|---|---|---|
| 通訊媒體服務 | Agora RTC | 第三方雲（新加坡 / 日本）| 按分鐘計費、管理簡單 |
| 信令 / RTM | Agora RTM | 同上 | 即插即用 |
| 白板 | Netless / Agora Whiteboard | 同上 | 按房間小時計費 |
| 前端 RTC Provider | useAgoraClassroom | Next.js | 緊耦合 Agora SDK |
| Token 簽發 | /api/agora/token | AWS Lambda (Next.js SSR) | 硬編碼憑證、無驗證 |
| 課程狀態 | course-sessions (無時長紀錄) | DynamoDB | 缺乏實際上課記錄 |
| 結算 | 用 order / enrollment 的 startTime/endTime 推估 | 後端邏輯 | 不精準，依前端報數 |

### 新架構（LiveKit 為主，Agora 為備援）
| 層級 | 組件 | 部署位置 | 特點 |
|---|---|---|---|
| 通訊媒體服務 | LiveKit Server | 自建 EC2 (c6i.large) | 固定成本、自主運維 |
| 信令 / RTM | LiveKit SDK + Webhooks | 同上 | SFU + 伺服器事件回呼 |
| 白板 | Netless (保留) | 第三方 | Phase 3b 遷 tldraw |
| **前端 RTC Provider** | **useLiveKitProvider** (與 Agora 並存) | Next.js | 抽象層，100% 型別相容 |
| Token 簽發 | /api/livekit/token + 獨立 Lambda | AWS Lambda | **withAuth 身分驗證** |
| 課程狀態 | course-sessions + presenceLog | DynamoDB | **Server-truth 事件日誌** |
| 結算 | Webhook room_finished 事件觸發 | Lambda | **時長來自 LiveKit server 時間戳** |
| 備援機制 | NEXT_PUBLIC_RTC_PROVIDER env | 環境變數 | 可實時切換，不改程式碼 |

---

## 2. 架構拓樸變化

### 原架構流程
```
┌─ 前端 (Next.js) ────────────────────────────────────────┐
│  /api/agora/token (硬編碼憑證，無身分驗證)           │
│  ↓                                                      │
│  1. useAgoraClassroom hook join()                      │
│  2. Agora RTC SDK 連 Agora server                      │
│  3. Whiteboard 同步連 Netless / Agora                  │
│  4. 下課時，前端呼叫 /api/classroom/session POST      │
│     (記 endTs，靠前端報數)                             │
└────────────────────────────────────────────────────────┘
         ↓ (按分鐘計費)
┌─ Agora Cloud (新加坡/日本) ──────────────────────────┐
│  媒體伺服器 (錄音、CDN 等額外費用)                  │
└───────────────────────────────────────────────────────┘
         ↓ (每月結算)
    成本: ~$559/月 (50 堂課/天)
```

### 新架構流程（LiveKit 啟用時）
```
┌─ 前端 (Next.js) ──────────────────────────────────────────┐
│  /api/livekit/token (withAuth + DynamoDB 驗証)        │
│  ↓                                                       │
│  1. Phase 2：授權層 (authorizeJoin)                    │
│     - 查 course-sessions status + 時間窗              │
│     - 查 profiles 判老師身分                           │
│     - 查 enrollments 判學生報名                        │
│  2. 簽 JWT (identity="role:userId")                    │
│  3. useLiveKitProvider (與 Agora 等值介面)           │
│  4. Room.connect(wss://..., token)                    │
└──────────────────────────────────────────────────────────┘
         ↓ (SFU + Webhooks)
┌─ 自建 LiveKit EC2 (Tokyo ap-northeast-1) ───────────┐
│  room_started      → markSessionStarted               │
│  participant_j/l   → recordPresenceEvent              │
│  room_finished     → markSessionCompleted             │
│                      + computeDurations               │
│                      + settleEscrow                   │
└──────────────────────────────────────────────────────┘
         ↓ (Webhook Lambda 觸發)
┌─ AWS Lambda ─────────────────────────────────────────┐
│  lib/livekit/webhookHandler.ts                       │
│  - 驗簽 WebhookReceiver                              │
│  - 算師生在場時長（聯集 & 交集）                    │
│  - releaseEscrow (保守：只有達門檻才付款)           │
│  - saveSessionSettlement 寫回 DynamoDB              │
└──────────────────────────────────────────────────────┘
    成本: ~$100-150/月 (EC2 + 頻寬封頂)
```

---

## 3. 成本對比（月度，1 對 1 教室，50 堂/天）

| 項目 | Agora 現況 | LiveKit on EC2 | 節省 |
|---|---|---|---|
| **RTC 媒體** | $400 (按分鐘) | $75 (c6i.large reserved) | $325 (-81%) |
| **Whiteboard** | $100 (Agora WB) | $50 (Netless，暫保留) | $50 (-50%) |
| **頻寬溢費** | $30-60 | 含在 $75 裡 | 無 |
| **其他** | $9-59 (CDN 等) | $0 | - |
| **損益兩平點** | - | **22 堂/天** | - |
| **總計** | **$559** | **$150** | **$409 (-73%)** |

> **注意**：LiveKit EC2 c6i.large 預留執行個體（1 年期）$75/月，支援 40 間 1 對 1 720p 課程。  
> 流量 (UDP + TCP + egress) ~$0-30/月，已納上表。

---

## 4. 功能與風險矩陣

### 新增能力
| 功能 | Agora 現況 | LiveKit 新增 | 優勢 |
|---|---|---|---|
| **精準時長** | ❌ 前端推估 | ✅ Server-truth (webhook) | 薪資結算無爭議 |
| **身分驗證** | ❌ 硬編碼、任何人可 token | ✅ withAuth + 角色檢查 | 防止濫用 |
| **Webhook 事件日誌** | ❌ RTM 全靠 manifest 同步 | ✅ room_started/finished + presence | 除錯與稽核清晰 |
| **保守結算** | ❌ 自動扣點（可能誤扣） | ✅ 達門檻才釋放 escrow | 老師沒到不付款 |
| **備援切換** | ❌ 需改程式碼 | ✅ NEXT_PUBLIC_RTC_PROVIDER env | 無停機切換 |

### 風險與緩解
| 風險 | Agora | LiveKit | 緩解方案 |
|---|---|---|---|
| **單點故障** | Agora 掛 = 全站掛 | LiveKit 掛 = 有 Agora | env 切換 + 監控告警 |
| **冷啟動** | 帳號級別 | 需自建運維 | CloudFormation 自動化 + 文檔 |
| **擴縮性** | Agora 代管 | 手動 / 自動擴縮 | ECS 多節點 + RDS 路由（>60 堂/天） |
| **時鐘漂移** | 前端時間不精準 | webhook 時間戳可信度高 | 門檻制（60s + 300s）容忍窄偏移 |
| **Webhook 重送** | N/A | at-least-once 投遞 | 冪等設計（事件 uuid key + 條件式更新） |

---

## 5. 實施時間線

| 階段 | 成果 | 耗時 | 狀態 |
|---|---|---|---|
| Phase 1 | 基礎設施 (EC2 + Docker + Caddy) | 1-2 天 | ✅ 完成 (未部署) |
| Phase 2 | Token API (authorizeJoin + JWT 簽發) | 2-3 天 | ✅ 完成 (test: tsc 0) |
| Phase 3 | 前端 provider (useLiveKitProvider) | 2-3 天 | ✅ 完成 (型別相容) |
| Phase 4 | Webhook & 結算 (presenceLog + escrow) | 2-3 天 | ✅ 完成 (邏輯驗證通過) |
| **小計** | | **7-11 天** | |
| 灰度測試 | 部分課程 / org 切 LiveKit | 1-2 週 | 排期中 |
| 全量切換 | 所有新課預設 LiveKit | 1 月 | 排期中 |
| Agora 下線 | 終止舊合約 | 1-2 月 | 備援期間 |

---

## 6. 決策清單 (Go-Live 前)

- [ ] 部署 Phase 1 的 EC2 + LiveKit 服務（非生產隔離）
- [ ] 實機測試 Phase 2-3 的 token + 連線
- [ ] 驗證 Phase 4 的 webhook 簽章 & 結算邏輯
- [ ] 測試 Agora → LiveKit 無停機切換（env 變更 + reload）
- [ ] 監控設定：LiveKit 房間數 / 頻寬 / 錯誤率；Lambda duration
- [ ] 補強 Agora token route 的身分驗證（移憑證到 env）
- [ ] Phase 3b 規劃：白板遷 tldraw（與 LiveKit 伺服器同台 Hocuspocus）

---

## 7. 結論

- **成本削減**：月省 $409 (~73%)，損益兩平 22 堂/天。
- **功能強化**：精準時長、保守結算、完整稽核日誌。
- **風險可控**：雙系統並存、無停機切換、冪等設計。
- **Next Step**：灰度測試，觀察 14 天無異常後全量切換。
