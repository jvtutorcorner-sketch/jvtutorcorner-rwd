# 為何 LiveKit 用 EC2 而非 Lambda：技術決策說明

## 1. 核心原因：LiveKit 的本質不同

### LiveKit Server 的特性
```
連接類型        長連接（persistent WebSocket + UDP）
狀態管理        房間狀態在內存中（當前參與者、視訊軌道）
網路協定        UDP (50000-60000 port range) + TCP
連線生命週期     課程開始到結束（通常 30-120 分鐘）
計算模式        持續佔用 CPU（即時編碼、轉發）
```

### Amplify Lambda 的特性（對比）
```
連接類型        無狀態請求-應答（HTTP/REST）
狀態管理        無狀態（或轉移到外部 DynamoDB）
網路協定        HTTP/HTTPS only
執行生命週期     冷啟動 + 0-15 分鐘執行
計算模式        事件驅動、按執行時間計費
```

---

## 2. 不能用 Lambda 的具體障礙

### A. 長連接問題
```
Lambda:
  ├─ API Gateway 默認超時 29 秒
  ├─ ALB 最多 4 小時
  ├─ WebSocket 需要 API Gateway，但每個連線另外計費
  └─ 一堂 60 分鐘課 = 需要持續執行 = 成本爆表

LiveKit Server 需求：
  ├─ 課程 30-120 分鐘全程運行
  ├─ 每個房間 = 一個長連接
  └─ 100 間課同時進行 = 100 個并發連接
```

**試試用 Lambda 連 60 分鐘：**
```
API Gateway HTTP API 長連接超時 29 秒 ❌
ALB WebSocket 長連接 4 小時可以，但...
  ├─ 需要持續預留計算資源
  ├─ Lambda 預留並發 = 固定成本
  └─ 成本 > EC2 預留執行個體
```

### B. UDP 通訊無法支援
```
Lambda:
  └─ 只能用 HTTP/REST，完全不支援 UDP

WebRTC 媒體路徑（LiveKit）:
  ├─ UDP 50000-60000  ← 主要媒體傳輸
  ├─ TCP 7881         ← ICE fallback
  └─ 不支援 UDP = 沒法做媒體轉發
```

**為何需要 UDP？**
- 低延遲（TCΡ 有重傳開銷、ACK 確認）
- 容許封包遺失（視訊 1-2% 掉包可接受）
- 高吞吐（即時視訊 720p 每秒 ~2Mbps）

Lambda 無法繫結 UDP port → 無法接收媒體封包。

### C. 直接的公網 IP 與埠綁定
```
Lambda:
  └─ 隱藏在 API Gateway 後面，無法直接綁 port

WebRTC ICE 候選位址：
  ├─ 需要固定公網 IP（當 UDP 被擋時的 fallback）
  ├─ 需要暴露固定埠（peer 才能連）
  └─ Elastic IP + Security Group = EC2 專利

Lambda 無法：
  ├─ 綁定 Elastic IP
  ├─ 綁定特定 UDP port range
  └─ peer 看到的 IP 是 ALB/NLB = 誤導性 ICE candidate
```

### D. 狀態持久化的成本
```
如果硬要用 Lambda + Redis cluster:

計算成本:
  ├─ Lambda 預留並發 100 = $3.50/月/並發
  ├─ 100 並發 = $350/月
  └─ 已經等於 EC2 預留!

記憶體成本:
  ├─ Redis cluster 4GB = ~$15-30/月 (ElastiCache)
  └─ 房間狀態需要即時同步
        └─ 每個房間狀態 ~10-50KB
        └─ 100 房間 = 1-5MB 在 Redis
        └─ 可以，但又多一筆 service + 複雜度

網路成本:
  ├─ Lambda → Redis 單向通訊
  ├─ 每個房間每秒 ~10-100 請求（track subscribe/unsubscribe）
  └─ 頻寬成本不直觀但存在
```

---

## 3. EC2 方案為何勝出

### 成本對比（月度，50 堂課/天 同時 100 房間）

| 方案 | 計算 | 記憶體 / 狀態 | 網路 | 總計 |
|---|---|---|---|---|
| **EC2 c6i.large reserved** | $75 | 含在 compute | ~$15 | **$90** |
| **Lambda 100 預留並發** | $350 | - | - | **$350+** |
| **Lambda + Redis** | $350 | $15-30 | ~$20 | **$385+** |
| **ECS Fargate** | $150-200 | 含在 compute | ~$15 | **$165+** |

> EC2 預留執行個體（1 年期 ap-northeast-1）最便宜。

### 架構清晰度
```
EC2 裡的 LiveKit Server:
  ├─ 房間狀態 = 程序內記憶體
  ├─ Participant info = 精準控制
  ├─ Track routing = 低延遲
  └─ 一切在「本地」，邏輯清晰

Lambda 模式:
  ├─ 房間狀態 → Redis？DynamoDB？
  ├─ 誰負責 keep-alive 房間？
  ├─ 100 Lambda 連接同一房間，如何協調？
  └─ 需要 pub/sub (SNS/SQS) 複雜度 ⬆
```

### 運維負擔
```
EC2:
  ✅ 執行 `docker compose up -d`
  ✅ CloudWatch Logs 看日誌
  ✅ CloudFormation 自動化

Lambda:
  ❌ 需要外部狀態存儲（Redis / DynamoDB）
  ❌ 需要 pub/sub 層協調多 Lambda 實例
  ❌ 冷啟動延遲（首次連線等待 1-3 秒）
  ❌ 除錯困難（分散在 CloudWatch Logs 裡）
```

---

## 4. 如果硬要用 Serverless：ECS Fargate

有一個 middle ground = **ECS Fargate**（容器編排，無伺服器管理）

| 特性 | EC2 | ECS Fargate |
|---|---|---|
| **成本** | $75-90/月 | $150-200/月 (+66%) |
| **UDP** | ✅ 完全支援 | ✅ 支援 |
| **長連接** | ✅ 原生 | ✅ 支援 |
| **擴縮** | 手動 | 自動（按房間數） |
| **冷啟動** | 秒級（容器已跑） | ~30 秒（新 task）|
| **運維** | 需自管 OS patch | AWS 管理（更簡單） |

**何時升級到 Fargate？**
```
現況 50 堂/天 = 1 個 c6i.large 足夠
        ↓
預估 150+ 堂/天 = 多個實例 + 自動擴縮
        ↓
改 ECS Fargate （AWS 自動分配 container，無需手管 EC2）
```

---

## 5. 最終決策

```
為什麼選 EC2？

✅ 成本最低（$75-90/月 vs Lambda $350+）
✅ 完全支援 WebRTC (UDP + 長連接 + 固定 IP)
✅ 邏輯清晰（房間狀態在內存，無需外部 cache）
✅ 運維簡單（Docker + CloudFormation）
✅ 現況 50 堂/天 無需擴縮

何時升級？
  → 60+ 堂同時 = 多 EC2 + NLB
  → 150+ 堂同時 = 改 ECS Fargate（自動擴縮）
  → 不會改回 Lambda（Lambda 基本上不適合 RTC）
```

---

## 附錄：為何 Agora 用了 10 年而沒問題？

Agora 是「託管的 SaaS」= 他們在自己的伺服器上跑 LiveKit-like 的軟體，用戶只需：
```
GET /api/token
  → Agora server 回 JWT
  → 前端連 Agora 的 global mesh (他們自建的超大 EC2 / 專用硬體叢集)
```

= Agora 承擔了所有的基礎設施負擔，我們只付錢。

自建 LiveKit 後，那些「運維負擔」就轉到自己身上，Lambda 無法滿足。
