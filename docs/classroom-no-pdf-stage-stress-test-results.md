# 教室未上傳 PDF 階段壓力測試結果整理

日期：2026-06-20  
資料來源：`e2e/classroom/07_room_pdf_sync_stress.spec.ts` 歷史測試紀錄中的非 PDF 同步階段  
測試範圍：課程建立、審核、報名、課程列表查找、進入 wait room、進入 `/classroom/room`

## 文件目的

本文整理「不以上傳 PDF 或 PDF 同步為判斷核心」時，不同併發組數在教室前置流程與進入教室流程中的表現。

需要先釐清：目前尚未執行一支完全獨立、明確跳過 PDF 上傳的 no-PDF 壓力測試 spec。本文是從既有 1 到 6 組 PDF sync 壓力測試中，抽出 PDF 上傳前與進入教室階段的結果來整理。因此這份文件可以回答：

- 多組併發時，課程建立是否成功？
- 管理員審核是否成功？
- 學生報名是否成功？
- 學生端是否還會找不到課程？
- 老師與學生是否能進入教室？
- 失敗是否發生在 PDF 上傳之前？

但這份文件不能宣稱已經完成「完全不觸發 PDF 上傳」的獨立壓測。

## 結論摘要

從 1 到 6 組的測試紀錄來看，非 PDF 階段整體是穩定的：

- 課程建立成功。
- 管理員審核成功。
- 學生報名成功。
- 老師端能找到對應課程。
- 學生端經過 helper 修正後，能以正確 `courseId` / `orderId` 進入 wait room。
- 1 到 6 組都能完成進入 `/classroom/room`。

目前主要失敗點不是「沒有上傳 PDF 前」的流程，而是 PDF 上傳成功並進入教室後的白板同步與 heartbeat 階段。

補充 2026-06-20 後續測試：

- 10 組、正式環境、headed、課程 5 分鐘、不上傳 PDF、只驗證進入教室與 60 秒穩定：通過。
- 補上「老師畫線、學生端確認同步」後，同樣 10 組情境失敗，畫線同步 `0/10`。
- 這表示「不傳 PDF」時，10 組可以進入教室，但白板畫線同步在 10 組壓力下不穩。
- 依序從 6 組往上補測畫線同步後，6 組通過、7 組失敗，因此目前 no-PDF 畫線同步臨界點落在 `6 -> 7`。

補充 2026-06-24 最新修正後重測：

- 7 組：畫線同步與短穩定檢查 `7/7`，通過。
- 8 組：畫線同步與短穩定檢查 `8/8`，通過。
- 9 組：報名與進教室 `9/9`，畫線同步僅 `6/9`，成功率 67%，未達 75% 門檻。
- 依照「發現無法同步就停止」規則，未繼續測試 10 組。
- 最新可確認臨界點更新為 `8 -> 9`。

## 結果總表

