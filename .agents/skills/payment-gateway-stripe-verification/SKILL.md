---
name: payment-gateway-stripe-verification
description: '測試 Stripe 支付流程——包括學生端在 /pricing 頁面的支付測試，以及管理員在 /apps 頁面的 Stripe 服務連線診斷。'
argument-hint: '執行 Stripe 支付測試流程，包含故障診斷'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-04-30'
  architecture-aligned: true
  notes: '環境配置已統一至 lib/envConfig.ts (APP_ENV switch)'
---

# Stripe 支付整合驗證技能 (Stripe Payment Integration Skill)

此技能用於驗證 Stripe 支付系統的完整流程，包括學生端的支付操作與管理員端的服務連線設定診斷。

## 功能概述

### 學生端流程
1. **自動登入**：以 Student 帳號登入平台
2. **導航至定價頁**：進入 `/pricing` 頁面
3. **選擇並支付**：選擇點數套餐或訂閱方案，點擊「購買」或「訂閱」按鈕
4. **Stripe 支付**：跳轉至 Stripe 託管結帳頁面，完成支付
5. **驗證成功**：確認支付成功並檢查資產入帳

### 管理員端診斷（當學生端支付失敗時）
1. **管理員登入**：以 Admin 帳號登入平台
2. **訪問應用程式頁**：進入 `/apps` 頁面或 `/apps?type=payment`
3. **檢查 Stripe 連線**：在「已連接的服務」表格中找到 Stripe 服務
4. **查看服務詳情**：點擊詳細或配置按鈕，檢查 Stripe API Key 設定
5. **測試連線**：使用內建的「測試」功能驗證 Stripe 連接狀態
6. **調整設定**：根據測試結果調整 API Key 或其他設定

## 環境驗證 (Environment Validation)

### 1. 必要環境變數

**⭐ NEW (2026-04-30): 環境配置統一**

在 `.env.local` 中確認以下變數：

```bash
# 🔑 環境開關 (所有金流由此決定 sandbox/live)
APP_ENV=local  # local = 沙盒, production = 正式

# Stripe 公鑰與祕鑰
# 注意: Stripe 自動從金鑰前綴判斷環境 (sk_test_* vs sk_live_*)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<YOUR_STRIPE_PUBLISHABLE_KEY>
STRIPE_SECRET_KEY=<YOUR_STRIPE_SECRET_KEY>  # APP_ENV=local 時需使用 test key

# Webhook 密鑰（用於驗證 Stripe 回調）
STRIPE_WEBHOOK_SECRET=<YOUR_STRIPE_WEBHOOK_SECRET>

# 測試帳號
TEST_STUDENT_EMAIL=<YOUR_TEST_STUDENT_EMAIL>
TEST_STUDENT_PASSWORD=<YOUR_PASSWORD>
ADMIN_EMAIL=<YOUR_ADMIN_EMAIL>
ADMIN_PASSWORD=<YOUR_PASSWORD>

# 登入繞過（僅限 local/e2e）
LOGIN_BYPASS_SECRET=<YOUR_BYPASS_SECRET>
# NEXT_PUBLIC_LOGIN_BYPASS_SECRET=<YOUR_BYPASS_SECRET>  # 僅舊版流程相容，預設不建議啟用

# 基礎 URL
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**⚠️ 重要**：啟動時若 `APP_ENV=production` 搭配 `sk_test_*` 金鑰，會立即報錯。確保配置一致。

### 2. 必要檢查清單
- [ ] Stripe 帳戶已建立，且處於 Test Mode（不是 Live Mode）
- [ ] Stripe API Keys 已在 `.env.local` 中設定
- [ ] Stripe Webhook 已在平台註冊（見下方 Webhook 設置）
- [ ] 測試用點數套餐或訂閱方案已在 `/settings/pricing` 中設定
- [ ] Stripe 已在 `/apps` 頁面連接
- [ ] 資料庫中存在測試學生帳號

### 3. Stripe Webhook 設置
在 Stripe Dashboard 中：
1. 進入 **Developers → Webhooks**
2. 點擊「Add endpoint」
3. 設定 Webhook URL：`https://your-domain.com/api/stripe/webhook`
4. 選擇事件：
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
5. 複製 Webhook Secret 至 `.env.local` 的 `STRIPE_WEBHOOK_SECRET`

