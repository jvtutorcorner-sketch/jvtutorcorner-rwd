# Stripe API 集成技術文檔

**最後更新**: 2026年4月25日  
**版本**: 1.0  
**狀態**: ✅ 已實現並就緒進行驗證

---

## 📋 目錄

1. [系統架構](#系統架構)
2. [API 端點](#api-端點)
3. [支付流程](#支付流程)
4. [Webhook 處理](#webhook-處理)
5. [錯誤處理](#錯誤處理)
6. [安全考量](#安全考量)
7. [測試指南](#測試指南)

---

## 🏗️ 系統架構

### 整體流程圖

```
┌─────────────────┐
│   Student      │
│   Frontend      │
└────────┬────────┘
         │ 1. 選擇方案
         ↓
┌─────────────────────────────────────────────┐
│  /pricing/checkout                          │
│  - 顯示訂單摘要                             │
│  - 提供支付方式選擇 (Stripe/PayPal/etc)    │
└────────┬────────────────────────────────────┘
         │ 2. 點擊「Stripe 支付」
         ↓
┌─────────────────────────────────────────────┐
│  Frontend 呼叫 /api/stripe/checkout         │
│  - 傳遞: userId, planId, amount, currency  │
└────────┬────────────────────────────────────┘
         │ 3. 建立 Stripe Session
         ↓
┌──────────────────────────────────────────────┐
│  /api/stripe/checkout (Backend)              │
│  - 驗證用戶身份                             │
│  - 取得/建立 Stripe Customer               │
│  - 建立 Checkout Session                    │
│  - 返回 sessionUrl                          │
└────────┬──────────────────────────────────────┘
         │ 4. 返回 sessionUrl
         ↓
┌──────────────────────────────────────────────┐
│  Frontend 重定向至 checkout.stripe.com       │
│  用戶進行支付                               │
└────────┬──────────────────────────────────────┘
         │ 5. 支付成功
         ↓
┌──────────────────────────────────────────────┐
│  Stripe 發送 Webhook Event                   │
│  (checkout.session.completed)                │
└────────┬──────────────────────────────────────┘
         │ 6. Webhook 回調
         ↓
┌──────────────────────────────────────────────┐
│  /api/stripe/webhook (Backend)               │
│  - 驗證簽名                                 │
│  - 更新訂單狀態 (PAID)                     │
│  - 新增點數/激活訂閱                       │
│  - 發送確認郵件                             │
└──────────────────────────────────────────────┘
```

---

## 🔌 API 端點

### 1. 建立結帳 Session

**端點**: `POST /api/stripe/checkout`

**請求體**:
```json
{
  "priceId": "price_1TL00f...",          // 可選：Stripe Price ID（訂閱）
  "amount": 9900,                         // 可選：金額（一次性支付）
  "currency": "TWD",                      // 可選：幣種，預設 TWD
  "userId": "pro@test.com",              // 必需：用戶 ID
  "orderId": "order_123",                // 可選：訂單 ID（用於追蹤）
  "itemName": "100 點數套餐",            // 可選：商品名稱
  "successUrl": "https://...",           // 可選：成功回調 URL
  "cancelUrl": "https://..."             // 可選：取消回調 URL
}
```

**響應**:
```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/pay/cs_test_..."
}
```

**錯誤響應**:
```json
{
  "error": "Missing userId"
}
```

**實現位置**: [`app/api/stripe/checkout/route.ts`](../app/api/stripe/checkout/route.ts)

---

### 2. Webhook 接收端點

**端點**: `POST /api/stripe/webhook`

**請求頭**:
```
stripe-signature: t=1234567890,v1=...
Content-Type: application/json
```

**支持的事件**:

#### a) `checkout.session.completed` (一次性支付/訂閱成功)
```json
{
  "id": "evt_test_...",
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_test_...",
      "mode": "payment",                   // 或 "subscription"
      "payment_status": "paid",
      "customer": "cus_...",
      "subscription": "sub_...",           // 若為訂閱模式
      "amount_total": 9900,                // 金額（美分）
      "metadata": {
        "userId": "pro@test.com",
        "orderId": "order_123"
      }
    }
  }
}
```

#### b) `invoice.payment_succeeded` (訂閱續約)
```json
{
  "type": "invoice.payment_succeeded",
  "data": {
    "object": {
      "subscription": "sub_...",
      "customer": "cus_...",
      "amount_paid": 9900,
      "paid": true
    }
  }
}
```

#### c) `customer.subscription.deleted` (訂閱取消)
```json
{
  "type": "customer.subscription.deleted",
  "data": {
    "object": {
      "id": "sub_...",
      "customer": "cus_...",
      "status": "canceled"
    }
  }
}
```

**實現位置**: [`app/api/stripe/webhook/route.ts`](../app/api/stripe/webhook/route.ts)

---

### 3. Stripe 客戶門戶

**端點**: `POST /api/stripe/portal`

**用途**: 允許用戶自助管理訂閱（更新支付方式、取消訂閱等）

**實現位置**: [`app/api/stripe/portal/route.ts`](../app/api/stripe/portal/route.ts)

---

## 💳 支付流程

### 完整流程步驟

#### 階段 1: 前端發起

```typescript
// 1. 用戶選擇方案並點擊「購買」
const response = await fetch('/api/stripe/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'pro@test.com',
    planId: 'points_100',
    amount: 9900,  // NT$99.00
    currency: 'TWD'
  })
});

const { sessionId, url } = await response.json();

// 2. 重定向至 Stripe 結帳
window.location.href = url;
```

#### 階段 2: 後端處理

```typescript
// /api/stripe/checkout
export async function POST(req: NextRequest) {
  const { userId, amount, currency, orderId, itemName } = await req.json();

  // 2a. 驗證用戶
  if (!userId) return errorResponse('Missing userId');

  // 2b. 取得或建立 Stripe Customer
  let customerId = await getStripeCustomerIdForUser(userId);
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: { userId }
    });
    customerId = customer.id;
    await updateUserStripeCustomerId(userId, customerId);
  }

  // 2c. 建立 Checkout Session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'twd',
        product_data: { name: itemName },
        unit_amount: Math.round(amount)
      },
      quantity: 1
    }],
    success_url: `${baseUrl}/pricing?success=true&orderId=${orderId}`,
    cancel_url: `${baseUrl}/pricing/checkout?plan=${orderId}`,
    metadata: { userId, orderId }
  });

  return NextResponse.json({
    sessionId: session.id,
    url: session.url
  });
}
```

#### 階段 3: Stripe 支付

1. 用戶輸入卡片資訊
2. Stripe 驗證卡片
3. Stripe 處理支付
4. 支付成功 → Stripe 傳送 Webhook

#### 階段 4: Webhook 回調

```typescript
// /api/stripe/webhook
export async function POST(req: NextRequest) {
  // 4a. 驗證 Webhook 簽名
  const sig = req.headers.get('stripe-signature');
  const event = stripe.webhooks.constructEvent(
    rawBody, 
    sig, 
    process.env.STRIPE_WEBHOOK_SECRET
  );

  // 4b. 處理 checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const { metadata, customer, subscription } = event.data.object;
    
    // 4c. 更新訂單狀態
    await updateOrderStatus(metadata.orderId, 'PAID');
    
    // 4d. 新增點數
    await addPointsToUser(metadata.userId, purchasedPoints);
    
    // 4e. 發送確認郵件
    await sendPaymentConfirmationEmail(metadata.userId);
  }

  return NextResponse.json({ received: true });
}
```

---

## 🔔 Webhook 處理

### Webhook 驗證

```typescript
// 使用 Stripe 官方 SDK 驗證簽名
const sig = request.headers.get('stripe-signature');
const event = stripe.webhooks.constructEvent(
  rawBody,                                  // 原始請求體
  sig,                                      // 簽名頭
  process.env.STRIPE_WEBHOOK_SECRET        // Webhook Secret
);
```

### 事件處理流程

#### 1. `checkout.session.completed` - 支付完成

```typescript
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  // 提取元資料
  const { userId, orderId } = session.metadata;
  
  // 更新訂單
  await fetch(`/api/plan-upgrades/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'PAID' })
  });
  
  // 執行支付成功邏輯
  const result = await handlePaymentSuccess({
    orderId,
    paymentMethod: 'stripe',
    amount: session.amount_total / 100
  });
  
  // result.pointsAdded 包含新增的點數
  console.log(`點數已新增: ${result.pointsAdded}`);
}
```

#### 2. `invoice.payment_succeeded` - 訂閱續約

```typescript
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription;
  const customerId = invoice.customer;
  
  // 更新訂閱資訊
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const user = await getUserByStripeCustomerId(customerId);
  
  await updateUserProfile(user.id, {
    subscriptionStatus: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000)
  });
}
```

#### 3. `customer.subscription.deleted` - 訂閱取消

```typescript
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const user = await getUserByStripeCustomerId(subscription.customer);
  
  await updateUserProfile(user.id, {
    subscriptionStatus: 'canceled',
    cancelAtPeriodEnd: false
  });
}
```

### Webhook 配置（Stripe Dashboard）

1. 進入 **Developers → Webhooks**
2. 點擊「Add endpoint」
3. 設定端點: `https://your-domain.com/api/stripe/webhook`
4. 選擇事件:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `customer.subscription.deleted`
5. 複製 **Signing secret** 至 `.env.local`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

