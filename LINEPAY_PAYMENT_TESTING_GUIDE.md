# LINE Pay 支付測試與收款驗證指南

## 🎯 測試目標

在進行 LINE Pay 實際支付測試時，需要：
1. 作為**學生帳號**完成 LINE Pay 支付流程
2. 作為**管理員帳號**驗證收款是否成功記錄
3. 確認款項金額、支付方式、訂單狀態等信息完整

---

## 📋 測試前準備

### 環境設定

確保以下環境變數已配置在 `.env.local`：

```bash
# 測試帳號
TEST_STUDENT_EMAIL=student@test.com
TEST_STUDENT_PASSWORD=password123
LOGIN_BYPASS_SECRET=your_bypass_secret

# LINE Pay 設定
NEXT_PUBLIC_PAYMENT_MOCK_MODE=false  # 改為 false 進行真實測試
LINE_PAY_CHANNEL_ID=your_channel_id
LINE_PAY_CHANNEL_SECRET=your_channel_secret
LINE_PAY_API_URL=https://sandbox-api.line.me  # 沙箱環境

# Admin 帳號
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin_password
```

### 必要依賴

```bash
# 確保已安裝測試工具
npm install --save-dev @playwright/test

# 啟動開發伺服器
npm run dev
```

---

## 🔄 完整測試流程

### Step 1: 學生端 - 購買課程或方案

#### 1.1 自動登入（使用 auto-login 技能）

```bash
# 使用 LOGIN_BYPASS_SECRET 自動登入學生帳號
npx playwright test e2e/auto-login.spec.ts --headed
```

#### 1.2 進入定價頁面並選擇方案

1. 訪問 `http://localhost:3000/pricing`
2. 選擇「購買點數」或「訂閱方案」
3. 點擊「前往結帳」按鈕

#### 1.3 進行結帳並選擇 LINE Pay

1. 在結帳頁面 (`/pricing/checkout`)，選擇 **LINE Pay** 作為支付方式
2. 確認訂單金額、課程信息是否正確
3. 點擊 **「使用 LINE Pay 支付」** 按鈕
4. **若為真實模式**：跳轉到 LINE Pay 沙箱環境進行支付
   - 輸入虛擬卡號（LINE 沙箱環境提供）
   - 完成授權
5. **支付成功後**：自動返回 `/settings/billing?success=true`

#### 1.4 驗證學生端的資產入帳

- 檢查個人資料中的「點數餘額」是否增加
- 或檢查「訂閱方案」狀態是否更新

### Step 2: 管理員端 - 驗證收款

#### 2.1 管理員登入

1. 訪問 `http://localhost:3000/login`
2. 使用 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 登入
   - 或使用 `LOGIN_BYPASS_SECRET` 自動登入（推薦用於測試）

#### 2.2 進入收款管理頁面

1. 進入後台儀表板 (`/dashboard`)
2. 在「營運與訂單中心」區塊，點擊 **「💳 收款管理」** 按鈕
3. 或直接訪問 `http://localhost:3000/admin/payments`

#### 2.3 在收款頁面中驗證

**應該看到以下信息：**

| 欄位 | 預期值 | 檢查項目 |
|------|--------|--------|
| **支付方式** | LINE Pay | 確保支付方式正確顯示 |
| **金額** | 與結帳金額一致 | 確保沒有計算錯誤 |
| **狀態** | PAID 或 COMPLETED | 確保訂單已完成 |
| **用戶 ID** | 對應學生帳號 | 確保關聯正確 |
| **建立時間** | 最近的時間戳 | 確保時間戳合理 |

#### 2.4 使用篩選功能驗證

在收款頁面，使用以下篩選功能驗證數據：

```
1. 支付方式篩選
   - 選擇「LINE Pay」
   - 確認只顯示 LINE Pay 相關的交易

2. 狀態篩選
   - 選擇「已付款 (PAID)」
   - 確認顯示所有已完成的付款

3. 日期篩選
   - 設定為今天的日期範圍
   - 確認顯示今天的交易

4. 導出 CSV
   - 點擊「匯出 CSV」按鈕
   - 確認下載的文件包含完整的交易信息
```

#### 2.5 查看訂單詳情

1. 在收款列表中，點擊任意交易的「查看詳情」按鈕
2. 在訂單詳情頁 (`/admin/orders/[orderId]`)，驗證以下信息：
   - 訂單 ID、用戶 ID、金額
   - 付款方式、支付狀態
   - 付款歷史記錄
   - 課程或方案信息

---

## 📊 收款管理頁面功能說明

### 頁面位置
- **路徑**: `/admin/payments`
- **權限**: 管理員 (admin) 角色
- **訪問**: 後台儀表板 → 營運與訂單中心 → 💳 收款管理

### 主要功能

#### 1. 即時統計卡片

