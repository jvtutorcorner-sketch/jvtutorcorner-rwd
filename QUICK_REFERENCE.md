# 訂單和金流支付流程 - 快速參考指南

## 1. 快速開始

### 用戶購買課程的最少步驟

```javascript
// 步驟 1：創建報名
const enrollRes = await fetch('/api/enroll', {
  method: 'POST',
  body: JSON.stringify({
    courseId: 'course-001',
    name: 'Student',
    email: 'student@example.com'
  })
});
const { enrollment } = await enrollRes.json();

// 步驟 2：創建訂單
const orderRes = await fetch('/api/orders', {
  method: 'POST',
  body: JSON.stringify({
    courseId: 'course-001',
    enrollmentId: enrollment.id,
    amount: 2900,
    currency: 'TWD'
  })
});
const { order } = await orderRes.json();

// 步驟 3：模擬支付（開發環境）或重定向到真實支付網關
await fetch('/api/payments/webhook', {
  method: 'POST',
  body: JSON.stringify({
    orderId: order.orderId,
    status: 'PAID'
  })
});

// 完成！用戶現在可以訪問課程
```

---

## 2. 主要 API 端點速記

| 操作 | 方法 | 端點 | 參數 |
|------|------|------|------|
| 創建訂單 | POST | `/api/orders` | courseId*, enrollmentId, amount, currency |
| 獲取訂單 | GET | `/api/orders/{orderId}` | - |
| 列表訂單 | GET | `/api/orders` | limit, status, userId, courseId 等 |
| 更新訂單 | PATCH | `/api/orders/{orderId}` | status*, payment |
| 支付回調 | POST | `/api/payments/webhook` | orderId*, status* |

*必需參數

---

## 3. 訂單狀態轉換

```
PENDING ──支付完成─→ PAID ──完成課程─→ COMPLETED
   │
   └─────取消─────→ CANCELLED
   
PAID ──退款────→ REFUNDED

任何狀態 ──管理員操作─→ 任何其他狀態
```

---

## 4. 常用代碼片段

### 4.1 檢查訂單狀態

```javascript
async function getOrderStatus(orderId) {
  const res = await fetch(`/api/orders/${orderId}`);
  const data = await res.json();
  return data.order.status;  // PENDING, PAID, COMPLETED 等
}
```

### 4.2 列出用戶的所有訂單

```javascript
async function getUserOrders(userId) {
  const res = await fetch(`/api/orders?userId=${userId}&limit=50`);
  const data = await res.json();
  return data.data;
}
```

### 4.3 標記訂單為已支付

