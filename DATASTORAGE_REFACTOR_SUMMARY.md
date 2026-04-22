# 資料庫與知識庫整合改造總結

## 改造完成內容

### 1. **前端頁面改造** ✅
位置: `/app/add-app/page.tsx`

#### 新增狀態與功能：
- **`dataStorageActiveTab`**: 選擇資料庫或知識庫配置的 tab
- **`selectedDatabaseType`**: 支援 5 種資料庫類型
- **`selectedKnowledgeBaseType`**: 知識庫類型配置

#### 支援的資料庫類型（5 種）：
1. **DynamoDB** 🗄️
   - AWS 無伺服器資料庫
   - 配置：Table Name、Partition Key、Sort Key、Region

2. **MongoDB** 🍃
   - NoSQL 文件型資料庫
   - 配置：URI、Database、Collection

3. **PostgreSQL** 🐘
   - SQL 關聯式資料庫
   - 配置：Host、Port、User、Password、Database、Table

4. **MySQL** 🐬
   - SQL 關聯式資料庫
   - 配置：Host、Port、User、Password、Database、Table

5. **Redis** ⚡
   - 高效能快取存儲
   - 配置：Host、Port、Password、DB Number

#### 支援的知識庫類型（1 種）：
1. **Qdrant** 🧠
   - 開源向量資料庫
   - 配置：URL、API Key、Collection Name、Embedding Model
   - 嵌入模型選項：
     - OpenAI text-embedding-3-small（推薦）
     - OpenAI text-embedding-3-large
     - OpenAI text-embedding-ada-002
     - Mistral Embed
     - Sentence Transformers all-MiniLM-L6-v2

### 2. **UI/UX 改進**
- **Tab 式介面**：清晰區分資料庫和知識庫配置
- **視覺化設計**：每種資料庫有不同的色彩編碼
  - DynamoDB: 橙色
  - MongoDB: 綠色
  - PostgreSQL: 藍色
  - MySQL: 青色
  - Redis: 紅色
  - Qdrant: 紫色
- **詳細的欄位驗證説明**：每個欄位都有清晰的 placeholder 和説明文字

### 3. **後端資料結構**

#### Database 保存時的負載結構：

```typescript
// DynamoDB
{
  type: "DYNAMODB",
  name: "設定名稱",
  config: {
    tableName: string,
    partitionKey: string,
    sortKey?: string,
    region: string
  }
}

// MongoDB
{
  type: "MONGODB",
  name: "設定名稱",
  config: {
    uri: string,
    database: string,
    collection: string
  }
}

// PostgreSQL / MySQL
{
  type: "POSTGRESQL" | "MYSQL",
  name: "設定名稱",
  config: {
    host: string,
    port: string,
    user: string,
    password: string,
    database: string,
    table: string
  }
}

// Redis
{
  type: "REDIS",
  name: "設定名稱",
  config: {
    host: string,
    port: string,
    password?: string,
    db: string
  }
}

// Qdrant
{
  type: "QDRANT",
  name: "設定名稱",
  config: {
    url: string,
    apiKey: string,
    collectionName: string,
    embeddingModel: string
  }
}
```

## 後端需要完成的工作

### 1. **API 端點更新**
`POST /api/app-integrations`

需要更新以支援新的資料庫類型和 Qdrant 知識庫。

### 2. **資料庫存儲**
- 更新 `app_integrations` 表以存儲新的資料庫類型和配置
- 確保 `type` 欄位支援：`DYNAMODB`, `MONGODB`, `POSTGRESQL`, `MYSQL`, `REDIS`, `QDRANT`

### 3. **連線驗證邏輯**
為每種資料庫類型實作連線測試：

```typescript
export async function testDatabaseConnection(type: string, config: any): Promise<boolean> {
  switch (type) {
    case 'DYNAMODB':
      // 使用 AWS SDK 測試 DynamoDB 連線
      break;
    case 'MONGODB':
      // 使用 MongoDB driver 測試連線
      break;
    case 'POSTGRESQL':
      // 使用 pg driver 測試連線
      break;
    case 'MYSQL':
      // 使用 mysql2 driver 測試連線
      break;
    case 'REDIS':
      // 使用 redis driver 測試連線
      break;
    case 'QDRANT':
      // 使用 Qdrant SDK 測試連線
      break;
  }
}
```

### 4. **AI 查詢集成**
- 在 AI 聊天服務中整合上述資料來源
- 根據選擇的資料庫類型執行適當的查詢操作
- 對於 Qdrant，實作語義搜索功能

## 測試建議

### 前端測試：
1. ✅ 切換各 tab (資料庫/知識庫)
2. ✅ 切換各資料庫類型，確認欄位動態變化
3. ✅ 表單驗證（必填欄位、資料格式）
4. ✅ 完整表單提交流程

### 後端測試（待完成）：
1. 各資料庫連線測試
2. 配置儲存與檢索
3. AI 查詢整合測試
4. Qdrant 語義搜索功能測試

## 相關 API 端點

- `POST /api/app-integrations` - 新增資料庫/知識庫配置
- `GET /api/app-integrations` - 列出已設定的配置
- `PUT /api/app-integrations/:id` - 更新配置
- `DELETE /api/app-integrations/:id` - 刪除配置
- `POST /api/app-integrations/test` - 測試連線（建議）

## 檔案修改記錄

- `/app/add-app/page.tsx` - 前端表單改造完成 ✅
- 後端 API 路由 - 待完成 ⏳
- 資料庫 schema 遷移 - 待完成 ⏳
- AI 聯動邏輯 - 待完成 ⏳