## 學生端測試流程 (Student Payment Flow)

### 步驟 1：自動登入
```
1. 開啟測試瀏覽器
2. 導航至 /login
3. Email 輸入欄填入：TEST_STUDENT_EMAIL 對應值
4. Password 輸入欄填入：TEST_STUDENT_PASSWORD 對應值
5. 驗證碼欄位填入：LOGIN_BYPASS_SECRET 對應值（僅限 local/e2e）
6. 點擊「登入」按鈕
7. 等待頁面導航至首頁或儀表板
8. 確認 Navbar 顯示「個人設定」等 Student 選項
```

### 步驟 2：導航至定價頁
```
1. 直接在 URL 欄輸入：/pricing
2. 或從 Navbar 點擊「方案與價格」
3. 等待頁面加載完成
4. 確認頁面顯示：
   - 點數套餐卡片（Points Packages）
   - 訂閱方案卡片（Subscription Plans）
```

### 步驟 3：選擇支付方案
```
1. 在「點數套餐」或「訂閱方案」區塊中選擇一個方案
   ⚠️ 注意：優先選擇金額較小的套餐以減少測試成本（如 $9.99 或 100 點）
   
2. 點擊「購買」或「訂閱」按鈕
   - 如果出現結帳頁面 (/pricing/checkout)，進入步驟 4
   - 如果直接跳轉到 Stripe，跳至步驟 5
```

### 步驟 4：結帳頁面 (/pricing/checkout)
```
1. 確認訂單摘要：
   - 方案名稱
   - 金額（USD 或 TWD，取決於設定）
   - 支付方式選項（Stripe、PayPal、ECPay 等）

2. 選擇「Stripe」作為支付方式

3. 點擊「前往 Stripe 支付」或「Complete Payment」按鈕
   - 等待頁面重新加載
   - 確認已跳轉至 Stripe 託管結帳頁面（URL 變為 checkout.stripe.com 或相似）
```

### 步驟 5：Stripe 支付頁面
```
1. 在 Stripe 託管結帳頁面上填入測試卡資訊：

   💳 TEST 卡號：4242 4242 4242 4242
   📅 過期日期：任意未來日期（如 12/25）
   🔒 CVC：任意 3 位數字（如 123）
   📧 Email：任意測試郵箱（如 test@example.com）

2. 檢查頁面是否要求其他資訊（如帳單地址）
   - 若需要，填入任意有效地址（國家、城市、郵編等）

3. 點擊「Pay」或類似的支付確認按鈕

4. 等待支付處理（通常 2-3 秒）
```

### 步驟 6：支付結果驗證
```
✅ 支付成功則：
   1. 跳轉至成功頁面（通常 /pricing?success=true 或感謝頁）
   2. 顯示「支付成功」或「訂閱已啟用」之類的訊息
   3. 確認點數或方案已添加至帳戶
   4. 檢查 /settings/profile 或帳戶儀表板確認資產

❌ 支付失敗則：
   1. 顯示錯誤訊息（如「Payment declined」或「Card was declined」）
   2. 停留在結帳頁面並提示重試
   3. 前往管理員診斷流程（見下方「管理員端診斷」）
```

## 管理員端診斷流程 (Admin Diagnostics)

### 步驟 1：管理員登入
```
1. 開啟新的測試瀏覽器窗口或清空 Cookie
2. 導航至 /login
3. Email 輸入欄填入：ADMIN_EMAIL 對應值
4. Password 輸入欄填入：ADMIN_PASSWORD 對應值
5. 驗證碼欄位填入：LOGIN_BYPASS_SECRET 對應值（僅限 local/e2e）
6. 點擊「登入」按鈕
7. 等待頁面導航至 Admin Dashboard
8. 確認 Navbar 顯示「訂單管理」、「老師審核」等 Admin 選項
```

