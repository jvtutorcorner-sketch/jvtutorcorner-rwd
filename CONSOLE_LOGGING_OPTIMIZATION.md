# 日誌警告和同步優化修復

## 問題分析

根據瀏覽器控制台日誌，系統雖然正常工作，但存在以下優化空間：

1. **SSE 消息過於頻繁**
   - 原因：每個 SSE 消息都觸發一次 `syncStateFromServer()` 調用
   - 影響：導致 Fast Refresh 頻繁觸發
   - 症狀：`SYNC: SSE message received` 日誌每秒多次出現

2. **會話過期警告**
   - 原因：WaitCountdownManager 檢測到會話已過期（remainingSeconds = 0）
   - 影響：顯示警告日誌，但實際上已應用了 10 分鐘的寬限期
   - 症狀：`[WaitCountdownManager] Session expired...` 日誌等級為 WARN（應為 INFO）

3. **Agora WebSocket Ping 超時**
   - 原因：正常的網絡延遲或臨時連接問題
   - 影響：不影響功能，但產生警告日誌
   - 症狀：`ws request timeout, type: ping` Agora SDK 警告

## 應用的修復

### 1. **增加 SSE 同步防抖延遲** ([app/classroom/wait/page.tsx](app/classroom/wait/page.tsx))
```
舊值：100ms
新值：300ms
```
- ✅ 將多個快速的 SSE 消息合併為一個同步操作
- ✅ 減少不必要的狀態更新和重新渲染

### 2. **改進 SSE 消息日誌** ([app/classroom/wait/page.tsx](app/classroom/wait/page.tsx))
- ✅ 只在每 5 個消息時記錄一次日誌（減少 80% 的日誌）
- ✅ 包括消息計數器，便於調試

### 3. **改進會話過期檢測** ([components/WaitCountdownManager.tsx](components/WaitCountdownManager.tsx))
- ✅ 改為 `console.log()` 而非 `console.warn()` 以降低警告級別
- ✅ 改進消息清晰性

### 4. **增強 Agora 連接狀態日誌** ([lib/agora/useAgoraClassroom.ts](lib/agora/useAgoraClassroom.ts))
- ✅ 添加不同連接狀態的詳細日誌（CONNECTING, CONNECTED, DISCONNECTED）
- ✅ 區分不同的斷開原因（LEAVE vs INTERRUPTED）

## 驗證方法

### 檢查 SSE 消息頻率
打開瀏覽器開發者工具 Console，搜索 `SYNC: SSE message received`：
- **修復前**：每秒 10+ 條消息
- **修復後**：每秒 ~2 條消息（因為防抖）

### 檢查會話過期警告等級
搜索 `Session expired`：
- **修復前**：顯示為黃色警告 (WARN)
- **修復後**：顯示為灰色信息 (INFO)

### 監控重新渲染頻率
觀察 `[Fast Refresh]` 消息：
- **修復前**：頻繁出現（因為 SSE 過於頻繁）
- **修復後**：頻率降低（因為防抖增加到 300ms）

## techinical 詳情

### 防抖機制
```
SSE 消息 → syncStateFromServer() → 300ms 延遲 → 實際狀態更新
```

如果在 300ms 內收到新的 SSE 消息，計時器會重置，只有最後一次會觸發實際同步。

### 狀態比較優化
即使 syncStateFromServer 執行，它也會檢查 participants 數量和 ready 狀態是否改變。
只有當數據實際改變時，才會調用 `setState()`，從而觸發重新渲染。

### Agora 連接穩定性
Agora SDK 的 ping 超時是正常行為，表示：
- 網絡延遲 > 設定的 ping 超時值（通常 10-15 秒）
- 可能的 UDP 包丟失
- 不影響 RTC 連接，通常會自動恢復

## 期望的改進結果

✅ **更清潔的控制台輸出**：日誌消息從數百條減少到數十條
✅ **改善應用性能**：降低不必要的重新渲染
✅ **改進用戶體驗**：快速刷新和重新連接不會那麼頻繁
✅ **調試更容易**：重要的日誌消息不被淹沒在噪音中

## 未來優化空間

1. **條件 SSE 啟用**：根據網絡狀態自動禁用 SSE
2. **可配置的防抖延遲**：根據不同場景調整防抖時間
3. **連接健康檢查**：定期檢查 Agora 連接質量

