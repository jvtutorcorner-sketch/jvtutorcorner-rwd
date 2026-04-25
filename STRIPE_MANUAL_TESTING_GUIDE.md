# Stripe 支付測試手冊 (Manual Testing Guide)

此文件提供逐步的手動測試指南，適用於在本地開發環境中進行 Stripe 支付驗證。

---

## 📋 準備階段

### 1. 確認環境配置

```bash
# 檢查 .env.local 是否有 Stripe 配置
Get-Content .env.local | Select-String "STRIPE"

# 應該看到:
# STRIPE_WEBHOOK_SECRET=whsec_...
# STRIPE_SECRET_KEY=sk_test_...
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
# NEXT_PUBLIC_PAYMENT_MOCK_MODE=false (確保是 false，使用真實支付)
```

### 2. 啟動開發應用

```bash
# 確保在工作區目錄
cd D:\jvtutorcorner-rwd

# 啟動開發伺服器
npm run dev

# 應該看到:
# > Ready in 3.5s
# - Local: http://localhost:3000
```

### 3. 開啟瀏覽器

打開 **Google Chrome** 或 **Edge** (推薦用於開發者工具):
- URL: `http://localhost:3000`

---

## 🔐 測試場景 1: 學生自動登入

### 步驟

1. **導航至登入頁**
   ```
   URL: http://localhost:3000/login
   ```

2. **填入登入資訊**
   ```
   Email:    pro@test.com
   Password: 123456
   驗證碼:    jv_secret_bypass_2024
   ```

3. **點擊「登入」**
   - 觀察頁面跳轉
   - 檢查 DevTools Console 是否有錯誤

### 驗證檢查

- [ ] 成功導航至首頁或儀表板
- [ ] Navbar 顯示用戶名稱
- [ ] 不出現 401/403 錯誤
- [ ] 無 console 錯誤

---

## 💳 測試場景 2: 瀏覽定價頁面

### 步驟

1. **導航至定價頁**
   ```
   URL: http://localhost:3000/pricing
   ```

2. **觀察頁面內容**
   - 滾動查看所有方案
   - 檢查卡片是否正確顯示

### 驗證檢查

- [ ] 頁面載入成功（沒有白屏或錯誤）
- [ ] 見到至少 2 個方案卡片
- [ ] 卡片顯示：
  - [ ] 方案名稱
  - [ ] 價格
  - [ ] 功能列表
  - [ ] 購買按鈕
- [ ] 用戶點數餘額顯示（登入後）

### 調試

如果頁面未載入:

```bash
# 1. 檢查瀏覽器 DevTools (F12)
# - Console 標籤: 查看錯誤訊息
# - Network 標籤: 查看 /api/admin/pricing 是否 200

# 2. 檢查應用日誌
# - 搜索: "pricing" 或 "Failed"

# 3. 驗證定價 API
curl -X GET http://localhost:3000/api/admin/pricing
```

---

## 🛒 測試場景 3: 購買點數

### 步驟

1. **在定價頁點擊「購買點數」**
   - 選擇任意點數套餐（例如 100 點）
   - 點擊「購買點數」按鈕

2. **應重定向至結帳頁**
   ```
   預期 URL: http://localhost:3000/pricing/checkout?plan=points_100
   ```

3. **檢查結帳摘要**
   - [ ] 方案名稱: "100 點"
   - [ ] 金額: "NT$ xxx"
   - [ ] 支付方式選項可見

4. **選擇 Stripe 支付**
   - 尋找「Stripe」或「使用 Stripe 支付」按鈕
   - 點擊該按鈕

### 驗證檢查

- [ ] 成功導航至結帳頁面
- [ ] 訂單摘要信息正確
- [ ] Stripe 支付按鈕可見
- [ ] 點擊後頁面跳轉或打開 modal

### 常見問題

**問題**: 找不到「購買點數」按鈕
```
可能原因:
1. 定價方案未在管理員頁面設定
2. 方案未標記為 isActive=true
3. 頁面加載不完全

解決:
1. 進入 /settings/pricing (以 Admin 帳號)
2. 確認至少有一個「點數方案」已啟用
3. 刷新 /pricing 頁面
```