### 步驟 2：訪問應用程式頁
```
1. 方式 A（直接 URL）：在 URL 欄輸入 /apps 或 /apps?type=payment
2. 方式 B（導航）：
   - 從 Admin Dashboard 尋找「應用程式」或「系統設定」連結
   - 若無，則點擊 Navbar 的「個人設定」並尋找「應用程式」

3. 等待 /apps 頁面加載
4. 確認頁面顯示多個分頁：
   - 「通用」（General）
   - 「支付」（Payments）- 通常在這個分頁
   - 「AI」、「自動化」等
```

### 步驟 3：選擇支付分頁
```
1. 若未自動進入支付分頁，點擊「支付」或「Payments」分頁標籤
2. 確認頁面顯示支付服務列表：
   - PayPal
   - Stripe ✅
   - LINE Pay
   - ECPay
   等
```

### 步驟 4：尋找 Stripe 服務
```
在「已連接的服務」表格中尋找 Stripe：

| 名稱 | 類型 | 狀態 | 操作 |
|------|------|------|------|
| ... | ... | active | 配置 刪除 |
| **Stripe** | **STRIPE** | **✅ Active** | **配置 測試 刪除** |

✅ 確認 Stripe 列在表格中
✅ 確認狀態為「Active」或「✅ 已連接」
```

### 步驟 5：查看 Stripe 配置詳情
```
方法 A：點擊「配置」按鈕
   1. 點擊 Stripe 列對應的「配置」或「Edit」按鈕
   2. 會彈出配置模態視窗 (AppConfigModal)
   3. 確認以下欄位已填入：
      - Webhook Secret (`<YOUR_STRIPE_WEBHOOK_SECRET>`)
      - Secret Key (`<YOUR_STRIPE_SECRET_KEY>`)
      - Publishable Key (`<YOUR_STRIPE_PUBLISHABLE_KEY>`)
   4. 檢查「Status」為「enabled」或「active」

方法 B：點擊「詳細」或「Detail」（若存在）
   1. 導航至 Stripe 的詳細頁面
   2. 檢查設定與連接日期
```

### 步驟 6：測試 Stripe 連接
```
1. 查找「測試」按鈕或「Test Connection」
   - 通常在配置視窗或詳細頁面上
   
2. 點擊測試按鈕

3. 系統會發送測試請求至 Stripe API

4. 等待結果：
   ✅ 成功：顯示「Connection successful」或綠色勾選
   ❌ 失敗：顯示錯誤訊息，如：
      - "Invalid API Key"
      - "Webhook Secret mismatch"
      - "API rate limit exceeded"

5. 若失敗，根據錯誤訊息採取行動（見下方故障排除）
```

### 步驟 7：驗證 Webhook
```
手動檢查 Webhook 設置：

1. 前往 Stripe Dashboard (https://dashboard.stripe.com)
2. 進入 **Developers → Webhooks**
3. 尋找端點：https://your-domain.com/api/stripe/webhook
4. 點擊該端點查看詳情
5. 確認事件為：
   - ✅ payment_intent.succeeded
   - ✅ payment_intent.payment_failed
   - ✅ charge.refunded
6. 檢查最近的事件日誌，確保 webhook 有被正確調用
```

## 故障排除 (Troubleshooting)

### 錯誤 1：「Invalid API Key」
```
原因：Stripe Secret Key 或 Publishable Key 不正確
解決：
  1. 前往 Stripe Dashboard
  2. 進入 **Developers → API Keys**
  3. 複製正確的 Secret Key 與 Publishable Key
  4. 更新 .env.local 或 Admin 應用程式設定中的金鑰
  5. 重新測試連接
```

### 錯誤 2：「Webhook Secret mismatch」
```
原因：STRIPE_WEBHOOK_SECRET 不正確或與 Stripe Dashboard 設定不符
解決：
  1. 前往 Stripe Dashboard → Developers → Webhooks
  2. 找到對應的 webhook 端點
  3. 點擊「Reveal」顯示 Signing secret
  4. 複製該 secret
  5. 更新 .env.local 中的 STRIPE_WEBHOOK_SECRET
  6. 重新啟動應用程式
  7. 重新測試連接
```

### 錯誤 3：「Card was declined」（支付被拒）
```
原因：測試卡未被識別或被 Stripe 拒絕
解決：
  1. 確認使用的是 Stripe 官方測試卡：4242 4242 4242 4242
  2. 嘗試其他測試卡號（詳見下方「Stripe 測試卡號」）
  3. 確認 /pricing 使用 Test Mode 的金鑰，而非 Live Mode 金鑰
  4. 檢查 Stripe Dashboard 中是否有限制此卡的規則
```

