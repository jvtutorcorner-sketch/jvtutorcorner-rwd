# API 端點詳細說明

## 目錄
1. [訂單 API](#訂單-api)
2. [支付 API](#支付-api)
3. [數據模型](#數據模型)
4. [請求/響應示例](#請求響應示例)
5. [認證和授權](#認證和授權)
6. [速率限制](#速率限制)

---

## 訂單 API

### 基本 URL
```
/api/orders
/api/orders/{orderId}
```

### 1. 創建訂單

**方法：** `POST /api/orders`

**描述：**
為特定課程和報名創建新訂單。系統將自動生成訂單 ID 和訂單號。

**請求頭：**
```
Content-Type: application/json
```

**請求體：**
```json
{
  "courseId": "string",           // 必需：課程 ID
  "enrollmentId": "string",       // 可選：報名記錄 ID
  "amount": number,               // 可選：訂單金額（默認 0）
  "currency": "string"            // 可選：貨幣代碼（默認 TWD）
}
```

**參數詳解：**

| 參數 | 類型 | 必需 | 說明 |
|------|------|------|------|
| courseId | String | ✓ | 課程唯一識別碼 |
| enrollmentId | String | | 報名記錄 ID，用於建立訂單與報名的關聯 |
| amount | Number | | 訂單金額，用於商業交易 |
| currency | String | | ISO 4217 貨幣代碼（如 TWD, USD, JPY） |

**cURL 示例：**
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "courseId": "course-001",
    "enrollmentId": "enroll-uuid-12345",
    "amount": 2900,
    "currency": "TWD"
  }'
```

**JavaScript 示例：**
```javascript
const response = await fetch('/api/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    courseId: 'course-001',
    enrollmentId: 'enroll-uuid-12345',
    amount: 2900,
    currency: 'TWD'
  })
});

const data = await response.json();
if (response.ok) {
  console.log('訂單創建成功:', data.order);
  const orderId = data.order.orderId;
  // 重定向到支付頁面
  window.location.href = `/checkout?orderId=${orderId}`;
} else {
  console.error('創建訂單失敗:', data.error);
}
```

**成功響應 (201)：**
```json
{
  "message": "Order created successfully",
  "order": {
    "orderId": "550e8400-e29b-41d4-a716-446655440000",
    "orderNumber": "student@example.com-2025-01-11T10:00:00.000Z",
    "userId": "student@example.com",
    "courseId": "course-001",
    "enrollmentId": "enroll-uuid-12345",
    "amount": 2900,
    "currency": "TWD",
    "status": "PENDING",
    "createdAt": "2025-01-11T10:00:00.000Z",
    "updatedAt": "2025-01-11T10:00:00.000Z"
  }
}
```

**錯誤響應：**

| HTTP 碼 | 錯誤信息 | 說明 |
|---------|---------|------|
| 400 | Course ID is required | 未提供 courseId |
| 401 | User not authenticated | 用戶未認證 |
| 500 | Failed to create order | 服務器內部錯誤 |

---

### 2. 獲取單個訂單

**方法：** `GET /api/orders/{orderId}`

**描述：**
根據訂單 ID 獲取訂單詳細信息。

**路徑參數：**

| 參數 | 類型 | 必需 | 說明 |
|------|------|------|------|
| orderId | String | ✓ | 訂單 UUID |

**cURL 示例：**
```bash
curl http://localhost:3000/api/orders/550e8400-e29b-41d4-a716-446655440000
```

**JavaScript 示例：**
```javascript
const orderId = '550e8400-e29b-41d4-a716-446655440000';
const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
const data = await response.json();

if (response.ok) {
  console.log('訂單詳情:', data.order);
} else {
  console.error('獲取訂單失敗:', data.error);
}
```

**成功響應 (200)：**
```json
{
  "ok": true,
  "order": {
    "orderId": "550e8400-e29b-41d4-a716-446655440000",
    "orderNumber": "student@example.com-2025-01-11T10:00:00.000Z",
    "userId": "student@example.com",
    "courseId": "course-001",
    "enrollmentId": "enroll-uuid-12345",
    "amount": 2900,
    "currency": "TWD",
    "status": "PAID",
    "createdAt": "2025-01-11T10:00:00.000Z",
    "updatedAt": "2025-01-11T10:05:00.000Z",
    "payments": [
      {
        "time": "2025-01-11T10:05:00.000Z",
        "action": "payment_capture",
        "amount": 2900,
        "currency": "TWD",
        "status": "PAID",
        "transactionId": "stripe_pi_12345"
      }
    ]
  }
}
```

**錯誤響應：**

| HTTP 碼 | 錯誤信息 | 說明 |
|---------|---------|------|
| 400 | orderId required | 未提供 orderId |
| 404 | Order not found | 訂單不存在 |
| 500 | Server error | 服務器內部錯誤 |

---

### 3. 列表訂單（分頁）

**方法：** `GET /api/orders`

**描述：**
列表所有訂單，支持過濾和分頁。返回分頁結果。

**查詢參數：**

| 參數 | 類型 | 默認 | 範圍 | 說明 |
|------|------|------|------|------|
| limit | Number | 20 | 1-100 | 每頁結果數 |
| lastKey | String | | | 分頁游標（用於獲取下一頁） |
| status | String | | PENDING, PAID, COMPLETED, CANCELLED, REFUNDED | 按狀態篩選 |
| userId | String | | | 按用戶 ID 篩選 |
| courseId | String | | | 按課程 ID 篩選 |
| enrollmentId | String | | | 按報名 ID 篩選 |
| orderId | String | | | 按訂單 ID 篩選 |
| startDate | String | | ISO 8601 | 開始日期（含） |
| endDate | String | | ISO 8601 | 結束日期（含） |

**cURL 示例：**
```bash
# 獲取前 20 個已支付的訂單
curl "http://localhost:3000/api/orders?limit=20&status=PAID"

# 按日期範圍篩選
curl "http://localhost:3000/api/orders?startDate=2025-01-01T00:00:00.000Z&endDate=2025-01-31T23:59:59.999Z"

# 獲取特定課程的訂單
curl "http://localhost:3000/api/orders?courseId=course-001&limit=50"

# 分頁：獲取下一頁
curl "http://localhost:3000/api/orders?limit=20&lastKey=eyJvcmRlcklkIjoiNTUwZTg0MDAifQ=="
```

**JavaScript 示例：**
```javascript
// 獲取用戶的所有訂單
async function getUserOrders(userId) {
  const params = new URLSearchParams({
    userId: userId,
    limit: '50'
  });
  
  const response = await fetch(`/api/orders?${params.toString()}`);
  const data = await response.json();
  
  if (response.ok) {
    console.log('用戶訂單:', data.data);
    
    // 如果有更多頁面
    if (data.lastKey) {
      console.log('還有更多訂單，lastKey:', data.lastKey);
    }
  }
}

// 複雜查詢：特定日期範圍內某課程的所有已支付訂單
async function getCompletedOrders(courseId, startDate, endDate) {
  const params = new URLSearchParams({
    courseId: courseId,
    status: 'PAID',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    limit: '100'
  });
  
  const response = await fetch(`/api/orders?${params.toString()}`);
  return await response.json();
}
```

**成功響應 (200)：**
```json
{
  "ok": true,
  "data": [
    {
      "orderId": "550e8400-e29b-41d4-a716-446655440000",
      "orderNumber": "user1@example.com-2025-01-11T10:00:00.000Z",
      "userId": "user1@example.com",
      "courseId": "course-001",
      "amount": 2900,
      "currency": "TWD",
      "status": "PAID",
      "createdAt": "2025-01-11T10:00:00.000Z",
      "updatedAt": "2025-01-11T10:05:00.000Z"
    },
    {
      "orderId": "660e8400-e29b-41d4-a716-446655440111",
      "orderNumber": "user2@example.com-2025-01-11T11:00:00.000Z",
      "userId": "user2@example.com",
      "courseId": "course-002",
      "amount": 1500,
      "currency": "TWD",
      "status": "PENDING",
      "createdAt": "2025-01-11T11:00:00.000Z",
      "updatedAt": "2025-01-11T11:00:00.000Z"
    }
  ],
  "lastKey": "eyJvcmRlcklkIjoiNjYwZTg0MDAifQ=="
}
```

**分頁邏輯：**
```javascript
// 循環獲取所有訂單
let allOrders = [];
let lastKey = null;

do {
  const params = new URLSearchParams({ limit: '20' });
  if (lastKey) {
    params.set('lastKey', lastKey);
  }
  
  const response = await fetch(`/api/orders?${params.toString()}`);
  const data = await response.json();
  
  allOrders = allOrders.concat(data.data);
  lastKey = data.lastKey;
  
} while (lastKey); // 直到沒有更多頁面

console.log(`總共獲取 ${allOrders.length} 個訂單`);
```

---

### 4. 更新訂單

**方法：** `PATCH /api/orders/{orderId}`

**描述：**
更新訂單狀態並添加支付記錄。支持單個或批量支付記錄。

當訂單狀態變為 PAID 且存在關聯的 enrollmentId 時，系統會自動：
1. 將 enrollment 狀態設為 PAID
2. 將 enrollment 狀態設為 ACTIVE（激活課程訪問）

**路徑參數：**

| 參數 | 類型 | 必需 | 說明 |
|------|------|------|------|
| orderId | String | ✓ | 訂單 UUID |

**請求體：**
```json
{
  "status": "string",           // 必需：新的訂單狀態
  "payment": {                  // 可選：單個支付記錄
    "time": "string",
    "action": "string",
    "amount": number,
    "currency": "string",
    "status": "string",
    "note": "string"
  },
  "payments": [                 // 可選：多個支付記錄
    {
      "time": "string",
      "action": "string",
      "amount": number,
      "currency": "string",
      "status": "string",
      "note": "string"
    }
  ]
}
```

**參數詳解：**

| 參數 | 類型 | 必需 | 說明 | 允許值 |
|------|------|------|------|---------|
| status | String | ✓ | 訂單新狀態 | PENDING, PAID, CANCELLED, REFUNDED, COMPLETED |
| payment | Object | | 單個支付記錄 | 見下表 |
| payments | Array | | 支付記錄列表 | Payment[] |

**Payment 對象字段：**

| 字段 | 類型 | 必需 | 說明 |
|------|------|------|------|
| time | String | | 交易時間（ISO 8601） |
| action | String | | 操作類型：payment_capture, refund, cancel, complete |
| amount | Number | | 交易金額 |
| currency | String | | 貨幣代碼 |
| status | String | | 交易狀態 |
| note | String | | 備註說明 |
| transactionId | String | | 支付網關交易 ID（可選） |
| paymentMethod | String | | 支付方式（可選） |

**cURL 示例：**
```bash
# 標記訂單為已支付（添加支付記錄）
curl -X PATCH http://localhost:3000/api/orders/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "PAID",
    "payment": {
      "time": "2025-01-11T10:05:00.000Z",
      "action": "payment_capture",
      "amount": 2900,
      "currency": "TWD",
      "status": "PAID",
      "transactionId": "stripe_pi_12345"
    }
  }'

# 取消訂單
curl -X PATCH http://localhost:3000/api/orders/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "CANCELLED"
  }'

