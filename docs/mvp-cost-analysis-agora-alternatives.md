# MVP 成本分析 & Agora 替代方案評估

**文件日期：** 2026-06-27  
**分析範圍：** MVP 壓力測試（10 組並發）+ 上線後生產費用  
**課堂規格：** 固定 50 分鐘 / 堂，1 教師 + 1 學生（2 users/session）

---

## 一、現有系統架構與計費服務

```
每組教室 (1 teacher + 1 student)
    ├── Agora RTC    ── 視頻/音訊串流    (agora-rtc-sdk-ng v4.23.0)
    ├── Agora RTM    ── 信令/頁面同步    (agora-rtm-sdk v2.2.3-1)
    ├── Netless WB   ── 白板畫筆同步    (white-web-sdk 2.16.44, Singapore)
    ├── AWS Lambda   ── Next.js SSR API  (Amplify, ap-northeast-1)
    ├── AWS DynamoDB ── 白板狀態 / PDF  (PAY_PER_REQUEST)
    └── AWS S3       ── PDF 檔案儲存   (jvtutorcorner-uploads)
```

---

## 二、MVP 壓力測試成本（10 組並發）

### 測試規格

| 項目 | 數值 |
|------|------|
| 並發組數 | 10 組 |
| 每組人數 | 2 人（teacher + student） |
| 測試檔案 | `e2e/classroom/07_room_pdf_sync_stress.spec.ts` |
| 成功門檻 | 75%（需 8/10 組通過） |
| 驗證項目 | PDF 上傳 → 3 頁翻頁同步 → 畫筆繪圖同步 |

### 單次測試費用（依課程時長）

| 課程時長 | Agora RTC | Netless WB | Lambda / DB / S3 | **合計** |
|--------|:---------:|:----------:|:----------------:|:--------:|
| 1 分鐘  | $0.08     | $0.003     | ~$0.005          | **$0.09** |
| 5 分鐘  | $0.40     | $0.013     | ~$0.005          | **$0.42** |
| 10 分鐘 | $0.80     | $0.025     | ~$0.005          | **$0.83** |
| 15 分鐘 | $1.20     | $0.038     | ~$0.005          | **$1.24** |

> **計算公式：** Agora RTC = 10 groups × 2 users × N min × $3.99 / 1,000

### MVP 開發週期預算（3 個月）

| 測試類型 | 次數 | 消耗 (user-min) |
|---------|:----:|:--------------:|
| 局部調試（1–5 組，5–10 min） | 30 次 | ~2,250 |
| 10 組 10-min PDF 同步測試 | 20 次 | ~4,000 |
| 完整矩陣跑（最終驗收）| 3 次 | ~3,876 |
| **月消耗合計** | | **~10,126** |

Agora **每月免費額度 10,000 分鐘**，超出約 126 分鐘 ≈ **幾乎免費**。

**MVP 3 個月總預算：~$20–30 USD**

---

## 三、生產環境月費比較

### 計費基準

```
每月 user-minutes = 每日堂數 × 50 min × 2 users × 30 天
```

| 每日堂數 | 月總 user-min | 扣免費額度後 |
|:-------:|:------------:|:-----------:|
| 10 堂   | 30,000       | 20,000      |
| 50 堂   | 150,000      | 140,000     |
| 100 堂  | 300,000      | 290,000     |

### 各方案月費對比

| 方案 | 10 堂/天 | 50 堂/天 | 100 堂/天 | 費用類型 |
|------|:--------:|:--------:|:---------:|---------|
| **現況 Agora** | $80 | $559 | $1,157 | 隨用量無上限 |
| **Amazon Chime SDK** | $51 | $255 | $510 | 隨用量，較低費率 |
| **LiveKit · ECS Fargate** | $110 | $150 | $200 | 固定 + 頻寬封頂 |
| **LiveKit · EC2** | $90 | $130 | $175 | 固定最低 |

> **損益兩平點：** 每天超過 **22 堂**，LiveKit 自架即優於 Agora。

### 費用公式

| 方案 | 計算方式 |
|------|---------|
| Agora RTC | `(user-min - 10,000) × $3.99 / 1,000` |
| Amazon Chime SDK | `user-min × $1.70 / 1,000` |
| LiveKit ECS Fargate | `~$100/月 compute + 每堂 $1–3 頻寬` |
| LiveKit EC2 Reserved | `~$75/月 compute + 每堂 $1–3 頻寬` |

---

## 四、技術特性比較

| | 現況 Agora | Amazon Chime SDK | LiveKit · ECS Fargate | LiveKit · EC2 |
|--|:---:|:---:|:---:|:---:|
| **需要新伺服器** | ❌ | ❌ | ❌（容器託管） | ✅ |
| **需要 DevOps** | ❌ | ❌ | △ 低度 | ✅ 中度 |
| **與 Amplify 相容** | ✅ | ✅ AWS 原生 | ✅ 同 VPC | ✅ 同 VPC |
| **完全自控代碼** | ❌ | ❌ | ✅ | ✅ |
| **視頻 SDK 遷移難度** | 現狀 | 中（重寫 RTC hooks） | 中（API 類似 Agora） | 中 |
| **白板需另行處理** | ❌ Netless 內建 | ✅ 需接 tldraw | ✅ 需接 tldraw | ✅ 需接 tldraw |
| **信令需另行處理** | ❌ RTM 內建 | ✅ 需接 API GW WS | ✅ 需接 Socket.IO | ✅ 需接 Socket.IO |
| **穩定性** | ★★★★★ | ★★★★★ | ★★★★ | ★★★★ |
| **長期成本控制** | ❌ 無上限 | △ 仍依用量 | ✅ 封頂 | ✅ 封頂最低 |

