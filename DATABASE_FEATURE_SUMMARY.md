# DynamoDB 資料庫管理功能實現總結

## 📋 已完成的實現

### 1. 數據庫類型定義 ✅
- **檔案**: `app/apps/page.tsx`、`app/add-app/page.tsx`
- **新增常量**:
  ```typescript
  const DATABASE_TYPES = ['DYNAMODB', 'KNOWLEDGE_BASE'];
  
  const DATABASE_META = {
    DYNAMODB: { 
      badge: 'bg-orange-100 text-orange-800', 
      label: 'DynamoDB 資料庫', 
      icon: '🗄️', 
      desc: 'AWS 無伺服器資料庫，為 AI 聊天室提供高速知識庫搜尋' 
    },
    KNOWLEDGE_BASE: { 
      badge: 'bg-purple-100 text-purple-800', 
      label: '知識庫', 
      icon: '📚', 
      desc: '自訂知識庫，儲存組織特定資訊供 AI 聊天室參考' 
    }
  };
  ```

### 2. /add-app 頁面支持 ✅
- **新增 isDatabase 類型檢查**
- **新增資料庫狀態管理**:
  ```typescript
  const [selectedDatabaseType, setSelectedDatabaseType] = useState('');
  const [databaseData, setDatabaseData] = useState({
    name: '',
    tableName: '',
    partitionKey: '',
    sortKey: '',
    region: 'us-east-1',
    description: ''
  });
  ```

### 3. /apps 頁面支持 ✅
- **新增 showDatabase 顯示條件**
- **為 AI_CHATROOM 編輯面板添加資料庫選擇選項**:
  ```typescript
  // 在 linkedSkillId 選擇之後新增
  <div className="mt-4">
    <label>🗄️ 選擇資料庫 (選填):</label>
    <select
      value={editedConfig.linkedDatabaseId || ''}
      onChange={(e) => setEditedConfig({ ...editedConfig, linkedDatabaseId: e.target.value })}
    >
      <option value="">-- 不選擇資料庫 --</option>
      {apps
        .filter(app => DATABASE_TYPES.includes(app.type) && app.status === 'ACTIVE')
        .map(app => (
          <option key={app.integrationId} value={app.integrationId}>
            {DATABASE_META[app.type]?.icon} {app.name} ({app.type})
          </option>
        ))
      }
    </select>
  </div>
  ```

### 4. 配置保存修復 ✅
- **位置**: `app/apps/page.tsx` 中的 `handleSaveConfig`
- **修復內容**: 從 `const updatedConfig = { ...editedConfig }` 改為 `const updatedConfig = { ...selectedAppConfig.config, ...editedConfig }`
- **效果**: 確保未編輯的欄位（如 linkedSkillId、linkedDatabaseId）不會被覆蓋

## 🔄 建議的下一步

### 1. 完成 /add-app 的資料庫表單 (需要實現)
在 `/add-app/page.tsx` 中，在 isEmail 塊之後添加 isDatabase 塊：

