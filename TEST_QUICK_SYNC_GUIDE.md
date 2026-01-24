# 🧪 快速延遲測試使用指南

## 概述
此測試框架模擬真實 Amplify 部署環境中的網路延遲，快速檢測 Teacher + Student 之間的白板同步問題。

## 環境檢查

```bash
# 1. 檢查環境是否就緒
node scripts/diagnose-whiteboard.js

# 2. 所有檢查項目應為 ✓
# 如果有 ✗，執行修復建議
```

## 快速啟動

### 方案 1：快速腳本（推薦）

```bash
# 在 PowerShell 中運行
.\scripts\test-classroom-delay.ps1

# 選擇運行模式：
# 1 = 無頭模式（快速）
# 2 = 帶 UI 模式（便於觀察） ← 推薦用於調試
# 3 = 調試模式（最詳細）
```

### 方案 2：直接使用 Playwright

```bash
# 帶 UI 顯示（推薦）
npx playwright test e2e/quick-sync-test.spec.ts --headed --workers=1

# 無頭模式
npx playwright test e2e/quick-sync-test.spec.ts

# 調試模式
npx playwright test e2e/quick-sync-test.spec.ts --headed --workers=1 --debug

# 僅運行某個測試
npx playwright test e2e/quick-sync-test.spec.ts -g "Teacher to Student"
```

## 測試流程

### 自動執行的步驟：

1. **設定網路延遲** (500ms)
   - 模擬真實部署環境的延遲
   - Teacher 和 Student 各 250ms（往返 500ms）

2. **加載頁面**
   - Teacher 進入: `/classroom/wait?courseId=c1&role=teacher&session=classroom_session_ready_c1`
   - Student 進入: `/classroom/wait?courseId=c1&role=student&session=classroom_session_ready_c1`

3. **等待 SSE 連接**
   - 等待 2 秒讓 SSE 連接建立
   - 檢查就緒按鈕是否可見

4. **在白板上繪圖**
   - Teacher 在白板上繪製一條線
   - 從 (100, 100) 到 (200, 200)

5. **驗證同步**
   - Student 應在 5 秒內收到筆畫
   - 檢查 canvas 像素變化
   - 記錄實際同步延遲

6. **收集日誌**
   - 輸出 Teacher 和 Student 的最後 5 條日誌
   - 便於問題診斷

## 理解輸出

### 成功案例

```
📌 測試：Classroom 白板同步（帶延遲）
👨‍🏫 Teacher URL: http://localhost:3000/classroom/wait?courseId=c1&role=teacher&session=classroom_session_ready_c1
👩‍🎓 Student URL: http://localhost:3000/classroom/wait?courseId=c1&role=student&session=classroom_session_ready_c1

[1] 設定網路延遲 (500ms)...
  ✓ Teacher 頁面載入完成 (2341ms)
  ✓ Student 頁面載入完成 (2356ms)

[3] 等待 SSE 連接與就緒狀態...
  • Teacher 就緒按鈕可見: true
  • Student 就緒按鈕可見: true

[4] 在 Teacher 白板上繪圖...
  ✓ Canvas 已找到
  • Canvas 大小: 800x600
  • 繪製筆畫: (900,150) → (1000,250)
  ✓ 筆畫完成

[5] 等待同步到 Student (最多 5 秒)...
  ✅ 同步成功! 延遲: 800ms, 像素數: 245
```

### 失敗案例

```
[5] 等待同步到 Student (最多 5 秒)...
  ⏳ 等待中... (1000ms)
  ⏳ 等待中... (2000ms)
  ⏳ 等待中... (3000ms)
  ⏳ 等待中... (4000ms)
  ⏳ 等待中... (5000ms)
  ❌ 5 秒後仍未同步
```

**診斷步驟**:
1. 檢查 Teacher 和 Student 的日誌
2. 查看 Network 標籤中 `/api/whiteboard/stream` 是否中斷
3. 檢查是否有 CORS 錯誤
4. 驗證 SSE 連接是否保持

## 查看測試結果

```bash
# 自動打開 HTML 報告
Start-Process "test-results/index.html"

# 查看失敗的截圖
Get-ChildItem test-results/*.png

# 查看錄製的影片
Get-ChildItem test-results/*.webm
```

## 常見問題

### Q: Canvas 未找到
**症狀**: `⚠️ Canvas 未找到`

