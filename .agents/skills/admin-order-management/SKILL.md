---
name: admin-order-management
description: '負責訂單、訂閱與退款的管理。'
argument-hint: '管理訂單狀態、訂閱方案配置以及退款流程'
metadata:
  verified-status: '❌ UNVERIFIED'
  last-verified-date: '-'
  architecture-aligned: false
  architecture-aligned: false
  last-verified-date: '-'
  verified-status: ❌ UNVERIFIED
  verified-status: ❌ UNVERIFIED
  last-verified-date: '-'
  architecture-aligned: false
---

# 管理員訂單與訂閱管理技能 (Admin Order & Subscription Management)

此技能用於協助管理員在 `/admin/orders` 管理全球訂單，以及在 `/admin/subscriptions` 配置會員方案與擴充功能。

## 功能檢查清單

### 1. 訂單狀態管理
- **路徑**: `/admin/orders`
- **架構背景**: 依賴 [Order Model](../../../architecture_overview.md#12-data-models-graphqldynamodb) 中的 `status` 欄位（PENDING, PAID, CANCELLED, REFUNDED, FAILED）。
- **主要操作**:
  - **訂單搜尋**: 支援按 OrderId、學員 ID、課程 ID、狀態及日期區間進行篩選。
  - **手動更新狀態**: 點擊「編輯」後，可手動將訂單標記為「已付款 (PAID)」、「已取消 (CANCELLED)」或「已退款 (REFUNDED)」。
  - **匯出 CSV**: 支援將當前篩選出的訂單列表匯出為 CSV 檔案。
- **驗證方式**:
  - 確認訂單列表能正確載入並分頁。
  - 驗證手動更新狀態後，系統是否有彈出確認對話框，且更新後狀態標籤顏色正確變動。

### 2. 訂閱方案與擴充配置
- **路徑**: `/admin/subscriptions`
- **架構背景**: 由 `lib/subscriptionsService` 提供支持，對應 `jvtutorcorner-plan-upgrades` 相關邏輯。
- **主要操作**:
  - **方案展示**: 分為「主會員方案 (Plans)」與「擴充包 (Extensions)」。
  - **排序調整**: 使用 ↑/↓ 按鈕調整前台顯示順序。
  - **即時編輯**: 可直接修改 ID、標籤名稱、價格提示、功能簡述及期限。
  - **狀態切換**: 勾選/取消勾選控制該方案是否在前端上架（isActive）。
- **驗證方式**:
  - 確認修改或新增方案後，點擊「儲存」能成功持久化到後端。
  - 驗證刪除操作是否有二次確認防呆機制。

## 測試指令

### 手動驗證流程

#### A. 訂單管理驗證
1. 以管理員帳號登入。
2. 進入 `/admin/orders`。
3. 搜尋一個特定的 `PENDING` 訂單，點擊「編輯」並設為 `PAID`。
4. 驗證該學員是否因此獲得對應的課程權限或點數（參見 [Student Enrollment Flow](../../../architecture_overview.md#22-student-course-enrollment)）。

#### B. 方案更新驗證
1. 進入 `/admin/subscriptions`。
2. 修改「主會員方案」中某一項的「價格提示」。
3. 點擊「儲存」。
4. 切換到學員點數/方案購買頁面，確認價格提示已連動更新。

## 常見問題排查

| 問題 | 可能原因 | 排查步驟 |
|------|---------|---------|
| 訂單狀態更新後無效 | Webhook 衝突或 API 失敗 | 檢查 `PATCH /api/orders/[id]` 的 API 回應。 |
| 匯出 CSV 亂碼 | 編碼不相容 | 確認 CSV 內容是否包含特殊符號，預設使用 UTF-8。 |
| 方案 ID 重複 | DynamoDB 鍵值衝突 | 檢查是否有兩個方案使用相同的 `id`。 |

## 相關檔案
- `/app/admin/orders/page.tsx` - 訂單管理入口
- `/components/OrdersManager.tsx` - 核心訂單操作元件
- `/app/admin/subscriptions/page.tsx` - 方案配置介面
- `/api/orders/[id]/route.ts` - 訂單更新 API
- `/api/admin/subscriptions/route.ts` - 方案管理 API
