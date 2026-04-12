---
name: classroom-ready
description: '紀錄並驗證 /api/classroom/ready 的修正：以 DynamoDB 取代本地 fs，避免 Serverless 環境下的同步異常。'
argument-hint: '檢查 /classroom/ready 的持久化、同步行為、測試指引與回退步驟。'
metadata:
  verified-status: '❌ UNVERIFIED'
  last-verified-date: '2026-04-12'
  architecture-aligned: true
---

# Classroom Ready - Skill

目的：紀錄並驗證針對 `/api/classroom/ready` 的修正，解決在 Serverless（Amplify/Lambda）環境下，
原先使用本機檔案 (`fs.promises`) 與 in-memory SSE 廣播導致之不同步問題。

核心結論
- 原因：原實作依賴本機文件與記憶體廣播（單一實例），在 Serverless 多實例/無狀態環境中會造成狀態無法共享，導致 Teacher/Student 同步失敗。
- 解法：改為使用 DynamoDB（專案內已有 `lib/dynamo.ts` 與 `ddbDocClient`）作為共享狀態儲存，key 使用 `ready_{uuid}`，並保有 TTL 清理機制；保留（非跨實例）SSE 廣播作為同一實例內的即時通知，前端仍保有 polling fallback 以確保最終一致性。

已變更檔案（實作重點）
- `app/api/classroom/ready/route.ts`：
  - 移除 `fs.promises` 與本機檔案鎖定邏輯（`fileLocks`）。
  - 使用 `@aws-sdk/lib-dynamodb` 的 `GetCommand` / `PutCommand`，透過 `ddbDocClient` 讀寫 `jvtutorcorner-whiteboard`（可由 `DYNAMODB_TABLE_WHITEBOARD` 覆寫）。
  - Item Key 範例：`{ id: 'ready_<uuid>', participants: [...] }`，並加入 `updatedAt` 與 `ttl` 欄位（預設 2 小時）。
  - `updateList` 流程：先 `Get` 最新資料 → 在記憶體中更新 → `Put` 回 DB（如有必要可再加 conditional write）。

為何選擇 DynamoDB
- Serverless friendly：橫向擴展且延遲低、與現有 AWS SDK 模組一致。
- TTL 支援：自動清理過期等待室資料，避免表膨脹。

測試 / 驗證指引

1) 環境準備
- 在 `.env.local`（或 CI env）設定：
  - `AWS_REGION`、`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`（如果需要）
  - (選用) `DYNAMODB_TABLE_WHITEBOARD=jvtutorcorner-whiteboard`

2) 快速自動化測試（有 Playwright）
```bash
# 單一 E2E 測試執行
npm run test -- e2e/quick-sync-test.spec.ts
```

3) 手動檢查（本機啟動 dev server）
```bash
# 啟動開發伺服器
npm run dev

# 清空等候室（示範）：
curl -X POST "http://localhost:3000/api/classroom/ready" \
  -H "Content-Type: application/json" \
  -d '{"uuid":"classroom_session_ready_c1","action":"clear-all"}'
```

4) 檢查 DynamoDB 內容（可選，用 AWS CLI 或管理控制台）
```bash
aws dynamodb get-item --table-name jvtutorcorner-whiteboard \
  --key '{"id":{"S":"ready_classroom_session_ready_c1"}}'
```

5) 手動驗證流程（瀏覽器）
- 開啟兩個分頁或不同瀏覽器：
  - Teacher：`/classroom/wait?courseId=c1&role=teacher&session=classroom_session_ready_c1&forceJoin=true`
  - Student：`/classroom/wait?courseId=c1&role=student&session=classroom_session_ready_c1&forceJoin=true`
- 在任一端點擊「準備好」，確認另一端會在數秒內更新 Participants 列表（若 SSE 可用則即時更新；若 SSE 不可則透過 polling 補足）。

回退 (Rollback)
- 若需回退：`git checkout -- app/api/classroom/ready/route.ts`（或還原到先前 commit），並重新部署。

注意事項與後續改進建議
- `broadcast(uuid, ...)` 在同一 server instance 上仍可用，但無法跨執行個體保證即時性；因此主要一致性來源為 DynamoDB + 前端 polling fallback。
- 長期優化：若需要更即時且跨實例的推播，建議整合 Agora RTM（專案已有 `agora-rtm-sdk`）或建立 WebSocket (API Gateway + Lambda) / Push service。
- 高頻率更新情境（多人同時頻繁變動）可考慮使用 DynamoDB Conditional Writes 或借助 Redis/ElastiCache 以減少寫入延遲與衝突。

驗證清單（PR Reviewer）
- [ ] 確認 `app/api/classroom/ready/route.ts` 已切換到 `ddbDocClient`。
- [ ] 確認 key 命名（`ready_{uuid}`）與前端一致。
- [ ] 確認新增 TTL 欄位且表上啟用了 TTL 功能（若需要）。
- [ ] 執行 `e2e/quick-sync-test.spec.ts`，檢查 Teacher/Student 同步是否穩定。

備註：本文檔為修正紀錄與驗證指引，預設狀態為未驗證（UNVERIFIED），在完成 E2E 驗證或上線後請更新 `metadata.verified-status` 與 `last-verified-date`。

---
作者：工程團隊
