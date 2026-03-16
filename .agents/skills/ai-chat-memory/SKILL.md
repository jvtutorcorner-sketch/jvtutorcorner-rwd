---
name: ai-chat-memory
description: 負責驗證與管理 LanceDB 向量對話記憶 (Vector Memory)。當需要檢查 AI 是否能正確讀取歷史對話背景、或者 LanceDB 連線與檢索是否正常時使用。
---

# LanceDB 向量對話記憶技能

此技能用於驗證與管理專案中的 LanceDB 向量資料庫，主要應用於 `ai-chat` 的歷史對話記憶功能。

## 核心功能
1. **向量儲存**: 將對話內容轉換為向量並儲存於 LanceDB。
2. **語義檢索**: 根據使用者的最新輸入，在 LanceDB 中檢索最相關的歷史對話。
3. **連線管理**: 使用 Singleton 模式管理資料庫連線。

## 驗證步驟

### 1. 環境變數檢查
驗證 LanceDB 功能前，必須確保 `.env.local` 包含以下變數（用於產生 Embedding）：
- `GEMINI_API_KEY`: 用於呼叫 Google Gemini Embedding API。

### 2. 資料庫檔案檢查
確認專案根目錄下的 `data/lancedb` 資料夾是否存在及其內容：
```powershell
ls data/lancedb
```

### 3. 自動化測試腳本
執行預設的測試腳本以驗證 Embedding 產生、資料儲存與向量檢索：
```powershell
npx ts-node scripts/test-lancedb.ts
```

**預期結果**:
- `Phase 1`: 成功產生維度為 768 (或對應模型) 的 Embedding。
- `Phase 2`: 成功將測試資料寫入 `test_memories_v1` 表。
- `Phase 3`: 檢索結果應包含與 "English lessons" 相關的內容，且分數 (Score) 越小代表越相關。
- `Phase 4`: 成功列出資料庫中的所有原始資料表。

## 常見問題與排除
- **Embedding 失敗**: 檢查 `GEMINI_API_KEY` 是否有效或配額是否用盡。
- **連線失敗**: 確認 `data/lancedb` 沒有被其他進程鎖定。
- **檢索結果不相關**: 檢查 `lib/embeddings.ts` 中的模型設定是否一致。
