# Skill 驗證狀態更新指南

本指南說明如何在架構變動和 Skill 驗證成功後，更新 Skill 的驗證狀態標籤和中央追蹤文件。

---

## 快速參考

### Skill 驗證狀態標籤

在每個 `SKILL.md` 的 YAML frontmatter 中使用 `metadata` 欄位包含以下信息：

```yaml
---
name: skill-name
description: 'Skill 的描述'
argument-hint: '使用提示'
metadata:
  verified-status: ✅ VERIFIED | ⚠️ PARTIAL | ❌ UNVERIFIED | 🔄 IN-PROGRESS
  last-verified-date: YYYY-MM-DD
  architecture-aligned: true | false
---
```

> 📌 **重要**：不支援直接在 frontmatter 頂層添加自訂欄位。必須使用 `metadata` 來存儲驗證信息。

### 驗證狀態清單

| 狀態 | 符號 | 說明 | 何時使用 |
|------|------|------|--------|
| 已驗證 | ✅ | 功能完整，所有測試通過 | Skill 功能已實裝並驗證完成 |
| 部分驗證 | ⚠️ | 功能部分完成或待補充測試 | Skill 功能不完整或依賴項未實裝 |
| 未驗證 | ❌ | 尚未進行測試或待審核 | Skill 新建或架構文件未同步 |
| 驗證中 | 🔄 | 正在進行驗證流程 | Skill 作為當前工作目標 |

---

## 標準工作流程

### 場景 1: 新建 Skill

1. **建立 Skill 文件**
   - 在 `.agents/skills/{skill-name}/` 目錄建立 `SKILL.md`
   - 包含完整的功能說明和測試指南

2. **新增 YAML Frontmatter**
   ```yaml
   ---
   name: your-skill
   description: '描述'
   argument-hint: '使用提示'
   metadata:
     verified-status: 🔄 IN-PROGRESS
     last-verified-date: YYYY-MM-DD
     architecture-aligned: false
   ---
   ```

3. **執行測試**
   - 根據 SKILL.md 中的測試清單進行驗證
   - 記錄發現的問題

4. **更新狀態**
   - 驗證成功 → `✅ VERIFIED`
   - 功能不完整 → `⚠️ PARTIAL`
   - 無法驗證 → `❌ UNVERIFIED`

5. **更新中央追蹤文件**
   - 修改 `SKILLS_VERIFICATION_STATUS.md`
   - 新增完整的驗證項目清單

### 場景 2: 架構變動影響現有 Skill

1. **檢測受影響的 Skill**
   ```bash
   # 查看可能受影響的 Skill
   grep -r "schema.graphql\|DynamoDB\|API endpoint" .agents/skills/
   ```

2. **標記 Skill 為待驗證**
   - 修改 `verified-status` 為 `⚠️ PARTIAL` 或 `🔄 IN-PROGRESS`
   - 更新 `architecture-aligned` 為 `false`

3. **執行架構對齐驗證**
   - 檢查依賴的實體（例如：GraphQL 類型、API 端點）
   - 確認邏輯流程與新架構一致

4. **重新測試 Skill**
   - 按照 SKILL.md 的測試清單執行驗證
   - 更新測試結果和已知問題

5. **完成同步**
   - `verified-status` 更新為最終狀態
   - `architecture-aligned` 設為 `true`（如已對齐）
   - 更新 `last-verified-date`

### 場景 3: 驗證成功，更新狀態
 的 metadata**
   ```yaml
   metadata:
     verified-status: ✅ VERIFIED
     last-verified-date: '2026-03-15'
     last-verified-date: '2026-03-15'
   architecture-aligned: true
   ```

2. **更新中央追蹤文件 (`SKILLS_VERIFICATION_STATUS.md`)**
   ```markdown
   ### {Skill Name}
   - **狀態**: ✅ VERIFIED
   - **驗證日期**: 2026-03-15
   - **最後更新**: 2026-03-15
   - **驗證項目**:
     - ✅ 功能項目 1
     - ✅ 功能項目 2
   - **已知問題**: 無
   - **架構對齊**: ✅ 與 {相關架構} 對齐
   ```

3. **提交變更**
   ```bash
   git add .agents/skills/
   git commit -m "chore(skills): verify and update status for {skill-name}"
   ```

---

## 架構變動檢查清單

當發現 Git 有以下檔案變動時，應檢查相關 Skill：

### 檔案變動 → 受影響的 Skill