# 處理退款
curl -X PATCH http://localhost:3000/api/orders/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "REFUNDED",
    "payment": {
      "time": "2025-01-15T14:20:00.000Z",
      "action": "refund",
      "amount": 2900,
      "currency": "TWD",
      "status": "REFUNDED",
      "note": "Full refund processed"
    }
  }'
```

**JavaScript 示例：**
```javascript
// 確認支付（標記為 PAID）
async function confirmPayment(orderId, transactionId) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status: 'PAID',
      payment: {
        time: new Date().toISOString(),
        action: 'payment_capture',
        amount: 2900,
        currency: 'TWD',
        status: 'PAID',
        transactionId: transactionId,
        paymentMethod: 'credit_card'
      }
    })
  });

  const data = await response.json();
  if (response.ok) {
    console.log('訂單已確認支付:', data.order);
  } else {
    console.error('支付確認失敗:', data.error);
  }
}

// 處理退款請求
async function refundOrder(orderId, refundAmount = null) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status: 'REFUNDED',
      payment: {
        time: new Date().toISOString(),
        action: 'refund',
        amount: refundAmount || undefined,
        currency: 'TWD',
        status: 'REFUNDED',
        note: '用戶申請退款'
      }
    })
  });

  const data = await response.json();
  if (response.ok) {
    console.log('退款已處理:', data.order);
  } else {
    console.error('退款失敗:', data.error);
  }
}

