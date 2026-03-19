---
name: classroom-wait
description: '檢查 /classroom/wait 頁面的連線同步、身份驗證、設備檢測狀態與進入教室按鈕。'
argument-hint: '測試並驗證 /classroom/wait 頁面的等待流程與同步機制'
metadata:
  verified-status: '❌ UNVERIFIED'
  last-verified-date: '2026-03-16'
  architecture-aligned: true
---

# 教室等待頁面檢查技能 (Classroom Wait Page Verification)

此技能用於驗證 `/classroom/wait` 頁面的核心功能，確保學生與老師在進入教室前的同步狀態、設備檢測與安全性。

## 功能檢查清單

### 1. 身份驗證與路由保護
- **架構背景**：依賴於 `lib/mockAuth.ts` 的登入狀態。
- **要求**：未登入用戶進入此頁面應被導向 `/login`，且帶有 `redirect` 參數。
- **驗證方式**：
  - 清除 localStorage 後訪問該頁面，確認是否跳轉。
  - 檢查 URL 是否包含 `redirect=%2Fclassroom%2Fwait...`。

### 2. 同步機制 (Sync Mechanism)
- **要求**：頁面能正確顯示當前房間內的參與者（老師或學生）。
- **驗證方式**：
  - 開啟兩個瀏覽器（或分頁），一個以老師身份登入，一個以學生身份。
  - 雙方進入同一個課程的等待頁。
  - 檢查當一方點擊「準備好」時，另一方的頁面是否即時更新參與者狀態。
- **技術細節**：
  - 開發環境使用 SSE (`/api/classroom/stream`)。
  - 生產環境使用 Polling (每 5 秒一次)。
  - 跨分頁使用 `BroadcastChannel`。

### 3. 設備檢測 (Device Check)
- **要求**：用戶必須通過麥克風與攝影機檢測才能點擊「準備好」。
- **驗證方式**：
  - 檢查 `setDeviceCheckPassed` 邏輯。
  - E2E 測試中可透過在頁面注入 `window.__E2E_BYPASS_DEVICE_CHECK__ = true` 繞過硬體請求。
  - 若在開發環境 (localhost) 遇到 `getUserMedia` 因為非 HTTPS 導致的報錯或卡住，應確保 `requestPermissions` 擁有 `hostname === 'localhost'` 或 `127.0.0.1` 的豁免邏輯，以免測試流程中斷。
  - 點擊「準備好」按鈕，確認狀態變更。

### 4. 進入教室條件 (Activation)
- **要求**：當老師與學生都處於「準備好」狀態時，「進入教室」按鈕始終顯示但只有在雙方就緒時才建議進入（UI 會顯示「立即進入教室」）。
- **驗證方式**：
  - 驗證 `canEnter` 變數邏輯（`hasTeacher && hasStudent`）。
  - 確認點擊按鈕後導向 `/classroom/room`。

### 5. 房間人數限制 (Occupancy)
- **要求**：同一角色（老師或學生）不能同時有兩人在同一個房間。
- **驗證方式**：
  - 模擬兩位老師進入同一個 `session`。
  - 第二位進入者應看到「房間已滿 (Wait.room_full_title)」提示。

### 6. 課程倒數 (Countdown) 故障排除
- **問題基礎**：`WaitCountdownManager` 負責管理等待頁面的停留時間。
- **異常行為**：用戶反映正在等待課程開始時，卻出現 10 分鐘倒數並被踢回首頁。
- **原因分析**：
  - 當 `/api/classroom/session` 返回的 `endTs` 為空時，系統會默認套用 10 分鐘寬限期。
  - 此設計是為了防止用戶無限期留在等待頁，但在提早進場的情況下會造成困擾。
- **解決能力**：
  - **診斷**：檢查 Chrome console 是否有 `[WaitCountdownManager] No end time set... using default 10 minutes` 日誌。
  - **測試解決方案**：在 E2E 測試或調試時，可先讓「老師」進入教室啟動 Session，或透過 API POST 延長 `endTs`。
  - **Skill 行動建議**：若倒數時間與預期不符，應檢查 `api/orders` 的 `remainingSeconds` 是否正確讀取，這才是 Session 真正的來源。

## 相關檔案
- `/app/classroom/wait/page.tsx` - 主頁面元件
- `/components/WaitCountdownModal.tsx` - 倒數導航元件
- `/api/classroom/ready` - 狀態更新 API
- `/api/classroom/stream` - SSE 同步 API
