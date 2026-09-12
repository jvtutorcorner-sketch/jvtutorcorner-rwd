---
name: knowledge-base-rag
description: '知識庫與 RAG：Qdrant 向量庫、Gemini embeddings、知識檔解析與同步，以及工作流程的 qdrant-knowledge-base node。Use when: adding knowledge content, changing embeddings or the Qdrant collection, or wiring retrieval into AI chat/workflows.'
argument-hint: '描述要處理的知識庫工作，例如：新增 FAQ 知識、換 embedding 模型'
metadata:
  verified-status: '❌ UNVERIFIED'
  last-verified-date: '-'
  architecture-aligned: false
  related-skills: [workflow-engine, ai-chat, cloud-hybrid-architecture]
---

# 知識庫與 RAG (Knowledge Base & RAG)

> **[Known Gap]** Qdrant 目前沒有部署；本機與正式環境都沒有 `QDRANT_URL`。以下描述程式碼的設計，實際檢索流程尚未驗證。

## 組成

| 檔案 | 功能 |
|---|---|
| [lib/qdrant.ts](../../../lib/qdrant.ts) | `qdrantClient`、`ensureCollection(name, vectorSize)` |
| [lib/embeddings.ts](../../../lib/embeddings.ts) | `getEmbedding(text)`／`getEmbeddings(texts)`，使用 Gemini |
| [lib/knowledge-base.ts](../../../lib/knowledge-base.ts) | `parseKnowledgeFile()` 解析知識檔、`syncKnowledgeItem()` 寫入向量、`searchKnowledge(query, limit)` 檢索 |
| [app/api/workflows/qdrant-knowledge-base/](../../../app/api/workflows/qdrant-knowledge-base/) | 工作流程 node（`withAdminOrHmac`） |
| [cloudformation/dynamodb-rag-tables.yml](../../../cloudformation/dynamodb-rag-tables.yml) | RAG 相關的 DynamoDB 表 |

## 測試指令

```bash
# 權限 contract（G 401／S 403／SYS 缺欄位 400，在連 Qdrant 之前就擋下）
npx playwright test e2e/workflow_engine_verification.spec.ts --project=chromium --grep qdrant
```

實際檢索的端到端驗證要等 Qdrant 部署後補上。

## 環境驗證 (Environment Validation)

- `QDRANT_URL`、`QDRANT_API_KEY`、`QDRANT_COLLECTION_NAME`
- `GEMINI_API_KEY` 或 `GOOGLE_GENERATIVE_AI_API_KEY`（embeddings）

## 故障排除

- **`ensureCollection` 維度錯誤**：換 embedding 模型後向量維度改變，需要建新 collection 並重新同步，不能沿用舊的。
- **部署選項**：Qdrant Cloud 或自架；成本與放置位置見 [cloud-hybrid-architecture](../cloud-hybrid-architecture/SKILL.md) 的比較文件「知識庫」一節。

## 相關技能

- [workflow-engine](../workflow-engine/SKILL.md)、[ai-chat](../ai-chat/SKILL.md)