| 組數 | 環境 | 瀏覽器模式 | 課程建立 | 審核 | 報名 | 課程查找 / Wait room | 進入教室 | 非 PDF 階段結論 |
|---:|---|---|---|---|---|---|---|---|
| 1 | 本機 | Headless | 通過 | 通過 | 1/1 | 通過 | 1/1 | 本機 baseline 正常。 |
| 1 | 正式環境 | Headless | 通過 | 通過 | 1/1 | 通過 | 1/1 | 正式環境單組正常。 |
| 2 | 正式環境 | Headed | 通過 | 通過 | 2/2 | 通過 | 2/2 | 2 組非 PDF 階段正常。 |
| 3 | 正式環境 | Headed | 通過 | 通過 | 3/3 | 通過 | 3/3 | 3 組非 PDF 階段正常。 |
| 4 | 正式環境 | Headed | 通過 | 通過 | 4/4 | 通過 | 4/4 | 4 組非 PDF 階段正常；後續 PDF sync 曾不穩。 |
| 5 | 正式環境 | Headed | 通過 | 通過 | 5/5 | 通過 | 5/5 | 5 組非 PDF 階段正常；後續 1 組 PDF sync 失敗。 |
| 6 | 正式環境 | Headed | 通過 | 通過 | 6/6 | 通過 | 6/6 | 6 組非 PDF 階段正常；後續 PDF sync 全失敗。 |
| 6 | 正式環境 | Headed | 通過 | 通過 | 6/6 | 通過 | 6/6 | no-PDF 畫線同步補測通過，短穩定檢查通過。 |
| 7 | 正式環境 | Headed | 通過 | 通過 | 7/7 | 通過 | 7/7 | no-PDF 畫線同步補測失敗，`0/7` 通過；停止往上測。 |
| 7 | 正式環境 | Headed | 通過 | 通過 | 7/7 | 通過 | 7/7 | 2026-06-24 最新修正後重測：畫線同步與穩定檢查 `7/7`。 |
| 8 | 正式環境 | Headed | 通過 | 通過 | 8/8 | 通過 | 8/8 | 2026-06-24 最新修正後重測：畫線同步與穩定檢查 `8/8`。 |
| 9 | 正式環境 | Headed | 通過 | 通過 | 9/9 | 通過 | 9/9 | 畫線同步僅 `6/9`，成功率 67%；未達 75% 門檻並停止往上測。 |
| 10 | 正式環境 | Headed | 通過 | 通過 | 10/10 | 通過 | 10/10 | 不上傳 PDF 且只檢查進教室/短穩定可通過；補畫線同步後失敗 0/10。 |

## 各組詳細狀況

### 1 組，本機

非 PDF 階段結果：通過。

觀察結果：

- 學生帳號可用。
- 點數授予成功。
- 老師建立課程成功。
- 管理員審核成功。
- 學生報名成功。
- 老師與學生能進入教室。

遇到的問題：

- 本機第一次失敗點不是業務流程，而是錄影 helper 嘗試寫入 `D:\playwright-recordings` 導致權限錯誤。
- 修正錄影輸出路徑後，本機 1 組通過。

判斷：

- 本機非 PDF 流程沒有發現產品功能問題。

### 1 組，正式環境

非 PDF 階段結果：通過。

觀察結果：

- 報名：`1/1`
- 進入教室：`1/1`

判斷：

- 正式環境單組課程與進教室流程正常。

### 2 組，正式環境開啟瀏覽器

非 PDF 階段結果：通過。

觀察結果：

- 報名：`2/2`
- 進入教室：`2/2`

判斷：

- 2 組併發下，學生端與老師端都能完成課程查找與進入教室。

### 3 組，正式環境開啟瀏覽器

非 PDF 階段結果：通過。

觀察結果：

- 報名：`3/3`
- 進入教室：`3/3`

判斷：

- 3 組併發下，非 PDF 階段穩定。
- 這是目前正式環境最安全的併發 baseline。

### 4 組，正式環境開啟瀏覽器

非 PDF 階段結果：通過。

觀察結果：

- 報名：`4/4`
- 進入教室：`4/4`

後續狀況：

- 曾有一次 4 組測試在 PDF sync 階段只同步 `1/4`。
- 立即重跑後 PDF sync `4/4`。

判斷：

- 4 組的前置流程與進教室流程不是問題。
- 4 組的不穩定點出現在進教室後的白板/PDF 同步階段。

### 5 組，正式環境開啟瀏覽器

非 PDF 階段結果：通過。

觀察結果：

- 報名：`5/5`
- 進入教室：`5/5`

後續狀況：

- PDF sync `4/5`。
- `group-2` 在 `pdf_sync_verify` 發生：

```text
page.waitForFunction: Target page, context or browser has been closed
```

判斷：

- 5 組時，非 PDF 階段仍然正常。
- 問題開始出現在進入教室後的同步驗證階段。

### 6 組，正式環境開啟瀏覽器

非 PDF 階段結果：通過。

觀察結果：

- 報名：`6/6`
- PDF 上傳前的前置流程：通過。
- 進入教室：`6/6`

後續狀況：

- PDF sync `0/6`。
- 所有 group 都在 `pdf_sync_verify` 發生：

```text
page.waitForFunction: Target page, context or browser has been closed
```

- Console 觀察到多個正式環境 server `500`。

判斷：

