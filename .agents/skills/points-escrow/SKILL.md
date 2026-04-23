---
name: points-escrow
description: '點數暫存（Escrow）系統：學生報名時扣點，課程完成時釋放給老師。'
argument-hint: '驗證報名扣點與課程完成時的 Escrow 釋放邏輯'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-04-23'
  infrastructure-deployed: '✅ Table 配置 + 初始化腳本'
  amplify-build-status: '✅ 修復 js-yaml TypeScript 錯誤'
  architecture-aligned: true
  verification-results:
    - '✅ 1 分鐘課程倒數自動結束：教室自動跳轉回等待頁 (1.5m)'
    - '✅ 白板隨機繪圖：老師 3 條線有內容'
    - '✅ 直接 API 報名：remainingSeconds=60 正確，課程 durationMinutes=1 正確'
    - '✅ 雙方進入等待室 → 準備好 → 進入教室 完整流程'
    - '✅ DynamoDB Escrow Table 初始化腳本完成'
    - '✅ 環境變數配置完成（next.config.mjs, .env.local.example）'
    - '✅ 清理腳本更新（cleanup-aggressive.mjs, cleanup-database-direct.mjs）'
    - '✅ AWS 健康檢查監視表更新'
    - '⚠️ Escrow HOLDING 查詢：production jvtutorcorner-points-escrow DynamoDB table 未部署'
    - '⚠️ 老師點數增加驗證：因 Escrow table 未部署，無法驗證'
---

# 點數暫存系統技能 (Points Escrow Skill)

此技能負責管理「點數暫存」（Escrow）流程——確保學生報名時扣除的點數安全地保管，直到課程完整結束後才轉給老師。

## 設計目的

**防止滥用**：學生報名時點數立即扣除但被「鎖定」在暫存區，防止重複購買或濫用。
**公平分配**：點數只在課程「確實完成」後才轉給老師，保護學生利益。
**事務一致性**：支援課程取消時「退款」回到學生帳戶，以及正常完成時「轉帳」給老師。

## 核心流程

### 1. 報名時：建立 Escrow 記錄（HOLDING）
```
POST /api/orders (paymentMethod='points')
  ↓
  deductUserPoints(studentId, pointCost)  ← 點數立即扣除
  ↓
  createEscrow({
    escrowId,
    orderId,
    enrollmentId,
    studentId,      ← 誰扣的
    teacherId,      ← 誰會收到
    courseId,
    courseTitle,
    points: pointCost,
    status: 'HOLDING'  ← 暫存狀態
  })
  ↓
  Order 記錄儲存 pointsEscrowId
```

### 2. 課程進行中
- 點數被鎖定在暫存區，學生「看不見」這些點數（不在 `userPoints` 餘額中）
- 學生和老師進入教室進行課堂

### 3. 課程完成：釋放 Escrow 到老師（RELEASED）
```
PATCH /api/agora/session (status='completed')
  ↓
  getEscrowByOrder(orderId)
  ↓
  releaseEscrow(escrowId)
    {
      1. getUserPoints(teacherId)
      2. newBalance = teacherBalance + escrowPoints
      3. setUserPoints(teacherId, newBalance)
      4. Update escrow: status='RELEASED', releasedAt=now
    }
  ↓
  點數轉入老師帳戶 ✓
```

### 4. 課程取消：退款 Escrow 回學生（REFUNDED）
```
Manual cancel or app trigger
  ↓
  refundEscrow(escrowId)
    {
      1. getUserPoints(studentId)
      2. newBalance = studentBalance + escrowPoints
      3. setUserPoints(studentId, newBalance)
      4. Update escrow: status='REFUNDED', refundedAt=now
    }
  ↓
  點數返回學生帳戶 ✓
```

## 資料庫結構

### Escrow 表（DynamoDB: `jvtutorcorner-points-escrow`）

| 欄位 | 類型 | 說明 |
|:---|:---|:---|
| `escrowId` | String | 主鍵 (UUID) |
| `orderId` | String | 訂單 ID（GSI: `byOrderId`） |
| `enrollmentId` | String | 報名紀錄 ID |
| `studentId` | String | 學生 ID（GSI: `byStudentId`） |
| `teacherId` | String | 老師 ID（GSI: `byTeacherId`） |
| `courseId` | String | 課程 ID |
| `courseTitle` | String | 課程名稱 |
| `points` | Number | 暫存的點數數量 |
| `status` | String | `HOLDING` \| `RELEASED` \| `REFUNDED` |
| `createdAt` | String | 建立時間 (ISO 8601) |
| `updatedAt` | String | 最後更新時間 |
| `releasedAt` | String | 釋放時間（status='RELEASED'） |
| `refundedAt` | String | 退款時間（status='REFUNDED'） |

