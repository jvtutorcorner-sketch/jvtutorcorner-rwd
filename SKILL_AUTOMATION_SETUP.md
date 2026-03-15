# Skill 狀態自動化建置指南

本指南說明如何使用新建立的自動化腳本和工作流來管理 Skill 驗證狀態。

---

## 📦 新建的文件清單

### 本地腳本 (`scripts/`)
```
scripts/
├── update-skill-status.js           # 核心更新工具
├── validate-skill-frontmatter.js    # Frontmatter 驗證工具
└── skill-status-reporter.js         # Playwright 自訂 Reporter
```

### GitHub Actions 工作流
```
.github/workflows/
└── verify-skills.yml                # CI/CD 自動驗證工作流
```

### npm Scripts (package.json)
```json
"skills:validate": "驗證所有 Skill frontmatter 格式"
"skills:update": "更新所有 Skill 狀態"
"test:verify-skills": "執行驗證測試並自動更新狀態"
"test:verify-skills:ci": "CI 環境下的驗證測試"
```

---

## 🚀 使用方式

### 方式 1: 手動驗證 (開發時期)

驗證所有 Skill 的 frontmatter 格式：
```bash
npm run skills:validate
```

**輸出示例**：
```
🔍 掃描 Skill 檔案...

✅ 掃描完成: 檢查了 9 個 Skill

============================================================
📋 驗證報告

✅ 通過驗證 (9):
   ✓ course-alignment
   ✓ auto-login
   ...

============================================================

✅ 所有 Skill 驗證通過
```

### 方式 2: 手動更新狀態

更新所有 Skill 的驗證狀態和追蹤文件：
```bash
npm run skills:update
```

**輸出示例**：
```
🔍 掃描 Skill 檔案...
✅ 找到 9 個 Skill

🔧 驗證 frontmatter 格式...
✅ 0 個 frontmatter 已修復

📊 統計並更新追蹤文件...
✅ 已更新: .agents/skills/SKILL_VERIFICATION_SUMMARY.md

============================================================
📋 更新報告

📈 統計結果：
   ✅ VERIFIED (驗證完成): 5
   ⚠️  PARTIAL (部分驗證): 0
   🔄 IN-PROGRESS (驗證中): 0
   ❌ UNVERIFIED (未驗證): 4

============================================================
✅ 所有 Skill 已同步更新
```

### 方式 3: 測試 + 自動更新 (推薦)

執行驗證測試，通過後自動更新 Skill 狀態：
```bash
npm run test:verify-skills
```

**流程**：
1. ✅ 執行所有 `verification` 相關的 Playwright 測試
2. ✅ 若測試全部通過，自動執行 `npm run skills:update`
3. ✅ 同步更新 `SKILL.md`、`SKILLS_VERIFICATION_STATUS.md`、`SKILL_VERIFICATION_SUMMARY.md`

---

## 🔄 自動化工作流

### GitHub Actions - 自動驗證

在以下情況自動觸發：

| 觸發條件 | 說明 |
|--------|------|
| `push` 到 `main` / `develop` | 提交代碼到主分支 |
| `.agents/skills/**/*.md` 變動 | Skill 檔案修改 |
| `e2e/**/*.spec.ts` 變動 | E2E 測試變動 |
| `workflow_dispatch` | 手動觸發 |

### 工作流步驟

1. **🔍 驗證 Frontmatter**
   - 檢查所有 SKILL.md 的格式
   - 驗證必需的 metadata 欄位
   - 失敗則停止後續步驟

2. **📊 更新 Skill 狀態**
   - 掃描並統計所有 Skill
   - 更新 `SKILL_VERIFICATION_SUMMARY.md`
   - 自動提交變更到分支

3. **🧪 測試受影響的 Skill**
   - 執行 E2E 驗證測試
   - 上傳測試報告 (保留 30 天)

---

## 📋 工作流程範例

### 場景: 驗證新 Skill 完成

1. **編輯 SKILL.md**
   ```yaml
   ---
   name: my-skill
   description: 'My new skill'
   metadata:
     verified-status: ✅ VERIFIED
     last-verified-date: '2026-03-15'
     architecture-aligned: true
   ---
   ```

2. **提交並推送**
   ```bash
   git add .agents/skills/my-skill/SKILL.md
   git commit -m "chore(skills): verify my-skill"
   git push origin main
   ```

