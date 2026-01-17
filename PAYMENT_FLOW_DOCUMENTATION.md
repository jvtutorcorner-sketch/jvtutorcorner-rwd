# 訂單流程和金流支付流程文件

## 目錄
1. [概述](#概述)
2. [訂單流程](#訂單流程)
3. [金流支付流程](#金流支付流程)
4. [系統架構](#系統架構)
5. [API 端點](#api-端點)
6. [狀態轉換](#狀態轉換)
7. [付款記錄](#付款記錄)
8. [錯誤處理](#錯誤處理)

---

## 概述

jvtutorcorner 系統採用**報名→訂單→支付→課程激活**的完整流程，以確保用戶能夠安全地購買課程並獲得訪問權限。

### 主要角色
- **學生（Student）**：報名課程並支付費用
- **教師（Teacher）**：查看自己課程的訂單
- **管理員（Admin）**：管理所有訂單和支付情況

### 核心概念
- **報名（Enrollment）**：學生表示想要參與課程的初始請求
- **訂單（Order）**：為報名創建的付款記錄
- **支付（Payment）**：訂單金流狀態的變化記錄

---

## 訂單流程

### 完整流程圖

```
用戶報名
    ↓
建立報名記錄 (Enrollment: PENDING_PAYMENT)
    ↓
建立訂單 (Order: PENDING)
    ↓
[支付網關] 
    ↓
支付完成 (Order: PAID)
    ↓
激活報名 (Enrollment: ACTIVE)
    ↓
用戶可以訪問課程
```

### 步驟詳解

#### 步驟 1：用戶報名
- 用戶點擊課程的「報名」或「購買」按鈕
- 前端調用 `/api/enroll` (POST)
- 系統創建一條報名記錄 (Enrollment)

**Enrollment 初始狀態：**
```json
{
  "id": "enrollment-uuid",
  "courseId": "course-001",
  "studentId": "student-email@example.com",
  "name": "Student Name",
  "email": "student-email@example.com",
  "status": "PENDING_PAYMENT",
  "createdAt": "2025-01-11T10:00:00.000Z",
  "updatedAt": "2025-01-11T10:00:00.000Z"
}
```

#### 步驟 2：創建訂單
- 前端自動或用戶點擊「創建訂單」按鈕
- 調用 `/api/orders` (POST)
- 系統根據 enrollmentId 創建訂單

**Order 初始狀態：**
```json
{
  "orderId": "order-uuid",
  "orderNumber": "student-email@example.com-2025-01-11T10:00:00.000Z",
  "userId": "student-email@example.com",
  "courseId": "course-001",
  "enrollmentId": "enrollment-uuid",
  "amount": 0,
  "currency": "TWD",
  "status": "PENDING",
  "createdAt": "2025-01-11T10:00:00.000Z",
  "updatedAt": "2025-01-11T10:00:00.000Z",
  "payments": []
}
```

#### 步驟 3：支付階段
- 用戶進行支付（實際環境中連接支付網關如 Stripe、ECPay 等）
- 支付網關通過 webhook 回調
- 系統接收並處理支付結果

#### 步驟 4：確認支付
- 系統通過 PATCH `/api/orders/{orderId}` 更新訂單狀態為 `PAID`
- 同時記錄付款信息

**Order 更新後：**
```json
{
  "orderId": "order-uuid",
  "orderNumber": "student-email@example.com-2025-01-11T10:05:00.000Z",
  "userId": "student-email@example.com",
  "courseId": "course-001",
  "enrollmentId": "enrollment-uuid",
  "amount": 0,
  "currency": "TWD",
  "status": "PAID",
  "createdAt": "2025-01-11T10:00:00.000Z",
  "updatedAt": "2025-01-11T10:05:00.000Z",
  "payments": [
    {
      "time": "2025-01-11T10:05:00.000Z",
      "action": "payment_capture",
      "amount": 0,
      "currency": "TWD",
      "status": "PAID"
    }
  ]
}
```

#### 步驟 5：激活課程訪問
- 訂單狀態變為 PAID 時，系統自動：
  1. 更新 Enrollment 狀態為 `PAID`
  2. 再更新 Enrollment 狀態為 `ACTIVE`
- 用戶現在可以訪問課程

**Enrollment 最終狀態：**
```json
{
  "id": "enrollment-uuid",
  "courseId": "course-001",
  "studentId": "student-email@example.com",
  "name": "Student Name",
  "email": "student-email@example.com",
  "status": "ACTIVE",
  "createdAt": "2025-01-11T10:00:00.000Z",
  "updatedAt": "2025-01-11T10:05:00.000Z"
}
```

---

## 金流支付流程

### 支付狀態機制

```
PENDING (訂單等待支付)
   ↓
   ├─→ PAID (支付成功)
   │    ↓
   │    COMPLETED (課程已完成或確認)
   │
   └─→ CANCELLED (訂單取消)
       ↓
       REFUNDED (已退款)
```

### 支付流程詳解

#### 1. 支付啟動

**過程：**
```
前端 → 支付網關（Stripe/ECPay）
   ↓
用戶輸入支付信息
   ↓
支付網關處理交易
```

**示例：使用模擬支付**
```javascript
// 調用支付 webhook（開發環境模擬）
POST /api/payments/webhook
Content-Type: application/json

{
  "orderId": "order-uuid",
  "status": "PAID"
}
```

#### 2. 支付回調（Webhook）

**系統流程：**
```
支付網關 → Webhook Endpoint (/api/payments/webhook)
   ↓
驗證 orderId 和 status
   ↓
PATCH /api/orders/{orderId}
   ↓
更新訂單狀態和支付記錄
   ↓
觸發 Enrollment 更新
```

**Webhook 實現：**
```typescript
// app/api/payments/webhook/route.ts
POST /api/payments/webhook
{
  "orderId": "order-uuid",
  "status": "PAID"  // 或其他狀態
}

返回：
{
  "ok": true,
  "proxied": {
    "ok": true,
    "order": { /* 更新後的訂單 */ }
  }
}
```

#### 3. 訂單狀態更新

**PATCH 操作：**
```
PATCH /api/orders/{orderId}
{
  "status": "PAID",
  "payment": {
    "time": "2025-01-11T10:05:00.000Z",
    "action": "payment_capture",
    "amount": 0,
    "currency": "TWD",
    "status": "PAID"
  }
}
```

**系統檢查：**
- 如果 order.enrollmentId 存在且 status = PAID：
  1. 自動調用 `/api/enroll` PATCH 將 enrollment 狀態設為 PAID
  2. 再調用一次 `/api/enroll` PATCH 將狀態設為 ACTIVE

**相關代碼：**
```typescript
// app/api/orders/[orderId]/route.ts
if (updated.enrollmentId && status === 'PAID') {
  // Set enrollment to PAID
  await fetch(`${base}/api/enroll`, {
    method: 'PATCH',
    body: JSON.stringify({ 
      id: updated.enrollmentId, 
      status: 'PAID' 
    }),
  });
  
  // Activate course access
  await fetch(`${base}/api/enroll`, {
    method: 'PATCH',
    body: JSON.stringify({ 
      id: updated.enrollmentId, 
      status: 'ACTIVE' 
    }),
  });
}
```

#### 4. 支付記錄（Payment History）

系統維護每個訂單的完整支付歷史記錄在 `order.payments` 陣列中：

```json
{
  "orderId": "order-uuid",
  "payments": [
    {
      "time": "2025-01-11T10:05:00.000Z",
      "action": "payment_capture",
      "amount": 0,
      "currency": "TWD",
      "status": "PAID",
      "note": "Initial payment"
    },
    {
      "time": "2025-01-12T15:30:00.000Z",
      "action": "refund",
      "amount": 0,
      "currency": "TWD",
      "status": "REFUNDED",
      "note": "Admin refund request"
    }
  ]
}
```

### 退款流程

**退款步驟：**
```
PAID (訂單已支付)
  ↓
Admin 發起退款
  ↓
PATCH /api/orders/{orderId}
{
  "status": "REFUNDED",
  "payment": {
    "time": "2025-01-12T15:30:00.000Z",
    "action": "refund",
    "status": "REFUNDED"
  }
}
  ↓
訂單狀態變為 REFUNDED
  ↓
付款記錄中新增退款記錄
```

---

## 系統架構

### 數據存儲

#### DynamoDB 表結構

**Orders 表：**
```
表名：jvtutorcorner-orders
主鍵：orderId (分區鍵)

屬性：
- orderId (String): 訂單唯一識別碼
- orderNumber (String): 人類可讀的訂單號
- userId (String): 用戶 ID/Email
- courseId (String): 課程 ID
- enrollmentId (String): 報名記錄 ID
- amount (Number): 訂單金額
- currency (String): 貨幣 (如 TWD)
- status (String): 訂單狀態 (PENDING, PAID, CANCELLED, REFUNDED, COMPLETED)
- createdAt (String): 創建時間 (ISO 8601)
- updatedAt (String): 更新時間 (ISO 8601)
- payments (Array): 支付記錄陣列
```

**本地開發存儲：**
```
.local_data/orders.json
```

### 開發環境 vs 生產環境

**開發環境（LOCAL_ORDERS 模式）：**
- 使用本地 JSON 文件存儲
- 訂單數據保存在 `.local_data/orders.json`
- 便於本地測試和調試

**生產環境（DynamoDB 模式）：**
- 使用 AWS DynamoDB
- 環境變量：`DYNAMODB_TABLE_ORDERS`
- `NODE_ENV=production` 時激活

---

## API 端點

### 訂單管理 API

#### 1. 創建訂單

**端點：** `POST /api/orders`

**請求：**
```json
{
  "courseId": "course-001",
  "enrollmentId": "enrollment-uuid",
  "amount": 0,
  "currency": "TWD"
}
```

**響應 (201)：**
```json
{
  "message": "Order created successfully",
  "order": {
    "orderId": "uuid",
    "orderNumber": "email-timestamp",
    "userId": "student-email",
    "courseId": "course-001",
    "enrollmentId": "enrollment-uuid",
    "amount": 0,
    "currency": "TWD",
    "status": "PENDING",
    "createdAt": "2025-01-11T10:00:00.000Z",
    "updatedAt": "2025-01-11T10:00:00.000Z"
  }
}
```

**錯誤 (400/401/500)：**
```json
{
  "error": "Error message"
}
```

---

#### 2. 獲取訂單

**端點：** `GET /api/orders/{orderId}`

**響應 (200)：**
```json
{
  "ok": true,
  "order": { /* 訂單詳細信息 */ }
}
```

---

#### 3. 列表訂單

**端點：** `GET /api/orders`

**查詢參數：**
```
?limit=20                    // 每頁數量（默認 20，最大 100）
&lastKey=encoded-key         // 分頁用的起始鍵
&status=PAID                 // 按狀態篩選
&userId=student-email        // 按用戶篩選
&courseId=course-001         // 按課程篩選
&orderId=order-uuid          // 按訂單 ID 篩選
&enrollmentId=enroll-uuid    // 按報名 ID 篩選
&startDate=2025-01-01T00:00  // 開始日期
&endDate=2025-01-31T23:59    // 結束日期
```

**響應 (200)：**
```json
{
  "ok": true,
  "data": [ /* 訂單陣列 */ ],
  "lastKey": "encoded-next-key"
}
```

---

#### 4. 更新訂單

**端點：** `PATCH /api/orders/{orderId}`

**請求：**
```json
{
  "status": "PAID",
  "payment": {
    "time": "2025-01-11T10:05:00.000Z",
    "action": "payment_capture",
    "amount": 0,
    "currency": "TWD",
    "status": "PAID"
  }
}
```

**特殊行為：**
- 如果 `status: PAID` 且訂單有 `enrollmentId`，系統會自動：
  1. 將 enrollment 狀態設為 PAID
  2. 將 enrollment 狀態設為 ACTIVE

**響應 (200)：**
```json
{
  "ok": true,
  "order": { /* 更新後的訂單 */ }
}
```

---

### 支付 API

#### 1. 支付 Webhook

**端點：** `POST /api/payments/webhook`

**請求：**
```json
{
  "orderId": "order-uuid",
  "status": "PAID"
}
```

**流程：**
1. 驗證 orderId 和 status
2. 調用 PATCH `/api/orders/{orderId}`
3. 返回代理結果

**響應 (200)：**
```json
{
  "ok": true,
  "proxied": { /* 訂單更新結果 */ }
}
```

---

## 狀態轉換

### 訂單狀態圖

```
          PENDING
           /    \
          /      \
       PAID    CANCELLED
        |         |
    COMPLETED  REFUNDED
```

### 允許的狀態轉換

| 當前狀態 | 可轉換到 | 說明 |
|---------|--------|------|
| PENDING | PAID, CANCELLED | 等待支付或取消 |
| PAID | COMPLETED, REFUNDED | 完成課程或退款 |
| CANCELLED | (終終端狀態) | 訂單已取消 |
| REFUNDED | (終終端狀態) | 已退款完成 |
| COMPLETED | (終終端狀態) | 課程已完成 |

### 狀態說明

| 狀態 | 說明 | Enrollment 狀態 |
|------|------|-----------------|
| PENDING | 訂單已建立，等待支付 | PENDING_PAYMENT |
| PAID | 支付已確認，課程可訪問 | ACTIVE |
| COMPLETED | 課程已完成或確認完成 | ACTIVE |
| CANCELLED | 訂單已取消（支付前） | CANCELLED 或維持原狀 |
| REFUNDED | 已退款 | REFUNDED |

---

## 付款記錄

### Payment 對象結構

```typescript
{
  // 時間戳
  time?: string;           // ISO 8601 格式
  
  // 操作類型
  action?: string;         // payment_capture, refund, cancel, complete 等
  
  // 金額信息
  amount?: number;         // 交易金額
  currency?: string;       // 貨幣代碼 (TWD, USD 等)
  
  // 狀態
  status?: string;         // 交易狀態 (PAID, REFUNDED, CANCELLED 等)
  
  // 備註
  note?: string;           // 備註說明
  memo?: string;           // 別名字段
  
  // 支付網關相關
  transactionId?: string;  // 第三方支付平台交易 ID
  paymentMethod?: string;  // 支付方式
  reference?: string;      // 參考編號
}
```

### 支付記錄示例

```json
{
  "payments": [
    {
      "time": "2025-01-11T10:05:00.000Z",
      "action": "payment_capture",
      "amount": 2900,
      "currency": "TWD",
      "status": "PAID",
      "transactionId": "stripe_pi_12345",
      "paymentMethod": "credit_card"
    },
    {
      "time": "2025-01-15T14:20:00.000Z",
      "action": "refund",
      "amount": 2900,
      "currency": "TWD",
      "status": "REFUNDED",
      "transactionId": "stripe_re_67890",
      "note": "Student requested refund"
    }
  ]
}
```

---

## 錯誤處理

### 常見錯誤碼

| HTTP 碼 | 錯誤 | 說明 |
|---------|------|------|
| 400 | Bad Request | 缺少必要參數或無效的參數 |
| 401 | Unauthorized | 未認證或無權限 |
| 404 | Not Found | 訂單或資源不存在 |
| 500 | Server Error | 服務器內部錯誤 |

### 錯誤響應格式

```json
{
  "ok": false,
  "error": "Order not found"
}
```

或

```json
{
  "error": "Error message"
}
```

### 常見問題處理

**問題：創建訂單時收到 401 Unauthorized**
- 原因：未認證的用戶
- 解決：確保用戶已登錄並有有效的 session

**問題：支付完成但 Enrollment 未自動更新**
- 原因：Enrollment ID 不匹配或服務間通信失敗
- 解決：檢查訂單中的 enrollmentId，手動觸發 `/api/enroll` PATCH

**問題：PATCH 訂單時收到 "Order not found"**
- 原因：開發環境下訂單未正確保存
- 解決：檢查 `.local_data/orders.json` 文件，確保目錄存在

---

## 前端集成指南

### 用戶報名並購買課程

```typescript
// 1. 創建報名
const enrollRes = await fetch('/api/enroll', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    courseId: 'course-001',
    name: 'Student Name',
    email: 'student@example.com'
  })
});
const enrollment = await enrollRes.json();

// 2. 創建訂單
const orderRes = await fetch('/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    courseId: 'course-001',
    enrollmentId: enrollment.id,
    amount: 2900,
    currency: 'TWD'
  })
});
const order = await orderRes.json();

// 3. 重定向到支付頁面（使用支付網關）
// window.location.href = `${PAYMENT_GATEWAY_URL}?orderId=${order.orderId}`;

// 4. (開發) 模擬支付完成
const paymentRes = await fetch('/api/payments/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    orderId: order.orderId,
    status: 'PAID'
  })
});
```

### 監控訂單狀態

```typescript
// 定期檢查訂單狀態
async function checkOrderStatus(orderId: string) {
  const res = await fetch(`/api/orders/${orderId}`);
  const data = await res.json();
  
  if (data.order.status === 'PAID') {
    // 顯示課程訪問按鈕
    showAccessButton();
  } else if (data.order.status === 'PENDING') {
    // 顯示待支付提示
    showPendingMessage();
  }
}
```

---

## 管理員操作

### 查看所有訂單

```
訪問：/admin/orders

功能：
- 列表所有訂單
- 按狀態、用戶、課程篩選
- 按日期範圍篩選
- 導出 CSV
- 分頁導航
```

### 修改訂單狀態

```
訪問：/admin/orders/{orderId}

功能：
- 查看完整訂單詳情
- 查看付款歷史
- 標記為已支付 (PENDING → PAID)
- 取消訂單 (PENDING → CANCELLED)
- 完成訂單 (PAID → COMPLETED)
- 發起退款 (PAID → REFUNDED)
- 新增付款記錄
```

### 管理員操作示例

```typescript
// 標記訂單為已支付
const response = await fetch(`/api/orders/${orderId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'PAID',
    payment: {
      time: new Date().toISOString(),
      action: 'payment_capture',
      amount: 2900,
      currency: 'TWD',
      status: 'PAID',
      note: 'Admin manually marked as paid'
    }
  })
});
```

---

## 測試指南

### 模擬完整訂單流程

**自動化測試按鈕位置：**
- 訪問 `/admin` 或課程頁面
- 查找「SimulationButtons」組件

**測試步驟：**
```
1. 點擊「建立報名」- 創建新的 enrollment
2. 點擊「建立訂單」- 為上一個 enrollment 創建訂單
3. 點擊「模擬付款」- 模擬支付完成
4. 驗證：
   - Enrollment 狀態 → ACTIVE
   - Order 狀態 → PAID
   - 支付記錄已添加
```

### 手動測試

**測試清單：**
- [ ] 建立新報名
- [ ] 為報名創建訂單
- [ ] 模擬支付（開發環境）
- [ ] 驗證 Enrollment 自動更新為 ACTIVE
- [ ] 驗證用戶可以訪問課程
- [ ] 測試退款流程
- [ ] 測試取消訂單
- [ ] 驗證支付記錄完整性

---

## 故障排除

### 常見問題

**Q: 訂單創建後，支付模擬不起作用**
A: 檢查：
1. orderId 是否正確傳遞
2. `/api/payments/webhook` 端點是否可訪問
3. 查看瀏覽器控制台和服務器日誌的錯誤信息

**Q: Enrollment 沒有自動變成 ACTIVE**
A: 檢查：
1. 訂單中是否有 enrollmentId
2. 訂單狀態是否確實變為 PAID
3. `/api/enroll` 端點是否可訪問
4. 查看服務器日誌中的 "Failed to update enrollment status" 錯誤

**Q: 支付記錄為空**
A: 檢查：
1. 是否在 PATCH 時提供了 payment 對象
2. 開發環境是否正確保存到 `.local_data/orders.json`
3. 是否有寫入權限

---

## 相關文件

- [API 路由](/app/api/orders) - 訂單 API 實現
- [API 路由](/app/api/payments) - 支付 API 實現
- [組件](/components/OrdersManager.tsx) - 訂單管理組件
- [組件](/components/EnrollmentManager.tsx) - 報名管理組件
- [管理頁面](/app/admin/orders) - 管理員訂單頁面

---

**文件版本：1.0**  
**最後更新：2025-01-11**  
**作者：系統文檔**
