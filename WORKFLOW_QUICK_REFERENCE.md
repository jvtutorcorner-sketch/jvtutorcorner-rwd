# Workflow 腳本系統 - 快速參考卡

**最後更新**: 2026-03-31

---

## 🔤 節點類型速查表

| 節點類型 | 語言 | 用途 | 超時 | 沙箱 |
|---------|------|------|------|------|
| `javascript` | JavaScript | 快速轉換、驗證 | 3s | isolated-vm |
| `action` | 泛用 | 郵件、HTTP 等 | 可變 | 無 |

---

## 📚 文檔尋址

### 我想...

| 需求 | 對應文檔 | 位置 |
|------|---------|------|
| **測試 JS 腳本** | WORKFLOW_SCRIPT_TEST_GUIDE.md | 詳細步驟、常見場景 |
| **了解代碼變更** | WORKFLOW_SCRIPT_REFACTOR_SUMMARY.md | 所有變更記錄、驗証清單 |
| **部署到 Amplify** | AMPLIFY_WORKFLOW_DEPLOYMENT_CHECKLIST.md | 環境變數、檢查清單 |
| **看完整更新摘要** | WORKFLOW_SCRIPT_COMPLETE_UPDATE_SUMMARY.md | 概覽、功能矩陣、時間線 |

---

## 🚀 快速部署檢查 (< 5 分鐘)

```bash
# 1️⃣ 編譯檢查
npm run build  # ✓ 無錯誤

# 2️⃣ 類型檢查  
npx tsc --noEmit  # ✓ 無錯誤

# 3️⃣ 本地測試
npm run dev
# 打開 Canvas，確認 JS 節點顯示 ✓

# 4️⃣ 提交
git push origin main  # ✓ 等待 Amplify 構建
```

---

## 🎯 常見任務速查

### 添加新的 JavaScript 腳本節點

```
1. Workflow Canvas → 拖拽 "JavaScript 腳本" 節點
2. 側邊欄：自動填入 45 行範例 ✓
3. 編輯腳本，測試
4. 觀看 console.log 輸出
```

### 訪問工作流程資料

**JavaScript**:
```javascript
const name = data?.student_name || 'default';
const items = data?.items || [];
```

---

## ⚠️ 常見錯誤速修

| 錯誤 | 原因 | 修復 |
|------|------|------|
| "JS 節點不顯示" | 未更新 Canvas | 清除瀏覽器緩存 (Ctrl+Shift+Del) |
| "側邊欄顯示不正確" | CSS 問題 | 檢查 Tailwind 類名 |

---

## 📊 版本兼容性

```
Node.js:          18+⭐  20   22
Amplify:          ✓ 兼容 (230MB 限制內)
isolated-vm:      6.0.2+
Next.js:          13+ / 14
React:            18+
TypeScript:       5.0+
```

---

## 🔗 關鍵文件參考

```
核心代碼:
├─ components/
│  └─ workflows/
│     ├─ WorkflowCanvas.tsx         (節點定義)
│     └─ WorkflowConfigSidebar.tsx  (UI 配置)
├─ lib/
│  └─ workflowEngine.ts             (執行引擎)

文檔:
├─ WORKFLOW_SCRIPT_TEST_GUIDE.md            (測試)
├─ WORKFLOW_SCRIPT_REFACTOR_SUMMARY.md      (變更)
├─ AMPLIFY_WORKFLOW_DEPLOYMENT_CHECKLIST.md (部署)
└─ WORKFLOW_SCRIPT_COMPLETE_UPDATE_SUMMARY.md (摘要)
```

---

## 💡 提示和最佳實踐

### ✅ 應該做

```javascript
// ✓ 檢查資料存在
const value = data?.key || 'default';

// ✓ 使用 console.log 調試
console.log('[JS-Debug]', data);

// ✓ 返回完整結果對象
return { status: 'success', data: result };
```

```python
# ✓ 使用 try-except
try:
    result = do_something()
except Exception as e:
    print(f"[Error] {e}")
    return {"status": "error"}

# ✓ 使用 print 調試
print(f"[Python-Debug] Processing {data}")

# ✓ 返回 JSON-compatible 對象
return {"status": "success", "data": result}
```

### ❌ 避免做

