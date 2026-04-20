---
name: course-management-service
description: '負責教師的課程管理與管理員的課程審核。'
argument-hint: '管理教師課程建立、狀態更新及管理員審核流程'
metadata:
  verified-status: ✅ VERIFIED
  last-verified-date: '2026-03-16'
  architecture-aligned: true
---

# 課程管理服務技能 (Course Management Service)

此技能用於處理課程的生命週期管理，包括教師端在 `/courses_manage` 建立與編輯課程，以及管理員端在 `/admin/course-reviews` 進行審核。

## 功能檢查清單

### 1. 教師課程管理 (Teacher side)
- **路徑**: `/courses_manage`
- **架構背景**: 依賴 [Course Model](../../../architecture_overview.md#12-data-models-graphqldynamodb) 中的 `status` 欄位（待審核、上架、下架）。
- **主要操作**:
  - **建立新課程**: 點擊「新增課程」跳出 `NewCourseForm` 彈窗，填寫標題、時長、價格等。
  - **課程列表**: 透過 `TeacherDashboardClient` 顯示該教師的所有課程。
  - **狀態申請**: 選擇上架或下架時，系統會將課程狀態更新為「待審核」，並記錄 `reviewRequestedStatus`。
- **驗證方式**:
  - 確認教師能看到自己建立的課程列表。
  - 驗證建立新課程時，必填欄位有無正確驗證。
  - 提交上架申請後，課程狀態應立即轉為「待審核」。

### 2. 管理員課程審核 (Admin side)
- **路徑**: `/admin/course-reviews`
- **架構背景**: 依賴 [Course Model](../../../architecture_overview.md#12-data-models-graphqldynamodb) 的狀態變更邏輯。
- **主要操作**:
  - **審核列表**: 顯示所有 `status` 為「待審核」的課程。
  - **核准 (Approve)**: 調用 `POST /api/admin/course-reviews/{id}` 並傳入 `action: 'approve'`，將 `status` 改為 `reviewRequestedStatus` 的值。
  - **退回 (Reject)**: 調用同一 API 並傳入 `action: 'reject'`，保持原狀態。
- **驗證方式**:
  - 確認核准後，該課程狀態正確變更（例如從「待審核」變為「上架」）。
  - 核准或退回後，該筆資料應從審核清單中移除。
  - 檢查是否能看到申請者的老師名稱與課程基本描述。

### 3. 測試課程管理 (Test Course Management)
- **規則**: 所有 ID 以 `test-course-` 開頭的課程被視為測試資料。
- **排除邏輯**: 
  - 這些課程會自動從 `/courses` 頁面與 `/api/courses` (列表模式) 中過濾掉。
  - `/api/courses?id={id}` 仍可直接存取以支援自動化測試 (E2E)。
- **清理方式**: 可執行 `node scripts/cleanup_test_courses.js` 批量刪除 DynamoDB 中的殘留測試課程。

## 環境驗證 (Environment Validation)

### 1. 必要環境變數 (Required Environment Variables)
- [ ] `.env.local` 必須包含 `LOGIN_BYPASS_SECRET`
- [ ] `.env.local` 必須包含 `TEST_TEACHER_EMAIL` / `TEST_TEACHER_PASSWORD` (教師權限)

### 2. 必要驗證檔案 (Required Validation Files)
- [ ] `e2e/course_management_flow.spec.ts` (課程管理流程驗證)
- [ ] `scripts/cleanup_test_courses.js` (資料清理工具)

### 3. 執行驗證指令 (Validation Command)
- `npx playwright test e2e/course_management_flow.spec.ts`
- `npx playwright test e2e/student_enrollment.spec.ts` (驗證測試課程生命週期)
- **API Registry**: `node scripts/inspect_apis.mjs` (若有修改 API 結構)

## 測試指令

### 手動驗證流程

#### A. 教師建立並申請上架
1. 以老師帳號登入。
2. 進入 `/courses_manage` 並建立一門新課程。
3. 提交「上架申請」。
4. 確認該課程在列表中的狀態顯示為「待審核」。

#### B. 管理員審核課程
1. 以管理員帳號登入。
2. 進入 `/admin/course-reviews`。
3. 找到剛剛老師建立的課程。
4. 點擊「核准」。
5. 返回課程列表確認該課程狀態已變更為「上架」。

## 常見問題排查

| 問題 | 可能原因 | 排查步驟 |
|------|---------|---------|
| 課程建立後未出現在列表 | API 或快取延遲 | 檢查 `GET /api/courses` 的回應內容。 |
| 狀態變更無法核准 | 資料庫連線或權限 | 檢查 `/api/admin/course-reviews/[id]` 的後端日誌。 |
| 狀態文字顯示錯誤 | i18n 或 API 回傳格式 | 檢查 Course 表中的 `status` 欄位原始值。 |
| 看到 `test-course-*` 資料 | 過濾邏輯失效 | 檢查 `/app/courses/page.tsx` 與 `/app/api/courses/route.ts` 的 `startsWith('test-course-')` 邏輯。 |
| 測試課程殘留過多 | 未執行自動清理 | 執行 `node scripts/cleanup_test_courses.js`。 |

## 相關檔案
- `/app/courses/page.tsx` - 前台課程列表 (包含過濾邏輯)
- `/app/api/courses/route.ts` - 課程 API (包含過濾邏輯)
- `/app/courses_manage/page.tsx` - 教師課程管理入口
- `/components/TeacherDashboardClient.tsx` - 課程列表元件
- `/components/NewCourseForm.tsx` - 建立課程表單
- `/app/admin/course-reviews/page.tsx` - 管理員審核介面
- `/app/api/admin/course-reviews/route.ts` - 課程審核端點
- `/scripts/cleanup_test_courses.js` - 測試資料清理指令

## 環境切換 (Environment Switching)

此 skill 同時支援 **開發環境 (localhost:3000)** 與 **正式環境 (jvtutorcorner.com)**。

```bash
# 開發環境（預設）
npx playwright test e2e/course_management_flow.spec.ts

# 正式環境
BASE_URL=https://www.jvtutorcorner.com npx playwright test e2e/course_management_flow.spec.ts
```

> ⚠️ **注意**：對正式環境執行測試課程建立流程，測試完成後需手動從 `/admin/course-reviews` 清除測試資料。
