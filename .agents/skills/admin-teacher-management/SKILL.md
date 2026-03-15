---
name: admin-teacher-management
description: '負責教師在職狀態管理與檔案修改審核。'
argument-hint: '管理並驗證教師的在職狀態與資料審核流程'
metadata:
  verified-status: ⚠️ PARTIAL
  last-verified-date: '2026-03-15'
  architecture-aligned: false
---

# 管理員教師管理技能 (Admin Teacher Management)

此技能用於協助管理員在 `/teachers/manage` 頁面管理老師的在職狀態，以及在 `/admin/teacher-reviews` 頁面審核老師提交的檔案修改申請。

## 功能檢查清單

### 1. 教師在職狀態管理
- **路徑**: `/teachers/manage`
- **架構背景**: 依賴 [Teacher Model](../../../architecture_overview.md#12-data-models-graphqldynamodb) 中的 `status` 欄位。
- **主要操作**:
  - **編輯模式**: 點擊「編輯」進入該列的編輯狀態。
  - **狀態切換**: 可選擇「在職 (active)」或「離職 (resigned)」。
  - **批量儲存**: 修改後需點擊右上角的「儲存變更」才會調用 API (`PATCH /api/teachers/{id}`)。
- **驗證方式**:
  - 確認表格能正確載入老師列表。
  - 切換狀態後，檢查該列是否有高亮顯示（表示已修改但未儲存）。
  - 儲存後，確認系統彈出成功提示並更新本地狀態。

### 2. 教師教學資訊審核
- **路徑**: `/admin/teacher-reviews`
- **架構背景**: 依賴 [TeacherReview](../../../architecture_overview.md#12-data-models-graphqldynamodb) 實體，記錄 `pendingProfileChanges`。
- **主要操作**:
  - **差異對比**: 頁面會顯示「原始資料」與「申請修改為」的對比，差異處會以紅/綠色高亮。
  - **核准 (Approve)**: 調用 `POST /api/admin/teacher-reviews/{id}` 並傳入 `action: 'approve'`，會將修改內容同步到 Teacher 表。
  - **退回 (Reject)**: 調用同一 API 並傳入 `action: 'reject'`，不修改 Teacher 表。
- **驗證方式**:
  - 確認頁面能正確顯示待審核的申請。
  - 驗證差異高亮邏輯是否正確反映了文字、科目或語言的增刪。
  - 執行 核准/退回 後，該筆申請應從清單中消失。

## 測試指令

目前尚未建立專用的 E2E 測試，建議參考 `e2e/teacher_courses_verification.spec.ts` 的架構來建立管理端測試。

### 手動驗證流程

#### A. 狀態管理驗證
1. 以 `admin` 帳號登入。
2. 進入 `/teachers/manage`。
3. 隨機選擇一位老師，點擊「編輯」。
4. 修改狀態。
5. 點擊「儲存變更」。
6. 重新整理頁面，確認狀態已持久化。

#### B. 審核流程驗證
1. 讓一位老師在個人檔案頁面提交修改申請（或手動在資料庫/API 建立 `pendingProfileChanges`）。
2. 管理員進入 `/admin/teacher-reviews`。
3. 檢查差異顯示是否準確。
4. 點擊「核准」。
5. 到教師列表或教師個人頁面確認資料已更新。

## 常見問題排查

| 問題 | 可能原因 | 排查步驟 |
|------|---------|---------|
| 無法進入管理頁面 | 權限不足 | 檢查 `lib/mockAuth.ts` 中當前用戶的 `role` 是否為 `admin`。 |
| 儲存變更失敗 | API 回傳錯誤 | 檢查 `PATCH /api/teachers/{id}` 的網路回應。 |
| 差異顯示怪異 | Text Diff 演算法限制 | 針對超長文本（如自我介紹），檢查 `levenshteinDistance` 是否因差異過大觸發全量高亮。 |

## 相關檔案
- `/app/teachers/manage/page.tsx` - 在職狀態管理 UI
- `/app/admin/teacher-reviews/page.tsx` - 審核系統 UI
- `/app/api/teachers/[id]/route.ts` - 教師更新 API
- `/app/api/admin/teacher-reviews/route.ts` - 審核 API