---

## 五、各服務替換方案詳細說明

### 5.1 Agora RTC（視頻/音訊）→ 替換選項

#### 選項 A：Amazon Chime SDK
- AWS 自家 WebRTC 服務，**不需要額外伺服器**
- 與 Amplify Lambda 天然整合
- 費率：`$0.0017/attendee-minute`（Agora 的 43%）
- 遷移：重寫 `lib/agora/` 相關 hooks，概念相同（room / participant / track）

#### 選項 B：LiveKit on ECS Fargate
- 開源 WebRTC SFU（Apache 2.0），官方 Docker image
- Fargate 不需管理 EC2，自動重啟、同 AWS VPC
- SDK：`@livekit/components-react`，API 設計與 Agora 相近
- 需要：UDP port range (50000–60000) 透過 NLB 開放

#### 選項 C：LiveKit on EC2
- 與 Fargate 相同軟體，但用 EC2 instance 直接跑
- 成本最低，但需要手動管理 patching / restart
- 建議規格：`c5.xlarge`（4 vCPU, 8GB），Reserved 約 $75/月

### 5.2 Agora RTM（信令）→ 替換選項

RTM 目前傳遞的訊息類型僅有：
`wb-uuid-sync` / `page-change` / `pdf-available` / `ready-state-update` / `ping`

#### 選項 A：AWS API Gateway WebSocket API（推薦）
- 完全 Serverless，與 Amplify 天然整合，**不需任何新伺服器**
- 費率：`$1/百萬訊息 + $0.25/百萬連線分鐘`
- 50 堂/天估算：~$2/月
- 遷移：重寫 `lib/agora/useAgoraRTM.ts`，替換為 WebSocket client

#### 選項 B：Socket.IO（搭配 LiveKit 伺服器同跑）
- 若已有 LiveKit 伺服器，Socket.IO 跑在同一台，邊際成本為零

### 5.3 Netless Whiteboard（白板）→ 替換選項

#### 選項：tldraw + Hocuspocus
- **tldraw**（MIT）：功能完整的協作白板，內建 Yjs 同步
- **Hocuspocus**：Yjs WebSocket 伺服器，可跑在 LiveKit 同台
- PDF 支援：用 `pdf.js` 渲染頁面為 Canvas，覆蓋在 tldraw 上層
- 現有 S3 PDF 上傳流程、`/api/whiteboard/pdf` 路由可保留不動

---

## 六、成本最大來源排名

| 排名 | 服務 | 現況佔比 | 月費（50 堂/天） | 可省金額 |
|:---:|------|:-------:|:--------------:|:-------:|
| 1 | Agora RTC | **93%** | $559 | 最高優先 |
| 2 | Netless WB | 3% | $18.75 | 次要 |
| 3 | AWS Lambda | 1% | ~$0.05 | 可忽略 |
| 4 | DynamoDB | 0.5% | ~$5 | 可忽略 |
| 5 | S3 | < 0.5% | ~$1 | 可忽略 |

---

## 七、建議遷移路徑

```
階段 0 │ 現在                    │ 維持現狀，完成 10 組壓力測試驗收
       │                         │ 不在 MVP 驗收前引入架構變動
───────┼─────────────────────────┼──────────────────────────────────
階段 1 │ MVP 驗收後（第 1 個月）  │ Agora RTM → API Gateway WebSocket
       │                         │ 不動視頻/白板，純信令替換
       │                         │ 節省：Agora RTM 費用（目前幾乎免費，
       │                         │ 但驗證自有 WebSocket 在高並發的穩定性）
───────┼─────────────────────────┼──────────────────────────────────
階段 2 │ 成長期（10–25 堂/天）    │ Agora RTC → Amazon Chime SDK
       │                         │ 不需新伺服器，省 36% 視頻費
       │                         │ 可與 Amplify 直接整合
───────┼─────────────────────────┼──────────────────────────────────
階段 3 │ 規模化（> 25 堂/天）     │ 評估 LiveKit on ECS Fargate
       │                         │ 費用封頂，越多堂越划算
       │                         │ 同步遷移 Netless → tldraw
```

### 各階段預期節省

| 階段 | 方案 | 50 堂/天月費 | 相較 Agora 節省 |
|------|------|:-----------:|:--------------:|
| 現況 | 純 Agora | $559 | — |
| 階段 2 | Chime SDK | $255 | **$304（54%）** |
| 階段 3 | LiveKit Fargate | $150 | **$409（73%）** |

---

## 八、總結

```
┌──────────────────────────────────────────────────────────────────┐
│  MVP 壓力測試成本（10 組 × 10 min）：~$0.83 / 次                 │
│  MVP 開發週期 3 個月：~$20–30 USD（多數在 Agora 免費額度內）      │
│                                                                  │
│  生產成本最大威脅：Agora RTC 佔總費用 93%                        │
│  最快無痛降本：Agora RTC → Amazon Chime SDK，省 54%，不需新伺服器 │
│  長期最低成本：LiveKit on ECS Fargate，費用封頂，省 73%           │
└──────────────────────────────────────────────────────────────────┘
```
