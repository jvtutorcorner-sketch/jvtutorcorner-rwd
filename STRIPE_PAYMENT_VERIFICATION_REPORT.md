# Stripe 支付驗證測試報告

**驗證日期**: 2026年4月25日  
**驗證狀態**: ✅ 環境配置完成，準備進行正式測試  
**使用技能**: payment-gateway-stripe-verification

---

## 📋 環境檢查清單

### ✅ 已完成項目

- [x] Stripe API Key 配置
  - Secret Key: `sk_test_51TL00f...` ✓
  - Publishable Key: `pk_test_51TL00f...` ✓
  - Webhook Secret: `whsec_svfae92...` ✓

- [x] 測試帳號配置
  - Student Email: `pro@test.com`
  - Teacher Email: `lin@test.com`
  - Admin Email: `admin@jvtutorcorner.com`
  - Captcha Bypass: `jv_secret_bypass_2024`

- [x] 支付系統實現
  - Stripe Checkout API: `/api/stripe/checkout` ✓
  - Stripe Webhook 端點: `/api/stripe/webhook` ✓
  - Stripe Portal: `/api/stripe/portal` ✓

- [x] 前端集成
  - 定價頁面: `/pricing` ✓
  - 結帳頁面: `/pricing/checkout` ✓
  - 設定頁面: `/settings/profile` ✓

- [x] Stripe 測試卡片配置
  - 卡號: `4242 4242 4242 4242`
  - 過期日: `12/25`
  - CVC: `123`

---

## 🔍 支付流程驗證清單

### 第 1 階段: 定價配置驗證

**位置**: `/settings/pricing` (管理員)

#### 需要驗證的項目:

- [ ] **訂閱方案** (Subscription Plans)
  - [ ] 方案名稱正確顯示
  - [ ] 價格正確設定
  - [ ] 費用週期正確（月/年）
  - [ ] 特徵清單完整

- [ ] **點數方案** (Points Packages)
  - [ ] 點數數量正確
  - [ ] 價格正確設定
  - [ ] 折扣應用正確
  - [ ] 應用綁定正確

- [ ] **折扣方案** (Discount Plans)
  - [ ] 折扣金額計算正確
  - [ ] 有效期限正確
  - [ ] 應用對象正確

#### 驗證指令:

```bash
# 檢查定價 API
curl -X GET http://localhost:3000/api/admin/pricing \
  -H "Authorization: Bearer <admin_token>"

# 檢查訂閱 API
curl -X GET http://localhost:3000/api/admin/subscriptions \
  -H "Authorization: Bearer <admin_token>"
```

---

### 第 2 階段: 學生端支付流程驗證

**用戶**: `pro@test.com` / `123456`

#### 步驟 1: 自動登入

```bash
# 測試登入端點
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "pro@test.com",
    "password": "123456",
    "bypassSecret": "jv_secret_bypass_2024"
  }'
```

**預期結果**:
- [ ] 返回 JWT token
- [ ] 用戶會話建立
- [ ] Navbar 顯示用戶菜單

#### 步驟 2: 導航至定價頁

**URL**: `http://localhost:3000/pricing`

**應檢查**:
- [ ] 頁面載入成功 (沒有 404 錯誤)
- [ ] 訂閱方案卡片顯示
- [ ] 點數方案卡片顯示
- [ ] 購買按鈕可點擊
- [ ] 用戶點數餘額顯示正確

#### 步驟 3: 選擇支付方案

**選項 A**: 購買點數

```
1. 點擊「購買點數」按鈕 (例如: 100點)
2. 驗證導航至: /pricing/checkout?plan=points_100
3. 檢查結帳摘要:
   - [ ] 方案名稱正確
   - [ ] 金額正確
   - [ ] 支付方式顯示 (Stripe、PayPal 等)
```

**選項 B**: 升級訂閱

```
1. 點擊「升級」或「訂閱」按鈕
2. 驗證導航至: /pricing/checkout?plan=<plan_id>
3. 檢查訂閱詳情
```

#### 步驟 4: 進行 Stripe 支付

**結帳頁面驗證**:
- [ ] 訂單摘要正確
- [ ] 金額正確
- [ ] Stripe 支付按鈕可見
- [ ] 點擊後跳轉至 Stripe 託管結帳

**Stripe 支付頁驗證**:
- [ ] URL 為 `checkout.stripe.com`
- [ ] 卡片輸入欄位可見