- 6 組時，非 PDF 階段依然完成。
- 失敗不是因為無法建立課程、無法報名、找不到課程或無法進入教室。
- 失敗集中在進入教室後的 runtime sync / heartbeat / whiteboard 相關階段。

## 「找不到課程」問題整理

### 表面現象

測試過程中曾出現學生端像是找不到課程，容易讓人懷疑：

- 課程排序是否不正確。
- 報名資料是否尚未 propagation。
- 學生端是否沒有拿到正確課程。

### 實際原因

後續檢查發現，主要問題在測試 helper 的課程查找策略：

- 原本使用較寬鬆的 row/card matching。
- 歷史壓力測試課程累積後，頁面上會有多筆相似課程。
- 測試可能檢查或點到非目標課程。

### 修正方向

目前 helper 已朝以下方向調整：

- 優先使用精準 `data-course-id`。
- 進入 wait room 後驗證 URL 中的 `courseId` 是否為目標課程。
- 學生端 fallback direct URL 時，先用 `/api/orders?courseId=...` 找 active order。
- wait room URL 同時帶入 `courseId` 與 `orderId`，避免學生端身份與訂單對不上。

### 目前判斷

「找不到課程」不是 5 組與 6 組測試失敗的主因。後續 1 到 6 組結果都顯示：

- 報名成功。
- 課程查找成功。
- 進入教室成功。

## 非 PDF 階段的容量判斷

| 併發組數 | 非 PDF 階段狀態 |
|---:|---|
| 1 | 穩定 |
| 2 | 穩定 |
| 3 | 穩定 |
| 4 | 穩定 |
| 5 | 穩定 |
| 6 | 穩定到進入教室為止 |

目前能確認的是：至少到 6 組為止，前置流程與進教室流程本身不是瓶頸。

## 和 PDF 同步測試的差異

| 階段 | 1-6 組觀察結果 | 判斷 |
|---|---|---|
| 建立課程 | 全部通過 | 非瓶頸 |
| 管理員審核 | 全部通過 | 非瓶頸 |
| 學生報名 | 全部通過 | 非瓶頸 |
| 課程查找 / wait room | 修正 helper 後通過 | 原先是測試流程問題 |
| 進入 `/classroom/room` | 全部通過 | 非瓶頸 |
| PDF 上傳 | 既有 PDF 壓測中全部通過 | 非主要瓶頸 |
| PDF scene sync / heartbeat | 5 組開始部分失敗，6 組全失敗 | 目前主要瓶頸 |
| 非 PDF 畫線同步 | 10 組正式環境 headed 失敗 0/10 | 10 組壓力下白板/RTM 同步也會失敗，不只 PDF scene sync |

## 10 組非 PDF 畫線同步補測

## 6 到 7 組非 PDF 畫線同步補測

測試設定：

```powershell
$env:APP_ENV='production'
$env:CONCURRENT_GROUPS='<6 或 7>'
$env:STRESS_COURSE_DURATION_MINUTES='5'
$env:NO_PDF_MODE='1'
$env:NO_PDF_STABILITY_MS='10000'
$env:ENROLLMENT_PROPAGATION_WAIT_MS='0'
$env:SKIP_CLEANUP='1'
$env:HEADLESS='false'
npx.cmd playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium --reporter=line
```

6 組結果：

- 課程建立：`6/6`
- 學生報名：`6/6`
- 進入教室：`6/6`
- 老師畫線後學生端同步：`6/6`
- 10 秒穩定檢查：`6/6`
- 結果：通過。

7 組結果：

- 課程建立：`7/7`
- 學生報名：`7/7`
- 進入教室：`7/7`
- 老師畫線後學生端同步：`0/7`
- 結果：失敗，停止往上測。

7 組主要錯誤：

- `Agora whiteboard WhiteWebSdk not ready within 30 s`
- `page.waitForFunction: Target page, context or browser has been closed`
- Console 中可見 RTM / Presence 相關錯誤，例如 `Presence operation failed`、`Kicked off by remote session`。

判斷：

- no-PDF 畫線同步在 6 組可通過。
- 7 組開始失敗，且失敗點仍在白板 runtime 初始化 / RTM presence / page context 穩定性，不是報名或進教室。
- 上述為 2026-06-20 的歷史結果；2026-06-24 最新修正後，7 與 8 組均已通過，新的臨界點為 9 組。

