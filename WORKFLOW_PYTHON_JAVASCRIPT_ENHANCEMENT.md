# Workflow 頁面 - Python & JavaScript 完善指南

**最後更新：2026-03-31**

## ✅ 完善內容總結

已將 workflow 系統中的 Python 和 JavaScript 執行功能進行全面完善，並確保 **AWS Amplify 部署相容性**。

---

## 📋 改善清單

### 1️⃣ Python 執行功能增強 (`/app/api/workflows/run-python/route.ts`)

**改善項目：**
- ✅ 增強 AWS 認證管理 (lazy initialization)
- ✅ 新增腳本大小檢查 (防止 DoS，上限 1MB)
- ✅ 改進超時管理 (自訂超時，範圍 1-300 秒)
- ✅ 完善錯誤分類 (認證、超時、找不到函式等)
- ✅ 新增 Amplify 環境檢測與診斷提示

**關鍵改變：**
```typescript
// Before: 固定超時，錯誤處理簡陋
await lambdaClient.send(command);

// After: 動態超時、超時保護、詳細錯誤分類
const effectiveTimeout = Math.max(MIN_TIMEOUT, Math.min(MAX_TIMEOUT, timeout_ms || LAMBDA_TIMEOUT_MS));
const lambdaPromise = client.send(command);
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Lambda execution timeout')), effectiveTimeout + 5000)
);
await Promise.race([lambdaPromise, timeoutPromise]);
```

**環境變數支援：**
- `AWS_LAMBDA_FUNCTION_NAME` (預設: `RunPythonWorkflowNode`)
- `LAMBDA_TIMEOUT_MS` (預設: `30000`)
- `AWS_ACCESS_KEY_ID` (Amplify 必需)
- `AWS_SECRET_ACCESS_KEY` (Amplify 必需)
- `AWS_REGION` (預設: `ap-northeast-1`)

---

### 2️⃣ JavaScript 執行功能增強 (`/lib/scriptExecutor.ts`)

**改善項目：**
- ✅ 改進超時保護機制 (支援自訂超時)
- ✅ 新增記憶體管理驗證 (上限 128MB 可設定)
- ✅ 新增腳本/資料負載大小檢查 (防止 DoS)
- ✅ 完善錯誤分類 (超時、記憶體溢位、堆疊溢位等)
- ✅ 新增執行時間追蹤 (`executionTimeMs`)

**關鍵改變：**
```typescript
// Before: 硬編碼 3000ms 超時
await runner.apply(undefined, [payloadString], { timeout: 3000 });

// After: 動態超時、多層保護、時間追蹤
const effectiveTimeout = timeoutMs || SCRIPT_EXECUTION_TIMEOUT_MS;
const resultString = await Promise.race([
  runner.apply(undefined, [payloadString], { timeout: effectiveTimeout }),
  new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error(`timeout`)), effectiveTimeout + 1000)
  )
]);
return { success: true, result: parsedResult, logs, executionTimeMs: Date.now() - startTime };
```

**環境變數支援：**
- `SCRIPT_EXECUTION_TIMEOUT_MS` (預設: `3000`)
- `SCRIPT_COMPILE_TIMEOUT_MS` (預設: `1000`)
- `SCRIPT_MEMORY_LIMIT_MB` (預設: `128`)

---

### 3️⃣ Amplify 相容性檢查系統 (`/lib/amplifyCompatibilityCheck.ts`)

**新增模組功能：**
- ✅ 自動檢測環境 (Amplify vs 本地)
- ✅ 驗證 Python 執行依賴 (AWS Lambda 配置)
- ✅ 驗證 JavaScript 執行依賴 (`isolated-vm` 套件)
- ✅ 生成診斷報告，包含建議與警告

**檢查項目：**
```typescript
interface AmplifyCompatibilityReport {
  isCompatible: boolean;
  environment: 'amplify' | 'local' | 'unknown';
  pythonExecution: {
    supported: boolean;
    reason: string;
    warnings: string[];
  };
  javascriptExecution: {
    supported: boolean;
    reason: string;
    warnings: string[];
  };
  recommendations: string[];
}
```

