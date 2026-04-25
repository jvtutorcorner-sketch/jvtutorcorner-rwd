# LINE Pay 支付流程 - 故障排除指南 (已修正)

## 📋 完整的支付流程

```
1️⃣ 客戶端選擇方案
   └─ 訪問 /pricing 頁面
      └─ 選擇點數套餐或訂閱方案
         └─ 點擊「前往結帳」

2️⃣ 結帳頁面 (/pricing/checkout)
   ├─ 驗證用戶已登入 ✓
   ├─ 加載方案詳情 ✓
   ├─ 創建訂單 (POST /api/plan-upgrades) ✓
   └─ 選擇支付方法

3️⃣ 支付處理
   ├─ LINE Pay → LINE Pay Sandbox
   ├─ ECPay → ECPay Sandbox  
   ├─ Stripe → Stripe Checkout
   └─ PayPal → PayPal Sandbox

4️⃣ 支付確認 (🟢 已修正)
   ├─ 標記訂單為 PAID
   ├─ 🟢 新增: 添加點數到用戶帳戶 (如果 itemType='POINTS')
   ├─ 更新訂單狀態為 COMPLETED
   └─ 重定向到成功頁面

5️⃣ 管理員驗證
   ├─ 訪問 /admin/payments
   ├─ 查看收款清單
   └─ 驗證交易詳情
```

## 🔧 常見問題和解決方案

### ❌ 問題 1: 支付成功後點數未入帳

**症狀**:
- 用戶完成支付
- 看到成功頁面
- 但點數餘額未增加

**根本原因** (已修正):
- 舊版本: 支付確認端點只標記訂單為 PAID，沒有調用 `/api/points` 添加點數

**修正內容**:
- ✅ `/api/linepay/confirm` - 支付成功後調用 `handlePaymentSuccess()`
- ✅ `/api/ecpay/return` - 支付成功後調用 `handlePaymentSuccess()`
- ✅ `/api/stripe/webhook` - 結帳完成後調用 `handlePaymentSuccess()`
- ✅ `/api/paypal/capture-order` - 捕獲成功後調用 `handlePaymentSuccess()`

**檢查方法**:
```bash
# 1. 查看瀏覽器開發者工具 (F12) Console
# 應該看到: "[Line Pay Confirm] Payment success handler completed. Points added: 500"

# 2. 檢查 /admin/payments 列表
# 訂單應該顯示為 PAID 或 COMPLETED

# 3. 查詢用戶點數
curl "http://localhost:3000/api/points?userId=pro@test.com"
# 應返回增加後的點數餘額
```

### ❌ 問題 2: LINE Pay 沙箱支付不顯示

**症狀**:
- 點擊「使用 LINE Pay 支付」按鈕
- 沒有跳轉到 LINE Pay 頁面

**檢查清單**:
```
□ 確認 NEXT_PUBLIC_PAYMENT_MOCK_MODE=false (.env.local)
□ 確認 LINEPAY_CHANNEL_ID 正確設定
□ 確認 LINEPAY_CHANNEL_SECRET_KEY 正確設定
□ 檢查瀏覽器 Console 有無錯誤
□ 檢查開發伺服器日誌
```

**解決步驟**:
```bash
# 1. 驗證環境變數
grep "LINEPAY" .env.local | grep -v "^#"

# 2. 查看開發伺服器日誌
# 應看到: "[linepay checkout API] Requesting payment..."

# 3. 如果仍有問題，啟用 mock 模式測試
echo "NEXT_PUBLIC_PAYMENT_MOCK_MODE=true" >> .env.local
npm run dev  # 重啟開發伺服器
```

### ❌ 問題 3: 訂單狀態未更新為 COMPLETED

**症狀**:
- 支付成功
- 點數已添加
- 但訂單狀態仍為 PAID (不是 COMPLETED)

**可能原因**:
- DynamoDB 更新失敗
- 數據庫連接問題

**檢查方法**:
```bash
# 查看支付記錄表
aws dynamodb scan --table-name jvtutorcorner-orders \
  --filter-expression "orderId = :id" \
  --expression-attribute-values "{\":id\": {\"S\": \"<orderId>\"}}"

# 查看狀態字段是否為 "COMPLETED"
```

**修正步驟**:
```bash
# 手動更新訂單狀態
aws dynamodb update-item \
  --table-name jvtutorcorner-orders \
  --key "{\"orderId\": {\"S\": \"<orderId>\"}}" \
  --update-expression "SET #st = :s" \
  --expression-attribute-names "{\"#st\": \"status\"}" \
  --expression-attribute-values "{\":s\": {\"S\": \"COMPLETED\"}}"
```

### ❌ 問題 4: 管理員看不到支付記錄

**症狀**:
- 登入 /admin/payments
- 列表為空或沒有最近的交易

**檢查清單**:
```
□ 確認已使用管理員帳號登入
□ 確認訂單已標記為 PAID/COMPLETED
□ 確認用戶 ID 正確
□ 確認日期篩選範圍正確
```

**檢查管理員權限**:
```bash
# 查看管理員帳號
grep "admin" .env.local

# 登入後驗證角色
curl "http://localhost:3000/api/profile" \
  -H "Cookie: <session-cookie>"
# 應返回 role: "admin"
```

### ❌ 問題 5: 支付金額計算錯誤

**症狀**:
- 管理員看到的金額與客戶支付金額不符
- 啟用應用方案時金額異常

