# 資料庫與知識庫後端實作指南

> 本文件為後端開發人員提供詳細的實作步驟

## 1. 資料庫 Schema 更新

### Amplify 資料模型定義

在 `amplify/backend/api/graphql/schema.graphql` 中更新或新增：

```graphql
type AppIntegration @model @auth(rules: [{allow: owner}]) {
  id: ID!
  userId: String!
  type: AppIntegrationType! # 新增: MONGODB, POSTGRESQL, MYSQL, REDIS, QDRANT
  name: String!
  config: AWSJSON! # 儲存完整的配置 JSON
  status: IntegrationStatus! # ACTIVE, INACTIVE, ERROR
  lastTestedAt: AWSDateTime
  testResult: String # 連線測試結果
  createdAt: AWSDateTime!
  updatedAt: AWSDateTime!
}

enum AppIntegrationType {
  # 現有
  LINE
  TELEGRAM
  WHATSAPP
  MESSENGER
  SLACK
  TEAMS
  DISCORD
  WECHAT
  OPENAI
  ANTHROPIC
  GEMINI
  AI_CHATROOM
  ECPAY
  PAYPAL
  STRIPE
  LINEPAY
  JKOPAY
  RESEND
  # 新增資料庫
  DYNAMODB
  MONGODB
  POSTGRESQL
  MYSQL
  REDIS
  # 新增知識庫
  QDRANT
}

enum IntegrationStatus {
  ACTIVE
  INACTIVE
  ERROR
  PENDING_TEST
}
```

### DynamoDB 資料表更新

```typescript
// 使用 AWS CDK 或 CloudFormation 定義表
const appIntegrationsTable = new Table(this, 'AppIntegrations', {
  partitionKey: { name: 'userId', type: AttributeType.STRING },
  sortKey: { name: 'integrationId', type: AttributeType.STRING },
  encryption: TableEncryption.AWS_MANAGED,
  billingMode: BillingMode.PAY_PER_REQUEST,
  ttl: {
    attribute: 'expiresAt',
    enabled: true
  }
});

// GSI for querying by type
appIntegrationsTable.addGlobalSecondaryIndex({
  indexName: 'typeIndex',
  partitionKey: { name: 'userId', type: AttributeType.STRING },
  sortKey: { name: 'type', type: AttributeType.STRING }
});
```

## 2. 後端 API 路由實作

### 位置
`app/api/app-integrations/route.ts`

### POST 端點完整實作

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { validateDatabaseConfig } from '@/lib/database-validators';
import { encryptConfig } from '@/lib/encryption';
import { saveIntegration } from '@/lib/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, type, name, config } = body;

    // 1. 驗證必填欄位
    if (!userId || !type || !name || !config) {
      return NextResponse.json(
        { error: '缺少必填欄位' },
        { status: 400 }
      );
    }

    // 2. 根據類型驗證配置
    const validationResult = await validateDatabaseConfig(type, config);
    if (!validationResult.valid) {
      return NextResponse.json(
        { error: validationResult.error },
        { status: 400 }
      );
    }

    // 3. 加密敏感資訊
    const encryptedConfig = encryptConfig(config, type);

    // 4. 測試連線
    const testResult = await testConnection(type, config);
    if (!testResult.success) {
      return NextResponse.json(
        { error: `連線測試失敗: ${testResult.error}` },
        { status: 400 }
      );
    }

    // 5. 儲存到資料庫
    const integration = await saveIntegration({
      userId,
      type,
      name,
      config: encryptedConfig,
      status: 'ACTIVE',
      lastTestedAt: new Date(),
      testResult: testResult.message
    });

    return NextResponse.json({
      ok: true,
      data: {
        id: integration.id,
        name,
        type,
        status: 'ACTIVE'
      }
    });
  } catch (error) {
    console.error('保存配置失敗:', error);
    return NextResponse.json(
      { error: '伺服器錯誤' },
      { status: 500 }
    );
  }
}
```

## 3. 資料庫連線類 (Drivers)

### 檔案結構
```
lib/
  database-connectors/
    base.ts              # 基底類別
    dynamodb.ts          # DynamoDB 實作
    mongodb.ts           # MongoDB 實作
    postgresql.ts        # PostgreSQL 實作
    mysql.ts             # MySQL 實作
    redis.ts             # Redis 實作
    qdrant.ts            # Qdrant 實作
    validators.ts        # 驗證邏輯
```

### base.ts - 基底類別

```typescript
export interface DatabaseConfig {
  [key: string]: any;
}

export abstract class DatabaseConnector {
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract query(sql: string, params?: any[]): Promise<any>;
  abstract test(): Promise<{ success: boolean; message: string }>;
}

