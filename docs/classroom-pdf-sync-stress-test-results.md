# 教室 PDF 同步壓力測試結果整理

日期：2026-06-20  
測試目標：`/classroom/wait` PDF 上傳與 `/classroom/room` PDF 白板同步  
測試檔案：`e2e/classroom/07_room_pdf_sync_stress.spec.ts`

## 測試目的

本文整理 1 到 6 組同步教室壓力測試的歷史結果，包含本機驗證、正式環境開啟瀏覽器測試、測試流程中遇到的問題，以及目前觀察到的正式環境容量臨界點。

目前最重要的結論是：課程建立、審核、報名、PDF 上傳、進入教室，在 6 組情境下都能完成。真正失敗的位置出現在進入教室之後，也就是 PDF 白板 scene 同步與 heartbeat 活動期間。

## 測試指令模式

正式環境開啟瀏覽器測試：

```powershell
$env:APP_ENV='production'
$env:CONCURRENT_GROUPS='<GROUP_COUNT>'
$env:STRESS_RUN_TS='<UNIQUE_RUN_TIMESTAMP>'
$env:STRESS_COURSE_DURATION_MINUTES='30'
$env:SKIP_CLEANUP='1'
$env:HEADLESS='false'
npx.cmd playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium --reporter=line
```

本機 headless 驗證：

```powershell
$env:APP_ENV='local'
$env:NEXT_PUBLIC_BASE_URL='http://localhost:3001'
$env:CONCURRENT_GROUPS='1'
$env:STRESS_RUN_TS='1781937000000'
$env:STRESS_COURSE_DURATION_MINUTES='30'
$env:REUSE_STRESS_SETUP='1'
$env:SKIP_CLEANUP='1'
$env:ENROLLMENT_PROPAGATION_WAIT_MS='0'
$env:HEADLESS='true'
npx.cmd playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium --reporter=line
```

## 結果總表

| 組數 | 環境 | 瀏覽器模式 | 資料建立方式 | 結果 | PDF 同步數 | 備註 |
|---:|---|---|---|---|---:|---|
| 1 | 本機 | Headless | 復用前置資料 | 通過 | 1/1 | 修正錄影輸出路徑後，本機驗證修改後流程可正常執行。 |
| 1 | 正式環境 | Headless | 全新建立 | 通過 | 1/1 | 正式環境單組 baseline 通過。 |
| 2 | 正式環境 | Headed | 全新建立 | 通過 | 2/2 | 開啟瀏覽器測試通過。 |
| 3 | 正式環境 | Headed | 全新建立 | 通過 | 3/3 | 開啟瀏覽器測試通過。 |
| 4 | 正式環境 | Headed | 全新建立 | 曾不穩，重跑通過 | 重跑 4/4 | 先前一次在 PDF sync 發生 page/context closed；立即重跑後全數通過。 |
| 5 | 正式環境 | Headed | 全新建立 | 達到門檻，但非全綠 | 4/5 | 因門檻為 75%，整體測試通過；但 1 組在 `pdf_sync_verify` 失敗。 |
| 6 | 正式環境 | Headed | 全新建立 | 失敗 | 0/6 | 全部組別都已進入教室，但全部在 `pdf_sync_verify` 失敗；正式環境出現多個 500 回應。 |

## 詳細測試歷程

### 1 組，本機

結果：通過。

觀察結果：

- 報名：`1/1`
- PDF 上傳：`1/1`
- 進入教室：`1/1`
- PDF 同步：`1/1`

通過前發現的問題：

- 第一次本機測試已經進到 Phase 4，但因錄影 helper 嘗試寫入 `D:\playwright-recordings` 而失敗。
- 這是本機檔案權限問題，與教室同步功能本身無關。
- 錄影輸出路徑已改為預設寫入 `<repo>/test-results/playwright-recordings`，並保留 `PLAYWRIGHT_RECORDINGS_ROOT` 作為覆寫參數。

結論：

- 修改後的壓力測試流程，在本機 1 組 baseline 情境可正常執行。
- 錄影路徑問題屬於測試基礎設施問題，不是教室產品功能問題。

### 1 組，正式環境

結果：通過。

觀察結果：

- 報名：`1/1`
- PDF 上傳：`1/1`
- 進入教室：`1/1`
- PDF 同步：`1/1`