**可能原因**:
- 應用方案扣點邏輯未正確計算
- prePurchasePointsCost 未扣除

**檢查方法**:
```javascript
// 在 /pricing/checkout/page.tsx 中
const netPoints = Math.max(0, points - (itemData?.prePurchasePointsCost || 0));
console.log(`Gross: ${points}, PreCost: ${itemData?.prePurchasePointsCost}, Net: ${netPoints}`);
```

**修正**:
- 確認 prePurchasePointsCost 在購買時正確傳遞
- 驗證 DynamoDB 中的 points 字段正確

## 📊 測試檢查清單

### Phase 1: 模擬模式測試 (30 秒)
```
□ NEXT_PUBLIC_PAYMENT_MOCK_MODE=true
□ 運行: npx playwright test e2e/line_pay_simulated.spec.ts
□ 預期: ✓ 2 passed
□ 驗證: 重定向到 /settings/billing?success=true
```

### Phase 2: 實際支付測試 (2-3 分鐘)
```
□ NEXT_PUBLIC_PAYMENT_MOCK_MODE=false
□ 訪問 /login
└─ 使用: pro@test.com / 123456

□ 進入 /pricing
└─ 選擇點數套餐

□ 選擇 LINE Pay 支付
└─ 完成沙箱支付流程
    └─ 卡號: 4111111111111111
    └─ 期限: 12/25 (任何未來日期)
    └─ CVV: 123

□ 驗證返回成功頁面
□ 檢查點數已增加
□ 檢查 /admin/payments 已記錄交易
```

### Phase 3: 管理員驗證 (2 分鐘)
```
□ 登入 /login
└─ 使用: admin@jvtutorcorner.com / 123456

□ 進入 /admin/payments
□ 篩選: 狀態 = PAID, 支付方式 = LINE Pay
□ 驗證項目:
  □ 訂單 ID 正確
  □ 金額正確
  □ 用戶 ID 正確
  □ 支付方式: LINE Pay
  □ 交易時間: 最近
  □ 點擊「查看詳情」能進入訂單頁面
```

## 🚨 Critical API Endpoints

### 支付成功處理 Flow
```
1. Payment Provider (LINE Pay/ECPay/Stripe/PayPal)
   ↓
2. 支付確認端點 (/api/linepay/confirm | /api/ecpay/return | etc)
   ├─ 驗證支付成功
   ├─ 標記訂單為 PAID
   ├─ 調用 handlePaymentSuccess()
   │  ├─ 獲取訂單詳情
   │  ├─ 檢查 itemType
   │  ├─ 如果 itemType='POINTS': 調用 setUserPoints()
   │  └─ 標記訂單為 COMPLETED
   └─ 重定向到成功頁面
   ↓
3. 用戶頁面 (/settings/billing)
   ├─ 顯示成功訊息
   ├─ 點數餘額已更新
   └─ 可查看交易歷史
```

## 📝 日誌查看

### 查看支付成功日誌
```bash
# 開發伺服器輸出應包含:
# [Line Pay Confirm] Mock Mode Active - Confirming [orderId]
# [Line Pay Confirm] Capture Success: {...}
# [Payment Success Handler] Processing orderId: [orderId]
# [Payment Success Handler] Successfully added 500 points to pro@test.com
```

### 查看管理員操作日誌
```bash
# Amplify Logs (生產環境)
amplify logs backend -f api

# CloudWatch Logs (AWS Console)
# 搜尋: "[Payment Success Handler]" 或 "[Line Pay Confirm]"
```

## 🔗 相關文件

- [LINEPAY_PAYMENT_TESTING_GUIDE.md](LINEPAY_PAYMENT_TESTING_GUIDE.md) - 詳細測試指南
- [PAYMENT_FLOW_DOCUMENTATION.md](PAYMENT_FLOW_DOCUMENTATION.md) - 支付流程文檔
- [lib/paymentSuccessHandler.ts](lib/paymentSuccessHandler.ts) - 支付成功處理器
- [app/api/linepay/confirm/route.ts](app/api/linepay/confirm/route.ts) - LINE Pay 確認端點
- [app/api/ecpay/return/route.ts](app/api/ecpay/return/route.ts) - ECPay 回調端點
- [app/api/stripe/webhook/route.ts](app/api/stripe/webhook/route.ts) - Stripe Webhook 端點
- [app/api/paypal/capture-order/route.ts](app/api/paypal/capture-order/route.ts) - PayPal 確認端點

## ✅ 修正總結

| 項目 | 狀態 | 說明 |
|-----|------|------|
| **支付成功點數入帳** | ✅ 已修正 | 所有支付方式都會在支付成功後自動添加點數 |
| **LINE Pay** | ✅ 已修正 | `/api/linepay/confirm` 添加 `handlePaymentSuccess()` |
| **ECPay** | ✅ 已修正 | `/api/ecpay/return` 添加 `handlePaymentSuccess()` |
| **Stripe** | ✅ 已修正 | `/api/stripe/webhook` 添加 `handlePaymentSuccess()` |
| **PayPal** | ✅ 已修正 | `/api/paypal/capture-order` 添加 `handlePaymentSuccess()` |
| **通用處理器** | ✅ 已創建 | `lib/paymentSuccessHandler.ts` 集中管理邏輯 |
| **故障排除指南** | ✅ 已更新 | 本文檔 |