// 添加多個支付記錄
async function addMultiplePayments(orderId, payments) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status: 'PAID',
      payments: payments  // 支付記錄陣列
    })
  });

  const data = await response.json();
  return data;
}
```

**成功響應 (200)：**
```json
{
  "ok": true,
  "order": {
    "orderId": "550e8400-e29b-41d4-a716-446655440000",
    "orderNumber": "student@example.com-2025-01-11T10:05:00.000Z",
    "userId": "student@example.com",
    "courseId": "course-001",
    "enrollmentId": "enroll-uuid-12345",
    "amount": 2900,
    "currency": "TWD",
    "status": "PAID",
    "createdAt": "2025-01-11T10:00:00.000Z",
    "updatedAt": "2025-01-11T10:05:00.000Z",
    "payments": [
      {
        "time": "2025-01-11T10:05:00.000Z",
        "action": "payment_capture",
        "amount": 2900,
        "currency": "TWD",
        "status": "PAID",
        "transactionId": "stripe_pi_12345",
        "paymentMethod": "credit_card"
      }
    ]
  }
}
```

**自動 Enrollment 更新過程：**
```
PATCH /api/orders/{orderId} { status: PAID, ... }
  ↓
檢查：order.enrollmentId 存在？
  ↓ 是
發送 PATCH /api/enroll { id: enrollmentId, status: PAID }
  ↓