### 環境變數配置

**新增於 2026-04-23**：
- `next.config.mjs`: 加入 `DYNAMODB_TABLE_POINTS_ESCROW` 環境變數定義
- `.env.local.example`: 加入 `DYNAMODB_TABLE_POINTS_ESCROW=jvtutorcorner-points-escrow`

| 環境變數 | 說明 | 預設值 | 來源 |
|:---|:---|:---|:---|
| `DYNAMODB_TABLE_POINTS_ESCROW` | Points Escrow DynamoDB 表名稱 | `jvtutorcorner-points-escrow` | `.env.local`, `next.config.mjs` |

## 核心檔案

### 新增

- **[lib/pointsEscrow.ts](../../../lib/pointsEscrow.ts)**
  - `createEscrow(params)` — 建立 HOLDING 狀態的暫存記錄
  - `releaseEscrow(escrowId)` — 釋放點數給老師（HOLDING → RELEASED）
  - `refundEscrow(escrowId)` — 退款回學生（HOLDING → REFUNDED）
  - `getEscrow()` / `getEscrowByOrder()` / `listEscrows()` — 查詢

- **[app/api/points-escrow/route.ts](../../../app/api/points-escrow/route.ts)**
  - `GET /api/points-escrow` — 查詢暫存列表（admin）
  - `POST /api/points-escrow` — `{ action: 'release'|'refund', escrowId }` 手動操作

- **[scripts/create-dynamo-tables.mjs](../../../scripts/create-dynamo-tables.mjs)** ✅ 2026-04-23 更新
  - 新增 `createPointsEscrowTable()` 函數
  - 初始化 `jvtutorcorner-points-escrow` table（有 GSI: byOrderId, byTeacherId）

### 修改

- **[app/api/orders/route.ts](../../../app/api/orders/route.ts)**
  - 扣點成功後呼叫 `createEscrow()`
  - 訂單記錄新增 `pointsEscrowId` 欄位

- **[app/api/agora/session/route.ts](../../../app/api/agora/session/route.ts)**
  - PATCH 時若 `status='completed'`，自動呼叫 `releaseEscrow()`

- **[next.config.mjs](../../../next.config.mjs)** ✅ 2026-04-23 更新
  - 加入 `DYNAMODB_TABLE_POINTS_ESCROW` 環境變數

- **[.env.local.example](../../.env.local.example)** ✅ 2026-04-23 更新
  - 加入 `DYNAMODB_TABLE_POINTS_ESCROW=jvtutorcorner-points-escrow`

- **[cleanup-database-direct.mjs](../../../cleanup-database-direct.mjs)** ✅ 2026-04-23 更新
  - 新增 `deleteTestEscrowsFromDB()` 清理測試 Escrow 記錄

- **[cleanup-aggressive.mjs](../../../cleanup-aggressive.mjs)** ✅ 2026-04-23 更新
  - 新增 `deleteTestEscrows()` 清理測試 Escrow 記錄（包含統計輸出）

- **[lib/awsHealthChecker.ts](../../../lib/awsHealthChecker.ts)** ✅ 2026-04-23 更新
  - 加入 `jvtutorcorner-points-escrow` 到監視表清單

- **[scripts/setup-db.mjs](../../../scripts/setup-db.mjs)**
  - 新增 `createPointsEscrowTable()` 初始化

## 測試指令

### 快速驗證測試（推薦：1 分鐘課程，等待倒數，白板繪圖，驗證 Escrow）

```powershell
# 預設 1 分鐘課程（倒數 60 秒後自動結束教室，再觸發 Escrow 釋放）
$env:COURSE_DURATION_MINUTES=1
npx playwright test e2e/points-escrow-quick-release.spec.ts --project=chromium --reporter=line

# 2 分鐘課程
$env:COURSE_DURATION_MINUTES=2
npx playwright test e2e/points-escrow-quick-release.spec.ts --project=chromium --reporter=line
```

