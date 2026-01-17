# 訂單和金流支付流程文檔索引

## 📚 文檔概覽

本專案包含三份主要文檔，詳細說明了 jvtutorcorner 系統的訂單流程和金流支付機制：

---

## 📖 文檔清單

### 1. **完整流程文檔** - `PAYMENT_FLOW_DOCUMENTATION.md`
📄 **最完整和詳細的文檔**

**適合：** 需要全面理解系統架構的開發者和產品經理

**包含內容：**
- ✓ 系統概述和核心概念
- ✓ 完整訂單流程（5 個步驟）
- ✓ 金流支付流程詳解
- ✓ 系統架構和數據存儲
- ✓ 所有 API 端點概述
- ✓ 狀態轉換圖表
- ✓ 付款記錄結構
- ✓ 錯誤處理指南
- ✓ 前端集成指南
- ✓ 管理員操作說明
- ✓ 測試指南
- ✓ 故障排除

**推薦閱讀順序：**
1. 概述（了解系統）
2. 訂單流程（理解核心流程）
3. 金流支付流程（理解支付機制）
4. API 端點（了解可用操作）

---

### 2. **API 詳細文檔** - `API_DETAILED_DOCUMENTATION.md`
📄 **API 的技術參考手冊**

**適合：** 後端開發者、前端集成工程師

**包含內容：**
- ✓ 訂單 API 詳細規範（4 個端點）
  - POST /api/orders - 創建訂單
  - GET /api/orders/{orderId} - 獲取訂單
  - GET /api/orders - 列表訂單
  - PATCH /api/orders/{orderId} - 更新訂單
- ✓ 支付 API 規範（1 個端點）
  - POST /api/payments/webhook - 支付回調
- ✓ 完整的數據模型定義
- ✓ 請求/響應示例（cURL 和 JavaScript）
- ✓ 認證和授權指南
- ✓ 速率限制建議

**使用方式：**
- 作為 API 文檔參考
- 實現 API 集成時查閱
- 編寫客戶端代碼時參考

---

### 3. **快速參考指南** - `QUICK_REFERENCE.md`
📄 **速查手冊和常用代碼片段**

**適合：** 所有開發者（快速查找）

**包含內容：**
- ✓ 快速開始（3 行代碼完成購買）
- ✓ API 端點速記表
- ✓ 狀態轉換圖
- ✓ 14 個常用代碼片段
- ✓ 調試技巧
- ✓ 常見問題解決
- ✓ 檢查清單
- ✓ 監控和維護指南

**使用方式：**
- 快速查找 API 端點
- 複製粘貼代碼片段
- 故障排除速查

---

## 🎯 依據用途選擇文檔

### 我想...

**理解系統如何運作**
→ 閱讀 [PAYMENT_FLOW_DOCUMENTATION.md](./PAYMENT_FLOW_DOCUMENTATION.md) 的「概述」和「訂單流程」部分

**實現前端購買流程**
→ 參考 [API_DETAILED_DOCUMENTATION.md](./API_DETAILED_DOCUMENTATION.md) 的「請求/響應示例」部分

**快速集成 API**
→ 使用 [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) 的「快速開始」和「常用代碼片段」

**查找特定 API 的用法**
→ 在 [API_DETAILED_DOCUMENTATION.md](./API_DETAILED_DOCUMENTATION.md) 中搜索 API 名稱

**調試支付流程問題**
→ 參考 [PAYMENT_FLOW_DOCUMENTATION.md](./PAYMENT_FLOW_DOCUMENTATION.md) 的「故障排除」部分

**快速查找某個端點**
→ 在 [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) 的「API 端點速記表」中查找

**理解數據模型**
→ 查看 [API_DETAILED_DOCUMENTATION.md](./API_DETAILED_DOCUMENTATION.md) 的「數據模型」部分

**部署到生產環境**
→ 參考 [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) 的「後端部署檢查清單」

---

## 🔗 文檔之間的聯繫

```
PAYMENT_FLOW_DOCUMENTATION.md (全局視圖)
    ↓ 詳細的 API 規範
    └→ API_DETAILED_DOCUMENTATION.md (技術參考)
    
    ↓ 快速查找
    └→ QUICK_REFERENCE.md (速查手冊)
```

---

## 📊 完整流程概覽

### 用戶購買課程的流程

```
1. 用戶點擊「購買課程」
   ↓
2. 系統建立 Enrollment (報名記錄)
   ↓
3. 系統建立 Order (訂單)
   ↓
4. 用戶進行支付
   ↓
5. 支付網關確認支付
   ↓
6. 系統更新 Order 狀態為 PAID
   ↓
7. 系統自動激活 Enrollment (變為 ACTIVE)
   ↓
8. 用戶可以訪問課程
```

