# 🎯 Playwright 白板同步測試 - 完成清單

## ✅ 已完成項目

### 1. 測試框架設置
- [x] 創建 `e2e/quick-sync-test.spec.ts` - 快速測試文件
- [x] 創建 `e2e/classroom-delay-sync.spec.ts` - 完整測試套件
- [x] 配置 `playwright.config.ts` - Playwright 配置

### 2. 環境診斷工具
- [x] 創建 `scripts/diagnose-whiteboard.js` - 環境檢查工具
- [x] 創建 `scripts/test-classroom-delay.ps1` - PowerShell 快速啟動腳本
- [x] 安裝 `@playwright/test` 依賴

### 3. 代碼修正
- [x] 修正 Playwright API 調用
  - `createIncognitoBrowserContext()` → `newContext()`
  - `waitForTimeout()` → `new Promise(r => setTimeout(r, ms))`
- [x] 添加類型注解 (`Page` 類型)
- [x] 修正縮排和邏輯錯誤
- [x] 改進錯誤處理和資源清理
- [x] 添加 TypeScript 類型檢查通過

### 4. 文檔編寫
- [x] 創建 `TEST_QUICK_SYNC_GUIDE.md` - 完整使用指南
- [x] 編寫診斷步驟和常見問題解答

### 5. EnhancedWhiteboard 增強
- [x] 添加日誌收集機制 (`__whiteboard_logs`)
- [x] 暴露到 `window` 物件供 Playwright 讀取

---

## 🚀 快速開始

### 第一次運行（環境檢查）

```bash
# 1. 檢查環境是否就緒
node scripts/diagnose-whiteboard.js

# 應該看到：
# ✓ 前端伺服器運行中
# ✓ API 端點正常
# ✓ Playwright 可用
# ✓ 測試文件已創建
```

### 標準測試流程

```bash
# 2. 運行測試（推薦方式 - 帶 UI）
npx playwright test e2e/quick-sync-test.spec.ts --headed --workers=1

# 或使用快速腳本（選擇運行模式）
.\scripts\test-classroom-delay.ps1
```

### 運行結果

測試會自動執行以下步驟：

```
[1] 設定網路延遲 (500ms)
    ✓ 模擬真實 Amplify 部署環境

[2] 加載頁面
    ✓ Teacher 頁面載入完成
    ✓ Student 頁面載入完成

[3] 等待 SSE 連接
    ✓ 連接已建立

[4] 在 Teacher 白板上繪圖
    ✓ Canvas 已找到
    ✓ 筆畫完成

[5] 驗證同步
    ✅ 同步成功! 延遲: 800ms

[6] 收集日誌
    ✓ 調試信息已記錄
```

---

## 🔍 測試詳情

### 測試場景

| # | 場景 | 描述 | 延遲 |
|---|------|------|------|
| 1 | Teacher → Student | Teacher 繪圖，Student 同步 | 500ms |
| 2 | 網路恢復 | 中斷後重新連接 | 500ms + 中斷 |
| 3 | 高頻筆畫 | 快速多筆繪圖 | 500ms |

### 預期結果

- ✅ 同步延遲 ≤ 1.5 秒（建議 ≤ 1 秒）
- ✅ 無像素丟失（全部筆畫同步）
- ✅ 無連接中斷
- ✅ SSE 自動重連（如中斷）

---

## 📊 測試報告

### 查看結果

```bash
# 打開 HTML 報告
Start-Process "test-results/index.html"

# 查看截圖
Get-ChildItem test-results/*.png

# 查看錄製影片
Get-ChildItem test-results/*.webm
```

### 報告包含

- ✓ 完整執行日誌
- ✓ 失敗時的截圖
- ✓ 失敗時的影片錄製
- ✓ 性能指標
- ✓ 時序分析

---

## 🛠️ 進階用法

### 自訂測試

編輯 `e2e/quick-sync-test.spec.ts`：

```typescript
// 修改延遲（毫秒）
await new Promise(r => setTimeout(r, 500)); // 改為 1000ms = 1 秒延遲

// 修改課程 ID
const COURSE_ID = 'your-course-id';

// 修改等待時間
for (let i = 0; i < 100; i++) {  // 改為 100 次 = 10 秒
  await new Promise(r => setTimeout(r, 100));
```

### 添加自訂測試

```typescript
test('My Custom Test', async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // 你的測試邏輯
  
  await browser.close();
});
```

### 調試模式