發送 PATCH /api/enroll { id: enrollmentId, status: ACTIVE }
  ↓
用戶可以訪問課程
```

**錯誤響應：**

| HTTP 碼 | 錯誤信息 | 說明 |
|---------|---------|------|
| 400 | orderId and status required | 缺少必要參數 |
| 404 | Order not found | 訂單不存在 |
| 500 | Server error | 服務器內部錯誤 |

---

## 支付 API

### 1. 支付 Webhook

**方法：** `POST /api/payments/webhook`

**描述：**
接收來自支付網關的支付確認回調。系統會驗證訂單並更新其狀態。

此端點用於：
- 接收支付網關（Stripe、ECPay 等）的回調通知
- 開發環境中模擬支付完成
- 手動觸發訂單狀態更新

**請求體：**
```json
{
  "orderId": "string",      // 必需：訂單 ID
  "status": "string"        // 必需：支付結果狀態
}
```

**參數詳解：**

| 參數 | 類型 | 必需 | 說明 |
|------|------|------|------|
| orderId | String | ✓ | 訂單唯一識別碼 |
| status | String | ✓ | 支付狀態（通常為 PAID） |

**cURL 示例：**
```bash
# 模擬支付完成
curl -X POST http://localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "PAID"
  }'
```

**JavaScript 示例：**
```javascript
// 模擬支付完成（開發環境）
async function simulatePaymentCompletion(orderId) {
  const response = await fetch('/api/payments/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      orderId: orderId,
      status: 'PAID'
    })
  });

  const data = await response.json();
  if (response.ok) {
    console.log('支付已模擬:', data);
    return data.proxied.order; // 返回更新後的訂單
  } else {
    console.error('模擬失敗:', data.error);
    throw new Error(data.error);
  }
}

