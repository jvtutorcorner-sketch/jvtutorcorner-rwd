# 腳本執行版本快速參考

## 🟦 JavaScript 執行版本 

```
┌─ Runtime ─────────────────────────┐
│ Node.js: 18+                       │
│ Sandbox: isolated-vm 6.0.2+        │
│ Next.js: 16.0.10+                  │
└────────────────────────────────────┘

┌─ 限制 ──────────────────────────────┐
│ 超時:     3,000ms (預設)            │
│ 記憶體:   128MB                     │
│ 腳本:     500KB                     │
│ 資料:     1MB                       │
└────────────────────────────────────┘

✅ 支援:  async/await, JSON, 標準庫
❌ 不支持: fetch, setTimeout, 檔案系統

📍 檔案:
  • /lib/scriptExecutor.ts (實作)
  • 版本信息: JAVASCRIPT_VERSION_INFO
```

---

## 🟥 Python 執行版本

```
┌─ Runtime ──────────────────────────┐
│ Python: 3.9, 3.10, 3.11 (推薦), 3.12 │
│ Executor: AWS Lambda               │
│ SDK: @aws-sdk/client-lambda 3.1019 │
│ Caller: Node.js 18+                │
└────────────────────────────────────┘

┌─ 限制 ──────────────────────────────┐
│ 超時:     30,000ms (預設, 最多 300s)  │
│ 記憶體:   512MB - 3GB               │
│ 腳本:     1MB                       │
│ 資料:     6MB                       │
└────────────────────────────────────┘

✅ 支援:  NumPy, Pandas, 異步, 檔案 I/O
❌ 不支持: 無限時間, GUI, 本地檔案系統

📍 檔案:
  • /app/api/workflows/run-python/route.ts (API)
  • 版本信息: PYTHON_VERSION_INFO
```

---

## 🔧 環境變數配置

### JavaScript 執行

```env
# 可選 (使用預設值)
SCRIPT_EXECUTION_TIMEOUT_MS=3000      # 執行超時
SCRIPT_COMPILE_TIMEOUT_MS=1000        # 編譯超時
SCRIPT_MEMORY_LIMIT_MB=128            # 記憶體上限
```

### Python 執行

```env
# 必需 (Amplify 部署)
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
AWS_LAMBDA_FUNCTION_NAME=RunPythonWorkflowNode

# 可選 (使用預設值)
LAMBDA_TIMEOUT_MS=30000               # 執行超時
```

---

## 📝 使用範例

### JavaScript (isolated-vm)

```typescript
import { executeWebhookScript } from '@/lib/scriptExecutor';

const result = await executeWebhookScript(`
  function doPost(event) {
    console.log('Event:', event);
    return { success: true, data: event.data };
  }
`, 
{ data: { key: 'value' } },
3000 // 超時 (ms)
);

// 結果
if (result.success) {
  console.log('Output:', result.result);
  console.log('Time:', result.executionTimeMs, 'ms');  // 版本 1.0.0+
}
```

### Python (Lambda)

```typescript
const response = await fetch('/api/workflows/run-python', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    script: `
import json
result = {"status": "success", "version": "3.11"}
print(json.dumps(result))
    `,
    data: { input: 'test' },
    timeout_ms: 30000  // 可自訂超時
  })
});

const result = await response.json();
// result.ok, result.stdout, result.stderr, result.code
```

---

## 🚀 Amplify 部署步驟

1. **驗證版本相容性**
   ```bash
   curl http://localhost:3000/api/workflows/check-compatibility
   ```

2. **設定環境變數** (Amplify Console)
   ```
   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_LAMBDA_FUNCTION_NAME
   ```

3. **部署後檢查**
   ```bash
   curl https://<url>/api/workflows/check-compatibility?DEBUG_AMPLIFY_CHECK=true
   ```

---

## 🔗 相關文件

- **詳細指南**: `WORKFLOW_SCRIPT_EXECUTION_VERSIONS.md`
- **部署檢查**: `AMPLIFY_WORKFLOW_DEPLOYMENT_CHECKLIST.md`
- **功能完善**: `WORKFLOW_PYTHON_JAVASCRIPT_ENHANCEMENT.md`

---

## 版本信息物件 (程式碼中可存取)

### JavaScript
```typescript
import { JAVASCRIPT_VERSION_INFO } from '@/lib/scriptExecutor';
// runtime, isolatedVm, nextJs, environment, memoryLimitMb 等
```

### Python
```typescript  
import { PYTHON_VERSION_INFO } from '@/app/api/workflows/run-python/route';
// lambdaVersion, nodeVersion, awsSdkLambda, environment 等
```

### Workflow Engine
```typescript
import { WORKFLOW_ENGINE_VERSION_INFO } from '@/lib/workflowEngine';
// engineVersion, scriptExecution, dependencies, amplifyCompatibility 等
```

---

## 💡 快速診斷

```typescript
// 檢查 JavaScript 執行
const jsOk = await checkJavaScriptSupport();

// 檢查 Python 執行
const pyOk = await checkPythonSupport();

// 完整檢查
const report = await checkAmplifyCompatibility();
if (!report.isCompatible) {
  console.error('Issues:', report.recommendations);
}
```

---

**Last Updated**: 2026-03-31  
**Status**: ✅ All versions documented and annotated
