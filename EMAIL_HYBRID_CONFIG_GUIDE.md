# Email Verification Hybrid Schema - Environment Configuration

## 環境變數配置

在 `.env.local` 或 AWS Amplify 環境變數中添加以下配置：

### 1. DynamoDB 表名稱配置

```bash
# .env.local

# Profiles 表（既有）
DYNAMODB_TABLE_PROFILES=jvtutorcorner-profiles

# Email 驗證日誌表（新增）
DYNAMODB_TABLE_EMAIL_VERIFICATION_LOGS=jvtutorcorner-email-verification-logs
```

### 2. 管理員 API 安全令牌

```bash
# .env.local（開發環境）
ADMIN_API_SECRET=dev-secret

# AWS Amplify（生產環境）
# 通過 Amplify Console -> Hosting -> Environment variables 設定
# 使用強密碼，例如：
# ADMIN_API_SECRET=your_secure_random_token_here_min_32_chars
```

### 3. Email 白名單配置（既有）

```bash
# .env.local
# 逗號分隔的郵件或域名
EMAIL_WHITELIST=admin@test.com,@jvtutorcorner.com

# 或允許所有（開發環境）
EMAIL_WHITELIST=*
```

## DynamoDB 表建立

### jvtutorcorner-email-verification-logs 表

必須在 AWS DynamoDB 中建立新表：

```bash
# AWS CLI 命令

aws dynamodb create-table \
  --table-name jvtutorcorner-email-verification-logs \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=userId,AttributeType=S \
    AttributeName=email,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "userIdIndex",
        "KeySchema": [
          {"AttributeName": "userId", "KeyType": "HASH"},
          {"AttributeName": "timestamp", "KeyType": "RANGE"}
        ],
        "Projection": {"ProjectionType": "ALL"},
        "ProvisionedThroughput": {
          "ReadCapacityUnits": 5,
          "WriteCapacityUnits": 5
        }
      },
      {
        "IndexName": "emailIndex",
        "KeySchema": [
          {"AttributeName": "email", "KeyType": "HASH"},
          {"AttributeName": "timestamp", "KeyType": "RANGE"}
        ],
        "Projection": {"ProjectionType": "ALL"},
        "ProvisionedThroughput": {
          "ReadCapacityUnits": 5,
          "WriteCapacityUnits": 5
        }
      }
    ]' \
  --billing-mode PAY_PER_REQUEST \
  --region ap-northeast-1 \
  --tags Key=Environment,Value=production Key=Service,Value=email-verification
```

### TTL 配置（自動清理 90 天舊數據）

```bash
aws dynamodb update-time-to-live \
  --table-name jvtutorcorner-email-verification-logs \
  --time-to-live-specification AttributeName=ttl,Enabled=true \
  --region ap-northeast-1
```

### AWS CloudFormation（推薦）

使用 CloudFormation 模板自動化建立：

```yaml
# cloudformation/email-verification-logs.yml

AWSTemplateFormatVersion: '2010-09-09'
Description: 'Email Verification Logs Table for JV Tutor Corner'

Parameters:
  Environment:
    Type: String
    Default: development
    AllowedValues: [development, staging, production]

Resources:
  EmailVerificationLogsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: jvtutorcorner-email-verification-logs
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: id
          AttributeType: S
        - AttributeName: userId
          AttributeType: S
        - AttributeName: email
          AttributeType: S
        - AttributeName: timestamp
          AttributeType: S
      KeySchema:
        - AttributeName: id
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: userIdIndex
          KeySchema:
            - AttributeName: userId
              KeyType: HASH
            - AttributeName: timestamp
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
        - IndexName: emailIndex
          KeySchema:
            - AttributeName: email
              KeyType: HASH
            - AttributeName: timestamp
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
      TimeToLiveSpecification:
        Enabled: true
        AttributeName: ttl
      Tags:
        - Key: Environment
          Value: !Ref Environment
        - Key: Service
          Value: email-verification

  # CloudWatch Alarms
  WriteThrottlingAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: email-verification-logs-write-throttle
      MetricName: ConsumedWriteCapacityUnits
      Namespace: AWS/DynamoDB
      Statistic: Sum
      Period: 60
      EvaluationPeriods: 2
      Threshold: 40
      ComparisonOperator: GreaterThanThreshold
      Dimensions:
        - Name: TableName
          Value: !Ref EmailVerificationLogsTable

Outputs:
  TableArn:
    Value: !GetAtt EmailVerificationLogsTable.Arn
    Export:
      Name: EmailVerificationLogsTableArn
  TableName:
    Value: !Ref EmailVerificationLogsTable
    Export:
      Name: EmailVerificationLogsTableName
```

