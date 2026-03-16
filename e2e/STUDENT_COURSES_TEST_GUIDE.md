# Student Courses Page - 測試執行和結果檢查指南

## 📋 快速開始

### 1. 準備測試環境

確保 `.env.local` 中包含測試帳號和 Bypass Secret：

```bash
# .env.local
TEST_STUDENT_EMAIL=student@example.com
TEST_STUDENT_PASSWORD=your_password
LOGIN_BYPASS_SECRET=jv_secure_bypass_2024
```

### 2. 運行自動化測試

```bash
# 在項目根目錄運行
cd d:\jvtutorcorner-rwd

# 運行所有測試
npx playwright test e2e/student_courses_verification.spec.ts

# 運行特定測試
npx playwright test e2e/student_courses_verification.spec.ts -g "檢查1"

# 以調試模式運行
npx playwright test e2e/student_courses_verification.spec.ts --debug

# 以 UI 模式運行並查看實時執行
npx playwright test e2e/student_courses_verification.spec.ts --ui
```

## 📊 測試結果解讀

### 檢查1: 進入教室按鈕時間驗證

**預期結果應該顯示：**

```
開始測試：進入教室按鈕時間驗證
找到 X 個課程記錄
課程 1：課程名稱
  ✅ 進入教室按鈕顯示: 可見   (當前時間在課程時間區間內)
  或
  ✓ 進入教室按鈕隱藏: -      (當前時間不在課程時間區間內)

結果統計：
  按鈕顯示: N
  按鈕隱藏: M
```

**異常情況排查：**
- 如果所有課程都顯示按鈕隐藏（都是 `-`），檢查：
  1. 當前系統時間是否正確
  2. 課程的 startTime 和 endTime 是否正確設置
  3. 瀏覽器開發工具 (F12) → Network → `/api/courses` 查看時間值

### 檢查2: 老師欄位資料檢查

**預期結果應該顯示：**

```
開始測試：老師欄位資料檢查
課程 1 (ID: course_123)
  ✅ 老師欄位顯示: 教師名稱
  或
  ⚠️ 老師欄位缺失: "-"
    調試信息: [DEBUG] Course ID: course_123 - Teacher data missing from API

結果統計：
  老師信息存在: N
  老師信息缺失: M

需要檢查的課程ID:
  - Course ID: course_123
```

**如果看到 ⚠️ 缺失信息：**
1. 記錄 Course ID
2. 在瀏覽器 F12 DevTools 中搜索 API：`/api/courses?id=course_123`
3. 檢查 Response 中是否有 `teacherName` 或 `teacher` 欄位
4. 若沒有或為 null，需要更新課程資料庫

### 檢查3: 單堂時間(時長)欄位資料檢查

**預期結果應該顯示：**

```
開始測試：單堂時間(時長)欄位資料檢查
課程 1 (ID: course_123)
  ✅ 時長欄位顯示: 60 m
  或
  ⚠️ 時長欄位缺失: "-"
    調試信息: [DEBUG] Course ID: course_123 - durationMinutes missing or zero from API

結果統計：
  時長信息存在: N
  時長信息缺失: M

需要檢查的課程ID:
  - Course ID: course_123
```

**修復步驟：**
1. 依照調試信息記錄的 Course ID
2. 檢查數據庫課程記錄的 `durationMinutes` 欄位
3. 確保值 > 0 且為有效數字
4. 更新課程資訊並重新加載頁面

### 檢查4: 開始時間/結束時間欄位正確性

**預期結果應該顯示：**

```
開始測試：開始時間/結束時間欄位正確性
課程 1 (ID: course_123)
  ✅ 開始時間: 2026-03-14 14:30:00
  ✅ 結束時間: 2026-03-14 15:30:00
  或
  ⚠️ 開始時間缺失
    調試信息: [DEBUG] Course ID: course_123 - startTime is empty or invalid: "原始值"
  ⚠️ 結束時間缺失
    調試信息: [DEBUG] Course ID: course_123 - endTime is empty or invalid: "原始值"

結果統計：
  時間信息完整: N
  時間信息缺失: M

需要檢查的課程ID:
  - Course ID: course_123
    開始時間: 2026-03-14 (時間缺失)
    結束時間: 2026-03-14 (時間缺失)
```

**時間缺失的完整調試流程參見 SKILL.md 第1-7步**

## 🧪 手動測試檢查清單