---

## ❌ 錯誤處理

### 常見錯誤及解決方案

#### 錯誤 1: 「Invalid API Key」

```
原因: STRIPE_SECRET_KEY 不正確或過期
解決:
1. 進入 Stripe Dashboard
2. 導航至 Developers → API Keys
3. 複製 Secret Key (sk_test_...)
4. 更新 .env.local
5. 重啟應用
```

#### 錯誤 2: 「Webhook signature verification failed」

```
原因: STRIPE_WEBHOOK_SECRET 不匹配
解決:
1. 進入 Stripe Dashboard → Webhooks
2. 找到對應的端點
3. 點擊「Reveal」顯示 Signing secret
4. 複製並更新 .env.local 中的 STRIPE_WEBHOOK_SECRET
5. 重啟應用
```

#### 錯誤 3: 「Payment Intent Requires Action」

```
原因: 需要 3D Secure 驗證
解決:
- 使用測試卡: 4000 0025 0000 3155
- 用戶需要完成額外驗證步驟
```

#### 錯誤 4: 「Customer Not Found」

```
原因: 用戶尚未建立 Stripe Customer
解決: 自動建立（在 /api/stripe/checkout 中實現）
```

### 錯誤回應格式

```json
{
  "error": "具體錯誤訊息",
  "code": "stripe_error_code",
  "type": "card_error|api_error|rate_limit_error|authentication_error"
}
```