// 實際支付網關回調處理（在您的支付網關中配置）
// 支付網關會向此端點發送回調：
// POST https://yourdomain.com/api/payments/webhook
// {
//   "orderId": "...",
//   "status": "PAID",
//   "transactionId": "...",
//   ...其他支付網關字段
// }
```

**成功響應 (200)：**
```json
{
  "ok": true,
  "proxied": {
    "ok": true,
    "order": {
      "orderId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "PAID",
      "updatedAt": "2025-01-11T10:05:00.000Z",
      "payments": [
        {
          "time": "2025-01-11T10:05:00.000Z",
          "action": "payment_capture",
          "status": "PAID"
        }
      ]
    }
  }
}
```

**錯誤響應：**

| HTTP 碼 | 錯誤信息 | 說明 |
|---------|---------|------|
| 400 | orderId and status required | 缺少必要參數 |
| 500 | server error | 服務器內部錯誤 |

**Webhook 流程圖：**
```
支付網關
  ↓
POST /api/payments/webhook { orderId, status }
  ↓
驗證 orderId 和 status
  ↓
PATCH /api/orders/{orderId} { status: "PAID" }
  ↓
自動更新 Enrollment 狀態
  ↓
返回 { ok: true, proxied: {...} }
```

---

## 數據模型

### Order 模型

```typescript
interface Order {
  // 識別信息
  orderId: string;              // UUID
  orderNumber: string;          // 人類可讀編號 (userId-timestamp)
  
  // 關聯信息
  userId: string;               // 用戶 ID/Email
  courseId: string;             // 課程 ID
  enrollmentId?: string;        // 報名 ID（可選）
  
  // 金額信息
  amount: number;               // 訂單金額
  currency: string;             // 貨幣代碼 (TWD, USD 等)
  
  // 狀態
  status: string;               // PENDING | PAID | COMPLETED | CANCELLED | REFUNDED
  
  // 時間戳
  createdAt: string;            // ISO 8601 創建時間
  updatedAt: string;            // ISO 8601 更新時間
  
  // 支付歷史
  payments?: Payment[];         // 支付記錄列表
}
```

### Payment 模型

```typescript
interface Payment {
  // 時間戳
  time?: string;               // ISO 8601 交易時間
  
  // 操作信息
  action?: string;             // payment_capture | refund | cancel | complete
  
  // 金額信息
  amount?: number;             // 交易金額
  currency?: string;           // 貨幣代碼
  
  // 狀態
  status?: string;             // 交易狀態
  
  // 支付網關信息
  transactionId?: string;      // 第三方支付平台交易 ID
  paymentMethod?: string;      // credit_card | bank_transfer | wallet 等
  reference?: string;          // 參考編號
  
  // 備註
  note?: string;               // 備註說明
  memo?: string;               // 別名字段（與 note 同義）
}
```

### Enrollment 模型

```typescript
interface Enrollment {
  // 識別信息
  id: string;                  // UUID
  courseId: string;            // 課程 ID
  
  // 學生信息
  studentId: string;           // 學生 ID/Email
  name: string;                // 學生姓名
  email: string;               // 學生郵箱
  
  // 狀態
  status: string;              // PENDING_PAYMENT | PAID | ACTIVE | CANCELLED | REFUNDED
  
  // 時間戳
  createdAt: string;           // ISO 8601 創建時間
  updatedAt: string;           // ISO 8601 更新時間
  
  // 關聯信息
  orderId?: string;            // 關聯的訂單 ID（可選）
}
```

---

## 請求/響應示例

### 完整購買流程範例

```javascript
// 1. 創建報名
async function createEnrollment(courseId, studentName, studentEmail) {
  const enrollRes = await fetch('/api/enroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseId: courseId,
      name: studentName,
      email: studentEmail
    })
  });
  
  if (!enrollRes.ok) throw new Error('Failed to create enrollment');
  return await enrollRes.json();
}

