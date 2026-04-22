# Workflow 腳本執行版本指南

**最後更新：2026-03-31**

---

## 📋 概述

此文檔記錄 Workflow 系統中所有腳本執行功能的版本信息、依賴和相容性。

---

## 🔵 JavaScript 執行

### 版本信息

```
Runtime:           Node.js 18+
Sandbox:           isolated-vm 6.0.2+
Next.js:           16.0.10+
Framework:         Amplify Compatible ✅
```

### 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `SCRIPT_EXECUTION_TIMEOUT_MS` | 3000 | 執行超時 (毫秒) |
| `SCRIPT_COMPILE_TIMEOUT_MS` | 1000 | 編譯超時 (毫秒) |
| `SCRIPT_MEMORY_LIMIT_MB` | 128 | 記憶體限制 (MB) |

### 限制

| 項目 | 限制 | 說明 |
|------|------|------|
| 腳本大小 | 500 KB | 防止 DoS 攻擊 |
| 事件資料 | 1 MB | JSON 負載上限 |
| 執行時間 | 3000 ms (可設定) | 預設 3 秒 |
| 記憶體 | 128 MB (可設定) | isolated-vm 限制 |

### 支援特性

✅ **支援**
- ES2020+ 語法 (const, let, arrow functions)
- async/await Promise 模式
- 標準 JavaScript 庫 (JSON, Math, String, Array)
- console.log / console.error
- 物件、陣列、JSON 序列化

❌ **不支援**
- 網絡呼叫 (fetch, axios 不可用)
- 異步操作 (setTimeout, setInterval 不可用)
- 檔案系統存取 (fs 模組不可用)
- 進程管理 (child_process 不可用)
- 全域修改

### 執行範例

```javascript
/**
 * 標準 Webhook 腳本格式
 * 
 * 版本：Node.js 18+
 * Runtime：isolated-vm 6.0.2+
 */
function doPost(event) {
    // 輸入：event 物件
    console.log('Received event:', event);
    
    // 處理資料
    const result = {
        success: true,
        data: event.data,
        timestamp: new Date().toISOString()
    };
    
    // 輸出：回傳物件 (自動轉為 JSON)
    return result;
}
```

### 常見用途

- 資料驗證和轉換
- 條件判斷和邏輯流程
- JSON 解析和序列化
- 簡單計算和文字處理

---

## 🔴 Python 執行

### 版本信息

```
Runtime:           Python 3.9, 3.10, 3.11 (推薦), 3.12
Executor:          AWS Lambda
SDK:               @aws-sdk/client-lambda ^3.1019.0
Caller Runtime:    Node.js 18+
Framework:         Amplify Compatible ✅
```

### 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `AWS_REGION` | ap-northeast-1 | AWS 區域 |
| `AWS_ACCESS_KEY_ID` | - | AWS 存取金鑰 |
| `AWS_SECRET_ACCESS_KEY` | - | AWS 密鑰 |
| `AWS_LAMBDA_FUNCTION_NAME` | RunPythonWorkflowNode | Lambda 函式名稱 |
| `LAMBDA_TIMEOUT_MS` | 30000 | 執行超時 (毫秒) |

### Python 限制

| 項目 | 限制 | 說明 |
|------|------|------|
| 腳本大小 | 1 MB | 防止 DoS 攻擊 |
| 事件資料 | 6 MB | Lambda 事件負載上限 |
| 執行時間 | 300 秒 | Lambda 最大超時 |
| 記憶體 | 512 MB - 3 GB | Lambda 記憶體配置 |
| 臨時存儲 | 512 MB | /tmp 目錄 |

### 常用套件

| 套件 | 版本 | 說明 |
|------|------|------|
| NumPy | 1.24+ | 數值計算 |
| Pandas | 2.0+ | 資料分析 |
| Pillow | 10.1+ | 圖片處理 |
| Requests | 2.31+ | HTTP 請求 |
| Boto3 | 1.28+ | AWS 服務 |

### 支援特性

✅ **支援**
- Python 3.9 - 3.12 語法
- 異步操作 (asyncio)
- 檔案臨時存儲 (/tmp)
- 環境變數存取
- 標準庫 (json, re, datetime, math 等)
- 第三方套件 (Lambda 層)

❌ **不支援**
- 長期數據持久化 (除了 S3, DynamoDB)
- GUI 顯示 (沒有 X11)
- 本地檔案系統 (唯讀 /var, /opt)
- 系統命令執行 (受限)

### 執行範例

```python
"""
標準 Python 腳本執行

版本：Python 3.11 (推薦)
Runtime：AWS Lambda
Timeout：30000ms (預設)
"""

import json
from datetime import datetime

# 處理輸入資料
def handler(event):
    print(f"Processing event: {json.dumps(event)}")
    
    # 執行邏輯
    result = {
        "success": True,
        "data": event.get("data"),
        "timestamp": datetime.now().isoformat(),
        "processed": len(event.get("data", []))
    }
    
    print(f"Result: {json.dumps(result)}")
    return result

# 執行 (Workflow Engine 自動呼叫)
output = handler(input_data)
print(json.dumps(output))
```