export async function testConnection(
  type: string,
  config: DatabaseConfig
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const connector = getConnector(type, config);
    await connector.connect();
    const result = await connector.test();
    await connector.disconnect();
    return result;
  } catch (error) {
    return {
      success: false,
      message: '連線測試失敗',
      error: error instanceof Error ? error.message : '未知錯誤'
    };
  }
}

function getConnector(type: string, config: DatabaseConfig): DatabaseConnector {
  switch (type) {
    case 'DYNAMODB':
      return new DynamoDBConnector(config);
    case 'MONGODB':
      return new MongoDBConnector(config);
    case 'POSTGRESQL':
      return new PostgreSQLConnector(config);
    case 'MYSQL':
      return new MySQLConnector(config);
    case 'REDIS':
      return new RedisConnector(config);
    case 'QDRANT':
      return new QdrantConnector(config);
    default:
      throw new Error(`不支援的資料庫類型: ${type}`);
  }
}
```

### dynamodb.ts

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseConnector, DatabaseConfig } from './base';

export class DynamoDBConnector implements DatabaseConnector {
  private client: DynamoDBDocumentClient;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
    const dynamoDBClient = new DynamoDBClient({ region: config.region });
    this.client = DynamoDBDocumentClient.from(dynamoDBClient);
  }

  async connect(): Promise<void> {
    // DynamoDB 基於 http，無需明確連線
  }

  async disconnect(): Promise<void> {
    // 清理資源
  }

  async query(params: any): Promise<any> {
    const command = new GetCommand({
      TableName: this.config.tableName,
      Key: params
    });
    return this.client.send(command);
  }

  async test(): Promise<{ success: boolean; message: string }> {
    try {
      // 測試 DescribeTable 權限
      const command = new GetCommand({
        TableName: this.config.tableName,
        Key: { [this.config.partitionKey]: 'test' }
      });
      await this.client.send(command);
      return {
        success: true,
        message: `DynamoDB 表 "${this.config.tableName}" 連線成功`
      };
    } catch (error) {
      throw error;
    }
  }
}
```

### mongodb.ts

```typescript
import { MongoClient } from 'mongodb';
import { DatabaseConnector, DatabaseConfig } from './base';

export class MongoDBConnector implements DatabaseConnector {
  private client: MongoClient;
  private config: DatabaseConfig;
  private connected = false;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.client = new MongoClient(config.uri);
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }

  async query(filter: any): Promise<any> {
    const db = this.client.db(this.config.database);
    const collection = db.collection(this.config.collection);
    return collection.find(filter).toArray();
  }

  async test(): Promise<{ success: boolean; message: string }> {
    try {
      await this.connect();
      const admin = this.client.db().admin();
      const status = await admin.ping();
      return {
        success: true,
        message: `MongoDB 連線成功 - ${this.config.database}.${this.config.collection}`
      };
    } catch (error) {
      throw error;
    }
  }
}
```

### postgresql.ts

```typescript
import { Pool } from 'pg';
import { DatabaseConnector, DatabaseConfig } from './base';

export class PostgreSQLConnector implements DatabaseConnector {
  private pool: Pool;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.pool = new Pool({
      host: config.host,
      port: parseInt(config.port),
      user: config.user,
      password: config.password,
      database: config.database
    });
  }

  async connect(): Promise<void> {
    const client = await this.pool.connect();
    client.release();
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
  }

  async query(sql: string, params?: any[]): Promise<any> {
    return this.pool.query(sql, params);
  }

  async test(): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.pool.query('SELECT 1');
      return {
        success: true,
        message: `PostgreSQL 連線成功 - 表 "${this.config.table}"`
      };
    } catch (error) {
      throw error;
    }
  }
}
```

### qdrant.ts

```typescript
import { QdrantClient } from '@qdrant/js-client-rest';
import { DatabaseConnector, DatabaseConfig } from './base';

export class QdrantConnector implements DatabaseConnector {
  private client: QdrantClient;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.client = new QdrantClient({
      url: config.url,
      apiKey: config.apiKey
    });
  }

  async connect(): Promise<void> {
    // 基於 HTTP，無需連線
  }

  async disconnect(): Promise<void> {
    // 清理資源
  }

  async query(query: string, limit: number = 10): Promise<any> {
    // 使用向量搜索
    return this.client.search(this.config.collectionName, {
      vector: query, // 應先轉換為向量
      limit
    });
  }

  async test(): Promise<{ success: boolean; message: string }> {
    try {
      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(
        c => c.name === this.config.collectionName
      );
      
      if (!collectionExists) {
        return {
          success: false,
          message: `集合 "${this.config.collectionName}" 不存在`
        };
      }

      return {
        success: true,
        message: `Qdrant 連線成功 - 集合 "${this.config.collectionName}"`
      };
    } catch (error) {
      throw error;
    }
  }
}
```

