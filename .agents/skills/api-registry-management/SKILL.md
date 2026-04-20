# API Registry Management Skill

負責管理與維護專案內所有 API 的紀錄與自動化偵查。確保所有新增、刪除或修改的 API 都能即時更新至 `docs/api_registry.md`，並提供 introspection 功能供其他功能（如效能測試）參考。

## 核心功能
1. **API Introspection**: 自動掃描 Next.js (`app/api`) 與 FastAPI (`main.py`) 的路由定義。
2. **Registry Documentation**: 維持 `docs/api_registry.md` 的更新，作為專案的單一事實來源 (Single Source of Truth)。
3. **Change Tracking**: 在修改程式碼後，必須執行更新腳本以確保紀錄同步。

## 關鍵檔案
- **腳本**: `scripts/inspect_apis.mjs` - 執行 `node scripts/inspect_apis.mjs` 來重新掃描專案。
- **紀錄檔**: `docs/api_registry.md` - 所有 API 的清單、方法與原始碼連結。

## 使用流程

### 1. 新增、刪除或修改 API 時
當你修改了 `app/api/**/route.ts` 或 `main.py` 中的端點時，必須更新 Registry：
1. 執行偵查腳本：
   ```bash
   node scripts/inspect_apis.mjs
   ```
2. 檢查 `docs/api_registry.md` 的變化，確保正確記錄。

### 2. 開發效能測試腳本時
在修改 `api-performance-testing` 的腳本時：
1. 先查看 `docs/api_registry.md` 確定目前的 API 清單。
2. 根據 Registry 中的 Path 與 Method 更新 k6 測試腳本。
3. 若 Registry 中有新增的 API 而測試腳本尚未涵蓋，應主動補齊。

## Introspection 邏輯說明
- **Next.js (App Router)**:
  - 掃描 `app/api/` 目錄下的所有 `route.ts` 或 `route.js`。
  - 識別 `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS` 的具名導出 (Named Exports)。
- **FastAPI**:
  - 掃描 `main.py`。
  - 識別 `@app.get`, `@app.post` 等裝飾器定義的路由。

## 規則與限制
- **不可手動編輯**: `docs/api_registry.md` 應該透過 `scripts/inspect_apis.mjs` 產生，除非是為了補件說明。
- **原始碼連結**: 產生的 Markdown 應包含 `file:///` 協定的連結，方便在 IDE 中直接跳轉至實作頁面。
- **頻率**: 每次涉及 API 結構變更的對談 (Task) 結束前，都應執行一次更新。