結論：

- 正式環境單一老師與學生組合的 baseline 是健康的。

### 2 組，正式環境開啟瀏覽器

結果：通過。

觀察結果：

- 報名：`2/2`
- PDF 上傳：`2/2`
- 進入教室：`2/2`
- PDF 同步：`2/2`

結論：

- 正式環境 headed browser 流程在 2 組併發時穩定。

### 3 組，正式環境開啟瀏覽器

結果：通過。

觀察結果：

- 報名：`3/3`
- PDF 上傳：`3/3`
- 進入教室：`3/3`
- PDF 同步：`3/3`

結論：

- 正式環境 headed browser 流程在 3 組併發時穩定。

### 4 組，正式環境開啟瀏覽器

結果：曾發生不穩，重跑後通過。

先前失敗的觀察結果：

- 報名：`4/4`
- PDF 上傳：`4/4`
- 進入教室：`4/4`
- PDF 同步：`1/4`
- 失敗組別：`group-1`、`group-2`、`group-3`
- 失敗階段：`pdf_sync_verify`
- 錯誤：`page.waitForFunction: Target page, context or browser has been closed`
- Console 有重複 heartbeat 活動，並出現部分 server `500` 回應。

重跑後觀察結果：

- 報名：`4/4`
- PDF 上傳：`4/4`
- 進入教室：`4/4`
- PDF 同步：`4/4`

結論：

- 4 組不是穩定必敗點。
- 4 組曾出現不穩，但可以完整通過。
- 失敗位置仍然是在進入教室之後，不是課程查找或報名階段。

### 5 組，正式環境開啟瀏覽器

結果：達到測試門檻，但不是完全健康。

觀察結果：

- 報名：`5/5`
- PDF 上傳：`5/5`
- 進入教室：`5/5`
- PDF 同步：`4/5`
- 失敗組別：`group-2`
- 失敗階段：`pdf_sync_verify`
- 錯誤：`page.waitForFunction: Target page, context or browser has been closed`
- 要求成功率：`75%`
- 實際成功率：`80%`

結論：

- 5 組是目前實務上的邊界。
- 雖然可以達到測試門檻，但不是完全穩定，因為有 1 組在同步驗證期間失去 page/context。

### 6 組，正式環境開啟瀏覽器

結果：失敗。

觀察結果：

- 報名：`6/6`
- PDF 上傳：`6/6`
- 進入教室：`6/6`
- PDF 同步：`0/6`
- 失敗組別：`group-0` 到 `group-5`
- 失敗階段：`pdf_sync_verify`
- 所有組別錯誤：`page.waitForFunction: Target page, context or browser has been closed`
- 要求成功率：`75%`
- 實際成功率：`0%`

正式環境額外訊號：

- 多個瀏覽器 console 記錄顯示進入教室後 server 回傳 `500`。
- `500` 大多出現在 heartbeat / classroom session 活動附近。
- 每一組都已成功抵達 `/classroom/room`，之後才在同步驗證失敗。

結論：

- 6 組目前超過正式環境對這條 PDF 同步流程的穩定承載能力。
- 失敗集中在進入教室後的白板同步階段。

## 測試過程中發現的問題

### 1. 測試流程在學生/老師課程列表可能選到錯誤課程

表面現象：

- 學生端看起來像是「找不到課程」。
- 一開始容易誤判成課程排序或資料同步 propagation 問題。

實際問題：

- 測試 helper 使用過寬的 row/card matching。
- 當歷史壓力測試課程很多時，可能選到或檢查到錯誤課程。

已套用的修正方向：

- 優先使用精準 `data-course-id` 匹配。
- 驗證 wait room URL 內含預期的 `courseId`。
- 只有在精準匹配失敗後，才 fallback 到直接組 wait room URL。
- 學生直接進入 wait room 時，先透過 `/api/orders?courseId=...` 找 active order，再把 `orderId` 帶入 wait room URL。

狀態：

- 這是測試 helper 問題。
- 它不是目前 5 組或 6 組 PDF 同步失敗的主因。

### 2. Enrollment propagation wait 讓重複測試變慢

表面現象：

- 測試看起來卡很久才進入真正有價值的同步驗證。
- 尤其每次都重新建立帳號、課程、審核、報名時更明顯。

實際問題：