3. **GitHub Actions 自動執行**
   - ✅ 驗證 frontmatter 格式
   - ✅ 更新所有追蹤文件
   - ✅ 自動提交更新
   - ✅ 執行相關測試

4. **結果**
   - `SKILL_VERIFICATION_SUMMARY.md` 自動更新
   - `SKILLS_VERIFICATION_STATUS.md` 完整記錄
   - PR 或 commit 包含自動更新的文件

---

## 🛠️ 腳本詳細說明

### `update-skill-status.js`

**功能**：
- 掃描所有 SKILL.md 檔案
- 驗證並修復 frontmatter 格式
- 統計驗證狀態
- 自動更新追蹤文件

**使用**：
```bash
node scripts/update-skill-status.js
```

**修復的格式問題**：
- ✅ 新增缺失的 metadata 區塊
- ✅ 新增缺失的 metadata 欄位
- ✅ 修復縮進問題

### `validate-skill-frontmatter.js`

**功能**：
- 驗證 frontmatter 格式正確性
- 檢查必需欄位存在
- 檢查縮進一致性

**使用**：
```bash
node scripts/validate-skill-frontmatter.js
```

**返回值**：
- `0` - 驗證通過
- `1` - 驗證失敗

### `skill-status-reporter.js`

**功能**：
- 作為 Playwright Reporter 使用
- 測試完成後自動更新 Skill 狀態

**配置** (在 `playwright.config.ts` 中):
```typescript
reporter: [
  ['html'],
  [require.resolve('./scripts/skill-status-reporter.js')],
]
```

---

## 📊 追蹤文件說明

### `SKILL_VERIFICATION_SUMMARY.md`
- 快速參考統計 (VERIFIED/UNVERIFIED 計數)
- 已驗證的 Skill 列表
- 未驗證的 Skill 列表
- 最後更新於: 每次執行 `npm run skills:update` 時

### `SKILLS_VERIFICATION_STATUS.md`
- 詳細的驗證項目清單
- 每個 Skill 的驗證日期
- 已知問題記錄
- 架構對齐狀態

---

## ❓ 常見問題

### Q1: 如何只驗證特定 Skill？

目前腳本會驗證所有 Skill，可以手動編輯 SKILL.md 後執行：
```bash
npm run skills:update
```

未來可擴展支援指定 Skill 參數。

### Q2: GitHub Actions 執行失敗怎麼辦？

1. 檢查本地 frontmatter 格式：
   ```bash
   npm run skills:validate
   ```

2. 修復格式錯誤後重試

3. 查看 GitHub Actions 的執行日誌了解詳細錯誤

### Q3: 如何手動觸發 GitHub Actions？

在 GitHub 上：
1. 前往 `Actions` 標籤
2. 選擇 `Verify Skills Status`
3. 點擊 `Run workflow` 按鈕
4. 可選：輸入特定 Skill 名稱

### Q4: 如何禁用某些觸發條件？

編輯 `.github/workflows/verify-skills.yml` 中的 `on` 部分：
```yaml
on:
  push:
    branches: [main, develop]
    # 移除或註解不需要的觸發條件
  pull_request:
    branches: [main, develop]
```

---

## 🔗 相關文件

- [SKILL_UPDATE_GUIDE.md](./.agents/skills/SKILL_UPDATE_GUIDE.md) - 詳細更新指南
- [SKILL_VERIFICATION_SUMMARY.md](./.agents/skills/SKILL_VERIFICATION_SUMMARY.md) - 最新統計
- [SKILLS_VERIFICATION_STATUS.md](./.agents/skills/SKILLS_VERIFICATION_STATUS.md) - 完整追蹤

---

## 📝 更新日誌

### v1.0.0 (2026-03-15)
- ✅ 建立 `update-skill-status.js` 核心腳本
- ✅ 建立 `validate-skill-frontmatter.js` 驗證工具
- ✅ 建立 `skill-status-reporter.js` Playwright Reporter
- ✅ 建立 `.github/workflows/verify-skills.yml` CI/CD 工作流
- ✅ 新增 npm scripts 支援

### 計劃功能
- 🔄 支援 GraphQL 端點驗證
- 🔄 支援 API 路由驗證
- 🔄 支援智能架構變動偵測
- 🔄 支援 Slack 通知整合