```javascript
// ✗ 不使用同步操作
const result = fetch(...);  // 不支持

// ✗ 不訪問檔案系統
const file = fs.readFile(...);  // 沙箱限制

// ✗ 超時執行
for(let i = 0; i < 1000000000; i++) {}  // 會超時
```

```python
# ✗ 不訪問檔案系統
with open('file.txt') as f:  # 沙箱限制

# ✗ 不製造無窮循環
while True:  # 會超時

# ✗ 不使用不支持的庫
import torch  # 需요在 Lambda 層配置
```

---

## 📞 故障排除流程

```
Q: 系統無法運行?
→ 檢查: npm install 更新依賴
→ 檢查: npm run build 編譯是否成功

Q: JavaScript 節點不執行?
→ 檢查: console.log 是否有輸出
→ 檢查: 超時設置 (預設 3000ms)
→ 檢查: 資料格式是否正確

Q: Amplify 部署失敗?
→ 檢查: npm run build 本地是否通過
→ 檢查: 環境變數是否設置
→ 檢查: 構建日誌查看具體錯誤
```

---

## 🎓 學習資源

### 初級 (開始使用)
1. 閱讀: [WORKFLOW_SCRIPT_TEST_GUIDE.md](WORKFLOW_SCRIPT_TEST_GUIDE.md) 前 50 行
2. 試驗: JavaScript 節點範例腳本

### 中級 (自訂腳本)
1. 學習: [常見測試場景](WORKFLOW_SCRIPT_TEST_GUIDE.md#常見测试场景)
2. 實作: 編寫自己的轉換腳本
3. 調試: 使用 console.log

### 高級 (優化和擴展)
1. 研究: [WORKFLOW_SCRIPT_REFACTOR_SUMMARY.md](WORKFLOW_SCRIPT_REFACTOR_SUMMARY.md)
2. 理解: workflowEngine.ts 執行機制
3. 貢獻: 提交改進和新功能

---

## 🎯 週期性維護清單

### 每週

- [ ] 檢查 Amplify 構建狀態
- [ ] 監控 CloudWatch 日誌中的錯誤
- [ ] 收集用戶反饋

### 每月

- [ ] 更新依賴項 (npm update)
- [ ] 運行單元測試
- [ ] 審查性能指標

### 每季

- [ ] 升級 Node.js 版本 (如有新安全版本)
- [ ] 升級 Python 版本 (檢查 Lambda 支持)
- [ ] 全面安全審計

---

## 📈 性能基準

| 操作 | 時間 | 目標 |
|------|------|------|
| JavaScript 執行 | < 100ms | 對於簡單操作 |
| Python 執行 | 1-5s | 典型數據轉換 |
| 頁面加載 | < 2s | 完整 Canvas |
| 工作流執行 | < 10s | 小型工作流 |

---

## 🆘 獲取幫助

### 文檔搜尋優先級

1. **這個速查表** (本文檔)
2. **WORKFLOW_SCRIPT_TEST_GUIDE.md** (常見問題)
3. **WORKFLOW_SCRIPT_REFACTOR_SUMMARY.md** (技術詳情)
4. **AMPLIFY_WORKFLOW_DEPLOYMENT_CHECKLIST.md** (部署問題)
5. **源代碼注釋** (具體實現)

### 常見問題連結

- [JS 節點類型說明](#-节点类型速查表)
- [常見錯誤修復](#️-常见错误速修)
- [故障排除流程](#-故障排除流程)
- [最佳實踐提示](#-提示和最佳实践)

---

## ✨ 一句話總結

**JavaScript ⚡ (3秒)** 用於快速轉換 | **Python 🐍 (30秒)** 用於複雜計算

---

**完成部署了嗎?** → 檢查 [AMPLIFY_WORKFLOW_DEPLOYMENT_CHECKLIST.md](AMPLIFY_WORKFLOW_DEPLOYMENT_CHECKLIST.md)  
**想深入了解?** → 閱讀 [WORKFLOW_SCRIPT_COMPLETE_UPDATE_SUMMARY.md](WORKFLOW_SCRIPT_COMPLETE_UPDATE_SUMMARY.md)  
**需要示例?** → 參考 [WORKFLOW_SCRIPT_TEST_GUIDE.md](WORKFLOW_SCRIPT_TEST_GUIDE.md)