### 錯誤 4：「Timeout connecting to Stripe」
```
原因：網路連接問題或 Stripe 服務暫時不可用
解決：
  1. 確認網路連接正常
  2. 稍候幾秒後重試
  3. 檢查 Stripe 服務狀態頁：https://status.stripe.com/
  4. 查看應用程式日誌（/app/api/stripe/webhook/route.ts）
```

### 錯誤 5：「Support email not yet configured」
```
原因：Stripe 帳號未設定支援郵箱
解決：
  1. 前往 Stripe Dashboard
  2. 進入 **Settings → Account settings**
  3. 設定「Support email」與「Support phone」
  4. 重新測試
```

## Stripe 測試卡號

| 情境 | 卡號 | 月 | 年 | CVC |
|------|------|-----|-----|-----|
| **成功支付** | 4242 4242 4242 4242 | 任意 | 任意未來年份 | 任意 3 位 |
| 需要驗證 (3D Secure) | 4000 0025 0000 3155 | 任意 | 任意未來年份 | 任意 3 位 |
| 支付被拒 (generic_decline) | 4000 0000 0000 0002 | 任意 | 任意未來年份 | 任意 3 位 |
| 無效卡號 | 4000 0000 0000 0069 | 任意 | 任意未來年份 | 任意 3 位 |
| 過期卡 | 4000 0000 0000 0010 | 12 (過期月份) | 2020 (過期年份) | 任意 3 位 |

## 檔案結構與相關代碼

### 前端（學生端）
```
app/pricing/
├── page.tsx                    # 定價頁面
└── checkout/
    └── page.tsx               # 結帳頁面 (支付方式選擇)

app/settings/profile/page.tsx   # 個人資料（驗證資產入帳）
```

### 後端（API 與 Webhook）
```
app/api/stripe/
├── webhook/route.ts           # Stripe Webhook 接收端點
├── checkout/route.ts          # 建立結帳 Session
└── ... (其他 Stripe API 路由)
```

### 管理員端
```
app/apps/page.tsx              # 應用程式與服務管理
├── components/
│   ├── ConnectedAppsList.tsx   # 已連接服務列表
│   └── AppConfigModal.tsx      # 服務配置模態視窗
└── _hooks/useAppsPage.ts       # 頁面邏輯與狀態管理
```

## 自動化測試指令

### 執行 Stripe 支付流程測試
```bash
# 基礎 Stripe 支付測試（學生端）
npx playwright test e2e/stripe_payment.spec.ts

# 管理員 Stripe 診斷測試
npx playwright test e2e/admin_stripe_diagnostics.spec.ts

# 完整端到端測試（學生 + 管理員）
npx playwright test e2e/stripe_payment.spec.ts e2e/admin_stripe_diagnostics.spec.ts
```

## 幣種支持

根據 `/settings/pricing` 設定：
- **USD**（美元）：預設 Stripe 支付幣種
- **TWD**（台幣）：若啟用 ECPay，可同時支援台幣結帳
- **JPY**（日圓）：可透過 Stripe 支援

> 確認 Stripe 帳號已啟用多幣種支持

## 常見檢查清單

- [ ] 確認 Test Mode 卡號（4242 4242 4242 4242）
- [ ] `.env.local` 中的 Stripe Key 已設定
- [ ] `/apps` 中 Stripe 已連接且狀態為 Active
- [ ] Stripe Webhook 已在 Dashboard 中驗證
- [ ] 測試學生帳號存在於資料庫
- [ ] 測試方案已在 `/settings/pricing` 中建立
- [ ] 支付成功後，資產已入帳至學生帳戶
- [ ] Webhook 事件已在 Stripe Dashboard 中記錄
- [ ] 錯誤日誌已檢查（若有失敗）

## 相關 Skills & 技能
- `payment` - 支付系統整體架構與多閘道整合
- `point-purchase-flow` - 點數購買流程驗證
- `auto-login` - 自動登入機制
- `pricing-settings-verification` - 定價設定驗證
