---
name: ai-chat
description: 'AI 聊天室功能開發與維護技能。Use when: modifying ai-chat API route, chat route, platform tools, LanceDB memory, AIAssistantWidget, platform agents, or add-app AI integration. Covers tool calling schema, multi-provider support (Gemini/OpenAI), vector memory, agent execution, and UI for tool call logs.'
argument-hint: '描述要修改的 AI 聊天功能，例如：新增工具、修改記憶策略、調整 Agent prompt'
---

# AI Chat 功能技能

## 適用場景

- 修改 AI 聊天室 API（`app/api/ai-chat/route.ts`、`app/api/chat/route.ts`）
- 新增或修改平台工具（`lib/platform-skills.ts`）
- 調整 LanceDB 向量記憶（`lib/lancedb.ts`）
- 修改 AI Widget（`components/AIAssistantWidget.tsx`）
- 修改 Agent 設定（`lib/platform-agents.ts`）
- 新增 app 串接類型（`app/add-app/page.tsx`）
- 調整 AI 聊天頁面 UI（`app/apps/ai-chat/page.tsx`）

## 架構概覽

```
用戶訊息
   │
   ▼
app/api/ai-chat/route.ts        ← 主要 API 入口
   │  ├─ getAIConfig()           ← DynamoDB 讀取 AI 服務設定
   │  ├─ getAgentById()          ← lib/platform-agents.ts
   │  └─ getToolDefinitions()    ← lib/platform-skills.ts
   │
   ▼
app/api/chat/route.ts           ← 通用聊天（含記憶）
   │  ├─ LanceDB searchMemory()  ← 注入歷史對話記憶
   │  ├─ Gemini / OpenAI call
   │  └─ LanceDB addMemory()     ← 儲存本次對話

lib/platform-skills.ts          ← 平台工具定義
lib/lancedb.ts                  ← 向量記憶 CRUD
lib/platform-agents.ts          ← Agent 設定類型與元資料
```

## 關鍵檔案

| 檔案 | 用途 |
|------|------|
| `app/api/ai-chat/route.ts` | AI 聊天主 API，動態載入設定與工具 |
| `app/api/chat/route.ts` | 通用聊天 API，支援 LanceDB 記憶 |
| `lib/platform-skills.ts` | 工具定義（`PlatformTool` schema）|
| `lib/lancedb.ts` | LanceDB 向量記憶 adapter |
| `lib/platform-agents.ts` | Agent 類型：`AskPlanAgentConfig`、`EXECUTION_ENVIRONMENT_META` |
| `app/apps/ai-chat/page.tsx` | 聊天室前端頁面，含工具呼叫 log UI |
| `components/AIAssistantWidget.tsx` | 右下角浮動 AI Widget |
| `app/add-app/page.tsx` | 新增 App 整合（AI、Database 類型設定）|

## 新增平台工具

在 `lib/platform-skills.ts` 中新增一個 `PlatformTool`：

```typescript
export const my_new_tool: PlatformTool = {
    name: 'my_new_tool',
    description: '工具用途說明（繁體中文，讓 AI 理解何時使用）',
    parameters: {
        type: 'object',
        properties: {
            param1: { type: 'string', description: '參數說明' },
        },
        required: ['param1'],
    },
    execute: async ({ param1 }) => {
        // 實作邏輯
        return { ok: true, result: '...' };
    }
};

// 加入 PLATFORM_TOOLS 陣列
export const PLATFORM_TOOLS: PlatformTool[] = [
    search_courses,
    get_course_details,
    // ...
    my_new_tool,  // ← 加在這裡
];
```

## AI 服務設定流程

1. DynamoDB `APP_INTEGRATIONS_TABLE` 中存有 `AI_CHATROOM` 類型記錄
2. `AI_CHATROOM` 的 `config.linkedServiceId` 指向 GEMINI / OPENAI 服務
3. 若無 `AI_CHATROOM`，fallback 找 `ACTIVE` 狀態的 GEMINI 整合
4. 支援的 provider：`GEMINI`（gemini-1.5-pro）、`OPENAI`（gpt-4o）

## LanceDB 記憶機制

- **搜尋記憶**：每次對話前以最新訊息向量搜尋相關歷史（top-3）
- **儲存記憶**：對話結束後將 `User: ... AI: ...` 存入 LanceDB
- **設定方式**：在 `APP_INTEGRATIONS_TABLE` 建立 `LANCEDB` 類型整合，設 `config.tableName`
- **資料夾**：預設路徑 `./data/lancedb`

## Agent 設定

`lib/platform-agents.ts` 的 `AskPlanAgentConfig` 包含：
- `executionEnvironment`: `'local' | 'background' | 'cloud'`
- `allowedTools`: 該 agent 可使用的工具清單
- `askSystemPrompt` / `planSystemPrompt` / `executeSystemPrompt`: 三階段 prompt
- `maxLoops`: 最大執行迴圈數
- `verbosity`: `'concise' | 'detailed' | 'verbose'`

## 常見修改模式

### 修改 AI 錯誤訊息
編輯 `components/AIAssistantWidget.tsx` 的 catch 區塊，或 `app/api/ai-chat/route.ts` 的 `NextResponse.json({ reply: '...' })`。

### 新增工具呼叫 UI
`app/apps/ai-chat/page.tsx` 的 `{m.toolCalls && ...}` 區塊負責渲染工具呼叫 log。

### 新增資料庫整合類型
在 `app/add-app/page.tsx` 的 `selectedDatabaseType` state 初始化與 config 組裝 `switch/if` 中新增分支。

## Git Commit 規範

```
feat(ai-chat): <簡短描述>

- 詳細說明變更項目 1
- 詳細說明變更項目 2
```

使用 `feat`（新功能）、`fix`（修bug）、`refactor`（重構）、`chore`（雜務）前綴。
