# Agora 媒體及設備連接穩定性優化

## 問題分析

在最近的控制台日誌中，我們發現了 `AgoraRTCError UNEXPECTED_ERROR: can not find stream after getUserMedia` 錯誤。這通常由以下原因引起：

1. **設備佔用衝突**：當從「等候室」跳轉到「教室」時，等候室的攝像頭預覽可能仍在運行，導致新頁面無法獲取設備流。
2. **約束過度（Over-constrained）**：同時指定 `deviceId`（精確 ID）和 `facingMode: "user"` 可能導致瀏覽器判斷為不可能的約束並報錯。
3. **設備恢復失敗**：如果 localStorage 中存儲的設備 ID 已失效（如插拔外接設備），系統直接嘗試使用該 ID 可能導致失敗。

## 解決方案

### 1. 等候室資源釋放 ([app/classroom/wait/page.tsx](app/classroom/wait/page.tsx))
- ✅ 在點擊「進入教室」時主動調用 `stopCameraPreview()`。
- ✅ 在頁面卸載（Unmount）時自動停止並釋放所有媒體軌跡。
- ✅ 確保瀏覽器在跳轉前完全釋放攝像頭和麥克風權限。

### 2. 優化媒體約束策略 ([lib/agora/useAgoraClassroom.ts](lib/agora/useAgoraClassroom.ts))
- ✅ **智能選擇**：如果提供了 `videoDeviceId`，則不再強制要求 `facingMode: "user"`，避免約束衝突。
- ✅ **非嚴格限制**：減少使用 `exact` 約束，讓 SDK 自行選擇最佳匹配方式。

### 3. 三級降級機制 ([lib/agora/useAgoraClassroom.ts](lib/agora/useAgoraClassroom.ts))
當音視頻軌跡創建失敗時，現在會按順序嘗試：
1. **一級：特定 ID** - 嘗試使用上次保存的設備。
2. **二級：理想模式** - 如果特定 ID 失敗，嘗試使用 `facingMode: "user"`（前置相機）。
3. **三級：系統默認** - 如果以上皆失敗，嘗試打開系統默認設備。

### 4. 改進日誌診斷
- ✅ 添加了詳細的 `Fallback` 日誌，以便在設備出錯時準確知道系統在哪一步恢復了連接。

## 驗證方法

1. **檢查等候室**：確保在進入教室後，地址欄的攝像頭/麥克風圖標不再顯示正在使用（或在日誌中看到 `[WaitPage] Unmounting...`）。
2. **檢查教室連接**：即使保存的設備不在，系統也應能自動恢復到默認攝像頭。
3. **日誌觀察**：如果看到 `[Agora] Fallback with ID failed, trying default...`，表示降級機制正在工作。

## 預期效果

✅ 解決「網頁跳轉後找不到設備」的問題。
✅ 解決「UNEXPECTED_ERROR: can not find stream」的 Agora SDK 內部錯誤。
✅ 提高跨頁面導航時的通話成功率。