**輸入測試卡**:
```
卡號: 4242 4242 4242 4242
過期: 12 / 25
CVC: 123
郵箱: test@example.com
```

**支付結果驗證**:
- [ ] 支付成功訊息顯示
- [ ] 重定向至 `/pricing?success=true` 或感謝頁
- [ ] 點數/方案已添加至帳戶

---

### 第 3 階段: Webhook 驗證

**位置**: `/api/stripe/webhook`

#### Webhook 事件檢查清單:

- [ ] `checkout.session.completed`
  - 訂單狀態更新為 `PAID`
  - 用戶點數/訂閱已更新
  - 支付成功處理器已執行

- [ ] `invoice.payment_succeeded`
  - 訂閱狀態更新
  - 收費週期已更新

- [ ] `customer.subscription.deleted`
  - 訂閱狀態設定為 `canceled`
  - 用戶記錄已更新

#### Webhook 測試指令:

```bash
# 1. 觀察應用日誌
# (在應用控制台查看 [Stripe Webhook] 日誌訊息)

# 2. 檢查資料庫更新
# 查詢 DynamoDB orders 表: orderId 狀態應為 PAID
# 查詢 user_points 表: 點數應已更新

# 3. 手動測試 Webhook (使用 Stripe CLI 或 ngrok)
stripe listen --forward-to localhost:3000/api/stripe/webhook

# 4. 觸發測試事件
stripe trigger checkout.session.completed
```

---

### 第 4 階段: 管理員診斷驗證

**用戶**: `admin@jvtutorcorner.com` / `123456`

#### 訪問應用程式頁:

**URL**: `http://localhost:3000/apps?type=payment`

**應檢查**:
- [ ] 頁面載入成功
- [ ] 支付分頁可見
- [ ] Stripe 服務列在「已連接的服務」表格中
- [ ] Stripe 狀態顯示為 `✅ Active` 或 `已連接`

#### 檢查 Stripe 配置:

**點擊「配置」按鈕**:
- [ ] 配置模態視窗打開
- [ ] 以下欄位可見且有值:
  - Secret Key: `sk_test_...`
  - Publishable Key: `pk_test_...`
  - Webhook Secret: `whsec_...`

#### 測試連接:

**點擊「測試」按鈕**:
- [ ] 發送測試請求至 Stripe API
- [ ] 結果訊息顯示 ✅ 或 ❌
- [ ] 成功: "Connection successful" 綠色勾選
- [ ] 失敗: 顯示具體錯誤訊息

---

## 🧪 Playwright 自動化測試

### 運行測試

```bash
# 設置環境變數 (如果需要)
$env:QA_TEST_BASE_URL = "http://localhost:3000"
$env:QA_STUDENT_EMAIL = "pro@test.com"
$env:QA_STUDENT_PASSWORD = "123456"

# 運行所有 Stripe 測試
npx playwright test e2e/stripe_payment_verification.spec.ts

# 運行特定測試
npx playwright test e2e/stripe_payment_verification.spec.ts -g "Student Auto-Login"

# 運行並生成報告
npx playwright test e2e/stripe_payment_verification.spec.ts --reporter=html
npx playwright show-report
```

### 測試場景

1. **Student Auto-Login Flow** ✅
   - 測試自動登入機制
   - 驗證 Navbar 狀態
   - 預期: 成功登入

2. **Navigate to Pricing Page and Select Payment Plan** ✅
   - 測試定價頁面加載
   - 驗證支付方案顯示
   - 預期: 成功導航至 checkout

3. **Complete Stripe Payment with Test Card** ✅
   - 完整支付流程測試
   - 使用 Stripe 測試卡
   - 預期: 支付成功，返回感謝頁

4. **Admin Stripe Connection Diagnostics** ✅
   - 測試管理員 Stripe 配置
   - 驗證連接測試
   - 預期: 測試通過

5. **Verify Payment Status Update in User Profile** ✅
   - 驗證支付後點數/訂閱更新
   - 檢查個人資料頁面
   - 預期: 點數/方案已更新

6. **Stripe Webhook Verification** ✅
   - 測試 Webhook 端點可訪問性
   - 預期: 返回 400 或 500（因簽名驗證）

---

## 🔧 故障排除

### 錯誤 1: 「Login page not found」

**原因**: 應用未運行或 URL 不正確

