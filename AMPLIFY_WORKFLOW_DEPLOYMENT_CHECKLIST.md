# Amplify 部署 - Workflow 功能環境變數檢查清單

## 🎯 快速部署指南

### 步驟 1：本地驗證

```bash
# 檢查相容性報告
DEBUG_AMPLIFY_CHECK=true npm run dev

# 訪問診斷端點
curl http://localhost:3000/api/workflows/check-compatibility
```

### 步驟 2：Amplify 部衝前配置

在 Amplify Console 中設定以下環境變數：

#### 必設 (Python 執行)

```
AWS_REGION = ap-northeast-1
AWS_ACCESS_KEY_ID = <your-access-key>
AWS_SECRET_ACCESS_KEY = <your-secret-key>
AWS_LAMBDA_FUNCTION_NAME = RunPythonWorkflowNode
```

#### 可選 (使用預設值)

```
LAMBDA_TIMEOUT_MS = 30000
SCRIPT_EXECUTION_TIMEOUT_MS = 3000
SCRIPT_COMPILE_TIMEOUT_MS = 1000
SCRIPT_MEMORY_LIMIT_MB = 128
```

### 步驟 3：部署後驗證

```bash
# 檢查相容性 (生產環境設定 DEBUG_AMPLIFY_CHECK=true)
curl https://<amplify-url>/api/workflows/check-compatibility

# 測試 Python 執行
curl -X POST https://<amplify-url>/api/workflows/run-python \
  -H "Content-Type: application/json" \
  -d '{"script":"print(\"Hello\")","data":{}}'
```

---

## 📊 環境變數對照表

| 變數名 | 預設值 | 描述 | 必需 |
|--------|--------|------|------|
| `AWS_REGION` | ap-northeast-1 | AWS 區域 | ✅ |
| `AWS_ACCESS_KEY_ID` | - | AWS 存取金鑰 | ✅ (Amplify) |
| `AWS_SECRET_ACCESS_KEY` | - | AWS 密鑰 | ✅ (Amplify) |
| `AWS_LAMBDA_FUNCTION_NAME` | RunPythonWorkflowNode | Lambda 函式名稱 | ✅ |
| `LAMBDA_TIMEOUT_MS` | 30000 | Python 超時 (毫秒) | ❌ |
| `SCRIPT_EXECUTION_TIMEOUT_MS` | 3000 | JS 超時 (毫秒) | ❌ |
| `SCRIPT_COMPILE_TIMEOUT_MS` | 1000 | JS 編譯超時 (毫秒) | ❌ |
| `SCRIPT_MEMORY_LIMIT_MB` | 128 | JS 記憶體上限 (MB) | ❌ |
| `DEBUG_AMPLIFY_CHECK` | false | 啟用診斷日誌 | ❌ |

---

## 🔐 AWS IAM 權限

