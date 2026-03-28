---
name: teacher-courses-page
description: '檢查 /teacher_courses 頁面的學生資訊、進入教室按鈕、時間驗證、以及剩餘課程數/時間的正確性。'
argument-hint: '測試並驗證 /teacher_courses 頁面的所有功能'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-03-15'
  architecture-aligned: true
---

# 教師課程頁面檢查技能 (Teacher Courses Page Verification)

此技能用於驗證 `/teacher_courses` 頁面的核心功能，確保教師能正常看到學生資訊、進入教室按鈕、時長及剩餘課堂資訊。

## 功能檢查清單

### 1. 進入教室按鈕時間驗證
- **架構背景**：基於 [Teacher Course Management](../../../architecture_overview.md#23-teacher-course-management) 與實體關係。
- **要求**：「進入教室」按鈕只在「課堂時間範圍內」才顯示
- **驗證方式**：
  - 檢查當前時間是否在課程的 `startTime` 到 `endTime` 之間，為允許老師提早備課，前端應加入 10 分鐘的寬限期 (`now >= startTs - 10 * 60 * 1000`)。
  - 若在區間外，按鈕應隱藏（顯示 '-'）
  - 若在區間內，按鈕應顯示為「進入教室」的藍色按鈕
- **常見故障排除**：
  - 若測試用的課程 (ID 包含 `test-course-`) 無法在老師儀表板顯示，請檢查 `/api/courses/route.ts` 中是否錯誤地把測試課程過濾掉 (應允許帶有 `teacherId` 查詢時顯示測試課程)。
  - 若老師在沒有學生預約的情況下需要進入教室，應確保頁面有 fallback 區塊顯示「尚未有預約」的排程課程。
- **相關代碼位置**：`/app/teacher_courses/page.tsx` - `enter_classroom` 列的渲染邏輯

### 2. 學生與課程資料檢查
- **要求**：學生名稱和課程名稱必須正確顯示，不能為空或 '-'
- **驗證方式**：
  - 檢查第一列（學生）是否顯示學生姓名或 ID
  - 檢查第二列（課程名稱）是否顯示正確的課程標題
- **常見問題**：
  - 學生資訊缺失（顯示為 '-'）：可能是 `userMap` 未能正確根據 `userId` 獲取學生名稱
  - 課程名稱顯示為 ID 而非標題：可能是 `courseMap` 請求失敗

### 3. 課程時長與剩餘資訊檢查
- **要求**：時長、剩餘課程數、剩餘時間（分）必須顯示數值
- **驗證方式**：
  - **時長**：應顯示如 "50 m"
  - **剩餘課程數**：顯示該訂單/課程的剩餘堂數
  - **剩餘時間**：顯示剩餘堂數 x 時長的加總
- **修復重點**：確保 `courseMap` 正確返回 `durationMinutes` 且 `remainingSessions` 有正確計算

### 4. 開始時間/結束時間正確性
- **要求**：開始與結束時間應基於課程資料（courseData），而非僅訂單時間
- **邏輯**：
  - **開始時間**：使用 `(nextStartDate || startDate) + startTime`
  - **結束時間**：使用 `(nextStartDate || startDate) + endTime`
- **驗證方式**：
  - 檢查時間是否顯示為 `YYYY-MM-DD HH:mm:ss` 格式
  - 確保不顯示「時間缺失」或「-」

## 環境驗證 (Environment Validation)

### 1. 必要環境變數 (Required Environment Variables)
- [ ] `.env.local` 必須包含 `LOGIN_BYPASS_SECRET`
- [ ] `.env.local` 必須包含 `TEST_TEACHER_EMAIL` / `TEST_TEACHER_PASSWORD`

### 2. 必要驗證檔案 (Required Validation Files)
- [ ] `e2e/teacher_courses_verification.spec.ts` (教師課程頁面驗證測試)

### 3. 執行驗證指令 (Validation Command)
- `npx playwright test e2e/teacher_courses_verification.spec.ts --project=chromium`

## 測試指令

### 環境變數配置
確保 `.env.local` 中有以下配置：
```bash
TEST_TEACHER_EMAIL=lin@test.com
TEST_TEACHER_PASSWORD=123456
LOGIN_BYPASS_SECRET=jv_secret_bypass_2024
```

### 自動化測試
```bash
# 執行教師頁面驗證測試
npx playwright test e2e/teacher_courses_verification.spec.ts --project=chromium
```

**測試套件包含**：
- ✅ 檢查1: 進入教室按鈕時間驗證
- ✅ 檢查2: 學生與課程資料檢查
- ✅ 檢查3: 課程時長與剩餘資訊檢查
- ✅ 檢查4: 開始/結束時間正確性
- ✅ 綜合驗收清單

## 手動驗證清單
- [ ] 以教師身份登入後導航至 `/teacher_courses`
- [ ] 確認表格有 9 列標題
- [ ] 確認學生姓名正確顯示（非 ID）
- [ ] 確認「進入教室」按鈕在當前時間符合時顯示
- [ ] 確認剩餘課程數與剩餘時間（分）有顯示具體數字

## 相關檔案
- `/app/teacher_courses/page.tsx` - 教師課程頁面主邏輯
- `e2e/teacher_courses_verification.spec.ts` - 自動化測試腳本

## 環境切換 (Environment Switching)

此 skill 同時支援 **開發環境 (localhost:3000)** 與 **正式環境 (jvtutorcorner.com)**。

```bash
# 開發環境（預設）
npx playwright test e2e/teacher_courses_verification.spec.ts --project=chromium

# 正式環境
BASE_URL=https://www.jvtutorcorner.com npx playwright test e2e/teacher_courses_verification.spec.ts --project=chromium
```