```
├─ 總收入 (Total Revenue)
│  └─ 顯示所有已完成交易的總金額
├─ 交易狀態統計
│  ├─ 待確認 (PENDING): 筆數 + 金額
│  ├─ 已付款 (PAID): 筆數 + 金額
│  ├─ 已完成 (COMPLETED): 筆數 + 金額
│  └─ 已退款 (REFUNDED): 筆數 + 金額
└─ 支付方式統計
   ├─ Stripe: 筆數 + 金額
   ├─ PayPal: 筆數 + 金額
   ├─ LINE Pay: 筆數 + 金額
   └─ 其他方式...
```

#### 2. 高級篩選

支持以下篩選條件（組合篩選）：
- **狀態**: 待確認、已付款、已完成、已退款、失敗
- **支付方式**: Stripe、PayPal、LINE Pay、ECPay、點數
- **日期範圍**: 起始日期 ~ 結束日期

#### 3. 交易列表

表格包含以下欄位：
- Order ID（訂單 ID，縮寫顯示）
- User ID（用戶 ID，縮寫顯示）
- 金額（NT$，千位分隔）
- 狀態（彩色標籤）
- 支付方式（彩色標籤）
- 課程（課程名稱）
- 建立時間（完整時間戳）
- 操作（查看詳情連結）

#### 4. 分頁

- 每頁顯示 50 條記錄
- 支持上一頁、下一頁导航
- 顯示當前頁面的記錄範圍

#### 5. 數據導出

- **CSV 導出**: 下載當前篩選結果為 CSV 文件
- **文件命名**: `payments_YYYY-MM-DD.csv`
- **編碼**: UTF-8（支持中文字符）

---

## 🧪 自動化測試腳本

### 完整的 LINE Pay 支付測試腳本

創建 `e2e/linepay_payment_verification.spec.ts`：

```typescript
import { test, expect } from '@playwright/test';

test.describe('LINE Pay 支付測試與收款驗證', () => {
  
  test('學生購買方案，管理員驗證收款', async ({ page, browser }) => {
    // ============ Step 1: 學生端支付 ============
    
    // 1.1 學生登入
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="email"]', process.env.TEST_STUDENT_EMAIL!);
    await page.fill('input[name="password"]', process.env.TEST_STUDENT_PASSWORD!);
    await page.click('button:has-text("登入")');
    await page.waitForURL('**/pricing');
    
    // 1.2 進入定價頁面
    await page.goto('http://localhost:3000/pricing');
    
    // 1.3 選擇方案
    await page.click('text="購買點數"');
    await page.click('button:has-text("前往結帳")');
    
    // 1.4 選擇 LINE Pay
    await page.click('input[value="linepay"]');
    const orderAmount = await page.textContent('.order-total');
    console.log(`📊 訂單金額: ${orderAmount}`);
    
    // 1.5 模擬支付成功（在模擬模式下）
    if (process.env.NEXT_PUBLIC_PAYMENT_MOCK_MODE === 'true') {
      await page.click('button:has-text("使用 LINE Pay 支付")');
      await page.waitForURL('**/success=true');
    }
    
    // 1.6 獲取訂單 ID（從 URL 或頁面數據）
    const orderId = await page.evaluate(() => {
      return (document.querySelector('[data-order-id]') as any)?.textContent;
    });
    console.log(`✅ 訂單 ID: ${orderId}`);
    
    // ============ Step 2: 管理員驗證 ============
    
    // 2.1 創建新的管理員上下文
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    
    // 2.2 管理員登入
    await adminPage.goto('http://localhost:3000/login');
    await adminPage.fill('input[name="email"]', process.env.ADMIN_EMAIL!);
    await adminPage.fill('input[name="password"]', process.env.ADMIN_PASSWORD!);
    await adminPage.click('button:has-text("登入")');
    await adminPage.waitForURL('**/dashboard');
    
    // 2.3 進入收款管理頁面
    await adminPage.goto('http://localhost:3000/admin/payments');
    
    // 2.4 設置篩選條件
    await adminPage.selectOption('select:first-of-type', 'PAID'); // 狀態
    await adminPage.selectOption('select:nth-of-type(1)', 'linepay'); // 支付方式
    
    // 2.5 等待加載
    await adminPage.waitForTimeout(1000);
    
    // 2.6 驗證交易出現在列表中
    const paymentRow = adminPage.locator(
      `text="${orderId?.substring(0, 8)}"`
    ).first();
    await expect(paymentRow).toBeVisible();
    
    // 2.7 驗證交易詳情
    const amountText = await paymentRow.locator('td:nth-child(3)').textContent();
    expect(amountText).toContain(orderAmount);
    
    const statusBadge = await paymentRow.locator('text="PAID"').isVisible();
    expect(statusBadge).toBeTruthy();
    
    const methodBadge = await paymentRow.locator('text="LINEPAY"').isVisible();
    expect(methodBadge).toBeTruthy();
    
    // 2.8 點擊查看詳情
    await paymentRow.locator('button:has-text("查看詳情")').click();
    await adminPage.waitForURL(`**/admin/orders/${orderId}`);
    
    // 2.9 驗證訂單詳情頁
    const orderDetail = await adminPage.textContent('.order-detail');
    expect(orderDetail).toContain(orderId);
    expect(orderDetail).toContain('LINE Pay');
    
    // 2.10 驗證統計卡片
    const totalRevenueText = await adminPage.textContent('.summary-card:first-of-type');
    console.log(`💰 統計收入: ${totalRevenueText}`);
    
    // ============ 測試完成 ============
    console.log('✅ LINE Pay 支付與收款驗證測試通過！');
    
    await adminContext.close();
  });

  test('批量驗證 LINE Pay 交易（篩選與導出）', async ({ page }) => {
    // 管理員登入
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="email"]', process.env.ADMIN_EMAIL!);
    await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD!);
    await page.click('button:has-text("登入")');
    
    // 進入收款管理
    await page.goto('http://localhost:3000/admin/payments');
    
    // 篩選 LINE Pay 交易
    await page.selectOption('select:nth-of-type(1)', 'linepay');
    await page.waitForTimeout(1000);
    
    // 驗證行數 > 0
    const rows = await page.locator('table tbody tr').count();
    expect(rows).toBeGreaterThan(0);
    console.log(`📊 找到 ${rows} 筆 LINE Pay 交易`);
    
    // 導出 CSV
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("匯出 CSV")');
    const download = await downloadPromise;
    
    console.log(`✅ CSV 文件已下載: ${download.suggestedFilename}`);
    expect(download.suggestedFilename).toContain('payments_');
  });
});
```