## 4. 驗證邏輯

### validators.ts

```typescript
import { DatabaseConfig } from './base';

export async function validateDatabaseConfig(
  type: string,
  config: DatabaseConfig
): Promise<{ valid: boolean; error?: string }> {
  switch (type) {
    case 'DYNAMODB':
      return validateDynamoDB(config);
    case 'MONGODB':
      return validateMongoDB(config);
    case 'POSTGRESQL':
    case 'MYSQL':
      return validateSQL(config);
    case 'REDIS':
      return validateRedis(config);
    case 'QDRANT':
      return validateQdrant(config);
    default:
      return { valid: false, error: `不支援的類型: ${type}` };
  }
}

function validateDynamoDB(config: DatabaseConfig) {
  const required = ['tableName', 'partitionKey', 'region'];
  const errors = required.filter(k => !config[k]);
  
  if (errors.length > 0) {
    return { valid: false, error: `缺少必填欄位: ${errors.join(', ')}` };
  }
  
  const validRegions = ['us-east-1', 'us-west-2', 'ap-northeast-1', 'ap-southeast-1', 'eu-west-1'];
  if (!validRegions.includes(config.region)) {
    return { valid: false, error: '無效的 AWS 區域' };
  }
  
  return { valid: true };
}

function validateMongoDB(config: DatabaseConfig) {
  const required = ['uri', 'database', 'collection'];
  const errors = required.filter(k => !config[k]);
  
  if (errors.length > 0) {
    return { valid: false, error: `缺少必填欄位: ${errors.join(', ')}` };
  }
  
  if (!config.uri.startsWith('mongodb')) {
    return { valid: false, error: '無效的 MongoDB URI' };
  }
  
  return { valid: true };
}

function validateSQL(config: DatabaseConfig) {
  const required = ['host', 'port', 'user', 'password', 'database', 'table'];
  const errors = required.filter(k => !config[k]);
  
  if (errors.length > 0) {
    return { valid: false, error: `缺少必填欄位: ${errors.join(', ')}` };
  }
  
  const port = parseInt(config.port);
  if (isNaN(port) || port < 1 || port > 65535) {
    return { valid: false, error: '無效的埠號' };
  }
  
  return { valid: true };
}

function validateRedis(config: DatabaseConfig) {
  const required = ['host', 'port'];
  const errors = required.filter(k => !config[k]);
  
  if (errors.length > 0) {
    return { valid: false, error: `缺少必填欄位: ${errors.join(', ')}` };
  }
  
  return { valid: true };
}

function validateQdrant(config: DatabaseConfig) {
  const required = ['url', 'apiKey', 'collectionName'];
  const errors = required.filter(k => !config[k]);
  
  if (errors.length > 0) {
    return { valid: false, error: `缺少必填欄位: ${errors.join(', ')}` };
  }
  
  if (!config.url.startsWith('http')) {
    return { valid: false, error: '無效的 Qdrant URL' };
  }
  
  return { valid: true };
}
```

## 5. 加密工具

### lib/encryption.ts

```typescript
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-secure-key';

export function encryptConfig(config: any, type: string): string {
  const json = JSON.stringify(config);
  const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
  let encrypted = cipher.update(json, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

export function decryptConfig(encrypted: string): any {
  const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}
```

## 6. 環境設定

### .env.local

```bash
# 資料庫加密
ENCRYPTION_KEY=your-very-secure-encryption-key-32-chars

# AWS 設定 (DynamoDB)
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx

# 預設測試資料庫 (開發用)
TEST_MONGODB_URI=mongodb://localhost:27017
TEST_POSTGRES_URL=postgres://user:password@localhost:5432/test
TEST_MYSQL_URL=mysql://user:password@localhost:3306/test
TEST_REDIS_URL=redis://localhost:6379
TEST_QDRANT_URL=http://localhost:6333
```

## 7. 測試清單

- [ ] POST `/api/app-integrations` - 各資料庫類型
- [ ] 連線驗證 - 正確和錯誤情境
- [ ] 配置加密 - 驗證敏感資訊已加密
- [ ] 重複提交處理
- [ ] 錯誤訊息明確性
- [ ] 多用戶隔離

## 8. 部署檢查清單

- [ ] 環境變數配置完整
- [ ] 加密金鑰安全存儲
- [ ] 資料庫 schema 遷移完成
- [ ] 監控和日誌設定
- [ ] API 速率限制設定
- [ ] 安全性審計

---

**預計完成時間**: 3-5 個工作天  
**優先級**: HIGH  
**相依工作**: 前端改造已完成 ✅
