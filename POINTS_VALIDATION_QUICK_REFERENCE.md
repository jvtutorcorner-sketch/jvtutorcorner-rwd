# 點數檢查邏輯快速查詢指南

## 🚨 點數不足相關的關鍵程式碼片段

### 1. 前端顯示錯誤訊息

**檔案**：[components/EnrollButton.tsx](components/EnrollButton.tsx#L111)
```typescript
console.error('[EnrollButton] insufficient points:', userPoints, '<', pointCost);
setError(`點數不足，目前餘額 ${userPoints ?? 0} 點，需要 ${pointCost} 點`);
```

### 2. 後端驗證邏輯

**檔案**：[lib/pointsStorage.ts](lib/pointsStorage.ts#L62-L70)
```typescript
if (current < amount) {
  return {
    ok: false,
    error: `點數不足，目前餘額 ${current} 點，需要 ${amount} 點`,
    currentBalance: current,
  };
}
```

### 3. 訂單建立時的扣除

**檔案**：[app/api/orders/route.ts](app/api/orders/route.ts#L111-L120)
```typescript
const deductResult = await deductUserPoints(userId, effectivePointsToDeduct);
if (!deductResult.ok) {
  return NextResponse.json({
    error: deductResult.error,
    ok: false,
  }, { status: 400 });
}
```

---

## 🔍 搜尋關鍵字對應表

| 搜尋關鍵字 | 相關檔案 | 行數 | 說明 |
|:---|:---|:---:|:---|
| `insufficient points` | [components/EnrollButton.tsx](components/EnrollButton.tsx) | 111 | 前端點數檢查日誌 |
| `not enough credits` | ❌ 未使用 | — | 系統使用「點數不足」 |
| `点数不足` | [lib/pointsStorage.ts](lib/pointsStorage.ts) | 66 | 後端錯誤訊息 |
| `余额不足` | ❌ 未使用 | — | 系統使用「點數不足」 |
| `available balance` | [app/pricing/page.tsx](app/pricing/page.tsx) | 51 | 點數餘額查詢 |
| `required points` | [components/EnrollButton.tsx](components/EnrollButton.tsx) | 109 | 必需點數檢查 |
| `pointCost` | [components/EnrollButton.tsx](components/EnrollButton.tsx) | 109-115 | 課程點數成本 |
| `userPoints` | [components/EnrollButton.tsx](components/EnrollButton.tsx) | 111 | 使用者當前點數 |
| `deductUserPoints` | [app/api/orders/route.ts](app/api/orders/route.ts) | 111 | 點數扣除函數 |
| `getUserPoints` | [app/api/points/route.ts](app/api/points/route.ts) | 27 | 點數查詢函數 |
| `Math.max(0, points -` | [app/pricing/checkout/page.tsx](app/pricing/checkout/page.tsx) | 199 | 淨點數計算 |

---

## 🔄 點數檢查流程圖

### 完整流程（從報名到扣除）

```
┌─ 學生點擊「報名」
│
├─ [前端] useEffect 查詢 GET /api/points
│  └─ setUserPoints(d.balance)
│
├─ [前端] handleEnrollAndOrder() 驗證
│  ├─ if (userPoints === null || userPoints < pointCost) ❌
│  │  └─ 顯示「點數不足」錯誤
│  └─ else ✅ 繼續
│
├─ [前端] POST /api/orders
│
└─ [後端] app/api/orders/route.ts
   ├─ 讀取課程 pointCost（從 DB）
   │  └─ effectivePointsToDeduct = coursePointCost
   ├─ 呼叫 deductUserPoints(userId, effectivePointsToDeduct)
   │  ├─ 讀取 current = await getUserPoints(userId)
   │  ├─ if (current < amount) ❌
   │  │  └─ 返回 { ok: false, error: "點數不足..." }
   │  │     → HTTP 400 Response
   │  └─ else ✅
   │     ├─ 新餘額 = current - amount
   │     ├─ await setUserPoints(userId, newBalance)
   │     └─ 返回 { ok: true, newBalance }
   │
   ├─ 建立 Escrow（暫存記錄）
   └─ 返回 201 Created
```

### 僅限於結帳流程

```
┌─ 使用者進入 /pricing/checkout?plan=points-500
│
├─ [前端] GET /api/admin/pricing
│  ├─ 讀取套餐資訊（points, prePurchasePointsCost）
│  └─ 計算淨點數 = points - prePurchasePointsCost
│
├─ [UI] 顯示預計獲得：500 - 50 = 450 點
│
├─ 使用者選擇支付方式並點擊「支付」
│
├─ [前端] handleCreateOrder()
│  └─ 驗證 user 已登入 ✅
│
├─ POST /api/plan-upgrades
│  ├─ 傳送淨點數：Math.max(0, points - prePurchasePointsCost)
│  └─ 建立訂單（狀態 = PENDING）
│
├─ 重導至支付閘道（ECPay/Stripe/LINE Pay/Simulated）
│
└─ 支付成功 → Webhook
   └─ PATCH /api/plan-upgrades/[upgradeId]
      ├─ 狀態更新為 PAID
      ├─ setUserPoints(userId, currentBalance + netPoints)
      └─ 完成 ✅
```

---

## 📊 API 端點檢查表

### GET /api/points?userId=xxx

**用途**：查詢使用者點數餘額

**請求**：
```bash
curl "http://localhost:3000/api/points?userId=student@example.com"
```

**成功響應**（200）：
```json
{
  "ok": true,
  "userId": "student@example.com",
  "balance": 1500
}
```

**錯誤響應**（403）：
```json
{
  "ok": false,
  "error": "Forbidden: cannot query other user points"
}
```

---

### POST /api/orders

**用途**：建立報名訂單（含點數扣除）

**請求**：
```json
{
  "courseId": "course-123",
  "enrollmentId": "enrollment-456",
  "userId": "student@example.com",
  "paymentMethod": "points",
  "pointsUsed": 100,
  "startTime": "2026-04-26T10:00",
  "endTime": "2026-04-26T11:00",
  "status": "PENDING"
}
```

**成功響應**（201）：
```json
{
  "ok": true,
  "message": "Order created successfully",
  "order": {
    "orderId": "uuid-1234",
    "userId": "student@example.com",
    "courseId": "course-123",
    "pointsUsed": 100,
    "pointsEscrowId": "escrow-uuid",
    "status": "PENDING",
    "createdAt": "2026-04-25T12:34:56.000Z"
  }
}
```

**點數不足響應**（400）：
```json
{
  "ok": false,
  "error": "點數不足，目前餘額 50 點，需要 100 點"
}
```

**課程未設定點數費用（400）**：
```json
{
  "ok": false,
  "error": "此課程未設定點數費用，無法以點數報名。"
}
```

---

### POST /api/plan-upgrades

**用途**：建立點數套餐購買訂單

**請求**：
```json
{
  "userId": "student@example.com",
  "planId": "points-500",
  "amount": 99,
  "currency": "TWD",
  "itemType": "POINTS",
  "planLabel": "500 點套餐",
  "points": 450,  // ✅ 淨點數（500 - 50）
  "appPlanIds": ["pro-plan-id"]
}
```

**成功響應**（201）：
```json
{
  "message": "Upgrade order created successfully",
  "upgrade": {
    "upgradeId": "uuid-5678",
    "userId": "student@example.com",
    "planId": "points-500",
    "itemType": "POINTS",
    "points": 450,
    "status": "PENDING",
    "createdAt": "2026-04-25T12:34:56.000Z"
  }
}
```

---

## 🧪 常見測試命令

### 快速驗證點數檢查

```powershell
# 邊界條件測試（包含 E1：點數不足）
npx playwright test e2e/points-escrow-edge-cases-simple.spec.ts -g "E1" --reporter=line
```

### 完整點數購買流程

```powershell
# 點數購買 + 扣除邏輯驗證
npx playwright test e2e/pricing_deduction.spec.ts --project=chromium --reporter=line
```

### 手動 API 測試

```powershell
# 查詢點數
curl "http://localhost:3000/api/points?userId=test@example.com" \
  -H "Authorization: Bearer your_token"

# 檢查訂單狀態
curl "http://localhost:3000/api/orders?userId=test@example.com&limit=1" \
  -H "Authorization: Bearer your_token"

# 查詢 Escrow 狀態
curl "http://localhost:3000/api/points-escrow?studentId=test@example.com" \
  -H "Authorization: Bearer your_token"
```

---

## 💡 快速排查清單

### 場景 1：「點數不足」訊息卻無法報名

**檢查項目**：
- [ ] 是否在 `/api/points` 中返回最新的點數？（檢查 cache 設定）
- [ ] 課程是否正確設定了 `pointCost`？
- [ ] 客戶端呼叫 POST `/api/orders` 時是否包含正確的 `paymentMethod: 'points'`？
- [ ] 後端 `deductUserPoints()` 是否在 POST `/api/orders` 中被呼叫？

**檢查命令**：
```bash
# 查詢課程點數設定
curl "http://localhost:3000/api/courses?id=course-id" | grep pointCost

# 查詢使用者當前點數
curl "http://localhost:3000/api/points?userId=student@example.com"
```

### 場景 2：點數被扣除但報名失敗

**檢查項目**：
- [ ] Escrow 是否建立？（`pointsEscrowId` 是否存在）
- [ ] 點數是否已轉移到 Escrow 的 HOLDING 狀態？
- [ ] 課程是否被正確指派給老師？

**檢查命令**：
```bash
# 查詢 Escrow 記錄
curl "http://localhost:3000/api/points-escrow?orderId=order-id"

# 查詢使用者最新點數
curl "http://localhost:3000/api/points?userId=student@example.com"
```

### 場景 3：結帳時「淨點數」計算錯誤

**檢查項目**：
- [ ] `/api/admin/pricing` 是否包含 `prePurchasePointsCost` 欄位？
- [ ] 前端是否計算了淨點數：`Math.max(0, points - prePurchasePointsCost)`？
- [ ] POST `/api/plan-upgrades` 是否傳送了正確的淨點數？

**檢查命令**：
```bash
# 查詢套餐配置
curl "http://localhost:3000/api/admin/pricing" | grep -A5 "points-500"
```

---

## 📚 相關檔案導航

### 核心邏輯檔案

```
├── lib/
│  ├── pointsStorage.ts          ← 點數 CRUD 操作
│  └── pointsEscrow.ts           ← Escrow 暫存邏輯
│
├── app/api/
│  ├── points/route.ts           ← GET 點數、POST 增減
│  ├── orders/route.ts           ← 報名訂單 + 扣點
│  └── plan-upgrades/
│     ├── route.ts               ← 建立購點訂單
│     └── [upgradeId]/route.ts   ← 支付完成後入帳
│
├── components/
│  └── EnrollButton.tsx          ← 前端點數驗證
│
└── app/
   ├── pricing/page.tsx          ← 定價頁、點數顯示
   └── pricing/checkout/page.tsx ← 結帳、淨點數計算
```

### 測試檔案

```
e2e/
├── points-escrow-edge-cases-simple.spec.ts    ← 邊界條件（含 E1 點數不足）
├── pricing_deduction.spec.ts                   ← 扣點邏輯驗證
├── student_enrollment_flow.spec.ts             ← 完整報名流程
└── points-escrow-quick-release.spec.ts         ← 快速 Escrow 驗證
```

---

## 🎯 重點提示

> ⚠️ **重要**：
> 
> 1. **伺服器權威**：點數扣除永遠使用後端 DB 中的 `coursePointCost`，不信任客戶端的 `pointsUsed`
> 
> 2. **Escrow 暫存**：點數在報名時扣除，但直到課程完成才釋放給老師
> 
> 3. **淨點數計算**：購買點數套餐時，實際獲得 = 原始點數 - App 方案成本
> 
> 4. **無快取**：點數查詢需使用 `cache: 'no-store'` 確保最新值
> 
> 5. **登入驗證**：所有點數相關 API 需驗證使用者身份或為資源所有者