- 報名 propagation 有固定等待時間。
- fresh setup 每次都會花時間在帳號、課程、審核、報名前置流程。

已套用的修正方向：

- 新增由環境變數控制的復用旗標：
  - `REUSE_STRESS_SETUP`
  - `REUSE_ACCOUNTS`
  - `REUSE_POINTS`
  - `REUSE_COURSES`
  - `REUSE_APPROVALS`
  - `REUSE_ENROLLMENTS`
  - `REUSE_PDF_UPLOADS`
- 新增 `ENROLLMENT_PROPAGATION_WAIT_MS`，讓等待時間可以用指令控制，不需寫死在程式碼。

狀態：

- 測試流程現在可以透過指令調整。
- 但正式環境容量測試仍採用 fresh setup，避免舊課程或舊訂單資料造成誤判。

### 3. 復用舊壓力測試資料會產生無效結果

表面現象：

- 某些復用資料的測試看起來卡住或失敗。

實際問題：

- 壓力測試課程原本時長較短。
- 當復用舊 course/order 資料，但課程時間已過，會造成誤導性的失敗結果。

已套用的修正方向：

- 正式環境容量測試使用全新的 `STRESS_RUN_TS`。
- 將 `STRESS_COURSE_DURATION_MINUTES` 提高到 `30`。

狀態：

- 本文件中的容量結論，以 fresh setup 且 30 分鐘課程時長的正式環境測試為主要依據。

### 4. 本機錄影輸出路徑失敗

表面現象：

- 本機 headless 測試嘗試寫入錄影時發生檔案權限錯誤。

實際問題：

- recording helper 預設寫入 `D:\playwright-recordings` 或 `C:\playwright-recordings`。
- 在本機或 sandboxed 環境中，這些路徑不一定可寫。

已套用的修正方向：

- 預設錄影輸出改為 repo 內：
  - `test-results/playwright-recordings`
- 可選覆寫參數：
  - `PLAYWRIGHT_RECORDINGS_ROOT`

狀態：

- 此修正已解除本機驗證阻塞。

### 5. PDF 同步失敗發生在成功進入教室之後

表面現象：

- 5 組時，有 1 組同步驗證失敗。
- 6 組時，所有組別同步驗證失敗。

一致事實：

- 報名成功。
- PDF 上傳成功。
- 老師與學生都進入 `/classroom/room`。
- 同步驗證前，PDF metadata 可被找到。
- 失敗發生在等待 PDF scene 或 page index 同步時。

觀察到的錯誤：

```text
page.waitForFunction: Target page, context or browser has been closed
```

觀察到的正式環境訊號：

```text
Failed to load resource: the server responded with a status of 500
```

目前判斷：

- 問題指向正式環境 runtime 承載能力，或 classroom heartbeat/session/whiteboard sync 相關 server-side 穩定性。
- 這不能用課程排序、報名 propagation 或 PDF 上傳失敗來解釋。

## 目前容量臨界點

| 併發組數 | 狀態 |
|---:|---|
| 1 | 穩定 |
| 2 | 穩定 |
| 3 | 穩定 |
| 4 | 大致穩定，但曾觀察到一次 flaky 失敗 |
| 5 | 達到門檻，但曾觀察到部分同步失敗 |
| 6 | 最新正式環境 headed 測試明確失敗 |

建議的操作解讀：

- 安全 baseline：最多 3 組。
- 觀察區：4 組。
- 邊界區：5 組。
- 失敗區：6 組。

## 下一步除錯目標

1. 針對 6 組測試期間的 `500` 回應抓正式環境 server-side log。
2. 確認是哪個 API endpoint 在 heartbeat/session sync 期間回傳 `500`。
3. 在 Playwright 測試中加入 request-level diagnostics，記錄 method、URL、status、group label。
4. 增加 production-safe stress mode，把壓測拆成：
   - 只測進入教室
   - 只測 heartbeat
   - 只測 PDF 上傳
   - 只測 PDF scene sync
5. 補齊 endpoint 診斷後，重新測 4、5、6 組。

## 測試產物參考

最新 6 組失敗截圖位置：

```text
test-results/classroom-07_room_pdf_sync-87b98--classroom-entry-→-PDF-sync-chromium/test-failed-*.png
```

Playwright HTML report：

```text
playwright-report/index.html
```