**問題**: 結帳頁面顯示「Error」或空白
```
可能原因:
1. plan 參數無效
2. 點數方案配置錯誤

解決:
1. 檢查 console 錯誤訊息
2. 檢查 /api/admin/pricing 返回的方案 ID
3. 確保方案 ID 與 URL 參數相符
```

---

## 💰 測試場景 4: 完成 Stripe 支付

### 步驟

1. **點擊「前往 Stripe 支付」**
   - 如果打開新視窗，請聚焦到新視窗
   - 如果是 modal，請在 modal 中操作

2. **等待 Stripe 結帳頁加載**
   - 應該看到 Stripe 標誌
   - 預期 URL 包含 `checkout.stripe.com` 或類似

3. **填入卡片資訊**

   **卡號欄**:
   ```
   4242 4242 4242 4242
   ```

   **過期日期欄**:
   ```
   12 / 25
   ```

   **CVC 欄**:
   ```
   123
   ```

   **郵箱欄** (如果要求):
   ```
   test@example.com
   ```

   **名稱欄** (如果要求):
   ```
   Test User
   ```

4. **點擊「Pay」或「Subscribe」**
   - 等待處理（通常 2-3 秒）

### 驗證檢查

- [ ] Stripe 結帳頁成功加載
- [ ] 卡片欄位接受輸入
- [ ] 點擊支付後頁面跳轉
- [ ] 看到成功訊息（「Thank you」、「支付成功」等）

### 成功標誌

✅ **完整流程成功**:
```
1. 回到應用頁面
2. URL 顯示: /pricing?success=true 或類似
3. 看到「支付成功」訊息
4. 如無立即顯示，檢查個人資料頁面中點數是否已更新
```

### 調試

如果支付失敗:

```bash
# 1. 檢查 Stripe Dashboard
# https://dashboard.stripe.com/payments
# - 查找最近的交易
# - 確認狀態是否為 failed 或 incomplete

# 2. 檢查 DevTools
# - Console: 查看錯誤訊息
# - Network: 查看 /api/stripe/checkout 是否返回正確的 sessionUrl

# 3. 查看應用日誌
# 搜索: [Stripe] 或 checkout
# 驗證是否有錯誤訊息

# 4. 測試 Stripe 連接
curl -X POST http://localhost:3000/api/stripe/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 99,
    "currency": "TWD",
    "userId": "pro@test.com",
    "itemName": "Test Points"
  }'
```

---

## 📊 測試場景 5: 驗證點數入帳

### 步驟

1. **支付完成後，導航至設定**
   ```
   URL: http://localhost:3000/settings/profile
   ```

2. **檢查點數餘額**
   - 尋找「點數」或「Points」項目
   - 檢查數字是否增加

3. **與購買量對比**
   ```
   購買: 100 點
   原始餘額: 50 點
   預期新餘額: 150 點
   ```

### 驗證檢查

- [ ] 點數餘額已更新
- [ ] 增加的點數 = 購買的點數
- [ ] 無出現負數或異常值

### 查詢資料庫

如果 UI 未更新，檢查資料庫:

```bash
# 使用 AWS CLI 查詢 DynamoDB
aws dynamodb get-item \
  --table-name jvtutorcorner-user-points \
  --key '{"userId": {"S": "pro@test.com"}}' \
  --region ap-northeast-1
```

---

## 👨‍💼 測試場景 6: 管理員診斷

### 步驟

1. **以 Admin 帳號登入**
   ```
   Email:    admin@jvtutorcorner.com
   Password: 123456
   驗證碼:    jv_secret_bypass_2024
   ```

2. **導航至應用程式頁**
   ```
   URL: http://localhost:3000/apps?type=payment
   ```

3. **尋找 Stripe 服務**
   - 在表格中找到「Stripe」列
   - 檢查狀態欄

4. **點擊「配置」按鈕**
   - 應彈出配置 modal
   - 驗證欄位:
     - [ ] Webhook Secret (whsec_...)
     - [ ] Secret Key (sk_test_...)
     - [ ] Publishable Key (pk_test_...)

