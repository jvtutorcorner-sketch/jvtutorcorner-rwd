# No Local Devices Available - 修復

## 問題

在 `/classroom/wait` 上設備檢測正常，但進入 `/classroom/test` 後出現 "No local devices available" 錯誤。

## 根本原因

1. **設備選擇丟失**：從 `/classroom/wait` 導航到 `/classroom/test` 時，設備選擇（`selectedAudioDeviceId` 和 `selectedVideoDeviceId`）被重置為 null（因為它們是新的 React 組件實例）
2. **權限問題**：在不同頁面轉換時，媒體權限可能沒有被正確保持或重新驗證
3. **設備枚舉失敗**：設備列表可能為空或設備創建失敗，沒有足夠的錯誤追蹤

## 應用的修復

### 1. **設備選擇持久化** ([app/classroom/ClientClassroom.tsx](app/classroom/ClientClassroom.tsx))
- ✅ 將設備選擇保存到 `localStorage`（`tutor_selected_audio` 和 `tutor_selected_video`）
- ✅ 在組件挂載時從 localStorage 還原設備選擇
- ✅ 設備選擇改變時自動更新 localStorage

### 2. **改進權限請求流程** ([app/classroom/ClientClassroom.tsx](app/classroom/ClientClassroom.tsx))
- ✅ 添加詳細日誌記錄權限狀態
- ✅ 修復 useEffect 依賴項，確保在設備選擇後重新檢查權限
- ✅ 自動選擇第一個可用設備（如果未預先選擇）

### 3. **改進設備枚舉和日誌** ([app/classroom/ClientClassroom.tsx](app/classroom/ClientClassroom.tsx))
- ✅ 添加詳細的設備枚舉日誌
- ✅ 記錄所有可用設備及其 ID
- ✅ 改進自動選擇邏輯

### 4. **加強 Agora Track 創建診斷** ([lib/agora/useAgoraClassroom.ts](lib/agora/useAgoraClassroom.ts))
- ✅ 添加詳細的 track 創建日誌
- ✅ 分別記錄每個 fallback 嘗試
- ✅ 當沒有可用設備時，輸出更詳細的調試信息（包括設備 ID 和發布標誌）

### 5. **改進加入室內的日誌** ([app/classroom/ClientClassroom.tsx](app/classroom/ClientClassroom.tsx))
- ✅ 記錄自動加入嘗試時的完整參數
- ✅ 包括設備 ID、音視頻發布標誌等

## 驗證修復的步驟

### Step 1: 監控 LocalStorage
在教室頁面開發者工具的 Console 中執行：
```javascript
console.log('Saved Audio:', localStorage.getItem('tutor_selected_audio'));
console.log('Saved Video:', localStorage.getItem('tutor_selected_video'));
```

應該看到設備 ID（例如 `default` 或特定的設備 ID）。

### Step 2: 監控權限請求
在 `/classroom/test` 加載時，檢查 Terminal 中是否看到：
```
[ClientClassroom] Attempting to request media permissions on mount...
[ClientClassroom] ✓ Permissions granted and stream obtained
[ClientClassroom] ✓ Re-enumerated after permission: { audio: 1, video: 1 }
[ClientClassroom] Auto-selecting first audio: <deviceId>
[ClientClassroom] Auto-selecting first video: <deviceId>
```

### Step 3: 監控設備枚舉
```
[ClientClassroom] Devices enumerated: { audioCount: 1, videoCount: 1, devices: [...] }
```

### Step 4: 監控 join 嘗試
```
[AutoJoin] Attempting auto-join...: {
  publishAudio: true,
  publishVideo: true,
  audioDeviceId: 'default',
  videoDeviceId: 'default'
}
```

### Step 5: 監控 Track 創建
```
[Agora] Creating microphone and camera tracks with config: {...}
[Agora] ✓ Created both tracks: { hasMic: true, hasCam: true }
[Agora] Tracks created successfully: { hasMic: true, hasCam: true }
[Agora] Publishing local tracks: { count: 2, types: [ 'mic', 'cam' ] }
[Agora] ✓ Publish succeeded
```

## 故障排除

### Issue 1: "No local devices available" 仍然出現

**檢查項目**：
1. 查看 Terminal 中的 Agora 日誌，看是否有 track 創建失敗的消息
   - 搜索 `✗ Track creation failed` 或 `✗ Fallback: createMicrophoneAudioTrack failed`

2. 檢查權限是否真的被授予：
   ```javascript
   // 在 Console 中執行
   await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
   ```
   - 如果出現錯誤，瀏覽器權限被拒絕

3. 檢查設備 ID 是否為 `null` 或 `undefined`：
   ```javascript
   console.log('Devices:', {
     audio: localStorage.getItem('tutor_selected_audio'),
     video: localStorage.getItem('tutor_selected_video')
   });
   ```

### Issue 2: 設備 ID 在 wait 和 test 頁面不匹配

**解決方案**：
- 確保從 `/classroom/wait` 導航到 `/classroom/test` 時使用"進入教室"按鈕
- 不要直接在瀏覽器地址欄中輸入 `/classroom/test` URL
- 如果設備 ID 不保存，檢查 localStorage 是否被禁用

### Issue 3: 權限始終不被授予

**檢查項目**：
1. 在瀏覽器設置中檢查攝像頭和麥克風權限：
   - Chrome: Settings > Privacy and security > Camera/Microphone
   - Firefox: Preferences > Privacy > Permissions > Camera/Microphone

2. 確保允許了特定域名的權限

3. 許可重置：
   ```javascript
   // 完全清除 localStorage
   localStorage.clear();
   // 刷新頁面
   location.reload();
   ```

### Issue 4: 日誌顯示設備已枚舉但仍然失敗

**可能原因**：
- 設備在 `enumerateDevices` 後不可用（例如被其他應用佔用）
- Agora SDK 無法訪問特定設備
- 設備驅動程序問題

**調試步驟**：
1. 記下 Terminal 中顯示的設備 ID
2. 嘗試在另一個應用（如 Zoom 或 Google Meet）中測試設備
3. 如果在其他應用中也失敗，這是系統/驅動程序問題

## 技術細節

### 設備持久化流程
1. 用戶在 `/classroom/wait` 上進行設備檢測（自動或手動）
2. 設備選擇被保存到 localStorage
3. 用戶點擊"進入教室"按鈕導航到 `/classroom/test`
4. `/classroom/test` 讀取 localStorage 並恢復設備選擇
5. 自動加入時使用保存的設備 ID

### 權限流程
1. 頁面加載時（`mounted` 為 true），請求媒體權限
2. 如果權限被授予，枚舉設備並自動選擇
3. join 時使用選定的設備 ID

### Track 創建流程
1. 同時嘗試創建麥克風和攝像頭
2. 如果失敗，嘗試單獨創建每一個
3. 如果兩者都失敗或不存在，設置錯誤消息 "No local devices available"

## 相關文件修改

- [app/classroom/ClientClassroom.tsx](app/classroom/ClientClassroom.tsx) - 設備選擇、權限請求
- [lib/agora/useAgoraClassroom.ts](lib/agora/useAgoraClassroom.ts) - Track 創建、發布邏輯