// 2. 創建訂單
async function createOrder(courseId, enrollmentId, amount) {
  const orderRes = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseId: courseId,
      enrollmentId: enrollmentId,
      amount: amount,
      currency: 'TWD'
    })
  });
  
  if (!orderRes.ok) throw new Error('Failed to create order');
  return await orderRes.json();
}

// 3. 處理支付
async function processPayment(orderId) {
  // 實際應用中：重定向到支付網關
  // window.location.href = `https://payment-gateway.com/checkout?orderId=${orderId}`;
  
  // 開發環境：模擬支付
  const payRes = await fetch('/api/payments/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: orderId,
      status: 'PAID'
    })
  });
  
  if (!payRes.ok) throw new Error('Payment simulation failed');
  return await payRes.json();
}

// 4. 完整流程
async function purchaseCourse(courseId, coursePrice, studentName, studentEmail) {
  try {
    console.log('1. Creating enrollment...');
    const enrollData = await createEnrollment(courseId, studentName, studentEmail);
    const enrollmentId = enrollData.enrollment.id;
    console.log('   Enrollment created:', enrollmentId);
    
    console.log('2. Creating order...');
    const orderData = await createOrder(courseId, enrollmentId, coursePrice);
    const orderId = orderData.order.orderId;
    console.log('   Order created:', orderId);
    
    console.log('3. Processing payment...');
    const paymentData = await processPayment(orderId);
    console.log('   Payment successful:', paymentData);
    
    console.log('4. Purchase completed!');
    console.log('   Student can now access the course.');
    
    return {
      enrollment: enrollData.enrollment,
      order: orderData.order,
      payment: paymentData.proxied.order
    };
    
  } catch (error) {
    console.error('Purchase failed:', error);
    throw error;
  }
}

// 使用示例
await purchaseCourse(
  'course-001',
  2900,
  'John Doe',
  'john@example.com'
);
```

---

## 認證和授權

### 目前實現

系統目前使用簡化的認證模式，便於開發和測試。

**用戶識別方式：**
1. 在開發環境中，使用用戶郵箱作為 userId
2. 在生產環境中，應從認證 session 中獲取

**代碼參考：**
```typescript
// app/api/orders/route.ts
const getUserId = async (): Promise<string | null> => {
  return 'mock-user-123';  // 開發：返回模擬用戶
  // 生產：return req.session?.userId;
};
```

### 建議的改進

**實現真正的認證：**
```typescript
import { getSession } from 'next-auth/react';  // 如使用 NextAuth

async function authenticateUser(req) {
  const session = await getSession({ req });
  if (!session) {
    return null;
  }
  return session.user.email;
}
```

### 授權規則

| 操作 | 允許者 |
|------|--------|
| 創建自己的訂單 | 已認證用戶 |
| 查看自己的訂單 | 訂單所有者 |
| 查看課程的訂單 | 教師或管理員 |
| 查看所有訂單 | 管理員 |
| 修改訂單 | 管理員 |

---

## 速率限制

目前沒有實現速率限制。建議在生產環境中添加。

### 建議的限制

```
- 創建訂單：每個用戶每分鐘最多 10 次
- 查詢訂單列表：每個用戶每分鐘最多 30 次
- 支付 Webhook：每個訂單最多接受 5 次調用
```

### 實現方案

使用 `express-rate-limit` 或 Redis：

```javascript
import rateLimit from 'express-rate-limit';

const createOrderLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 分鐘
  max: 10,              // 最多 10 次
  message: 'Too many orders created, please try again later.'
});

app.post('/api/orders', createOrderLimiter, (req, res) => {
  // 處理訂單創建
});
```

---

## 相關文件

- [訂單/支付流程主文檔](./PAYMENT_FLOW_DOCUMENTATION.md)
- [訂單 API 路由](./app/api/orders/)
- [支付 API 路由](./app/api/payments/)
- [Enrollment API 路由](./app/api/enroll/)

---

**文件版本：1.0**  
**最後更新：2025-01-11**  
**作者：系統文檔**