5. **點擊「測試」按鈕**
   - 系統發送測試請求至 Stripe
   - 等待結果

### 驗證檢查

- [ ] Stripe 服務列在表格中
- [ ] 狀態顯示為「✅ Active」或「已連接」
- [ ] 配置值不為空
- [ ] 測試結果顯示 ✅ 或相關訊息

### 故障排除

**測試失敗**:
```
可能的錯誤訊息:
1. "Invalid API Key"
   → 檢查 STRIPE_SECRET_KEY 是否正確
   → 確認使用 sk_test_，不是 sk_live_

2. "Webhook Secret mismatch"
   → 檢查 STRIPE_WEBHOOK_SECRET 是否正確
   → 從 Stripe Dashboard 複製最新的值

3. "Connection timeout"
   → 檢查網路連接
   → 稍候後重試
   → 查看 Stripe 服務狀態: https://status.stripe.com/
```

---

## 🔍 檢查清單

### 完整支付流程驗證清單

```
【準備階段】
☐ 應用已啟動 (npm run dev)
☐ 訪問 http://localhost:3000 正常
☐ 瀏覽器開發者工具已打開 (F12)

【登入階段】
☐ 能使用 pro@test.com 登入
☐ Navbar 顯示用戶訊息
☐ 無 console 錯誤

【定價頁面】
☐ /pricing 頁面加載
☐ 至少看到 2 個方案卡片
☐ 每個卡片顯示完整信息
☐ 購買按鈕可點擊

【結帳頁面】
☐ 成功導航至 /pricing/checkout?plan=...
☐ 訂單摘要顯示正確
☐ Stripe 支付按鈕可見

【支付流程】
☐ Stripe 結帳頁成功加載
☐ 卡片資訊輸入成功
☐ 支付完成並返回應用
☐ 看到成功訊息

【後續驗證】
☐ 點數已在個人資料更新
☐ Webhook 已記錄 (查看日誌)
☐ 訂單狀態為 PAID

【管理員驗證】
☐ 以 Admin 帳號進入 /apps
☐ Stripe 連接測試通過
☐ 配置資訊正確完整
```

---

## 📝 測試結果記錄

在執行完整流程後，記錄以下信息:

```
測試日期: _______________
測試環境: _______________
測試帳號: pro@test.com

1. 登入成功: ☐ 是  ☐ 否
2. 定價頁面: ☐ 正常  ☐ 有問題
3. 支付流程: ☐ 成功  ☐ 失敗
4. 點數入帳: ☐ 已更新  ☐ 未更新
5. 管理員診斷: ☐ 通過  ☐ 失敗

問題/錯誤訊息:
____________________________________________
____________________________________________

解決方案:
____________________________________________
____________________________________________

簽名: ________________  日期: ______________
```

---

## 🆘 快速故障排除

| 問題 | 可能原因 | 解決方案 |
|------|--------|--------|
| 無法登入 | 密碼錯誤/帳號不存在 | 檢查 .env.local 中的 QA_STUDENT_EMAIL |
| 定價頁空白 | API 失敗 | 檢查 /api/admin/pricing 是否返回資料 |
| 找不到購買按鈕 | 方案未啟用 | 進入 /settings/pricing 建立或啟用方案 |
| Stripe 按鈕不存在 | Stripe 未連接 | 進入 /apps 確認 Stripe 為 Active |
| 支付失敗「Card declined」| 使用了 Live 金鑰 | 確認使用 Test Mode (pk_test_, sk_test_) |
| 支付成功但點數未更新 | Webhook 失敗 | 查看應用日誌 [Stripe Webhook] |

---

## 📚 相關資源

- **Stripe Dashboard**: https://dashboard.stripe.com
- **Stripe API 文檔**: https://stripe.com/docs
- **應用 API 文檔**: `/api/stripe/checkout`、`/api/stripe/webhook`
- **管理員定價設定**: `http://localhost:3000/settings/pricing`

---

**最後更新**: 2026年4月25日  
**驗證人**: _____________  
**簽名**: _____________