### 常見用途

- 複雜資料處理 (Pandas)
- 圖片處理和分析 (Pillow)
- 機器學習推論 (NumPy, scikit-learn)
- 資料科學計算
- 長時間執行的任務

---

## 🔧 其他執行類型

### HTTP 請求

```javascript
方法：fetch (原生 API)
版本：Node.js 18+ 原生
超時：30000ms (預設)
```

### Email 發送

```
套件：nodemailer ^8.0.1
版本支援：所有 Node.js 版本
支援協議：SMTP, SendGrid, Mailgun 等
```

### AI 呼叫

```javascript
套件：@google/generative-ai ^0.24.1
版本：Python, JavaScript 通用 API
支援模型：
  • Google Gemini (推薦)
  • OpenAI GPT-4
  • Anthropic Claude
```

### LINE 整合

```
API 版本：Messaging API v3.0+
支援功能：推送訊息、回覆、圖片分析
認證：Channel Access Token
```

---

## 🚨 版本檢查與診斷

### 檢查相容性 API

```bash
# 開發環境
curl http://localhost:3000/api/workflows/check-compatibility

# 生產環境 (Amplify)
curl https://<amplify-url>/api/workflows/check-compatibility?DEBUG_AMPLIFY_CHECK=true
```

### 回應格式

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
  }
}
```

---

## 📦 package.json 依賴

### 必要 (JavaScript 執行)

```json
{
  "dependencies": {
    "isolated-vm": "^6.0.2",
    "next": "^16.0.10",
    "react": "^18.3.1"
  }
}
```

### 必要 (Python 執行)

```json
{
  "dependencies": {
    "@aws-sdk/client-lambda": "^3.1019.0",
    "@aws-sdk/lib-dynamodb": "^3.940.0"
  }
}
```

### 可選 (其他功能)

```json
{
  "dependencies": {
    "@google/generative-ai": "^0.24.1",
    "nodemailer": "^8.0.1"
  }
}
```

---

## 🔐 Amplify 部署檢查清單

### 部署前必檢

- [ ] Node.js 版本 >= 18
- [ ] `isolated-vm` 已在 package.json 中
- [ ] AWS Lambda 函式已建立
- [ ] AWS IAM 角色有正確權限
- [ ] 環境變數已在 Amplify 中設定

### 環境變數設定 (.env.local 或 Amplify Console)

```env
# Python 執行 (必需)
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
AWS_LAMBDA_FUNCTION_NAME=RunPythonWorkflowNode

# JavaScript 執行 (可選)
SCRIPT_EXECUTION_TIMEOUT_MS=3000
SCRIPT_MEMORY_LIMIT_MB=128

# Python 執行 (可選)
LAMBDA_TIMEOUT_MS=30000
```

---

## 🆘 故障排除

### Python 「Lambda function not found」

**原因**: Lambda 函式名稱錯誤或未建立

**解決**:
1. 檢查 AWS_LAMBDA_FUNCTION_NAME 是否正確
2. 確認 Lambda 函式存在於 AWS 帳戶
3. 檢查區域是否與 AWS_REGION 一致

### JavaScript 「Script execution timeout」

**原因**: 腳本執行超過 3000ms

**解決**:
1. 優化 JavaScript 程式碼
2. 增加 SCRIPT_EXECUTION_TIMEOUT_MS (最多 300000ms)
3. 拆分為多個小任務

### Python 「AWS Credentials missing」

**原因**: 環境變數未設定

**解決**:
1. 檢查 AWS_ACCESS_KEY_ID 是否設定
2. 檢查 AWS_SECRET_ACCESS_KEY 是否設定
3. 重新產生 AWS 認證

---

## 📚 參考文件

- [Workflow Engine 實作](../../lib/workflowEngine.ts)
- [JavaScript 執行器](../../lib/scriptExecutor.ts)
- [Python Runner API](../../app/api/workflows/run-python/route.ts)
- [Amplify 部署指南](../AMPLIFY_WORKFLOW_DEPLOYMENT_CHECKLIST.md)

---

## 版本歷史

| 版本 | 日期 | 更新內容 |
|------|------|--------|
| 1.0.0 | 2026-03-31 | 初始版本，支援 JS 和 Python |

---

## ✨ 總結

✅ **JavaScript 執行**
- 快速、隔離、安全
- 適合資料轉換和邏輯處理
- 默認超時 3000ms

✅ **Python 執行**
- 強大的資料科學庫
- 長時間任務支援 (300 秒上限)
- 通過 Lambda 代理確保 Amplify 相容性

✅ **Amplify 相容** - 所有功能完全支援部署