---

## 🔐 安全考量

### 1. 驗證 Webhook 簽名

```typescript
// ✅ 正確做法
const event = stripe.webhooks.constructEvent(rawBody, sig, secret);

// ❌ 錯誤做法
const event = JSON.parse(req.body);  // 容易被偽造！
```

### 2. 環境變數管理

```env
# ✅ Test Mode (開發/測試)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# ❌ 永遠不要在 Live Mode 測試
# STRIPE_SECRET_KEY=sk_live_...
```

### 3. 驗證用戶身份

```typescript
// ✅ 確保 userId 來自認證會話
const userId = getCurrentUserId(req);  // 從認證 Token
if (!userId) return unauthorized();

// ❌ 不要信任客戶端提供的 userId
const userId = req.body.userId;  // 易被偽造
```

### 4. 幂等性處理

```typescript
// 同一筆 Webhook 可能被多次傳遞
// 使用 orderId 作為幂等鍵

async function handlePayment(orderId) {
  // 檢查是否已處理
  const existing = await getOrder(orderId);
  if (existing?.status === 'PAID') {
    return; // 已處理，忽略
  }
  
  // 處理支付
  await updateOrder(orderId, { status: 'PAID' });
}
```

---

## 🧪 測試指南

### 測試卡號

| 情景 | 卡號 | 結果 |
|------|------|------|
| 成功支付 | 4242 4242 4242 4242 | ✅ 成功 |
| 3D Secure | 4000 0025 0000 3155 | 需驗證 |
| 被拒絕 | 4000 0000 0000 0002 | ❌ 拒絕 |
| 過期卡 | 4000 0000 0000 0010 (2020) | ❌ 過期 |

