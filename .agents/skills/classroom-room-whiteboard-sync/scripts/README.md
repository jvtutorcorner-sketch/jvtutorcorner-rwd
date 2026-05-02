# 正式環境壓力測試方案總結

## 📚 完整文檔

詳細的使用指南和故障排查，請參考主文檔：

📖 **[PRODUCTION_STRESS_TEST_GUIDE.md](./PRODUCTION_STRESS_TEST_GUIDE.md)**

---

## 🚀 快速開始

### 方案 1️⃣：使用 npm 腳本（推薦 - 最簡單）

```bash
# 基礎壓力測試（3 組並發）
npm run test:production:stress

# 詳細模式
npm run test:production:stress:verbose
```

### 方案 2️⃣：使用 Node.js 腳本

```bash
# 基礎執行
node .agents/skills/classroom-room-whiteboard-sync/scripts/production_stress_test.js

# 自訂配置（5 組，執行 2 次）
STRESS_RUNS=2 STRESS_GROUP_COUNT=5 \
  node .agents/skills/classroom-room-whiteboard-sync/scripts/production_stress_test.js
```

### 方案 3️⃣：使用 PowerShell 腳本（Windows 推薦）

```powershell
# 基礎執行
.\scripts\production_stress_test.ps1 -TestType e2e

# 5 組並發
.\scripts\production_stress_test.ps1 -TestType e2e -GroupCount 5

# k6 負載測試（需要安裝 k6）
.\scripts\production_stress_test.ps1 -TestType load -VirtualUsers 50

# 詳細模式
.\scripts\production_stress_test.ps1 -TestType e2e -Verbose
```

### 方案 4️⃣：使用 k6 真正的負載測試（進階）

```bash
# 基礎負載測試
npm run test:production:load

# 壓力測試
npm run test:production:load:stress

# Spike 測試
npm run test:production:load:spike

# 自訂配置
k6 run -e BASE_URL=https://www.jvtutorcorner.com \
  -e TEST_TYPE=stress -e VUSER=100 \
  .agents/skills/classroom-room-whiteboard-sync/scripts/production_load_test.js
```

---

## 📊 方案對比

| 方案 | 命令 | 優點 | 缺點 | 推薦 |
|------|------|------|------|------|
| **npm 腳本** | `npm run test:production:stress` | 最簡單，一行命令 | 功能有限 | ✅ 首選 |
| **Node.js** | `node scripts/production_stress_test.js` | 靈活配置，支持迴圈 | 需要更多參數 | ✅ 二選 |
| **PowerShell** | `.\scripts\production_stress_test.ps1` | Windows 友善，交互式 | 僅限 Windows | ✅ Windows |
| **k6** | `k6 run production_load_test.js` | 真正負載測試，詳細指標 | 需要安裝 k6 | ⭐ 進階 |

---

## 🎯 快速參考

### 預設配置

```
Base URL:                  https://www.jvtutorcorner.com
並發組數 (E2E):            3
虛擬用戶 (k6):             10
測試時長:                  3-5 分鐘
```

### 測試帳戶

```
教師帳號:  lin@test.com / <YOUR_PASSWORD>
學生帳號:  pro@test.com / <YOUR_PASSWORD>
Bypass:    <YOUR_BYPASS_SECRET>
```

---

## ✅ 成功標誌

### E2E 測試應輸出：

```
✅ [stress] Group 0: Teacher & Student entered classroom
✅ [stress] Group 1: Teacher & Student entered classroom
✅ [stress] Group 2: Teacher & Student entered classroom
✅ All stress test groups completed successfully
```

### k6 測試應輸出：

```
✓ http_req_duration............: avg=450ms
✓ http_req_failed..............: 5.00%
✓ checks.......................: 95.00%
```

---

## 📁 目錄結構

```
.agents/skills/classroom-room-whiteboard-sync/
├── SKILL.md                              # 主 Skill 文檔
├── PRODUCTION_STRESS_TEST_GUIDE.md       # 詳細使用指南
├── README.md                             # 本文件
└── scripts/
    ├── production_stress_test.js         # Node.js 腳本
    ├── production_stress_test.ps1        # PowerShell 腳本
    └── production_load_test.js           # k6 負載測試腳本

.env.production                           # 正式環境配置
package.json                              # npm 腳本
```

---

## 🔧 環境準備

### 必需

- Node.js 18+
- Playwright 已安裝

### 可選

- k6（用於負載測試）
  ```bash
  # Windows (Chocolatey)
  choco install k6
  
  # macOS
  brew install k6
  ```

---

## 📋 常見命令速查

| 需求 | 命令 | 時間 |
|------|------|------|
| 快速驗證 | `npm run test:production:stress` | 3-5 分 |
| 高負載測試 | `STRESS_GROUP_COUNT=10 npm run test:production:stress` | 5-10 分 |
| 負載測試詳情 | `npm run test:production:load` | 2-3 分 |
| 極限壓力測試 | `npm run test:production:load:stress` | 5-8 分 |
| Spike 流量模擬 | `npm run test:production:load:spike` | 1-2 分 |

---

## ⚠️ 注意事項

1. **時間選擇**：在非業務高峰期進行測試
2. **用戶通知**：通知相關人員
3. **測試帳戶**：確保使用 QA 帳戶
4. **網絡環境**：確保穩定的網絡連接
5. **監控告警**：檢查是否觸發異常流量告警

---

## 🆘 問題排查

### 連接失敗

```bash
# 驗證網絡
ping www.jvtutorcorner.com
curl https://www.jvtutorcorner.com
```

### 登入失敗

```bash
# 驗證認證信息
cat .env.production | grep QA_
```

### 超時失敗

```bash
# 降低並發組數
STRESS_GROUP_COUNT=2 npm run test:production:stress
```

### Playwright 失敗

```bash
# 重新安裝瀏覽器
npx playwright install chromium
```

### k6 命令未找到

```bash
# 驗證 k6 安裝
k6 version

# 如未安裝，參考環境準備部分
```

---

## 📊 性能基準線

### Playwright E2E

| 並發 | 通過率 | 時間 |
|------|--------|------|
| 3 組 | 90%+ | 3-5 分 |
| 5 組 | 85%+ | 5-8 分 |
| 10 組 | 70%+ | 10-15 分 |

### k6 負載測試

| 用戶 | P95 延遲 | 成功率 |
|------|---------|--------|
| 10 | < 800ms | 98%+ |
| 50 | < 1200ms | 95%+ |
| 100 | < 2000ms | 90%+ |

---

## 📞 更多信息

- 🎓 [完整測試指南](./PRODUCTION_STRESS_TEST_GUIDE.md)
- 📖 [Skill 文檔](./SKILL.md)
- 🔐 [自動登入指南](../../auto-login/SKILL.md)
- 🧪 [測試最佳實踐](../../../e2e/README.md)

---

## 🎉 成功案例

```bash
# 典型的成功執行

$ npm run test:production:stress

✅ Using production URL: https://www.jvtutorcorner.com
ℹ️  Concurrent Groups: 3
ℹ️  Group Setup Delay: 2000ms

📊 Running Test 1/1

✅ [stress] Group 0: Teacher & Student entered classroom
   - Canvas Check: true
   - Drawing Sync: true

✅ [stress] Group 1: Teacher & Student entered classroom
   - Canvas Check: true
   - Drawing Sync: true

✅ [stress] Group 2: Teacher & Student entered classroom
   - Canvas Check: true
   - Drawing Sync: true

✅ All tests completed successfully!
```

---

**最後更新**: 2026-04-25  
**維護者**: DevOps Team
