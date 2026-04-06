---
name: admin-order-management
description: '負責管理後台（Admin Portal）的訂單清單、訂閱配置、CSV 匯出與 UI 操作功能開發。'
argument-hint: '開發或優化管理員後台介面、搜尋篩選、匯出 CSV 或方案排序功能'
metadata:
  verified-status: '🏗️ IN PROGRESS'
  last-verified-date: '2026-04-06'
  architecture-aligned: true
---

# 管理員後台訂單與訂閱管理技能 (Admin Portal Management Skill)

> [!TIP]
> 此技能專注於「管理後台 (Admin Portal)」的介面開發與數據展示功能；具體的退款與購買業務邏輯，請優先參考 `purchase-refund-flow`。

此技能用於協助開發管理員在 `/admin/orders` 的訂單管理介面，以及在 `/admin/subscriptions` 的會員方案展示配置。

## 核心功能與開發要點

### 1. 訂單清單介面 (Orders UI)
- **路徑**: `/admin/orders`
- **功能開發**:
  - **搜尋篩選 (Filters)**: 實作按 OrderId、學員 ID、狀態（PENDING/PAID/REFUNDED）及日期範圍的 API 篩選。
  - **數據分頁 (Pagination)**: 確保大數據量下的分頁流暢度。
  - **匯出 CSV (Export)**: 實作將目前視窗搜尋結果匯出為 CSV 格式（UTF-8 編碼）。
  - **多課程展示 (Bundle View)**: 在訂單詳情中，表格需正確顯示組成該訂單的所有 Enrollment 課程及其各自進度。

### 2. 訂單狀態 UI 操作 (Status Operations)
- **手動更新狀態**: 在 UI 上點擊「標記為已付款」或「取消」時，需有二次確認對話框。
- **退款發起 (Refund Initiation)**: 
  - UI 端按下「退款」按鈕後，應呼叫正確的 `PATCH` API 端點。
  - **[關鍵]：業務執行細節應參照 `purchase-refund-flow` 技能，確保 UI 事件觸發後正確扣除學員點數。**

### 3. 訂閱方案與內容配置 (Subscription Config)
- **路徑**: `/admin/subscriptions`
- **操作開發**:
  - **排序調整 (Sorting)**: 實作 ↑/↓ 按鈕邏輯，調整前端顯示的優先權順序。
  - **動態編輯**: 即時修改方案 ID、價格提示、功能描述，並確保儲存至 `plan-upgrades` 相關數據表。
  - **上架切換**: 使用 `isActive` 切換開關控制方案是否在前端展示。
40: 
41: ### 4. 方案與點數紀錄頁面 (Plan Records UI)
42: - **路徑**: `/plans`
43: - **功能開發**:
44:   - **多角色支持**: 提供學員查看「個人紀錄」與管理員查看「全站紀錄」的切換邏輯
45:   - **分門別類**: 區分「訂閱方案紀錄」與「點數購買紀錄」兩大分頁。
46:   - **關聯應用方案**: 顯示該紀錄所包含的 App 預扣點數或效期加乘。
47:   - **複合篩選**: 支援方案名稱、日期範圍與使用者 ID 的即時篩選。

## 與其他技能的聯動 (Relationship)

| 需求 | 優先參考技能 |
|------|-------------|
| 欲開發/修改管理後台的「搜尋框」或「CSV 匯出」 | **本技能 (`admin-order-management`)** |
| 欲開發/修改「退款如何扣學生點數」的後端邏輯 | **`purchase-refund-flow`** |
| 欲開發/修改「Stripe 退款 API」的技術細節 | **`monetary-refund`** |

## 相關檔案
- `/app/admin/orders/page.tsx`: 訂單管理入口。
- `/components/OrdersManager.tsx`: 核心訂單操作元件（UI 層）。
- `/app/admin/subscriptions/page.tsx`: 方案配置介面。
- `/app/plans/page.tsx`: 方案升級與點數購買紀錄（含學員與管理員視圖）。
- `/api/admin/subscriptions/route.ts`: 方案管理後端 API。
- `/api/plan-upgrades/route.ts`: 方案紀錄讀取 API。