**使用範例：**
```typescript
import { checkAmplifyCompatibility } from '@/lib/amplifyCompatibilityCheck';

const report = await checkAmplifyCompatibility();
if (!report.isCompatible) {
  console.error('Workflow features not available:', report.recommendations);
}
```

---

### 4️⃣ 診斷 API 端點 (`/app/api/workflows/check-compatibility/route.ts`)

**新增端點：**
- `GET /api/workflows/check-compatibility`

**功能：**
- 回傳 Amplify 相容性報告
- 包含環境資訊和詳細診斷
- 僅在開發環境或 `DEBUG_AMPLIFY_CHECK=true` 時可用

**回應範例：**
```json
{
  "ok": true,
  "report": {
    "isCompatible": true,
    "environment": "amplify",
    "pythonExecution": {
      "supported": true,
      "reason": "Python execution via AWS Lambda is ready",
      "warnings": []
    },
    "javascriptExecution": {
      "supported": true,
      "reason": "JavaScript execution via isolated-vm is ready",
      "warnings": []
    },
    "recommendations": [
      "✅ All workflow features are compatible with Amplify deployment"
    ]
  },
  "timestamp": "2026-03-31T...",
  "amplify": true
}
```

---

### 5️⃣ Workflow Engine 改進 (`/lib/workflowEngine.ts`)

**改善項目：**
- ✅ 改進 Lambda 客戶端管理 (lazy initialization)
- ✅ 增強 Python 腳本節點的超時保護
- ✅ 新增詳細的執行日誌記錄
- ✅ 新增 Amplify 診斷提示

**關鍵改變：**
```typescript
// Before: 簡單的同步調用，錯誤處理最少
const pyLambdaResponse = await lambdaClient.send(pyLambdaCommand);

// After: 超時保護、詳細日誌、Amplify 診斷
const lambdaPromise = lambdaClient.send(pyLambdaCommand);
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Lambda execution timeout')), lambdaTimeoutMs + 5000)
);
const pyLambdaResponse = await Promise.race([lambdaPromise, timeoutPromise]);
// 包含完整的日誌記錄和錯誤分類
```

---

## 🚀 Amplify 部署檢查清單

### ✅ 必要配置

| 項目 | 狀態 | 說明 |
|------|------|------|
| **Python 執行** | ✅ 支援 | 通過 AWS Lambda 委派（外部服務不影響 Amplify） |
| **JavaScript 執行** | ✅ 支援 | 使用 `isolated-vm` Node.js 套件（Amplify 原生支援） |
| **HTTP 請求** | ✅ 支援 | 標準 fetch API |
| **郵件發送** | ✅ 支援 | 標準 SMTP 或 Amplify 整合 |
| **DynamoDB 存儲** | ✅ 支援 | Amplify 原生支援 |

### ⚠️ Amplify 環境變數設定

**必設：**
```env
AWS_AMPLIFY=true
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=<your-access-key>
AWS_SECRET_ACCESS_KEY=<your-secret-key>
AWS_LAMBDA_FUNCTION_NAME=RunPythonWorkflowNode
```

**可選（使用預設值）：**
```env
LAMBDA_TIMEOUT_MS=30000
SCRIPT_EXECUTION_TIMEOUT_MS=3000
SCRIPT_COMPILE_TIMEOUT_MS=1000
SCRIPT_MEMORY_LIMIT_MB=128
```

---

## 📊 效能考量

### 限制

| 項目 | 限制 | 說明 |
|------|------|------|
| **Python 腳本大小** | 1 MB | 防止 DoS 攻擊 |
| **JavaScript 腳本大小** | 512 KB | 防止記憶體溢位 |
| **事件資料大小** | 1 MB | JSON 負載上限 |
| **Python 超時** | 300 秒 (5 分) | Lambda 限制 |
| **JavaScript 超時** | 3 秒 (預設) | 無服務器環境限制 |
| **JavaScript 記憶體** | 128 MB | isolated-vm 限制 |

### 建議

1. **Python 長時間任務**：應使用非同步 Lambda invoke (異步執行)
2. **JavaScript 複雜運算**：應分解為多個小任務
3. **監控與日誌**：所有執行都記錄詳細 console log 和執行時間

---

## 🔍 故障排除

### Python 執行失敗

**症狀：** `AWS Credentials missing or invalid`

