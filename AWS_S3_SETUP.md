# AWS S3 圖片存儲設置指南

本指南將幫助您設置 AWS S3 來存儲輪播圖和網站圖片，而不是使用 base64 編碼。

## 前置要求

1. AWS 帳號
2. 安裝 AWS Amplify CLI：
   ```bash
   npm install -g @aws-amplify/cli
   ```

3. 配置 AWS CLI（如果還沒做）：
   ```bash
   aws configure
   ```

## 設置步驟

### 1. 添加 S3 存儲到 Amplify 項目

運行設置腳本：
```bash
npm run setup-s3
```

或者手動執行：
```bash
amplify add storage
```

選擇以下選項：
- **Content type**: Content (Images, audio, video, etc.)
- **Friendly name**: jvtutorcornerimages
- **Bucket name**: jvtutorcornerimages
- **Auth users only?**: No
- **Guest users read access?**: Yes
- **Guest users write access?**: Yes

### 2. 部署存儲到 AWS

```bash
amplify push
```

### 3. 配置環境變數

在您的 `.env.local` 文件中添加以下變數：

```env
# AWS S3 Configuration
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_S3_BUCKET_NAME=jvtutorcornerimages

# DynamoDB Configuration (existing)
DYNAMODB_TABLE_CAROUSEL=jvtutorcorner-carousel
```

**如何獲取這些值：**

- **AWS_REGION**: 在 `amplify/team-provider-info.json` 中查看，或使用 `ap-northeast-1`
- **AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY**:
  - 前往 AWS IAM Console
  - 創建新用戶或使用現有用戶
  - 添加 `AmazonS3FullAccess` 權限
  - 生成 Access Key
- **AWS_S3_BUCKET_NAME**: 使用 Amplify 創建的 bucket 名稱

### 4. 測試設置

1. 啟動開發服務器：
   ```bash
   npm run dev
   ```

2. 前往管理頁面：`http://localhost:3000/admin/carousel`

3. 上傳圖片測試 S3 存儲功能

## 功能特點

- ✅ 圖片直接上傳到 AWS S3
- ✅ 公共讀取權限（無需認證即可查看圖片）
- ✅ 自動生成公共 URL
- ✅ 刪除時自動從 S3 移除文件
- ✅ 支持常見圖片格式 (JPEG, PNG, GIF, WebP)
- ✅ 20MB 文件大小限制

## 安全注意事項

- S3 bucket 配置為公共讀取，這適合公開圖片
- 如果需要私有圖片，請修改 bucket 策略
- 確保 AWS 憑證安全，不要提交到版本控制

## 故障排除

### 上傳失敗
- 檢查 AWS 憑證是否正確
- 確認 S3 bucket 名稱正確
- 檢查文件大小是否超過 20MB

### 圖片無法顯示
- 確認 bucket 有公共讀取權限
- 檢查圖片 URL 是否正確
- 確認 AWS 區域設置正確

### Amplify 部署問題
- 確保 AWS CLI 已正確配置
- 檢查 Amplify 項目狀態：`amplify status`