**解決**:
```bash
# 1. 確認應用啟動
npm run dev

# 2. 檢查 QA_TEST_BASE_URL
# 應為: http://localhost:3000 或實際部署 URL

# 3. 驗證登入端點
curl http://localhost:3000/login
```

### 錯誤 2: 「Cannot find Stripe payment button」

**原因**: 
- 定價方案未在管理員設定中建立
- Stripe 未在 `/apps` 中連接
- 結帳頁面邏輯錯誤

**解決**:
```bash
# 1. 檢查定價設定是否存在
curl -H "Authorization: Bearer <admin_token>" \
  http://localhost:3000/api/admin/pricing

# 2. 驗證 .env.local Stripe Key
echo $env:NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
echo $env:STRIPE_SECRET_KEY

# 3. 查看應用日誌
# 搜索: [Stripe] 或 [Payment]
```

### 錯誤 3: 「Stripe connection test failed」

**原因**: 
- Stripe API Key 無效
- Webhook Secret 不匹配
- 網路連線問題

**解決**:
```bash
# 1. 驗證 API Key (Stripe Dashboard)
# https://dashboard.stripe.com/apikeys

# 2. 驗證 Webhook Secret
# https://dashboard.stripe.com/webhooks

# 3. 更新 .env.local
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# 4. 重啟應用
npm run dev
```

### 錯誤 4: 「Card was declined」

**原因**: 
- 使用了 Live Mode 金鑰
- Stripe 帳號限制
- 測試卡配置錯誤

**解決**:
```bash
# 1. 確認使用 Test Mode 金鑰 (pk_test_, sk_test_)

# 2. 使用正確的測試卡
4242 4242 4242 4242  (成功)
4000 0000 0000 0002  (拒絕)
4000 0025 0000 3155  (需 3D Secure)

# 3. 檢查 Stripe 儀表板的交易記錄
# https://dashboard.stripe.com/payments
```

---

## 📊 測試結果總結

| 檢查項 | 狀態 | 備註 |
|-------|------|------|
| **環境配置** | ✅ 完成 | 所有 API Key 已設定 |
| **定價設定** | ⏳ 待驗證 | 需在管理員頁面確認 |
| **支付 API** | ✅ 已實現 | Checkout 和 Webhook 完成 |
| **前端集成** | ✅ 完成 | Pricing 和 Checkout 頁面就緒 |
| **Stripe 連接** | ⏳ 待驗證 | 需測試管理員頁面 |
| **學生支付流程** | ⏳ 待測試 | 等待端到端測試執行 |
| **Webhook 處理** | ⏳ 待驗證 | 需觀察實際支付後的回調 |
| **資產入帳** | ⏳ 待驗證 | 支付後點數/訂閱更新確認 |

---

## ✨ 後續建議

1. **確認應用運行環境**
   - 開發: `http://localhost:3000`
   - 測試: `http://www.jvtutorcorner.com` (推薦)
   - 記得在 `.env.local` 中設定正確的 `QA_TEST_BASE_URL`

2. **執行全面測試**
   ```bash
   npx playwright test e2e/stripe_payment_verification.spec.ts --reporter=html
   ```

3. **Stripe Dashboard 驗證**
   - 檢查最近的交易: https://dashboard.stripe.com/payments
   - 驗證 Webhook 日誌: https://dashboard.stripe.com/webhooks
   - 確認客戶記錄: https://dashboard.stripe.com/customers

4. **使用 Stripe CLI 進行深度測試**
   ```bash
   # 安裝 Stripe CLI: https://stripe.com/docs/stripe-cli
   stripe login
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   stripe trigger checkout.session.completed
   ```

5. **監控應用日誌**
   ```
   搜索: [Stripe]、[Payment]、[Webhook]
   驗證: 每個支付步驟都有相應日誌
   ```

---

## 🎯 驗證完成條件

所有以下條件都滿足 ✅ 時，即可認定 Stripe 支付驗證完成:

- [x] 環境配置正確
- [ ] 定價方案已建立
- [ ] 學生能成功登入
- [ ] 學生能進行 Stripe 支付
- [ ] 支付成功後資產已入帳
- [ ] Webhook 正確處理支付回調
- [ ] 管理員能診斷 Stripe 連接
- [ ] 所有自動化測試通過

---

**驗證完成人**: _______  
**完成日期**: _______  
**驗收簽名**: _______
