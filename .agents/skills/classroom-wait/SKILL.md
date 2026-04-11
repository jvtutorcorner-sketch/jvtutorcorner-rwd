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
- **詳細指南**：請參閱 [.agents/skills/classroom-wait-device-permissions/SKILL.md](../classroom-wait-device-permissions/SKILL.md) 獲取完整的設備權限驗證流程與自動化測試指令。
- **要求**：
  - **核心限制**：用戶必須先點擊「🔐 授予麥克風、聲音和攝影機權限」按鈕，並允許瀏覽器權限後，才能解除三個測試按鈕的禁用狀態。
  - **通過條件**：通過麥克風、攝影機與聲音測試後才能點擊「準備好」。
- **驗證方式**：
  - E2E 測試中可透過注入 `window.__E2E_BYPASS_DEVICE_CHECK__ = true` 繞過實體硬體請求。
  - 若在開發環境 (localhost) 遇到 `getUserMedia` 報錯，確保 `requestPermissions` 擁有 `localhost` 的安全上下文豁免邏輯。

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

---

## 疑難排解：UI 與樣式問題 (UI & Style Troubleshooting)

### 1. 等待頁面樣式跑版或無法點擊 (CSS Nesting Issue)
- **問題**：此頁面的「裝置檢測」容器或佈局異常，元件無法對齊。
- **原因**：在 `globals.css` 中，`.wait-page-container` 等多個類別曾意外被**嵌套**在 `.carousel-loading` 內部。
- **影響**：由於瀏覽器可能不完全支援靜態 CSS 嵌套，或類別必須在輪播圖載入時才會生效，導致等待頁樣式失效。
- **修正**：在 `globals.css` 中已將等待頁相關樣式提升至頂層。
- **提醒**：修改全局樣式時，務必確保沒有語法嵌套錯誤。