```javascript
async function confirmPayment(orderId) {
  const res = await fetch(`/api/orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'PAID',
      payment: {
        time: new Date().toISOString(),
        action: 'payment_capture',
        amount: 2900,
        currency: 'TWD',
        status: 'PAID'
      }
    })
  });
  return await res.json();
}
```

### 4.4 處理退款

```javascript
async function refundOrder(orderId) {
  const res = await fetch(`/api/orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'REFUNDED',
      payment: {
        time: new Date().toISOString(),
        action: 'refund',
        amount: 2900,
        currency: 'TWD',
        status: 'REFUNDED'
      }
    })
  });
  return await res.json();
}
```

---

## 5. 自動化測試流程

### 模擬完整購買流程

```javascript
async function simulateFullPurchase() {
  // 1. 創建 Enrollment
  const eRes = await fetch('/api/enroll', {
    method: 'POST',
    body: JSON.stringify({
      courseId: 'demo-course-001',
      name: '測試用戶',
      email: 'test@example.com'
    })
  });
  const enrollment = (await eRes.json()).enrollment;
  console.log('✓ Enrollment 創建:', enrollment.id);

  // 2. 創建 Order
  const oRes = await fetch('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      courseId: 'demo-course-001',
      enrollmentId: enrollment.id,
      amount: 0,
      currency: 'TWD'
    })
  });
  const order = (await oRes.json()).order;
  console.log('✓ Order 創建:', order.orderId);

  // 3. 模擬支付
  const pRes = await fetch('/api/payments/webhook', {
    method: 'POST',
    body: JSON.stringify({
      orderId: order.orderId,
      status: 'PAID'
    })
  });
  const payment = await pRes.json();
  console.log('✓ 支付完成:', payment.ok);

  // 4. 驗證
  const verifyRes = await fetch(`/api/orders/${order.orderId}`);
  const updated = (await verifyRes.json()).order;
  console.log('✓ 最終狀態:', updated.status);
  console.log('✓ 支付記錄數:', updated.payments.length);

  return { enrollment, order, updated };
}
```

---

## 6. 調試技巧

### 6.1 查看本地訂單數據

訂單保存在：`.local_data/orders.json`

```bash
# 在開發環境中查看
cat .local_data/orders.json | jq '.[0]'
```

### 6.2 檢查 Enrollment 狀態

```javascript
// 獲取所有 enrollments
const res = await fetch('/api/enroll');
const enrollments = await res.json();
console.table(enrollments.data);
```

### 6.3 追蹤支付歷史

```javascript
async function getPaymentHistory(orderId) {
  const res = await fetch(`/api/orders/${orderId}`);
  const order = (await res.json()).order;
  
  if (order.payments) {
    console.table(order.payments);
  } else {
    console.log('沒有支付記錄');
  }
}
```

---

## 7. 常見問題解決

| 問題 | 原因 | 解決方案 |
|------|------|--------|
| 創建訂單時 401 | 用戶未認證 | 確保用戶已登錄 |
| Enrollment 沒有激活 | enrollmentId 不匹配 | 檢查訂單中的 enrollmentId |
| 支付記錄為空 | 未提供 payment 對象 | PATCH 時包含 payment 對象 |
| 訂單不存在 | 本地文件未保存 | 檢查 .local_data 目錄權限 |

---

## 8. 前端集成檢查清單

- [ ] 用戶可以點擊「購買課程」按鈕
- [ ] 系統自動創建 Enrollment 和 Order
- [ ] 用戶被重定向到支付頁面（或模擬支付）
- [ ] 支付成功後，Enrollment 狀態變為 ACTIVE
- [ ] 用戶可以訪問課程內容
- [ ] 用戶可以查看訂單歷史
- [ ] 管理員可以查看所有訂單
- [ ] 管理員可以修改訂單狀態
- [ ] 支付記錄被正確記錄

---

## 9. 後端部署檢查清單

- [ ] 設置 `DYNAMODB_TABLE_ORDERS` 環境變數
- [ ] 配置 AWS DynamoDB 連接
- [ ] 設置支付網關 Webhook 端點
- [ ] 配置 `NEXT_PUBLIC_BASE_URL`
- [ ] 設置速率限制（推薦）
- [ ] 配置日誌系統
- [ ] 設置支付網關 API 密鑰
- [ ] 測試 Webhook 回調

---

## 10. 數據庫架構

### Orders 表 (DynamoDB)

```
表名: jvtutorcorner-orders
主鍵: orderId (分區鍵)

字段:
- orderId (S): UUID
- userId (S): 用戶 ID
- courseId (S): 課程 ID
- enrollmentId (S): 報名 ID
- status (S): PENDING|PAID|REFUNDED|COMPLETED|CANCELLED
- amount (N): 訂單金額
- currency (S): TWD, USD 等
- createdAt (S): ISO 8601
- updatedAt (S): ISO 8601
- payments (L): 支付記錄列表
- orderNumber (S): 人類可讀編號

全局二級索引 (推薦):
- userId (分區鍵) + createdAt (排序鍵)
- courseId (分區鍵) + createdAt (排序鍵)
- status (分區鍵) + createdAt (排序鍵)
```

---

## 11. 實時監控

### 檢查系統狀態

```javascript
async function checkSystemHealth() {
  try {
    // 測試訂單 API
    const orderRes = await fetch('/api/orders?limit=1');
    const orderOk = orderRes.ok;
    
    // 測試支付 API
    const paymentRes = await fetch('/api/payments/webhook', {
      method: 'POST',
      body: JSON.stringify({ orderId: 'test', status: 'PAID' })
    });
    const paymentOk = paymentRes.status !== 500;
    
    console.log('訂單 API:', orderOk ? '✓' : '✗');
    console.log('支付 API:', paymentOk ? '✓' : '✗');
    
    return orderOk && paymentOk;
  } catch (error) {
    console.error('系統檢查失敗:', error);
    return false;
  }
}
```

---

## 12. 支付網關集成

### 使用真實支付網關時

```javascript
// 1. 創建訂單後，重定向到支付網關
const order = (await createOrder(...)).order;

// Stripe 示例
window.location.href = `https://stripe.com/pay?amount=${order.amount}&orderId=${order.orderId}`;

// ECPay 示例
window.location.href = `https://ecpay.com.tw/checkout?amount=${order.amount}&orderId=${order.orderId}`;

// 2. 支付網關會在支付完成後回調
// POST /api/payments/webhook
// { orderId: "...", status: "PAID", transactionId: "...", ... }

// 3. 系統自動處理訂單和 Enrollment 更新
```

---

## 13. 環境變數配置

```bash
# .env.local

# DynamoDB
DYNAMODB_TABLE_ORDERS=jvtutorcorner-orders
DYNAMODB_TABLE_ENROLLMENTS=jvtutorcorner-enrollments

# AWS SDK
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx

# 應用配置
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NODE_ENV=development

# 支付網關（可選）
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
ECPAY_MERCHANT_ID=...
```

---

## 14. 支援聯絡

對於問題或建議，請參考：
- [完整文檔](./PAYMENT_FLOW_DOCUMENTATION.md)
- [API 詳細文檔](./API_DETAILED_DOCUMENTATION.md)
- [代碼文件](./app/api/orders/)

---

**版本：1.0** | **最後更新：2025-01-11**
