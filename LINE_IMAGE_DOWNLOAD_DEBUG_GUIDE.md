# LINE Image Download Debug Guide

## Problem Summary
LINE 官方帳號上傳圖片時出現 "無法下載圖片，請重新上傳。" 錯誤。

## What Was Added
1. **Enhanced Logging** - 詳細的日誌記錄，包括：
   - messageId validation
   - Channel Access Token validation  
   - 兩種下載方法的具體狀態碼
   - 完整的錯誤堆棧信息

2. **Debug GET Endpoint** - 允許獨立測試圖片下載：
   ```
   GET /api/line/webhook/[integrationId]?messageId=<messageId>&token=<optional_token>
   ```

## How to Use Debug Endpoint

### Option 1: Using Stored Configuration (Recommended)
當 LINE integration 已配置有 channelAccessToken 時：

```bash
curl "http://localhost:3000/api/line/webhook/YOUR_INTEGRATION_ID?messageId=ACTUAL_MESSAGE_ID"
```

### Option 2: Testing with Custom Token
若要測試特定 token：

```bash
curl "http://localhost:3000/api/line/webhook/YOUR_INTEGRATION_ID?messageId=ACTUAL_MESSAGE_ID&token=YOUR_CHANNEL_ACCESS_TOKEN"
```

### Response Format
```json
{
  "messageId": "100001234567890",
  "tokenUsed": "from_config",
  "tokenValidation": {
    "exists": true,
    "length": 148,
    "startsWithExpected": "Yes (likely valid)"
  },
  "method1": {
    "url": "https://api-data.line.me/v2/bot/message/100001234567890/content",
    "status": 401,
    "statusText": "Unauthorized",
    "size": null,
    "error": "Invalid access token"
  },
  "method2": {
    "url": "https://api.line.me/v2/bot/message/100001234567890/content",
    "status": 404,
    "statusText": "Not Found",
    "size": null,
    "error": "Not found"
  },
  "summary": {
    "success": false,
    "successMethod": "Neither",
    "downloadedBytes": null
  }
}
```

## Diagnostic Checklist

### Status Code 401 (Unauthorized)
**Likely Cause:** Channel Access Token 無效或已過期
**Solution:**
1. 檢查 LINE Developers Console
2. 重新產生 Channel Access Token
3. 更新 jvtutorcorner-app-integrations 表中的 config.channelAccessToken

### Status Code 404 (Not Found)
**Likely Cause:** 
- messageId 不存在或已過期
- LINE API 未能找到該訊息內容

**Solution:**
1. 確認 messageId 格式正確（應為長數字）
2. LINE 訊息內容有 24 小時有效期限・需要在此期間下載

### Status Code 500 (Server Error)
**Likely Cause:** LINE API 服務暫時故障
**Solution:**
1. 稍後重試
2. 檢查 LINE API 服務狀態

### No Response / Network Error
**Likely Cause:** 
- Network connectivity issue
- Domain resolution failure

**Solution:**
1. 測試基本網絡連接
2. 檢查防火牆設定

## Log Locations to Check

When real user uploads image to LINE official account:

1. **Development Local:**
   查看終端中的 `[LINE Webhook]` 標籤

2. **Production (AWS):**
   CloudWatch Logs → `/aws/lambda/[function-name]` 或應用程序日誌

3. **Key Log Entries:**
```
[LINE Webhook] Event details: {...}
[LINE Webhook] Channel Access Token exists: true/false
[LINE Webhook] Method 1 response status: XXX
[LINE Webhook] Method 2 response status: XXX
[LINE Webhook] Both methods failed...
```

## Testing Steps

### Step 1: Get Real messageId
1. 用戶上傳圖片到 LINE 官方帳號
2. 檢查日誌找到 `[LINE Webhook] Event details:`
3. 複製該 messageId（例如：100001234567890）

### Step 2: Run Debug Endpoint
```bash
# 在部署的環境中（本地或 AWS）
curl "http://your-domain/api/line/webhook/YOUR_INTEGRATION_ID?messageId=100001234567890"
```

### Step 3: Analyze Result
- 若 `summary.success` 為 `true` → 下載本身可行，問題可能在 AI 分析階段
- 若 `summary.success` 為 `false` → 檢查具體的狀態碼以確定根本原因

## Common Solutions

| 狀況 | 解決方案 |
|------|--------|
| Token 401 Unauthorized | 重新發行 Channel Access Token |
| messageId 404 Not Found | 超過 24 小時，需使用新的訊息 |
| 兩個方法都失敗 | 檢查 DynamoDB 配置設定 |
| 下載成功但無 AI 結果 | 檢查 AI service 連接 (OPENAI/ANTHROPIC/GEMINI) |

## Next Steps

1. 部署最新程式碼
2. 用戶上傳圖片，獲得 messageId
3. 使用 debug 端點測試
4. 根據狀態碼採取相應措施
5. 更新 configuration 或 troubleshoot 相應的 service
