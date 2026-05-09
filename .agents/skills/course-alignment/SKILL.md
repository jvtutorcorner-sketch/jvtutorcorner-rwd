---
name: course-alignment
description: '檢查頁面 /student_courses 登入的帳號跟頁面 /teacher_courses 的對應的課程對齊'
argument-hint: '驗證學生與老師語師頁面間的課程資料一致性'
metadata:
  verified-status: ✅ VERIFIED
  last-verified-date: '2026-03-15'
  architecture-aligned: true
---

# 課程對齊驗證技能 (Course Alignment Verification)

此技能用於驗證學生看到的課程列表 (`/student_courses`) 與老師看到的課程列表 (`/teacher_courses`) 之間的資料是否一致。

## Mobile Optimization Standard (iOS & Android)

在設計或除錯移動端 UI 時，必須同時驗證 WebKit（iOS Safari）與 Blink（Android Chrome）的一致性：

1. **高度適應**：禁止單純使用 `100vh` 定位全螢幕元素。必須優先考慮動態視窗單位（`dvh`/`svh`）或使用 JS 動態計算 `--vh`，避免 iOS/Android 瀏覽器工具列遮擋內容。
2. **邊距緩衝**：所有 Fixed/Absolute 且貼齊邊緣的元素，必須使用 `env(safe-area-inset-top)`、`env(safe-area-inset-bottom)`、`env(safe-area-inset-left)`、`env(safe-area-inset-right)`。
3. **寬度防禦**：避免在移動端使用 `vw` 定義主要容器寬度，改用 `%`、`max-width` 或 `calc(100% - padding)`，避免 Android 捲軸導致水平溢出。
4. **渲染測試**：修復與驗證步驟必須同時覆蓋 Safari（iOS）與 Chrome（Android），不得僅在單一引擎驗收。

## 功能檢查清單

### 1. 跨角色資料一致性
- **架構描述**：請參考 [Core Operational Flows](../../../architecture_overview.md#2-core-operational-flows) 以理解報名激活後的資料結構。
- **要求**：同一堂課程在學生端與老師端顯示的「開始時間」、「結束時間」、「課程名稱」必須完全相同。
- **資料來源優先級 (Source of Truth)**：
  1. **訂單資料 (Order Data)**：優先讀取訂單中的 `startTime`、`endTime` 及 `createdAt`。
  2. **課程表預設 (Course Table)**：若訂單無特定時間，則 fallback 到 `courseMap` 中的 `nextStartDate`/`startDate` 及預設時間。
- **驗證方式**：
  - 登入學生帳號，記錄所有課程的 ID、名稱、開始時間、結束時間。
  - 登入老師帳號，找出與該學生相關的課程。
  - 比對兩者間的關鍵欄位。
- **相關代碼位置**：
  - `/app/student_courses/page.tsx` (使用 `cleanTimeString` 與訂單優先邏輯)
  - `/app/teacher_courses/page.tsx` (使用 `cleanTimeString` 與訂單優先邏輯)

## 環境驗證 (Environment Validation)

### 1. 必要環境變數 (Required Environment Variables)
- [ ] `.env.local` 必須包含 `LOGIN_BYPASS_SECRET`
- [ ] `.env.local` 必須包含 `TEST_STUDENT_EMAIL` / `TEST_STUDENT_PASSWORD`
- [ ] `.env.local` 必須包含 `TEST_TEACHER_EMAIL` / `TEST_TEACHER_PASSWORD`

### 2. 必要驗證檔案 (Required Validation Files)
- [ ] `e2e/course_alignment_verification.spec.ts` (跨角色課程對齊驗證)

### 3. 執行驗證指令 (Validation Command)
- `npx playwright test e2e/course_alignment_verification.spec.ts --project=chromium`

## 測試指令

### 自動化測試
```bash
# 執行課程對齊驗證測試
npx playwright test e2e/course_alignment_verification.spec.ts --project=chromium
```

**測試套件包含**：
- ✅ 步1: 登入學生帳號並抓取數據
- ✅ 步2: 登入老師帳號並抓取數據
- ✅ 步3: 交叉比對課程 ID、時間與名稱

## 環境切換 (Environment Switching)

此 skill 同時支援 **開發環境 (localhost:3000)** 與 **正式環境 (jvtutorcorner.com)**。

```bash
# 開發環境（預設）
npx playwright test e2e/course_alignment_verification.spec.ts --project=chromium

# 正式環境
BASE_URL=https://www.jvtutorcorner.com npx playwright test e2e/course_alignment_verification.spec.ts --project=chromium
```

## 相關檔案
- `e2e/course_alignment_verification.spec.ts` - 自動化測試腳本
- `.agents/skills/student-courses-page/SKILL.md`
- `.agents/skills/teacher-courses-page/SKILL.md`