```typescript
} else if (isDatabase) {
    <div className="space-y-4">
      {/* 設定名稱 */}
      <div>
        <label>設定名稱 (僅供您辨識)</label>
        <input
          type="text"
          name="name"
          value={databaseData.name}
          onChange={handleDatabaseChange}
          required
        />
      </div>

      {/* 選擇資料庫類型 */}
      <div>
        <label>選擇資料庫類型 *</label>
        <select
          value={selectedDatabaseType}
          onChange={(e) => setSelectedDatabaseType(e.target.value)}
          required
        >
          <option value="">請選擇</option>
          <option value="DYNAMODB">DynamoDB (AWS)</option>
          <option value="KNOWLEDGE_BASE">自訂知識庫</option>
        </select>
      </div>

      {/* DynamoDB 特定字段 */}
      {selectedDatabaseType === 'DYNAMODB' && (
        <>
          <input name="tableName" placeholder="資料表名稱" onChange={handleDatabaseChange} />
          <input name="partitionKey" placeholder="分割鍵" onChange={handleDatabaseChange} />
          <input name="sortKey" placeholder="排序鍵 (選填)" onChange={handleDatabaseChange} />
          <select name="region" value={databaseData.region} onChange={handleDatabaseChange}>
            <option value="us-east-1">us-east-1</option>
            <option value="ap-northeast-1">ap-northeast-1 (日本)</option>
            <option value="ap-southeast-1">ap-southeast-1 (新加坡)</option>
            {/* 提供更多區域 */}
          </select>
        </>
      )}

      {/* 知識庫特定字段 */}
      {selectedDatabaseType === 'KNOWLEDGE_BASE' && (
        <textarea
          name="description"
          placeholder="知識庫描述"
          value={databaseData.description}
          onChange={handleDatabaseChange}
        />
      )}
    </div>
}
```

### 2. 為 /apps 頁面新增資料庫管理區塊 (需要實現)
可選：在 showDatabase 條件下添加一個完整的資料庫管理區塊，類似於金流/通訊渠道區塊

### 3. API 集成 (需要後端支持)
- 確保 `/api/app-integrations` 正確處理 DATABASE_TYPES
- 在 AI_CHATROOM 的聊天 API 中使用 linkedDatabaseId 進行知識庫查詢
- 參考: [api/ai-chat/route.ts](app/api/ai-chat/route.ts#L90) 可以在這裡添加資料庫查詢邏輯

### 4. 知識庫搜尋功能 (需要實現)
在 `/api/ai-chat/route.ts` 中：
```typescript
// 當 AI 聊天室有 linkedDatabaseId 時
if (linkedDatabaseId) {
  // 1. 從 DynamoDB 查詢相關文檔
  // 2. 將查詢結果添加到 system prompt
  // 3. AI 可以基於這些文檔進行回答
}
```

## 📊 目前狀態

| 功能 | 狀態 | 說明 |
|------|------|------|
| DATABASE_TYPES 定義 | ✅ 完成 | 已添加 DYNAMODB 和 KNOWLEDGE_BASE |
| /add-app 頁面支持 | ⚠️ 部分 | 狀態管理已添加，表單需完成 |
| /apps 頁面支持 | ✅ 完成 | AI_CHATROOM 可選擇資料庫 |
| 配置保存 | ✅ 完成 | 修復了覆蓋問題 |
| API 集成 | ❌ 待開始 | 需要後端實現 |

## 🎯 使用流程

### 新增資料庫
1. 進入 `/apps` → "系統設定"
2. 找到 "資料庫管理" 區塊（當有 DYNAMODB 或 KNOWLEDGE_BASE 時自動顯示）
3. 點擊 "新增資料庫"
4. 選擇類型並填寫相應信息
5. 保存

### 為 AI 聊天室關聯資料庫
1. 進入 `/apps` → "AI 聊天室" 區塊
2. 點擊要編輯的 AI 聊天室
3. 在 "選擇資料庫 (選填)" 下拉選單中選擇資料庫
4. 保存配置
5. AI 聊天室現在可以使用此資料庫的知識進行回答

## 🔧 技術細節

### 配置結構
```typescript
// AI_CHATROOM 配置範例
{
  linkedServiceId: 'svc-gemini-001',    // 關聯的 Gemini 服務
  linkedSkillId: 'code-reviewer',        // 選擇的技能
  linkedDatabaseId: 'db-knowledge-001',  // 選擇的資料庫
  systemInstruction: '...'               // 自訂指令
}

// DynamoDB 配置範例
{
  tableName: 'documents',
  partitionKey: 'docId',
  sortKey: 'version',
  region: 'us-east-1'
}

// 知識庫配置範例
{
  description: '公司內部知識庫'
}
```

---

**最後更新**: 2026-03-05