**原因**:
- 頁面未完全加載
- 白板組件未初始化
- 使用了不同的 DOM 結構

**解決**:
```bash
# 檢查頁面元素
npx playwright test e2e/quick-sync-test.spec.ts --headed --debug

# 在瀏覽器 DevTools 中檢查：
# document.querySelector('canvas')  # 應返回 canvas 元素
```

### Q: 同步延遲超過 5 秒
**症狀**: `❌ 5 秒後仍未同步`

**原因**:
- SSE 連接斷開
- 服務器處理過慢
- API 端點有問題
- 網路限流過於嚴格

**解決**:
```bash
# 調試 SSE 連接
curl -v http://localhost:3000/api/whiteboard/stream?uuid=course_c1

# 檢查 API 健康狀況
curl http://localhost:3000/api/whiteboard/state?uuid=course_c1 | jq .

# 減少模擬延遲進行測試
# 編輯 quick-sync-test.spec.ts 第 40 行，改為 100ms 延遲
```

### Q: 前端伺服器無法連接
**症狀**: `✗ Teacher 載入失敗` 或 `✗ Student 載入失敗`

**解決**:
```bash
# 確認前端正在運行
Invoke-WebRequest -Uri http://localhost:3000

# 如果沒有，啟動前端
npm run dev

# 確認端口是否正確（預設 3000）
# 如果需要修改，編輯 BASE_URL
```

## 進階用法

### 自訂網路延遲

編輯 [e2e/quick-sync-test.spec.ts](./quick-sync-test.spec.ts) 第 40 行：

```typescript
// 改變延遲時間（毫秒）
await new Promise(r => setTimeout(r, 250)); // 改成你想要的值

// 例如 1 秒延遲：
await new Promise(r => setTimeout(r, 500)); // 往返 1000ms
```

### 自訂課程 ID

編輯第 10-12 行：

```typescript
const COURSE_ID = 'your-custom-id';  // 改成你的課程 ID
const SESSION = 'your-custom-session'; // 改成你的 session ID
```

### 添加更多測試場景

在 `test()` 末尾添加新的 `test()` 塊：

```typescript
test('Custom Scenario - My Test', async () => {
  // 你的測試邏輯
});
```

## 調試技巧

### 1. 查看瀏覽器控制台

使用 `--headed` 模式時，手動打開 DevTools：

```bash
# 在顯示的瀏覽器中按 F12
```

查看：
- Console 日誌
- Network 標籤（SSE 連接）
- Application > Local Storage（會話信息）

### 2. 收集詳細日誌

編輯測試文件添加更多 `console.log`：

```typescript
console.log('[DEBUG]', teacherPage.url());
console.log('[DEBUG]', await teacherPage.content()); // 完整 HTML
```

### 3. 暫停執行

在特定位置暫停以手動檢查：

```typescript
await teacherPage.pause(); // 暫停，在控制台可交互操作
```

### 4. 截圖和錄影

自動在失敗時生成截圖和影片（見 `playwright.config.ts`）：

```typescript
screenshot: 'only-on-failure',
video: 'retain-on-failure',
```

## 集成到 CI/CD

在 GitHub Actions 或 GitLab CI 中運行：

```yaml
- name: Run Whiteboard Sync Tests
  run: npx playwright test e2e/quick-sync-test.spec.ts
  
- name: Upload Results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: test-results/
```

## 檔案結構

```
e2e/
├── quick-sync-test.spec.ts      # 快速測試（推薦）
└── classroom-delay-sync.spec.ts # 完整測試套件

scripts/
├── test-classroom-delay.ps1     # PowerShell 快速啟動腳本
└── diagnose-whiteboard.js       # 環境診斷工具

playwright.config.ts              # Playwright 配置
```

## 後續步驟

1. ✅ 本地通過所有測試
2. ➡️ 部署到 Amplify staging 環境
3. ➡️ 在 staging 進行回歸測試
4. ➡️ 部署到 production

---

需要幫助？查看相關文件：
- [WHITEBOARD_ACK_TIMEOUT_FIX.md](../WHITEBOARD_ACK_TIMEOUT_FIX.md) - 白板同步問題修復
- [API_DETAILED_DOCUMENTATION.md](../API_DETAILED_DOCUMENTATION.md) - API 文檔
- Playwright 官方文檔：https://playwright.dev/docs/intro