**解決：**
1. 檢查 AWS_ACCESS_KEY_ID 和 AWS_SECRET_ACCESS_KEY
2. 檢查 AWS_REGION 是否與 Lambda 函式區域匹配
3. 確認 IAM 角色有 `lambda:InvokeFunction` 權限

**症狀：** `Lambda function not found: RunPythonWorkflowNode`

**解決：**
1. 確認 Lambda 函式已建立
2. 檢查 AWS_LAMBDA_FUNCTION_NAME 拼寫正確
3. 確認函式與應用在同一區域

---

### JavaScript 執行失敗

**症狀：** `isolated-vm package not installed`

**解決：**
```bash
npm install isolated-vm
# 或
yarn add isolated-vm
# 或
pnpm add isolated-vm
```

**症狀：** `Script execution timeout`

**解決：**
1. 增加 SCRIPT_EXECUTION_TIMEOUT_MS (最大 300000ms)
2. 優化腳本以減少執行時間
3. 檢查是否有無限迴圈或阻塞操作

---

## 📝 開發指南

### 呼叫 Python 執行

```typescript
const response = await fetch('/api/workflows/run-python', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    script: `
      import json
      result = {"status": "success", "data": input_data}
      print(json.dumps(result))
    `,
    data: { input_data: { key: 'value' } },
    timeout_ms: 15000 // 15 秒
  })
});

const result = await response.json();
if (result.ok) {
  console.log('Output:', result.output);
} else {
  console.error('Error:', result.stderr);
}
```

### 呼叫 JavaScript 執行

```typescript
import { executeWebhookScript } from '@/lib/scriptExecutor';

const result = await executeWebhookScript(`
  function doPost(event) {
    console.log('Event:', event);
    return { success: true, data: event.data };
  }
`, 
{ data: { key: 'value' } },
3000 // 3 秒超時
);

if (result.success) {
  console.log('Result:', result.result);
  console.log('Execution time:', result.executionTimeMs, 'ms');
} else {
  console.error('Error:', result.error);
}
```

### 檢查 Amplify 相容性

```typescript
import { checkAmplifyCompatibility } from '@/lib/amplifyCompatibilityCheck';

export async function checkFeatures() {
  const report = await checkAmplifyCompatibility();
  
  if (!report.isCompatible) {
    console.warn('⚠️ Some features unavailable:', report.recommendations);
    return false;
  }
  
  console.log('✅ All workflow features available');
  return true;
}
```

---

## 🎯 測試建議

### 本地測試

```bash
# 測試 JavaScript 執行
curl http://localhost:3000/api/workflows/check-compatibility

# 測試 Python 執行 (需要 AWS 認證)
curl -X POST http://localhost:3000/api/workflows/run-python \
  -H "Content-Type: application/json" \
  -d '{"script":"print(\"Hello, World!\")","data":{}}'
```

### Amplify 部署前檢查清單

- [ ] AWS Lambda 函式已建立並可存取
- [ ] IAM 角色有正確的 invoke 權限
- [ ] `isolated-vm` 已安裝在 package.json
- [ ] 所有環境變數已在 Amplify 中設定
- [ ] 執行`DEBUG_AMPLIFY_CHECK=true` 進行診斷
- [ ] 在 /api/workflows/check-compatibility 檢查相容性報告

---

## 📚 相關文件

- [Workflow Engine 架構](../workflowEngine.ts)
- [Script Executor](../scriptExecutor.ts)
- [Amplify 兼容性檢查](../amplifyCompatibilityCheck.ts)
- [AWS Amplify 官方文檔](https://docs.amplify.aws/)

---

## ✨ 總結

✅ **完成：**
1. Python 執行功能已完全優化，支援動態超時和錯誤分類
2. JavaScript 執行功能包含記憶體管理和超時保護
3. 新增完整的 Amplify 相容性檢查系統
4. 所有長時間任務都通過 Lambda 適當委派
5. 提供詳細的診斷端點和日誌記錄

✅ **Amplify 相容性：**
- ✅ 適合 Amplify 部署（使用外部 Lambda 和標準 Node.js 原生功能）
- ✅ 無需修改核心部署配置
- ✅ 包含完整的環境檢測和診斷系統