### 本地 Webhook 測試

#### 方法 1: Stripe CLI

```bash
# 1. 安裝 Stripe CLI
# https://stripe.com/docs/stripe-cli

# 2. 登入
stripe login

# 3. 監聽 Webhook
stripe listen --forward-to localhost:3000/api/stripe/webhook

# 4. 觸發測試事件
stripe trigger checkout.session.completed

# 5. 檢查應用日誌
# 搜索: [Stripe Webhook]
```

#### 方法 2: ngrok (用於公網訪問)

```bash
# 1. 安裝 ngrok
# https://ngrok.com/

# 2. 啟動隧道
ngrok http 3000

# 3. 取得 ngrok URL (e.g., https://abc123.ngrok.io)

# 4. 在 Stripe Dashboard 更新 Webhook 端點
# https://abc123.ngrok.io/api/stripe/webhook

# 5. 測試支付流程
```

### 自動化測試

```bash
# 執行 Playwright 測試
npx playwright test e2e/stripe_payment_verification.spec.ts

# 生成 HTML 報告
npx playwright show-report
```

---

## 📊 監控與調試

### 應用日誌

搜索關鍵字:

```
[Stripe Checkout]   - 建立結帳 Session
[Stripe Webhook]    - Webhook 事件處理
[Payment Success]   - 支付成功邏輯
[Error]             - 錯誤訊息
```

### Stripe Dashboard 檢查

1. **最近交易**: https://dashboard.stripe.com/payments
2. **客戶記錄**: https://dashboard.stripe.com/customers
3. **Webhook 日誌**: https://dashboard.stripe.com/webhooks
4. **API 金鑰驗證**: https://dashboard.stripe.com/apikeys

### 資料庫檢查

```bash
# 檢查訂單狀態
aws dynamodb get-item \
  --table-name jvtutorcorner-orders \
  --key '{"orderId": {"S": "order_123"}}' \
  --region ap-northeast-1

# 檢查用戶點數
aws dynamodb get-item \
  --table-name jvtutorcorner-user-points \
  --key '{"userId": {"S": "pro@test.com"}}' \
  --region ap-northeast-1
```

---

## 🚀 部署檢查清單

- [ ] `.env` 已設定正確的 Stripe Key
- [ ] Stripe Webhook 已在 Stripe Dashboard 配置
- [ ] STRIPE_WEBHOOK_SECRET 已複製至環境變數
- [ ] NEXT_PUBLIC_PAYMENT_MOCK_MODE=false (使用真實支付)
- [ ] 所有 API 端點可訪問
- [ ] SSL/HTTPS 已啟用
- [ ] 應用日誌已配置
- [ ] 資料庫連接正常
- [ ] 完整流程測試通過

---

## 📞 支援

**Stripe 文檔**: https://stripe.com/docs  
**API 參考**: https://stripe.com/docs/api  
**常見問題**: https://stripe.com/docs/faq

---

**版本**: 1.0  
**最後更新**: 2026年4月25日  
**檢查者**: _____________
