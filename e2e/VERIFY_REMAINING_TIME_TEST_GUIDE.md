# 課程剩餘時間驗證測試指南 (Verify Remaining Time Test Guide)

## 簡介 (Introduction)
本文件詳細說明 `verify_remaining_time.spec.ts` 測試檔案的測試邏輯與執行方式。該測試旨在驗證當教師結束課程時，課程的**「剩餘時間 (Remaining Time)」**是否能正確地在資料庫中更新，並同步反映在教師與學生的課程儀表板 (Dashboard) 上。

## 測試目標 (Test Objectives)
- 確保課程在建立與報名後的初始時間正確 (60 分鐘)。
- 確保教師與學生進入教室後，系統能夠啟動時間追蹤與同步機制。
- 確保在教室停留超過 1 分鐘後 (65秒)，系統有正確扣除上課時間。
- 確保教師點擊「結束課程」後，剩餘時間正確更新並顯示於 `/teacher_courses` 與 `/student_courses` 列表中。

## 測試步驟解析 (Step-by-Step Breakdown)

1. **Step 0: 初始化課程與報名 (Triggering enrollment flow)**
   - 自動創建一堂 60 分鐘的課程。
   - 使用學生帳號自動完成該課程的報名與購買流程。

2. **Step 1: 登入並驗證初始時間 (Login & Verify Initial Time)**
   - 啟動兩個瀏覽器環境（模擬教師與學生）。
   - 自動繞過設備權限檢查 (Camera/Microphone)。
   - 分別進入 `/teacher_courses` 與 `/student_courses` 頁面。
   - 驗證課程卡片/列表上的初始剩餘時間顯示為 **60 分鐘**。

3. **Step 2: 進入教室 (Entering Classroom)**
   - 教師與學生分別進入等待室 (Wait Room)。
   - 雙方點擊進入教室並完成「準備就緒 (Ready)」操作，最後進入白板與視訊教室。

4. **Step 3: 教室內停留計時 (Timer Update in Classroom)**
   - 在教室內停留 **65 秒鐘**。
   - 觸發系統 60 秒的定期同步機制 (Periodic sync)，確保有實際產生上課時間消耗。

5. **Step 4: 教師結束課程 (Teacher Ends Course)**
   - 教師點擊「結束課程 (End Session)」按鈕，並在彈出視窗中確認離開。
   - 觸發後端資料庫更新該課程的剩餘時間。

6. **Step 5: 驗證儀表板更新時間 (Verify Updated Time on Dashboards)**
   - 教師與學生重新載入各自的課程列表頁面。
   - 抓取畫面上最新的剩餘時間。
   - 斷言 (Assertion)：**最終剩餘時間 < 初始剩餘時間 (60m)**。若成立，測試通過。

7. **Step 6: 清理測試資料 (Cleanup)**
   - 測試結束後，呼叫 API 刪除生成的課程與訂單，避免污染資料庫。
   - 若設定了 `SKIP_CLEANUP=true` 環境變數，則保留資料供後續開發者人工檢查。

---

## 執行測試指令 (How to Run the Test)

請在專案根目錄下開啟終端機 (Terminal) 並執行以下指令：

### 1. 標準執行 (Standard Run)
使用 Playwright 預設設定無頭執行測試，並在終端機輸出結果：
```bash
npx playwright test e2e/verify_remaining_time.spec.ts
```

### 2. 顯示瀏覽器 UI 執行 (Headed Mode)
若想要看見自動化點擊操作與 UI 變化過程：
```bash
npx playwright test e2e/verify_remaining_time.spec.ts --headed
```

### 3. 開啟 Playwright UI 介面 (UI Mode)
適合用來進行除錯、查看每一步驟的 Snapshot 與 Network Request：
```bash
npx playwright test e2e/verify_remaining_time.spec.ts --ui
```

### 4. 保留測試資料 (Skip Cleanup)
若測試失敗或想去資料庫/網頁檢查生成的測試資料，可加上環境變數略過清理步驟：

**Windows (PowerShell):**
```powershell
$env:SKIP_CLEANUP="true"; npx playwright test e2e/verify_remaining_time.spec.ts
```

**Mac/Linux:**
```bash
SKIP_CLEANUP=true npx playwright test e2e/verify_remaining_time.spec.ts
```

## 注意事項 (Notes)
- 執行此測試前，請確保 `.env.local` 檔案已正確設定資料庫連線、測試帳號密碼與 Bypass Secret。
- 此測試最長可能會耗時約 3~5 分鐘 (包含等待的 65 秒)，Playwright Timeout 預設設定為 300,000 毫秒 (5 分鐘)。
