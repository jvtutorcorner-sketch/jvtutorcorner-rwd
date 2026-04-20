---
name: api-performance-testing
description: 使用 k6 進行 API 效能測試與壓力測試。支援 Session 與 HMAC 認證，可用於驗證系統容量、反應時間與穩定性。
---

# API Performance Testing Skill

此 Skill 負責使用 **k6** 工具對 JVTutorCorner 的 API 進行各種層面的效能測試，包含冒煙測試 (Smoke)、負載測試 (Load)、壓力測試 (Stress) 與突刺測試 (Spike)。

## 1. 核心組成

測試腳本位於專案根目錄的 `k6/` 資料夾：

- **`k6/config.js`**: 全域配置（URL、效能閾值，並引用 `test_data.js` 中的帳號）。
- **`k6/test_data.js`**: 測試資料中心，包含帳號、常用 Payload、SharedArray 大數據範例。
- **`k6/helpers/`**: 通用的認證工具（Session 登入、HMAC 簽名）。
- **`k6/tests/`**: 具體的測試案例（Auth, Points, Courses, Enroll 等）。
- **`k6/run.ps1`**: PowerShell 執行器，自動注入環境變數並執行測試。
- **`docs/api_registry.md`**: (參考來源) 所有可用 API 的清單與原始碼連結。
- **`scripts/inspect_apis.mjs`**: (工具) 用於偵查並更新 API 紀錄的腳本。

## 2. 測試案例索引

| ID | 測試腳本 | 目的 |
|----|---------|------|
| **TC-PERF-SMOKE** | `07_smoke_test.test.js` | 快速驗證所有核心 API 是否通暢（1 VU, 30s）。 |
| **TC-PERF-AUTH** | `01_auth_flow.test.js` | 測試登入/登出與 Session 驗證的併發穩定性。 |
| **TC-PERF-HMAC** | `02_hmac_auth.test.js` | 驗證 HMAC 簽名認證機制與防重放攻擊。 |
| **TC-PERF-POINTS** | `03_points_api.test.js` | 模擬點數查詢與交易的高低峰混合流量。 |
| **TC-PERF-COURSES** | `04_courses_api.test.js` | 模擬 100+ VU 同時瀏覽課程的場景。 |
| **TC-PERF-STRESS** | `05_stress_test.test.js` | 尋找系統臨界點（Stress/Spike/Soak 場景）。 |
| **TC-PERF-ENROLL** | `06_enroll_flow.test.js` | 測試學生從瀏覽到報名的完整業務流程。 |

## 3. 使用方法

### 前置要求
必須安裝 k6：
```powershell
winget install k6 --source winget
```

### 執行測試
推薦使用 `k6/run.ps1` 執行器，它會處理所有必要的認證環境變數。

// turbo
```powershell
# 1. 冒煙測試（部署後的健康檢查）
.\k6\run.ps1 smoke

# 2. 執行全部核心測試
.\k6\run.ps1 all

# 3. 壓力測試（逐步增加負載直到系統崩潰）
.\k6\run.ps1 stress

# 4. 突刺測試（模擬瞬間流量爆發）
.\k6\run.ps1 spike

# 5. 指定自定義目標
.\k6\run.ps1 -Test points -BaseUrl http://localhost:3000
```

## 4. 效能基準與閾值 (Thresholds)

每個測試都定義了效能標準，若不達標會回傳失敗：
- **回應時間 (p95)**: 必須 < 500ms（一般 API）。
- **回應時間 (p99)**: 必須 < 1000ms。
- **錯誤率 (http_req_failed)**: 必須 < 1%。
- **Session 有效性**: > 95% 的請求必須通過 Auth 驗證。

## 5. 開發建議

1. **認證**: 優先使用 `k6/helpers/auth.js` 進行登入取得 Session。
2. **服務間調用**: 若測試 Cron 或 Internal API，請使用 `k6/helpers/hmac.js` 產生簽署 Headers。
3. **資料清理**: 若測試會產生大量報名或訂單資料，請在測試結束後（Teardown）或利用清理腳本移除測試數據。
4. **環境變數**: 避免在腳本中寫死 Secrets，應透過 `run.ps1` 傳入。
5. **資料管理**: 所有的靜態測試資料（如選單選項、搜尋詞）與範例 Payload 應統一放在 `k6/test_data.js`，方便重複使用與統一修改。
6. **大數據測試**: 若需測試大量不同 ID，請利用 `test_data.js` 內的 `SharedArray` 模式，避免每個 VU 都重複載入相同的資料導致記憶體過高。
7. **API 同步 (重要)**: 在開發或修改 API 測試腳本前，應先執行 `node scripts/inspect_apis.mjs` 更新 **API Registry** (`docs/api_registry.md`)。
8. **覆蓋率檢查**: 確保 `07_smoke_test.test.js` 至少涵蓋 Registry 中標記為核心功能的 API。若發現 Registry 中有新增的 API 但測試腳本未定義，應主動新增測試案例。