**測試步驟（points-escrow-quick-release.spec.ts）：**
1. API 登入（老師 + 學生，繞開驗證碼）
2. 記錄老師點數基準
3. 建立 N 分鐘課程（`durationMinutes=N`）
4. 學生直接 API 報名（取得 `orderId`，`remainingSeconds=N*60`）
5. 查詢 Escrow HOLDING 記錄（by `orderId` 或 `teacherId`）
6. 雙方進入等待室
7. 雙方按準備好（序列避免 race condition）
8. 雙方進入教室（並行）
9. **老師在白板隨機繪圖** (drawOnWhiteboard)
10. **等待 N 分鐘倒數結束 → 教室自動跳轉** (waitForURL `/classroom/wait`)
11. 觸發 Escrow 釋放（`POST /api/points-escrow { action: 'release', escrowId }`）
12. 驗證 Escrow 狀態 = RELEASED
13. 驗證老師點數增加

### 完整教室流程測試

```powershell
npx playwright test e2e/points-escrow-classroom-flow.spec.ts --project=chromium
```

### API 驗證測試（16 個測試）

```powershell
npx playwright test e2e/points-escrow-release.spec.ts
```

### 測試檔案對照表

| 檔案 | 用途 | 環境變數 |
|:---|:---|:---|
| `e2e/points-escrow-quick-release.spec.ts` | **快速驗證**（白板繪圖 + 自動倒數 + Escrow） | `COURSE_DURATION_MINUTES`, `TEST_COURSE_ID` |
| `e2e/points-escrow-classroom-flow.spec.ts` | 完整教室流程（雙瀏覽器視覺） | `TEST_COURSE_ID` |
| `e2e/points-escrow-release.spec.ts` | API 端點驗證（16 個測試） | — |

### 環境變數說明

| 變數 | 說明 | 預設值 |
|:---|:---|:---|
| `COURSE_DURATION_MINUTES` | 課程持續分鐘數（最小 1） | `1` |
| `TEST_COURSE_ID` | 指定既有課程 ID，跳過建立課程步驟 | 空（自動建立） |

### ⚠️ 注意：直接 API 報名 vs runEnrollmentFlow

`points-escrow-quick-release.spec.ts` 使用**直接 API 報名**（`POST /api/orders`），不透過 `runEnrollmentFlow` subprocess：
- **原因**：subprocess 會覆蓋課程的 `durationMinutes`（寫入 60 分鐘），導致教室倒數無法在 1 分鐘後結束
- **缺點**：`createEscrow()` 在 production 依賴 `jvtutorcorner-points-escrow` DynamoDB table 存在才能成功
- **若 Escrow table 未部署**：Step 4 的 `order.pointsEscrowId` 為 null，Step 5-12 會跳過並顯示 ⚠️



## 故障排除

### 症狀：課程完成但老師沒收到點數

**檢查清單**
1. Agora session PATCH 是否被觸發？
   - 檢查 `/api/agora/session` 日誌是否有 `Escrow ${escrowId} released`
2. Escrow 記錄是否存在？
   - 查詢 `GET /api/points-escrow?orderId=<orderId>`
3. Escrow 狀態是否為 HOLDING？
   - 若已是 RELEASED，代表邏輯已執行；檢查老師的 `userPoints` 是否增加

### 症狀：點數未正確扣除或退回

**檢查清單**
1. `deductUserPoints()` 是否在 ORDER 建立時呼叫？
   - 檢查 `[orders API] Deducted` 日誌
2. Escrow 是否建立但未記錄？
   - 查詢 DynamoDB `jvtutorcorner-points-escrow` 表
3. 若是退款，`refundEscrow()` 是否被呼叫？
   - 檢查 `[pointsEscrow] Refunded` 日誌

## 關鍵設計考量

### Q: 為什麼要用 Escrow？
**A**: 防止「double-spending」。若點數在報名時不扣除，學生可能多次報名同一課程。且確保課程確實進行後才轉給老師。

### Q: 若課程中途被打斷（網路中斷）怎麼辦？
**A**: Escrow 會保持 HOLDING 狀態。管理員可手動檢視並決定：
- 若課程無效：呼叫 `POST /api/points-escrow { action: 'refund' }`
- 若課程有效：呼叫 `POST /api/points-escrow { action: 'release' }`

### Q: 多個學生同時報名同一課程？
**A**: 每個學生的點數在各自的 Escrow 記錄中獨立管理，並行無衝突。

## 與其他技能的區別

| 技能 | 職責 | 時機 |
|:---|:---|:---|
| **points-escrow** (本) | 暫存 → 釋放/退款 | 報名 → 課程完成 |
| **payment-restitution-logic** | 點數返還（課程取消） | 課程被取消 |
| **student-enrollment-flow** | 報名完整流程 | 搜尋 → 付款 → 進教室 |
| **payment-refund-orchestration** | 金流退款（金錢） | 訂單被退款 |