### 涉及的 API 端點

```
POST /api/enroll              → 建立報名
POST /api/orders              → 建立訂單
POST /api/payments/webhook    → 支付確認
PATCH /api/orders/{orderId}   → 更新訂單狀態
```

---

## 💾 相關代碼文件

| 功能 | 文件位置 |
|------|--------|
| 訂單 API | `/app/api/orders/` |
| 支付 Webhook | `/app/api/payments/webhook/` |
| 報名 API | `/app/api/enroll/` |
| 訂單管理組件 | `/components/OrdersManager.tsx` |
| 報名管理組件 | `/components/EnrollmentManager.tsx` |
| 模擬測試按鈕 | `/components/SimulationButtons.tsx` |
| 管理後台訂單頁 | `/app/admin/orders/` |

---

## 🚀 快速開始示例

### 在 5 分鐘內完成集成

```javascript
// 1. 創建報名並建立訂單
async function purchaseCourse(courseId, studentEmail, studentName) {
  // 建立報名
  const enrollRes = await fetch('/api/enroll', {
    method: 'POST',
    body: JSON.stringify({ courseId, email: studentEmail, name: studentName })
  });
  const { id: enrollmentId } = (await enrollRes.json()).enrollment;

  // 建立訂單
  const orderRes = await fetch('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ courseId, enrollmentId, amount: 2900, currency: 'TWD' })
  });
  const { orderId } = (await orderRes.json()).order;

  // 重定向到支付頁面（或模擬支付）
  return orderId;
}

// 2. 支付完成後，系統自動處理：
// - 訂單狀態變為 PAID
// - Enrollment 自動激活
// - 用戶可以訪問課程
```

更多詳情見 [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)

---

## 📋 常見任務

### 查看訂單清單
→ `GET /api/orders?limit=20&status=PAID`

### 查詢特定用戶的訂單
→ `GET /api/orders?userId=student@example.com`

### 標記訂單為已支付
→ `PATCH /api/orders/{orderId}` 帶 `status: PAID`

### 發起退款
→ `PATCH /api/orders/{orderId}` 帶 `status: REFUNDED`

### 模擬完整購買流程（開發環境）
→ 訪問管理後台，點擊「模擬付款」按鈕

---

## ⚠️ 重要注意

### 開發環境
- 使用本地 JSON 文件存儲 (`.local_data/orders.json`)
- 使用模擬支付 Webhook
- 無需配置 AWS DynamoDB

### 生產環境
- 需要配置 AWS DynamoDB
- 需要連接真實支付網關
- 需要配置 Webhook 密鑰驗證
- 需要實現速率限制和日誌

---

## 🔧 故障排除

### 訂單無法創建
→ 查看 [PAYMENT_FLOW_DOCUMENTATION.md](./PAYMENT_FLOW_DOCUMENTATION.md) 的「錯誤處理」部分

### 支付後 Enrollment 未激活
→ 檢查 [API_DETAILED_DOCUMENTATION.md](./API_DETAILED_DOCUMENTATION.md) 的「自動 Enrollment 更新過程」

### 支付記錄為空
→ 參考 [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) 的「常見問題解決」

---

## 📞 技術支持

如有問題，請：
1. 查閱相關文檔的「故障排除」部分
2. 檢查 `.local_data/orders.json` 中的訂單數據
3. 查看瀏覽器控制台和服務器日誌的錯誤信息

---

## 📈 文檔更新歷史

| 日期 | 版本 | 更新內容 |
|------|------|--------|
| 2025-01-11 | 1.0 | 初版：完整流程、API 詳細、快速參考 |

---

## 📝 文檔許可

這些文檔是 jvtutorcorner 系統的一部分，用於技術參考和開發指導。

---

## 🎓 學習路徑建議

### 初學者
1. 閱讀 [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - 快速了解
2. 閱讀 [PAYMENT_FLOW_DOCUMENTATION.md](./PAYMENT_FLOW_DOCUMENTATION.md) - 完整理解
3. 嘗試「快速開始示例」

### 中級開發者
1. 重點閱讀 [API_DETAILED_DOCUMENTATION.md](./API_DETAILED_DOCUMENTATION.md)
2. 實現前端和後端集成
3. 運行測試流程

### 高級開發者
1. 審查代碼實現 (`/app/api/orders/`, `/app/api/payments/`)
2. 根據需要進行定制和擴展
3. 實現生產級別的安全和監控

---

**文檔集版本：1.0** | **最後更新：2025-01-11**

🎉 祝您開發愉快！