## 現有表遷移（Profiles 表）

### 添加新欄位（可選但推薦）

現有的 `profiles` 表不需要 schema 遷移，因為 DynamoDB 無 schema。但可以通過掃描和更新添加默認值：

```javascript
// scripts/migrate-email-verification-fields.mjs

import { ddbDocClient } from '../lib/dynamo.js';
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

async function migrateEmailVerificationFields() {
  const PROFILES_TABLE = 'jvtutorcorner-profiles';
  
  const { Items } = await ddbDocClient.send(new ScanCommand({
    TableName: PROFILES_TABLE
  }));

  for (const item of Items) {
    if (!item.emailVerificationStatus) {
      await ddbDocClient.send(new UpdateCommand({
        TableName: PROFILES_TABLE,
        Key: { id: item.id },
        UpdateExpression: `SET 
          emailVerificationStatus = :status,
          emailVerificationAttempts = :attempts,
          emailVerificationResendCount = :resendCount`,
        ExpressionAttributeValues: {
          ':status': item.emailVerified ? 'verified' : 'pending',
          ':attempts': 0,
          ':resendCount': 0
        }
      }));
    }
  }
  
  console.log(`✅ Migrated ${Items.length} profiles`);
}

await migrateEmailVerificationFields();
```

## 部署檢查清單

### 開發環境（.env.local）
- [ ] `DYNAMODB_TABLE_PROFILES` 設置
- [ ] `DYNAMODB_TABLE_EMAIL_VERIFICATION_LOGS` 設置
- [ ] `ADMIN_API_SECRET` 設置（可使用 `dev-secret`）
- [ ] `EMAIL_WHITELIST` 設置為 `*`（允許所有測試郵件）
- [ ] 本地 DynamoDB 已建立兩個表

### 生產環境（AWS Amplify）
- [ ] 建立 `jvtutorcorner-email-verification-logs` DynamoDB 表
- [ ] 配置 TTL：`ttl` 欄位，90天過期
- [ ] 通過 Amplify Console 設定環境變數：
  - `DYNAMODB_TABLE_EMAIL_VERIFICATION_LOGS`
  - `ADMIN_API_SECRET`（強密碼）
- [ ] 配置 IAM 角色允許 Lambda 訪問新表
- [ ] 建立 CloudWatch Alarms 監控寫入限流
- [ ] 驗證所有 API 端點正常運作

## Amplify IAM 權限

確保 Amplify Lambda 執行角色有訪問新表的權限：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Scan",
        "dynamodb:Query",
        "dynamodb:UpdateItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:ap-northeast-1:*:table/jvtutorcorner-profiles",
        "arn:aws:dynamodb:ap-northeast-1:*:table/jvtutorcorner-email-verification-logs",
        "arn:aws:dynamodb:ap-northeast-1:*:table/jvtutorcorner-email-verification-logs/index/*"
      ]
    }
  ]
}
```

## 驗證部署

部署後執行驗證：

```bash
# 1. 檢查表存在
aws dynamodb describe-table \
  --table-name jvtutorcorner-email-verification-logs \
  --region ap-northeast-1

# 2. 檢查 TTL 配置
aws dynamodb describe-time-to-live \
  --table-name jvtutorcorner-email-verification-logs \
  --region ap-northeast-1

# 3. 測試 API
curl -X GET 'http://localhost:3000/api/admin/email-verification/summary' \
  -H 'Authorization: Bearer dev-secret'

# 4. 運行 E2E 測試
npm run test e2e/email_hybrid_schema.spec.ts
```

## 故障排除

### 問題：無法連接日誌表
**解決**：
1. 確認表名稱在 `.env.local` 中正確設置
2. 確認 IAM 角色有訪問權限
3. 檢查區域設置（應為 `ap-northeast-1`）

### 問題：日誌寫入失敗但不中斷主流程
**預期行為**：日誌失敗只會記錄錯誤，不會阻止驗證流程
**檢查**：查看 CloudWatch 日誌中的 `[EmailVerificationLog]` 錯誤消息

### 問題：舊的日誌數據仍然存在
**解決**：TTL 最多需要 48 小時生效，確認 TTL 欄位設置正確

---

**最後更新**：2026-04-23  
**部署狀態**：✅ 就緒