若自動化測試無法執行，請按以下步驟手動驗證：

### 步驟1：打開 /student_courses 頁面

```
1. 登入系統（以學生帳號）
2. 導航到 http://localhost:3000/student_courses
3. 等待表格加載完成
```

### 步驟2：打開開發者工具

```
按 F12 打開開發者工具
進入 Console 標籤查看是否有 JavaScript 錯誤
進入 Network 標籤監控 API 請求
```

### 步驟3：識別問題欄位

在表格中查找顯示為 `-` 或 `(時間缺失)` 的欄位：

```
老師欄位為 "-" ? 
  ✓ Hover 查看 Tooltip（應顯示 [DEBUG] 信息）
  ✓ 在 F12 Network 中搜索 `/api/courses?id={courseId}`
  ✓ 檢查 Response 中的 teacherName 欄位

單堂時間欄位為 "-" ?
  ✓ Hover 查看 Tooltip（應顯示 durationMinutes 缺失）
  ✓ 檢查同一 API Response 中的 durationMinutes 欄位

開始/結束時間為 "(時間缺失)" ?
  ✓ Hover 查看 Tooltip（應顯示原始值和調試信息）
  ✓ 根據原始值判定是否為格式問題或完全缺失
  ✓ 按 SKILL.md 第1-7步進行調試
```

### 步驟4：測試進入教室按鈕

```
1. 找到一個課程記錄
2. 查看當前系統時間（右下角）
3. 檢查該課程的開始時間和結束時間
4. 若當前時間在區間內，「進入教室」應顯示可點擊按鈕
5. 若當前時間不在區間內，應顯示 "-"
```

## 📝 測試報告格式

當測試完成後，應生成以下格式的報告：

```markdown
# /student_courses 頁面測試報告 - 2026-03-14

## 環境信息
- Base URL: http://localhost:3000
- 測試帳號: student@example.com
- 測試時間: 2026-03-14 14:30:00

## 檢查結果

### ✅ 檢查1: 進入教室按鈕時間驗證
- 狀態: 通過
- 發現課程數: 5
- 按鈕顯示: 2 個
- 按鈕隐藏: 3 個
- 備註: 所有課程的按鈕狀態符合時間區間邏輯

### ⚠️ 檢查2: 老師欄位資料檢查
- 狀態: 部分通過
- 老師信息完整: 4 個課程
- 老師信息缺失: 1 個課程
- 问题課程 ID: course_xyz
- 修復建議: 檢查該課程的 teacherName 欄位

### ✅ 檢查3: 單堂時間(時長)欄位資料檢查
- 狀態: 通過
- 時長信息完整: 5 個課程
- 時長信息缺失: 0 個課程

### ⚠️ 檢查4: 開始時間/結束時間欄位正確性
- 狀態: 部分通過
- 時間信息完整: 4 個課程
- 時間信息缺失: 1 個課程
- 问题課程 ID: course_abc
- 原始值: "無法解析的時間格式"
- 修復建議: 按調試流程第5步檢查 cleanTimeString 函數

## 最終驗收
- [ ] 所有課程的開始時間和結束時間都正確顯示
- [ ] 進入教室按鈕在時間區間內正確顯示
- [ ] 老師欄位完整（無 "-" 符號）
- [ ] 單堂時間欄位完整（無 "-" 符號）
- [ ] 表格結構和所有欄位都正確加載
```

## 🔧 常見問題快速修復

| 症狀 | 原因 | 修復步驟 |
|------|------|--------|
| 老師欄位全是 "-" | API 未返回 teacherName | 檢查 `/app/api/courses` 實現 |
| 時長欄位全是 "-" | durationMinutes 未設置 | 檢查數據庫課程記錄 |
| 時間欄位顯示 "(時間缺失)" | 時間格式無法解析 | 按 SKILL.md 第4步測試 cleanTimeString |
| 按鈕一直不顯示 | 當前時間在區間外或系統時間錯誤 | 檢查系統時間和課程時間設置 |
| 頁面無法加載 | 權限/登錄問題 | 確認以學生身份登入 |

## 📞 需要幫助？

若遇到無法自行解決的問題，請提供：
1. 完整的測試輸出（複製 Console 中的完整日誌）
2. 瀏覽器版本和操作系統
3. 特定課程的 ID 和錯誤信息
4. F12 Network 中 `/api/courses` 的 Response 內容