| 變動檔案 | 受影響 Skill | 檢查項目 |
|---------|-----------|---------|
| `schema.graphql` | 所有依賴 GraphQL 查詢的 Skill | 類型定義、Query/Mutation、欄位名稱 |
| `architecture_overview.md` | 所有 Skill | Core Entities、ERD、Operational Flows |
| `app/api/**/*.ts` | 依賴 API 的 Skill | 端點路由、請求/回應格式、狀態碼 |
| `lib/**/services.ts` | 業務邏輯類 Skill | Service 方法簽名、返回值型態 |
| DynamoDB 表定義 | 資料模型相關 Skill | 表名、索引、屬性 |

### 通用檢查步驟

```checklist
- [ ] 確認 API 端點仍然有效
- [ ] 驗證 GraphQL 查詢/Mutation 語法正確
- [ ] 檢查返回資料結構是否改變
- [ ] 測試依賴的功能流程
- [ ] 確認測試環境與生產環境一致
- [ ] 更新 SKILL.md 中的架構背景連結
- [ ] 記錄變動內容在 SKILLS_VERIFICATION_STATUS.md
```

---

## 自動化檢查（建議）

### 1. 定期同步檢查

建立 GitHub Actions workflow 檢查 `schema.graphql` 變動：

```yaml
name: Check Schema Changes
on:
  pull_request:
    paths:
      - 'schema.graphql'
      - 'architecture_overview.md'
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Skill Verification Needed
        run: |
          echo "⚠️ Architecture files changed. Please verify affected Skills:"
          echo "- Re-run SKILLS_VERIFICATION_STATUS.md checklist"
          echo "- Update verified-status in affected SKILL.md files"
```

### 2. Pre-commit Hook

在 `.git/hooks/pre-commit` 中檢查 YAML frontmatter 格式：

```bash
#!/bin/bash
# 檢查所有 SKILL.md 是否包含必要的驗證欄位
for file in .agents/skills/*/SKILL.md; do
  if ! grep -q "verified-status:" "$file"; then
    echo "❌ $file 缺少 verified-status 欄位"
    exit 1
  fi
done
```

---

## 常見問題與解決方案

### Q1: 如何判斷 Skill 是否需要重新驗證？

**A:**
1. 檢查 `last-verified-date` 是否超過 2 週
2. 查看相關的 `schema.graphql` 或 API 是否有更新
3. 執行 Skill 的測試清單，記錄失敗情況

### Q2: 多個 Skill 受一個架構變動影響，如何優先驗證？

**A:**
按照以下優先級：
1. **Critical** - 影響核心流程的 Skill（例如：student-enrollment-flow）
2. **High** - 用於日常測試的 Skill（例如：auto-login、student-courses-page）
3. **Medium** - 管理功能的 Skill（例如：admin-teacher-management）
4. **Low** - 後期功能的 Skill（例如：ai-chat、payment）

### Q3: 如何記錄已知問題？

**A:**
在中央追蹤文件中填寫「已知問題」欄位：

```markdown
- **已知問題**:
  - 管理員審核頁面偶發 UI 延遲
  - 大訂單列表（>1000 筆）加載緩慢
  - 與 Safari 13 有相容性問題
```

### Q4: 架構變動後，哪些 Skill 優先恢復為 ✅ VERIFIED？

**A:**
優先順序同上，建議跳過未使用的 Skill（例如 AI chat、payment），先驗證核心 Skill。

---

## 維護者檢查清單

**月度維護任務**
- [ ] 檢查是否有超過 30 天未驗證的 Skill
- [ ] 驗證 `SKILLS_VERIFICATION_STATUS.md` 與各個 SKILL.md 狀態是否一致
- [ ] 清理過期的「已知問題」記錄
- [ ] 更新與 architecture_overview.md 的同步狀態

**季度維護任務**
- [ ] 全面重新驗證所有 PARTIAL 狀態的 Skill
- [ ] 評估未驗證的 Skill 是否還需要維護
- [ ] 更新此指南中的檢查清單和優先級

---

## 相關文件

- [SKILLS_VERIFICATION_STATUS.md](./SKILLS_VERIFICATION_STATUS.md) - 中央驗證狀態追蹤
- [architecture_overview.md](../../architecture_overview.md) - 系統架構文件
- [schema.graphql](../../schema.graphql) - GraphQL 架構定義

---

**最後更新**: 2026-03-15
**維護者**: AI Assistant