Lambda 函式所用的 IAM 角色需要：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": "arn:aws:lambda:*:*:function:RunPythonWorkflowNode"
    }
  ]
}
```

---

## ⚠️ 常見問題

### Q: 「AWS Credentials missing or invalid」

**A:** 檢查 Amplify Console > App settings > Environment variables
- ✅ AWS_ACCESS_KEY_ID 已設定
- ✅ AWS_SECRET_ACCESS_KEY 已設定
- ✅ 認證已過期：重新生成 AWS 金鑰

### Q: 「Lambda function not found」

**A:** 確認以下項目
- ✅ Lambda 函式 `RunPythonWorkflowNode` 已建立
- ✅ 函式位於相同的 AWS 區域
- ✅ AWS_LAMBDA_FUNCTION_NAME 拼寫正確

### Q: 「isolated-vm package not installed」

**A:** 在 package.json 中確認已安裝
```json
{
  "dependencies": {
    "isolated-vm": "^latest"
  }
}
```

---

## 📋 部署檢查清單

- [ ] Lambda 函式已建立
- [ ] AWS 認證金鑰已產生
- [ ] 所有環境變數已在 Amplify 中設定
- [ ] `isolated-vm` 在 package.json 中
- [ ] 本地測試通過 (check-compatibility 回傳 isCompatible: true)
- [ ] Amplify 建置成功
- [ ] 部署後執行 check-compatibility 端點驗證

---

## 🚀 功能狀態

✅ **已完善** - 可在 Amplify 部署
- Python 腳本執行 (via Lambda)
- JavaScript 腳本執行 (via isolated-vm)
- 超時管理與錯誤處理
- 環境相容性檢查

✅ **相容 Amplify 230MB 構件限制**
- 不新增額外套件（isolated-vm 已在 Node.js 中）
- Python 執行委派到外部 Lambda
- 所有功能均為無消耗發佈

---

## 🔧 JavaScript 節點類型重構 (v2.0)

**日期**: 2026-03-31  
**變更**: 將 JavaScript 節點從泛用 `'action'` 類型改為專屬 `'javascript'` 類型

### 變更摘要

| 元件 | 變更內容 |
|------|---------|
| **節點類型** | `'action'` → `'javascript'` |
| **初始化腳本** | 新增 45 行完整範例 |
| **UI 配置** | 藍色主題版本信息框 (Node.js 18+, 3000ms) |
| **執行引擎** | 更新可執行類型列表 |

### 部署前驗証

#### ✅ 代碼驗証

- [ ] TypeScript 編譯無錯誤
  ```bash
  npx tsc --noEmit
  ```

- [ ] 構建成功
  ```bash
  npm run build
  ```

- [ ] 變更文件驗証
  - [ ] `components/workflows/WorkflowCanvas.tsx` - 節點類型已更改
  - [ ] `components/workflows/WorkflowConfigSidebar.tsx` - UI 配置已更新
  - [ ] `lib/workflowEngine.ts` - 執行類型已更新

#### ✅ 本地 UI 驗証

- [ ] JavaScript 節點在調色板顯示
  - 打開 Workflow Canvas
  - 節點調色板 > 處理/腳本 > JavaScript 腳本 ✓
  
- [ ] 側邊欄配置顯示正確
  - 選擇 JavaScript 節點
  - 確認：
    - [ ] 藍色版本信息框
    - [ ] "Node.js 18+"
    - [ ] "超時: 3000ms"
    - [ ] "記憶體: 128MB"
    - [ ] Textarea 包含 JavaScript 範例

- [ ] Python 節點保持不变
  - 選擇 Python 節點
  - 確認：
    - [ ] 綠色版本信息框
    - [ ] "Python 3.9-3.12"
    - [ ] "超時: 30000ms"

#### ✅ 本地執行驗証

- [ ] JavaScript 腳本執行測試
  ```
  觸發器 → JS 節點 → Logger
  資料: {"student_name": "Test", "course_name": "JS 101"}
  結果: ✓ console.log 正常輸出
         ✓ 資料正確合併
  ```

- [ ] Python 腳本執行測試
  ```
  觸發器 → Python 節點 → Logger
  資料: {"student_name": "Test", "course_name": "Python 101"}
  結果: ✓ print() 正常輸出
         ✓ Lambda 調用成功
  ```

### Amplify 部署驗証

#### 🔍 部署前檢查

- [ ] 所有本地驗証已通過
- [ ] Git 提交信息清晰
  ```
  refactor: Change JS workflow node type from 'action' to 'javascript'
  with initialization examples
  ```

#### 🚀 Amplify 構建驗証

- [ ] 構建日誌無錯誤
  - 訪問: Amplify Console > Deployments > Build logs
  - [ ] `npm ci` 成功
  - [ ] `npm run build` 成功
  - [ ] 部署完成

#### ✅ Staging 驗証

- [ ] UI 驗証 (Staging URL)
  - [ ] JavaScript 節點正確顯示
  - [ ] 側邊欄配置正確
  - [ ] 初始化範例正確加載

- [ ] 功能驗証
  - [ ] JavaScript 腳本執行無誤
  - [ ] Python 腳本執行無誤
  - [ ] 日誌輸出正確

#### 🎯 性能驗証

- [ ] 頁面加載時間 < 3 秒
- [ ] JavaScript 執行時間 < 3000ms
- [ ] Python 執行時間 < 30000ms
- [ ] 無記憶體洩漏

### 部署檢查矩陣

| 級別 | 項目 | 檢查結果 |
|------|------|--------|
| **本地** | TypeScript 編譯 | ✓ ✗ |
| **本地** | 構建成功 | ✓ ✗ |
| **本地** | UI 驗証 | ✓ ✗ |
| **本地** | 執行驗証 | ✓ ✗ |
| **Amplify** | 構建成功 | ✓ ✗ |
| **Staging** | UI 驗証 | ✓ ✗ |
| **Staging** | 功能驗証 | ✓ ✗ |
| **生產** | 部署完成 | ✓ ✗ |

### 故障排除

**JavaScript 節點不顯示**
```bash
# 1. 檢查 WorkflowCanvas.tsx
# 確認節點定義: type: 'javascript'

# 2. 清除浏览器缓存
# Ctrl+Shift+Delete (所有時間)

# 3. 查看控制台錯誤
# F12 > Console > 查看是否有錯誤
```

**側邊欄配置不正確**
```bash
# 1. 檢查 WorkflowConfigSidebar.tsx
# 確認 case 'action_js_script' 存在

# 2. 檢查 CSS 類名
# 確認: bg-blue-950, text-blue-400 等

# 3. 硬重載
# Ctrl+Shift+R
```

---

## 📚 相關文件

- [WORKFLOW_SCRIPT_TEST_GUIDE.md](WORKFLOW_SCRIPT_TEST_GUIDE.md) - 詳細測試步驟
- [WORKFLOW_SCRIPT_REFACTOR_SUMMARY.md](WORKFLOW_SCRIPT_REFACTOR_SUMMARY.md) - 重構總結
- [components/workflows/WorkflowCanvas.tsx](app/components/workflows/WorkflowCanvas.tsx)
- [components/workflows/WorkflowConfigSidebar.tsx](app/components/workflows/WorkflowConfigSidebar.tsx)
- [lib/workflowEngine.ts](lib/workflowEngine.ts)
