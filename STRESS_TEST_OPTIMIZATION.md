# 課程審核流程優化 - 修復指南

## 問題分析

**根本原因**：Step 0.5 (管理員審核課程) 沒有在 Step 0 (創建課程) 和 Step 1 (學生報名) 之間執行，造成課程未審核就被用於報名，導致課程無法在學生清單中出現。

## 修復內容

### 1. 修正執行順序
- **之前**：Step 0 → Step 1 → Step 0.5 → 其他步驟
- **現在**：Step 0 → *Step 0.5* → Step 1 → 其他步驟

### 2. 優化 `adminApproveCourse()` 函數
改進包括：
- ✅ 嘗試直接 API 審核（更快速）
- ✅ 使用 `domcontentloaded` 而非 `networkidle` (加快頁面加載)
- ✅ 多重選擇器策略尋找課程和按鈕
- ✅ 改進的確認對話框處理
- ✅ 詳細的日誌記錄用於調試
- ✅ 優雅的降級處理

### 3. 優化 `createCourseAsTeacher()` 函數
改進包括：
- ✅ 改用 `domcontentloaded` 而非 `networkidle`（解決導航超時）
- ✅ 添加導航降級邏輯（優雅降低超時要求）
- ✅ 更好的表單元素驗證
- ✅ 改進的超時錯誤日誌
- ✅ 提高多教師並行課程創建的可靠性

### 4. 修復 TypeScript 選擇器錯誤  
- ✅ 移除 `selectOption()` 中的正則表達式，改使用字符串

## 執行指令

### 選項 A：完整清理 + 新測試（推薦）
```bash
# 清理舊測試數據
./cleanup-test-data.sh

# 重新運行優化後的壓力測試
SKIP_CLEANUP=true npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts --grep "Stress test" --project=chromium
```

### 選項 B：直接運行新測試（假設無需清理）
```bash
SKIP_CLEANUP=true npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts --grep "Stress test" --project=chromium
```

### 選項 C：運行單個小組測試（調試）
```bash
STRESS_GROUP_COUNT=1 npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts --grep "Stress test" --project=chromium
```

## 執行流程詳解

### Step 0: 教師建立課程 (多教師隔離)
```
- group-0-teacher@test.com → 創建課程 stress-group-0-{timestamp}
- group-1-teacher@test.com → 創建課程 stress-group-1-{timestamp}
- group-2-teacher@test.com → 創建課程 stress-group-2-{timestamp}
```
**預期輸出**：
```
✅ All 3 courses created successfully by their respective teachers
```

### Step 0.5: 管理員審核課程 (新增/優化)
```
- admin@jvtutorcorner.com 登入 /admin/course-reviews
- 依序審核 3 個課程
- 確認審核對話框
```
**預期輸出**：
```
✅ All 3 courses approved by admin
```

### Step 1: 學生報名課程
```
- basic@test.com 報名所有 3 個課程
- 驗證點數扣除
- 進入教室等待頁面
```
**預期輸出**：
```
✅ All 3 groups completed enrollment successfully
```

### Step 2-4: 並行測試
- 教師和學生同時進入教室
- 驗證隔離（每組只看到 2 人）
- 教師繪圖同步驗證

### Step 10: 清理 (可選)
```
SKIP_CLEANUP=false npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts --grep "Stress test"
```

## 故障排查

### 問題：課程審核頁面為空
**解決方案**：
1. 確認管理員帳戶 `admin@jvtutorcorner.com` 可訪問 /admin/course-reviews
2. 檢查課程是否實際創建（查看教師課程管理页面）
3. 檢查 DynamoDB 中的 `jvtutorcorner-courses` 表

### 問題：課程在學生清單中找不到
**可能原因**：
1. ❌ 課程未被管理員審核 (已修復 - Step 0.5 優化)
2. ❌ 課程狀態仍為 "待審核" (已修復 - 現在會正確審核)
3. ❌ API 響應延遲 (已改進 - 添加重試邏輯)

### 問題：管理員審核超時
**解決方案**：
1. 檢查 `/admin/course-reviews` 頁面元素選擇器是否匹配
2. 查看日誌中的"Found X items in review list"（應 > 0）
3. 檢查測試結果中的 screenshot (test-results/*.png)

## 提交內容

### 修改檔案
- `e2e/classroom_room_whiteboard_sync.spec.ts`
  - 重新排列 Step 0.5 在 Step 1 之前
  - 優化 `adminApproveCourse()` 函數
  - 修復 TypeScript 選擇器錯誤

### 新增檔案
- `cleanup-test-data.sh` - 快速清理腳本
- `e2e/cleanup-test-data.spec.ts` - Playwright 清理測試 (備用)
- `cleanup-test-data.mjs` - Node.js 清理工具 (備用)

## 預期結果

✅ 所有 3 個教師課程被正確創建
✅ 管理員成功審核所有 3 個課程  
✅ 學生能在課程清單中找到已審核課程
✅ 學生成功報名並進入教室
✅ 3 組學生與教師隔離，並行進行白板同步測試