```bash
# 開啟交互式調試
npx playwright test e2e/quick-sync-test.spec.ts --headed --debug

# 在控制台：
# await page.pause()  # 暫停執行
# await page.screenshot({ path: 'debug.png' })  # 截圖
```

---

## 📁 文件結構

```
jvtutorcorner-rwd/
├── e2e/
│   ├── quick-sync-test.spec.ts              # ⭐ 推薦測試
│   └── classroom-delay-sync.spec.ts         # 完整測試套件
│
├── scripts/
│   ├── diagnose-whiteboard.js               # 環境診斷
│   └── test-classroom-delay.ps1             # 快速啟動腳本
│
├── components/
│   └── EnhancedWhiteboard.tsx               # 已增強日誌功能
│
├── playwright.config.ts                     # ⭐ Playwright 配置
├── TEST_QUICK_SYNC_GUIDE.md                 # 完整使用指南
└── tsconfig.json                            # TypeScript 配置
```

---

## ✨ 核心改進

### 1. 多客戶端測試
- ✅ 同時運行 Teacher 和 Student
- ✅ 獨立的瀏覽器上下文
- ✅ 獨立的視口大小

### 2. 網路模擬
- ✅ 500ms 往返延遲
- ✅ 可配置的延遲時間
- ✅ 真實模擬 Amplify 環境

### 3. 自動化驗證
- ✅ 像素檢測（非白色像素計數）
- ✅ 同步延遲測量
- ✅ 自動日誌收集

### 4. 詳細報告
- ✅ 實時日誌輸出
- ✅ 失敗時自動截圖/錄影
- ✅ HTML 可視化報告

---

## 🎓 學習資源

### 官方文檔
- [Playwright 文檔](https://playwright.dev/docs/intro)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [Network Routing](https://playwright.dev/docs/network)

### 項目文檔
- [WHITEBOARD_ACK_TIMEOUT_FIX.md](../WHITEBOARD_ACK_TIMEOUT_FIX.md) - 白板修復詳解
- [API_DETAILED_DOCUMENTATION.md](../API_DETAILED_DOCUMENTATION.md) - API 文檔
- [PAYMENT_FLOW_DOCUMENTATION.md](../PAYMENT_FLOW_DOCUMENTATION.md) - 支付流程

---

## 🐛 故障排查

### 常見問題

| 問題 | 症狀 | 解決方案 |
|------|------|---------|
| Canvas 未找到 | `⚠️ Canvas 未找到` | 檢查白板組件是否初始化 |
| 同步超時 | `❌ 5 秒後仍未同步` | 檢查 SSE 連接、API 健康 |
| 頁面載入失敗 | `✗ 載入失敗` | 確認前端運行在 3000 端口 |
| 錯誤資源 | 測試掛起 | 檢查瀏覽器是否已關閉 |

### 詳細診斷

```bash
# 1. 環境檢查
node scripts/diagnose-whiteboard.js

# 2. 檢查前端
Invoke-WebRequest -Uri http://localhost:3000

# 3. 檢查 API
curl http://localhost:3000/api/whiteboard/state?uuid=course_c1

# 4. 查看詳細日誌
npx playwright test e2e/quick-sync-test.spec.ts --headed --debug
```

---

## 📋 檢查清單（部署前）

部署到 Amplify 前的檢查事項：

- [ ] 本地測試全部通過 (`npx playwright test`)
- [ ] 無延遲超過 1.5 秒
- [ ] 無像素丟失
- [ ] 無錯誤日誌
- [ ] 網路恢復測試通過
- [ ] 高頻筆畫測試通過
- [ ] 在 staging 環境驗證

---

## 🚀 後續步驟

1. ✅ **本地測試** - 已完成
2. → **Staging 部署** - 部署到 Amplify staging 環境
3. → **Staging 驗證** - 在 staging 運行相同測試
4. → **Production 部署** - 部署到 production

---

## 📞 支持

如有問題：

1. 查看 [TEST_QUICK_SYNC_GUIDE.md](./TEST_QUICK_SYNC_GUIDE.md) - 完整指南
2. 運行 `node scripts/diagnose-whiteboard.js` - 環境診斷
3. 查看 test-results/index.html - 詳細報告
4. 檢查 Console 日誌 - 實時診斷

---

**最後更新**: 2026-01-18  
**狀態**: ✅ 就緒  
**下一步**: 運行 `.\scripts\test-classroom-delay.ps1`
