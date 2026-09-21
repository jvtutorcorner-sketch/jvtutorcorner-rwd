---
name: skill-tooling
description: 'Skill 系統本身的維護：SKILL.md frontmatter 格式、validate-skill-frontmatter 與 update-skill-status 腳本、驗證狀態表、verify-skills CI 與 test:verify-skills。Use when: adding or editing a skill, updating verification status, or when skills:validate / the verify-skills workflow fails.'
argument-hint: '描述要做的事，例如：新增 skill、更新驗證狀態'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-09-11'
  architecture-aligned: true
  related-skills: [workflow, enterprise-general-test-coverage, env-check]
---

# Skill 工具鏈 (Skill Tooling)

## 新增 skill 的格式

```yaml
---
name: <與資料夾同名的 kebab-case>
description: '<中文說明>。Use when: <英文觸發情境>.'
argument-hint: '<使用時要提供什麼>'
metadata:
  verified-status: '✅ VERIFIED'   # 或 '⚠️ PARTIAL'、'🔄 IN-PROGRESS'、'❌ UNVERIFIED'
  last-verified-date: 'YYYY-MM-DD' # 未驗證寫 '-'
  architecture-aligned: true       # 裸布林
  related-skills: [a, b]
---
```

- metadata 下一律 2 空格縮排。內文 zh-TW，H1 為 `# 中文名 (English Name)`，常用段落：相關檔案（用 `../../../path` 連結）、測試指令、環境驗證 (Environment Validation)（只寫變數名）、故障排除、相關技能。
- 不得出現任何真實祕密；CI 會掃描常見 token 前綴與寫死的 bypass 字串。
- 有 Playwright 驗證的 skill：spec 命名 `e2e/<skill_底線>_verification.spec.ts`，describe 標題含 `Verification (<skill-name>)`，才會被 `--grep verification` 撿到。權限 contract 型 spec 請用 [e2e/helpers/auth-helpers.ts](../../../e2e/helpers/auth-helpers.ts)。

## 工具

| 指令 | 作用 |
|---|---|
| `npm run skills:validate` | [scripts/validate-skill-frontmatter.js](../../../scripts/validate-skill-frontmatter.js)：檢查 frontmatter、metadata 與縮排 |
| `npm run skills:update` | [scripts/update-skill-status.js](../../../scripts/update-skill-status.js)：重新產生 [SKILL_VERIFICATION_SUMMARY.md](../SKILL_VERIFICATION_SUMMARY.md) |
| `npm run test:verify-skills` | 跑所有 `verification` spec，再更新狀態 |

人工維護的總表：[SKILLS_VERIFICATION_STATUS.md](../SKILLS_VERIFICATION_STATUS.md)；更新方式見 [SKILL_UPDATE_GUIDE.md](../SKILL_UPDATE_GUIDE.md)。CI：[.github/workflows/verify-skills.yml](../../../.github/workflows/verify-skills.yml)。

## 測試指令

```bash
npm run skills:validate
node scripts/update-skill-status.js
npx playwright test --grep verification --list
```

## 環境驗證 (Environment Validation)

- 無必要環境變數；跑 `test:verify-skills` 時需要 e2e 的測試帳號與 `LOGIN_BYPASS_SECRET`（見 [server-auth-guards](../server-auth-guards/SKILL.md)）。大量登入請加 `DISABLE_RATE_LIMIT=true`。

## 故障排除

- **所有 skill 都被統計成 UNVERIFIED**（2026-09-11 已修）：`update-skill-status.js` 解析 metadata 的正則原本是 `\w+`，不吃 `verified-status` 這種含連字號的 key。已改為 `[\w-]+`。
- **某個 spec 沒被 `test:verify-skills` 跑到**：describe 標題或檔名不含 `verification`。目前 `b2c_verification.spec.ts` 以外，`points-escrow-*`、`b2b_*_ui_flow`、`order_refund`、`learning_content_analysis` 的標題都不含，因此不在批次內。
- **CI 的 `update-status` job 從不執行**：workflow 只有 `workflow_dispatch` 觸發，而該 job 的條件是 `github.event_name == 'push'`。
- **`.claude/commands/` 下的鏡像已過期**：多數與 `.agents/skills/` 不同步；以 `.agents/skills/` 為準。

## 相關技能

- [workflow](../workflow/SKILL.md)、[enterprise-general-test-coverage](../enterprise-general-test-coverage/SKILL.md)
