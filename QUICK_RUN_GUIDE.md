# 快速執行指南 - 課程審核優化壓力測試

## 已完成的優化

✅ **Step 0.5 審核流程** - 移到 Step 1 之前執行
✅ **多教師課程創建** - 改進導航超時處理  
✅ **管理員課程審核** - 添加 API 直接審核選項
✅ **TypeScript 類型錯誤** - 修復 selectOption() 正則表達式

## 執行指令

### 方式一：標準執行（推薦）
```bash
cd /Users/xucaiming/jvtutorcorner-rwd

# 運行優化後的壓力測試
SKIP_CLEANUP=true npx playwright test \
  e2e/classroom_room_whiteboard_sync.spec.ts \
  --grep "Stress test" \
  --project=chromium
```

### 方式二：單組測試（快速驗證）
```bash
STRESS_GROUP_COUNT=1 SKIP_CLEANUP=true npx playwright test \
  e2e/classroom_room_whiteboard_sync.spec.ts \
  --grep "Stress test" \
  --project=chromium
```

### 方式三：帶詳細報告
```bash
SKIP_CLEANUP=true npx playwright test \
  e2e/classroom_room_whiteboard_sync.spec.ts \
  --grep "Stress test" \
  --project=chromium \
  --reporter=verbose \
  --reporter=html=test-results/report.html
```

## 預期執行流程

```
📍 Step 0: 各教師建立課程
├─ group-0-teacher@test.com → stress-group-0-{timestamp}
├─ group-1-teacher@test.com → stress-group-1-{timestamp}
└─ group-2-teacher@test.com → stress-group-2-{timestamp}
   預期: ✅ All 3 courses created successfully

📍 Step 0.5: 管理員審核課程 【新增】
├─ admin@jvtutorcorner.com 登入 /admin/course-reviews
├─ 審核 stress-group-0/1/2-{timestamp}
└─ 確認審核對話框
   預期: ✅ All 3 courses approved by admin

📍 Step 1: 學生報名課程
├─ basic@test.com 報名 3 個課程
├─ 驗證點數扣除
└─ 進入教室等待頁面
   預期: ✅ All 3 groups completed enrollment

📍 Step 2-4: 並行白板測試
├─ 3 組教師和學生同時進入教室
├─ 驗證隔離（每組只看到 2 人）
└─ 教師繪圖同步驗證
   預期: ✅ Whiteboard sync verified
```

## 修改檔案清單

```
修改:
  e2e/classroom_room_whiteboard_sync.spec.ts
  - 重新排列 Step 0.5 到 Step 1 之前
  - 優化 createCourseAsTeacher() - 改用 domcontentloaded
  - 優化 adminApproveCourse() - 添加 API 審核選項
  - 修復 TypeScript selectOption() 錯誤

新增:
  STRESS_TEST_OPTIMIZATION.md - 詳細優化文檔
  cleanup-test-data.sh - 清理測試數據腳本 (可選)

備用/輔助:
  e2e/cleanup-test-data.spec.ts - Playwright 清理測試
  cleanup-test-data.mjs - Node.js 清理工具
```

## 故障排查

### 課程在學生清單中找不到?
看日誌中的:
- ✅ 確認 Step 0.5 有 "Course approved by admin" 訊息
- ✅ 確認未看到 "TimeoutError" 在 Step 0 中
- ✅ 查看管理員審核頁面是否有課程（參考 screenshot）

### 導航超時 TimeoutError?
- ✅ 已改用 domcontentloaded (更寬鬆的條件)
- ✅ 添加了降級邏輯
- 如果仍然失敗: 檢查服務器是否運行 (`curl http://localhost:3000`)

### 只有部分群組完成?
- ✅ Group-0 通常成功（第一個執行）
- ✅ Group-1/2 可能因網絡超時失敗
- 💡 使用 `STRESS_GROUP_COUNT=1` 測試單組

## 成功指標

✅ Step 0: 看到 "All 3 courses created successfully"
✅ Step 0.5: 看到 "All 3 courses approved by admin"  
✅ Step 1: 看到 "All 3 groups completed enrollment"
✅ 最終: 測試通過或看到完成訊息

---

**預計執行時間**: 3-5 分鐘（單組）或 8-15 分鐘（3 組）