## 2026-06-24 最新 7 到 9 組重測

測試條件：

- 正式環境
- Headed browser
- 課程時間 5 分鐘
- 不上傳 PDF
- 老師畫線、學生 canvas 驗證同步
- 同步後維持教室頁 10 秒

| 組數 | 報名 | 進入教室 | 畫線同步/穩定 | 成功率 | 結果 |
|---:|---:|---:|---:|---:|---|
| 7 | 7/7 | 7/7 | 7/7 | 100% | 通過 |
| 8 | 8/8 | 8/8 | 8/8 | 100% | 通過 |
| 9 | 9/9 | 9/9 | 6/9 | 67% | 失敗並停止 |

9 組失敗組別：

- `group-5`
- `group-6`
- `group-7`

共同錯誤：

```text
Student canvas did not receive drawing
Timeout 45000ms exceeded while waiting on the predicate
```

同時觀察到：

- Agora WebSocket `ERR_SOCKET_NOT_CONNECTED`
- RTM Presence service 錯誤
- API `500` / `504`
- `ERR_CONNECTION_CLOSED`

最新判斷：

- 課程建立、報名、課程查找與進入教室在 9 組仍為 `9/9`。
- 白板畫線同步從 9 組開始部分失敗。
- 目前可確認的安全上限是 8 組，臨界點為 `8 -> 9`。

## 10 組非 PDF 畫線同步補測

測試設定：

```powershell
$env:APP_ENV='production'
$env:CONCURRENT_GROUPS='10'
$env:STRESS_COURSE_DURATION_MINUTES='5'
$env:NO_PDF_MODE='1'
$env:NO_PDF_STABILITY_MS='10000'
$env:ENROLLMENT_PROPAGATION_WAIT_MS='0'
$env:SKIP_CLEANUP='1'
$env:HEADLESS='false'
npx.cmd playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium --reporter=line
```

測試結果：

- 課程建立：`10/10`
- 管理員審核：`10/10`
- 學生報名：`10/10`
- 進入教室：`10/10`
- 老師畫線後學生端同步：`0/10`

失敗類型：

- `Agora whiteboard WhiteWebSdk not ready within 30 s`
- `Target page, context or browser has been closed`
- `Student canvas did not receive drawing`
- 部分 console 出現 RTM / WebSocket / Agora RTC 連線錯誤，例如 `Presence service not connected`、`login too frequent`、`ERR_CONNECTION_CLOSED`。

判斷：

- 10 組不傳 PDF 的前置流程與進教室流程仍然正常。
- 真正補上白板畫線同步後，10 組正式環境無法通過。
- 這把問題範圍從「PDF scene sync」擴大為「高併發下 whiteboard runtime sync / RTM / WebSocket 穩定性」。

## 建議補上的獨立 no-PDF 測試

為了讓結果更乾淨，建議後續新增一支獨立測試，不執行 PDF 上傳，只驗證進入教室後的基本 runtime 穩定性。

建議測試範圍：

1. 建立或復用課程。
2. 學生報名。
3. 老師與學生進入 wait room。
4. 不上傳 PDF。
5. 雙方進入 `/classroom/room`。
6. 驗證：
   - Agora audio/video join 沒有直接崩潰。
   - `window.agoraRoom` 或 classroom 初始化狀態可讀。
   - 倒數計時存在且持續遞減。
   - heartbeat 在 60 到 120 秒內沒有大量 `500`。
   - page/context 沒有被關閉。

建議檔名：

```text
e2e/classroom/08_room_no_pdf_stress.spec.ts
```

建議指令：

```powershell
$env:APP_ENV='production'
$env:CONCURRENT_GROUPS='6'
$env:STRESS_RUN_TS='<UNIQUE_RUN_TIMESTAMP>'
$env:STRESS_COURSE_DURATION_MINUTES='30'
$env:SKIP_CLEANUP='1'
$env:HEADLESS='false'
npx.cmd playwright test e2e/classroom/08_room_no_pdf_stress.spec.ts --project=chromium --reporter=line
```
