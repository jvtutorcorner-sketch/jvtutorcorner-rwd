---
name: cloud-hybrid-architecture
description: 'AWS／GCP／Cloudflare 的成本與適配性比較，以及 AWS + Cloudflare 混合架構的分階段規劃（DNS、R2、Realtime SFU、Workers）。Use when: estimating infra cost, deciding where a new workload should run, or executing a hybrid-architecture phase.'
argument-hint: '描述要評估的工作負載或要執行的階段，例如：Phase C、估算 100 堂課/天的頻寬'
metadata:
  verified-status: '⚠️ PARTIAL'
  last-verified-date: '2026-09-11'
  architecture-aligned: true
  related-skills: [object-storage-uploads, classroom-rtc-providers, db-ops-migrations, env-check]
---

# 雲端混合架構 (Cloud Hybrid Architecture)

這是文件型技能：決策依據與階段驗收清單都在 docs/，這裡整理「什麼時候看哪一份」以及每個階段怎麼確認完成。

## 文件地圖

| 問題 | 文件 |
|---|---|
| 系統有哪些元件、彼此怎麼連 | [docs/system-architecture-diagram.md](../../../docs/system-architecture-diagram.md) |
| 權限層怎麼串 | [docs/auth-architecture-diagram.md](../../../docs/auth-architecture-diagram.md) |
| AWS／GCP／Cloudflare 在 10／50／100 堂課·天的成本 | [docs/cloud-platform-comparison-aws-gcp-cloudflare.md](../../../docs/cloud-platform-comparison-aws-gcp-cloudflare.md) |
| 影音供應商（Agora 替代方案）成本 | [docs/mvp-cost-analysis-agora-alternatives.md](../../../docs/mvp-cost-analysis-agora-alternatives.md) |
| 混合架構要怎麼一步步搬 | [docs/hybrid-architecture-plan.md](../../../docs/hybrid-architecture-plan.md) |

## 階段狀態

| 階段 | 內容 | 程式碼 | 驗收 |
|---|---|---|---|
| Phase 0 | 移除寫死的 Agora 憑證、bundle 祕密檢查 | 已完成 | `npm run check:bundle-secrets` |
| Phase A | 物件儲存抽象（S3 ↔ R2） | 已完成，預設仍用 S3 | 見 [object-storage-uploads](../object-storage-uploads/SKILL.md) |
| Phase B | Cloudflare Realtime SFU | 已完成，預設關閉 | 見 [classroom-rtc-providers](../classroom-rtc-providers/SKILL.md)；需 Cloudflare 憑證才能做雙向連線驗收 |
| 之後 | DNS 移到 Cloudflare、Workers／快取 | 未開始 | 依 plan 文件各節的清單 |

原則：資料庫（DynamoDB）與 SSR（Amplify）留在 AWS；頻寬密集的東西（物件下載、影音）搬到沒有 egress 費用的 Cloudflare。DNS 目前在 Route 53／註冊商，搬遷前先確認 Amplify 自訂網域的 CNAME 驗證方式。

## 測試指令

```bash
# Phase 0：client bundle 不得含伺服器祕密（需先 build）
npm run build && npm run check:bundle-secrets

# Phase B：SFU 授權純函式
node scripts/verify-realtime-sfu-guards.mjs
```

## 環境驗證 (Environment Validation)

每個階段新增的變數都列在 [.env.local.example](../../../.env.local.example) 與 [next.config.ts](../../../next.config.ts) 的 `env` 區塊（Amplify Gen1 SSR 需在 build 時內嵌）。新增伺服器祕密時，記得加進 [scripts/check-bundle-secrets.mjs](../../../scripts/check-bundle-secrets.mjs) 的名單。

## 故障排除

- **Amplify 上讀不到新環境變數**：沒有加進 `next.config.ts` 的 `env` 區塊，或加了之後沒有重新 build。
- **成本數字過期**：比較文件是用公開定價表推估，沒有實際帳單；定價變動時更新文件內的假設表，不要只改結論。
- **未驗證**：本技能沒有自動化測試；狀態依各階段子技能的驗證結果而定。

## 相關技能

- [object-storage-uploads](../object-storage-uploads/SKILL.md)、[classroom-rtc-providers](../classroom-rtc-providers/SKILL.md)
- [db-ops-migrations](../db-ops-migrations/SKILL.md)、[env-check](../env-check/SKILL.md)