### 執行測試

```bash
# 運行單個測試
npx playwright test e2e/linepay_payment_verification.spec.ts --headed

# 運行所有支付相關測試
npx playwright test e2e/*payment*.spec.ts

# 調試模式
npx playwright test e2e/linepay_payment_verification.spec.ts --headed --debug
```

---

## 🐛 常見問題與排查

### Q1: 收款頁面顯示 0 筆交易

**排查步驟：**
1. 確認是否已完成至少一筆 LINE Pay 支付
2. 檢查訂單狀態是否為 `PAID` 或 `COMPLETED`
3. 檢查 DynamoDB 中的 `jvtutorcorner-orders` 表是否有數據
4. 查看瀏覽器控制台的錯誤信息

**解決方案：**
```bash
# 查詢數據庫中的訂單
aws dynamodb scan \
  --table-name jvtutorcorner-orders \
  --filter-expression "paymentMethod = :method" \
  --expression-attribute-values '{":method": {"S": "linepay"}}'
```

### Q2: 支付成功但未顯示在收款列表

**排查步驟：**
1. 進入訂單詳情頁，確認訂單狀態
2. 檢查 Webhook 是否被正確觸發
3. 檢查數據庫中的 `payments` 數組

**調試日誌：**
```javascript
// 在 /app/api/linepay/confirm/route.ts 中加入日誌
console.log('[linepay confirm]', { orderId, status, amount });
```

### Q3: 金額計算錯誤

**排查項目：**
1. 檢查套餐的 `points` 數值
2. 若有 App 方案，確認是否正確扣除 `prePurchasePointsCost`
3. 驗證結帳頁面的計算邏輯（`app/pricing/checkout/page.tsx`）

---

## 📝 測試檢查清單

- [ ] 環境變數已正確配置
- [ ] 學生帳號能成功進行 LINE Pay 支付
- [ ] 管理員能訪問 `/admin/payments` 頁面
- [ ] 收款列表顯示最新的交易
- [ ] 篩選功能（狀態、支付方式、日期）工作正常
- [ ] CSV 導出功能正常
- [ ] 點擊「查看詳情」能進入訂單詳情頁
- [ ] 統計卡片顯示正確的總額和交易數
- [ ] 不同支付方式顯示不同的顏色標籤
- [ ] 分頁功能正常
- [ ] 支付多次後，列表能正確更新

---

## 📚 相關文檔與資源

- [LINE Pay API 文檔](https://docs.line.biz/zh-Hant/line-pay/overview)
- [LINE Pay 沙箱環境測試指南](https://sandbox-admin.line.biz/)
- [Playwright 測試框架](https://playwright.dev/)
- [支付基礎設施 Skill](../agents/skills/payment-infrastructure/SKILL.md)
- [LINE Pay 模擬技能](../agents/skills/payment-simulation-linepay/SKILL.md)

---

## 📞 支持與反饋

如有問題，請聯繫技術支援團隊或在代碼倉庫中提交 Issue。

**最後更新**: 2026-04-25
