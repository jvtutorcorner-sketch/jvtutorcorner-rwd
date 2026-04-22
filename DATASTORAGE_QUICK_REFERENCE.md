# 資料庫與知識庫配置快速參考

## 前後對比

### 改造前 ❌
- ✗ 只支援 DynamoDB
- ✗ 沒有知識庫功能
- ✗ 單一表單風格

### 改造後 ✅
- ✓ 支援 5 種資料庫 (DynamoDB、MongoDB、PostgreSQL、MySQL、Redis)
- ✓ 整合 Qdrant 向量知識庫
- ✓ Tab 式分頁 UI，清晰易用

---

## 使用流程

### 步驟 1: 選擇配置類型
在 `/add-app?type=database` 進入頁面後，選擇兩個 tab 之一：
- 🗄️ **資料庫設定** - 用於結構化資料存儲
- 🧠 **知識庫設定** - 用於向量搜索和語義匹配

### 步驟 2: 填寫必要資訊

#### 資料庫設定
| 資料庫 | 主要欄位 | 優勢 |
|--------|---------|------|
| **DynamoDB** | Table、Keys、Region | AWS 託管、自動擴展、無伺服器 |
| **MongoDB** | URI、DB、Collection | 靈活的文件結構、開發快速 |
| **PostgreSQL** | Host、Port、User、Pwd、DB、Table | 強大、開源、功能豐富 |
| **MySQL** | Host、Port、User、Pwd、DB、Table | 穩定、輕量、應用廣泛 |
| **Redis** | Host、Port、Pwd、DB# | 超快速、快取最佳化、實時數據 |

#### 知識庫設定 (Qdrant)
| 配置項 | 說明 |
|--------|------|
| **URL** | Qdrant 伺服器位址 (本地/Cloud) |
| **API Key** | 身份驗證金鑰 |
| **Collection** | 向量集合名稱 |
| **Embedding Model** | 文字向量化模型 (預設: OpenAI text-embedding-3-small) |

### 步驟 3: 儲存配置
點擊提交按鈕，系統自動將配置儲存至資料庫。

---

## 資料庫連線範例

### DynamoDB
```
資料表: jvtutorcorner-courses
主鍵: courseId
排序鍵: createdAt
區域: ap-southeast-1
```

### MongoDB
```
URI: mongodb+srv://user:pass@cluster.mongodb.net
資料庫: jvtutorcorner
集合: courses
```

### PostgreSQL
```
主機: db.example.com
埠: 5432
使用者: postgres
資料庫: jvtutorcorner
表: courses
```

### Redis
```
主機: cache.example.com
埠: 6379
DB: 0
```

### Qdrant
```
URL: https://qdrant.example.com
集合: knowledge-base
嵌入模型: text-embedding-3-small (維度: 1536)
```

---

## 常見問題 (FAQ)

### Q: 可以同時配置資料庫和知識庫嗎？
**A:** 可以，分別在兩個不同的 tab 中設定兩個配置。每次提交只會新增一個。

### Q: 知識庫用什麼語言儲存向量？
**A:** 支援多種嵌入模型，預設使用 OpenAI text-embedding-3-small (1536維)。

### Q: DynamoDB 是否支援複合主鍵？
**A:** 支援，可配置 Partition Key (主鍵) 和 Sort Key (排序鍵)。

### Q: 如果要切換資料庫怎麼辦？
**A:** 新增一個新的資料庫配置即可，系統會保留舊的配置，可在後台管理頁面切換。

### Q: Qdrant 本地開發怎麼設定？
**A:** 
```
URL: http://localhost:6333
(使用 Docker: docker run -p 6333:6333 qdrant/qdrant)
```

---

## API 負載範例

### 保存 MongoDB 配置
```json
{
  "type": "MONGODB",
  "name": "課程知識庫",
  "config": {
    "uri": "mongodb+srv://user:pass@cluster.mongodb.net",
    "database": "jvtutorcorner",
    "collection": "courses"
  }
}
```

### 保存 Qdrant 知識庫
```json
{
  "type": "QDRANT",
  "name": "語義知識庫",
  "config": {
    "url": "https://qdrant.example.com",
    "apiKey": "your-api-key",
    "collectionName": "knowledge-base",
    "embeddingModel": "text-embedding-3-small"
  }
}
```

---

## 隱藏功能 (待開放)

- [ ] 連線測試區塊（測試資料庫可連線性）
- [ ] 配置預覽面板
- [ ] 多配置管理頁面
- [ ] AI 語義搜索整合
- [ ] 資料遷移工具

---

## 技術棧

| 組件 | 技術 |
|------|------|
| **前端框架** | Next.js + React |
| **UI 組件** | Tailwind CSS |
| **表單驗證** | React hooks |
| **後端 API** | `/api/app-integrations` |
| **資料庫** | 動態支援 5 種 |
| **向量庫** | Qdrant |

---

## 關鍵改動檔案

- ✅ [app/add-app/page.tsx](app/add-app/page.tsx) - 前端表單 (已完成)
- ⏳ `api/app-integrations/route.ts` - API 端點 (待完成)
- ⏳ `lib/database-connectors/` - 資料庫驅動 (待完成)

---

## 下一步行動

1. **後端開發** - 實作各資料庫類型的連線和驗證
2. **測試** - 完整的端到端測試
3. **文件** - API 文件和部署指南
4. **監控** - 新增連線健康檢查和日誌
