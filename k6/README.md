# k6/README.md
# JVTutorCorner — k6 效能測試套件

## 安裝 k6

```powershell
# Windows (winget)
winget install k6 --source winget

# Windows (Chocolatey)
choco install k6

# Windows (MSI 安裝包)
# https://dl.k6.io/msi/k6-latest-amd64.msi
```

驗證安裝：
```powershell
k6 version
```

---

## 測試套件結構

```
k6/
├── config.js              # 共用設定（URL、帳號、Thresholds）
├── run.ps1                # PowerShell 執行器
├── helpers/
│   ├── auth.js            # 登入/登出/Session helper
│   └── hmac.js            # HMAC 簽名 helper
├── tests/
│   ├── 01_auth_flow.test.js     # 登入/Session/登出流程
│   ├── 02_hmac_auth.test.js     # HMAC 服務間認證
│   ├── 03_points_api.test.js    # 點數 API + 讀寫分離場景
│   ├── 04_courses_api.test.js   # 課程瀏覽 100 VU 高峰
│   ├── 05_stress_test.test.js   # 壓力/突刺/浸泡測試
│   ├── 06_enroll_flow.test.js   # 學生報名完整流程
│   └── 07_smoke_test.test.js    # 部署後冒煙驗證
└── reports/               # 測試結果 JSON（自動產生）
```

---

## 快速執行

### 使用 PowerShell Runner（推薦）

```powershell
# 冒煙測試（部署後快速驗證）
.\k6\run.ps1 smoke

# 指定測試目標
.\k6\run.ps1 -Test auth -BaseUrl http://localhost:3000

# 壓力測試
.\k6\run.ps1 stress

# 突刺測試
.\k6\run.ps1 spike

# 浸泡測試（2小時）
.\k6\run.ps1 soak

# 執行全部（非壓力）
.\k6\run.ps1 all
```

### 直接執行 k6

```powershell
# 基本執行
k6 run k6/tests/07_smoke_test.test.js

# 指定 BASE_URL
k6 run -e BASE_URL=http://www.jvtutorcorner.com k6/tests/01_auth_flow.test.js

# 產生 HTML 報表（需安裝 handlersummary）
k6 run --out json=k6/reports/result.json k6/tests/07_smoke_test.test.js
```

---

## 測試案例清單

| ID | 測試檔案 | 描述 |
|----|---------|------|
| TC-AUTH-001 | 01_auth_flow | 有效憑證登入 |
| TC-AUTH-002 | 01_auth_flow | Session 驗證 `/api/auth/me` |
| TC-AUTH-003 | 01_auth_flow | Session 用於後續 API |
| TC-AUTH-004 | 01_auth_flow | 登出 + Session 失效確認 |
| TC-AUTH-005 | 01_auth_flow | 錯誤密碼應回 401 |
| TC-AUTH-006 | 01_auth_flow | 未登入存取受保護 API → 401 |
| TC-HMAC-001 | 02_hmac_auth | 正確 HMAC 簽名 GET |
| TC-HMAC-002 | 02_hmac_auth | 正確 HMAC 簽名 POST |
| TC-HMAC-003 | 02_hmac_auth | 無效簽名應被拒絕 |
| TC-HMAC-004 | 02_hmac_auth | 過期時間戳（重放攻擊）|
| TC-HMAC-005 | 02_hmac_auth | 缺少 headers 應回 401 |
| TC-POINTS-001 | 03_points_api | 查詢自己的點數 |
| TC-POINTS-002 | 03_points_api | 查詢他人點數應回 403 |
| TC-POINTS-003 | 03_points_api | HMAC 服務查詢點數 |
| TC-POINTS-004 | 03_points_api | POST 點數（HMAC） |
| TC-POINTS-005 | 03_points_api | 缺少 userId → 400 |
| TC-COURSES-001 | 04_courses_api | 公開課程列表 |
| TC-COURSES-002 | 04_courses_api | 課程詳細資訊 |
| TC-COURSES-003 | 04_courses_api | 不存在的課程 → 404 |
| TC-COURSES-004 | 04_courses_api | 篩選老師課程 |
| TC-COURSES-005 | 04_courses_api | 並行請求穩定性 |
| TC-ENROLL-001 | 06_enroll_flow | 報名前查課程 |
| TC-ENROLL-002 | 06_enroll_flow | 報名前查點數 |
| TC-ENROLL-003 | 06_enroll_flow | 提交報名 |
| TC-ENROLL-004 | 06_enroll_flow | 缺少欄位 → 400 |
| TC-ENROLL-005 | 06_enroll_flow | 查詢報名清單 |
| SMOKE-01~08  | 07_smoke_test | 全套冒煙驗證 |

---

## 效能基準（Thresholds）

| 指標 | 目標值 |
|------|--------|
| p(95) 回應時間 | < 500ms |
| p(99) 回應時間 | < 1000ms |
| 登入 p(95) | < 600ms |
| 點數查詢 p(95) | < 300ms |
| 錯誤率 | < 1% |
| Session 有效率 | > 95% |

---

## 環境變數

| 變數 | 說明 | 預設 |
|------|------|------|
| `BASE_URL` | 目標主機 | `http://localhost:3000` |
| `API_HMAC_SECRET` | HMAC 簽名密鑰 | dev secret |
| `STUDENT_EMAIL` | 學生測試帳號 | `pro@test.com` |
| `STUDENT_PASSWORD` | 學生密碼 | `123456` |
| `CAPTCHA_BYPASS` | 驗證碼繞過 | `jv_secret_bypass_2024` |
| `SCENARIO` | 壓力場景選擇 | `stress` |
