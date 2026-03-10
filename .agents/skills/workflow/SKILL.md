# Workflow Skill — 工作流程相關修改指南

此 skill 用來記錄與標準化與 CI / workflow 有關的變更流程、檢查清單，以及建議的 git commit 格式，方便在修改 workflow（例如 GitHub Actions、CI 設定、build/cache 設定）時保持一致性。

使用情境：
- 新增或修改 GitHub Actions workflow 檔案
- 調整 CI 腳本或 build 快取設定
- 修正跨平台（Windows/Linux/Mac）執行問題

主要內容：
- 變更檢查清單：
  - 確認 workflow 在所有 target runner 上能成功執行（至少本地或模擬一個 run）
  - 檢查 secrets/env 是否需要更新或新增權限
  - 驗證 caching 與 artifact 設定是否正確（避免漏掉 cache key）
  - 更新 README 或相關文件中的使用說明（若有必要）
  - 新增/更新 Playwright/E2E 測試對應的 job（若改動影響測試）

- Commit 與 PR 標準建議：
  - Commit 類型建議使用 Conventional Commits 類型前綴，例如：
    - `chore(workflow):` 一般流程/設定變更
    - `fix(workflow):` 修正 CI 或 workflow 錯誤
    - `feat(workflow):` 新增重要工作流程或自動化
    - `docs(workflow):` 文件或說明更新
  - Commit 範例：
    - `chore(workflow): add build-cache to nodejs CI workflow`
    - `fix(workflow): correct windows path in test job`

- PR 描述模板建議要點：
  - Summary: 一句話說明變更
  - Motivation: 為何需要此變更或修正什麼問題
  - How to test: CI 須通過、或本地可復現的測試步驟
  - Rollback plan: 若失敗如何回退

如果你要我代為執行：
- 我可以將這個 skill 檔放到 `.agents/skills/workflow/`，並幫你 `git add` 與 `git commit`（請確認是否要我直接執行 commit）。
