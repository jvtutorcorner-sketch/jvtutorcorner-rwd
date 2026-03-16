# AI Models Initialization Guide

初始化 AI 模型到 DynamoDB 的完整步驟。

## 前置條件

1. ✅ DynamoDB 表已建立：`jvtutorcorner-ai-models`
2. ✅ CloudFormation 模板已部署（或本地已建立）
3. ✅ AWS 憑證已配置（或使用 IAM 角色）

## 方式 1: 透過 API（推薦）

**最簡單方法，適合開發環境**

```bash
# 1. 啟動開發服務器
npm run dev

# 2. 在另一個終端，執行初始化
node scripts/init-ai-models-via-api.mjs http://localhost:3000

# 輸出應該類似：
# 🤖 AI Models Initialization (via HTTP API)
# 📍 Target: http://localhost:3000
# 📝 Initializing AI models...
# Response Status: 200
# Response: { ok: true, message: 'AI models initialized.' }
# ✅ AI models initialized successfully!
```

## 方式 2: 直接腳本（需要 AWS 憑證）

**適合 CI/CD 或 AWS 環境**

```bash
# 設置 AWS 憑證環境變數
export AWS_REGION=ap-northeast-1
export AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY
export AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY

# 或者使用 IAM 角色（EC2/Lambda/Amplify 自動提供）
# 直接執行就會使用 IAM 角色

# 執行初始化
node scripts/init-ai-models.mjs

# 輸出應該類似：
# 🤖 AI Models Initialization
# 📊 Table: jvtutorcorner-ai-models
# 🌍 Region: ap-northeast-1
# 📝 Writing OPENAI...
# ✅ OPENAI written successfully
# ...
# 🎉 All AI models initialized successfully!
```

## 方式 3: 使用 curl 呼叫 API

```bash
# 假設服務器已在 http://localhost:3000 運行

curl -X POST http://localhost:3000/api/admin/ai-models \
  -H "Content-Type: application/json" \
  -d '{"action":"initialize"}'

# 成功回應:
# {"ok":true,"message":"AI models initialized."}
```

## 驗證初始化

### 確認 API 可以讀取模型

```bash
curl http://localhost:3000/api/admin/ai-models

# 應該回傳:
# {
#   "ok": true,
#   "data": [
#     {
#       "provider": "OPENAI",
#       "models": ["gpt-5.2", "gpt-5.2-pro", ...]
#     },
#     ...
#   ]
# }
```

### 使用 AWS CLI 確認 DynamoDB

```bash
# 列出 AI Models 表中的所有項目
aws dynamodb scan \
  --table-name jvtutorcorner-ai-models \
  --region ap-northeast-1

# 應該看到 3 項：OPENAI, ANTHROPIC, GEMINI
```

### 檢查瀏覽器

1. 打開 `http://localhost:3000/apps` 
2. 點擊「新增 AI 服務設定」
3. 選擇 AI 提供商（OpenAI, Anthropic, Google Gemini）
4. 應該看到動態載入的模型列表（而不是硬編碼的）

## 初始化的模型列表

### OPENAI
- gpt-5.2
- gpt-5.2-pro
- gpt-5-mini
- gpt-5-nano
- gpt-4.1
- o3-deep-research
- o1-pro

### ANTHROPIC
- claude-opus-4-6
- claude-sonnet-4-6
- claude-haiku-4-5-20251001
- claude-3-5-sonnet

### GEMINI
- gemini-3.1-pro-preview
- gemini-3-flash
- gemini-2.5-pro
- gemini-2.5-flash

## 更新模型列表

如果想在未來更新模型列表，有 2 種方式：

### 方式 A: 更新源代碼 + 重新初始化

編輯 `lib/aiModelsService.ts` 中的 `INITIAL_AI_MODELS` 陣列，然後重新執行初始化腳本：

```bash
node scripts/init-ai-models-via-api.mjs http://localhost:3000
```

### 方式 B: 使用 API 更新特定提供商

```bash
curl -X POST http://localhost:3000/api/admin/ai-models \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "OPENAI",
    "models": ["gpt-5.2", "gpt-5.2-pro", "gpt-4-turbo", "gpt-4"]
  }'
```

## 故障排除

### 錯誤: "Could not load credentials from any providers"

解決方式：
- ✅ 使用 API 方式（方式 1）- 不需要本地憑證
- 🔧 設置 AWS 環境變數（見方式 2）
- ☁️ 使用 AWS IAM 角色（EC2/Lambda/Amplify 環境）

### 錯誤: "Table 'jvtutorcorner-ai-models' not found"

解決方式：
```bash
# 首先建立表
node scripts/create-dynamo-tables.mjs

# 或使用 CloudFormation
aws cloudformation deploy \
  --template-file cloudformation/dynamodb-ai-models-table.yml \
  --stack-name jvtutorcorner-ai-models-stack \
  --region ap-northeast-1
```

### 錯誤: "Could not locate error"

通常表示無法連接到 DynamoDB。檢查：
- 🔍 AWS 憑證是否有效
- 🌍 區域設置是否正確（預設: `ap-northeast-1`）
- 🔌 網路連接是否正常

## 環境變數

```bash
# 可選：自訂表名（預設: jvtutorcorner-ai-models）
DYNAMODB_TABLE_AI_MODELS=custom-ai-models-table

# 可選：自訂 AWS 區域（預設: ap-northeast-1）
AWS_REGION=us-east-1
```

## 相關文件

- [lib/aiModelsService.ts](../lib/aiModelsService.ts) - AI 模型服務邏輯
- [app/api/admin/ai-models/route.ts](../app/api/admin/ai-models/route.ts) - API 端點
- [cloudformation/dynamodb-ai-models-table.yml](../cloudformation/dynamodb-ai-models-table.yml) - CloudFormation 模板
- [app/apps/page.tsx](../app/apps/page.tsx) - 從 API 動態載入模型
