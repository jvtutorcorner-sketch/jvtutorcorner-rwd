'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const TEMPLATE_CATEGORIES = [
    { id: 'all', name: '全部', icon: '📁' },
    { id: 'ai', name: 'AI 代理', icon: '🤖' },
    { id: 'messaging', name: '訊息傳遞', icon: '💬' },
    { id: 'business', name: '商業流程', icon: '💼' },
    { id: 'utility', name: '空白畫布', icon: '🔧' },
    { id: 'integration', name: 'MCP 整合', icon: '🔌' },
    { id: 'testing', name: '測試生成', icon: '🧪' },
];

const TEMPLATES = [
    {
        id: 'blank',
        name: '空白畫布',
        description: '從頭開始構建您的自定義自動化流程。',
        category: 'utility',
        icon: '✨',
        isFeatured: true,
        nodes: [],
        edges: []
    },
    {
        id: 'ai-chat-routing',
        name: 'AI 對話路由',
        description: '智慧訊息路由：正規化輸入 → 空值防護 → Agent 派遣 → 智慧執行/備援 AI → 統一輸出。',
        category: 'ai',
        icon: '🤖',
        isFeatured: true,
        nodes: [
            {
                id: 'node_1', type: 'trigger', position: { x: 350, y: 30 },
                data: {
                    label: '觸發：用戶對話訊息',
                    triggerType: 'trigger_chat_message',
                    config: {
                        testPayload: JSON.stringify({
                            message: { content: "我想了解課程與退款的問題", type: "text" },
                            user: { email: "student@example.com", name: "Amy" }
                        }, null, 2)
                    }
                }
            },
            {
                id: 'node_2', type: 'action', position: { x: 350, y: 140 },
                data: {
                    label: '正規化輸入變數',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'user_query', value: '{{message.content}}' },
                            { key: 'user_name',  value: '{{user.name}}' }
                        ]
                    }
                }
            },
            {
                id: 'node_3', type: 'logic', position: { x: 350, y: 260 },
                data: {
                    label: '訊息是否有效？',
                    actionType: 'logic_condition',
                    config: { variable: '{{user_query}}', operator: 'not_empty' }
                }
            },
            {
                id: 'node_4', type: 'ai', position: { x: 180, y: 400 },
                data: {
                    label: '分析問題 + 選擇最佳 Agent',
                    actionType: 'action_ai_dispatch',
                    config: { queryField: '{{user_query}}', outputField: 'dispatchResult' }
                }
            },
            {
                id: 'node_5', type: 'logic', position: { x: 180, y: 550 },
                data: {
                    label: '找到適合的代理？',
                    actionType: 'logic_condition',
                    config: { variable: '{{dispatchResult.ok}}', operator: 'equals', value: 'true' }
                }
            },
            {
                id: 'node_6', type: 'ai', position: { x: -20, y: 700 },
                data: {
                    label: '執行推薦的代理',
                    actionType: 'action_agent_execute',
                    config: {
                        agentIdField: '{{dispatchResult.primary.id}}',
                        inputField: '{{user_query}}',
                        useSmartRouter: true,
                        usePromptCache: true
                    }
                }
            },
            {
                id: 'node_7', type: 'ai', position: { x: 400, y: 700 },
                data: {
                    label: '通用 AI 備援回覆',
                    actionType: 'action_ai_summarize',
                    config: {
                        userPrompt: '您好，我是 JV Tutor Corner 的 AI 助教。\n\n請根據以下問題提供有幫助的詳細回覆：\n\n{{user_query}}'
                    }
                }
            },
            {
                id: 'node_8', type: 'action', position: { x: 680, y: 400 },
                data: {
                    label: '空訊息預設回覆',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'ai_output', value: '您好！請輸入想詢問的問題，我會立即為您解答。' }
                        ]
                    }
                }
            },
            {
                id: 'node_9', type: 'output', position: { x: 350, y: 880 },
                data: { label: '回傳最終回覆', actionType: 'output_workflow' }
            }
        ],
        edges: [
            { id: 'e1-2', source: 'node_1', target: 'node_2', type: 'smoothstep', animated: true },
            { id: 'e2-3', source: 'node_2', target: 'node_3', type: 'smoothstep', animated: true },
            { id: 'e3-4', source: 'node_3', target: 'node_4', sourceHandle: 'true',  label: '有訊息', type: 'smoothstep', animated: true },
            { id: 'e3-8', source: 'node_3', target: 'node_8', sourceHandle: 'false', label: '空訊息', type: 'smoothstep', animated: true },
            { id: 'e4-5', source: 'node_4', target: 'node_5', type: 'smoothstep', animated: true },
            { id: 'e5-6', source: 'node_5', target: 'node_6', sourceHandle: 'true',  label: '找到 Agent', type: 'smoothstep', animated: true },
            { id: 'e5-7', source: 'node_5', target: 'node_7', sourceHandle: 'false', label: '無 Agent，AI 備援', type: 'smoothstep', animated: true },
            { id: 'e6-9', source: 'node_6', target: 'node_9', type: 'smoothstep', animated: true },
            { id: 'e7-9', source: 'node_7', target: 'node_9', type: 'smoothstep', animated: true },
            { id: 'e8-9', source: 'node_8', target: 'node_9', type: 'smoothstep', animated: true }
        ]
    },
    {
        id: 'line-bot',
        name: 'LINE 自動回覆',
        description: '自動化 LINE 訊息流程，具備影像識別與智慧自動回覆功能。',
        category: 'messaging',
        icon: '💬',
        nodes: [
            {
                id: 'node_1', type: 'webhook', position: { x: 250, y: 50 },
                data: {
                    label: 'LINE Webhook',
                    triggerType: 'trigger_line_webhook',
                    config: {
                        testPayload: JSON.stringify({
                            replyToken: 'test-reply-token-12345',
                            source: { userId: 'Uxxxxxxxx', type: 'user' },
                            message: { id: '12345678', type: 'text', text: '你好，想了解課程資訊' },
                            timestamp: Date.now()
                        }, null, 2)
                    }
                }
            },
            {
                id: 'node_2', type: 'logic', position: { x: 250, y: 165 },
                data: {
                    label: '是否為圖片訊息？',
                    actionType: 'logic_condition',
                    config: { variable: '{{message.type}}', operator: 'equals', value: 'image' }
                }
            },
            {
                id: 'node_3', type: 'action', position: { x: 20, y: 290 },
                data: {
                    label: '下載並辨識藥品圖片',
                    actionType: 'action_line_image_analyze',
                    config: { messageIdField: '{{message.id}}', outputField: 'analysisResult' }
                }
            },
            {
                id: 'node_4', type: 'ai', position: { x: 460, y: 290 },
                data: {
                    label: 'AI 回覆訊息',
                    actionType: 'action_ai_summarize',
                    config: { userPrompt: '{{message.text}}' }
                }
            },
            {
                id: 'node_5', type: 'action', position: { x: 20, y: 430 },
                data: {
                    label: '回覆圖片辨識結果',
                    actionType: 'action_line_reply',
                    config: {
                        replyToken: '{{replyToken}}',
                        message: '📸 藥品辨識結果：\n\n🔷 形狀：{{analysis_shape}}\n🔶 顏色：{{analysis_color}}\n✏️ 刻字：{{analysis_imprint}}\n📏 刻痕：{{analysis_score_line}}'
                    }
                }
            },
            {
                id: 'node_6', type: 'action', position: { x: 460, y: 430 },
                data: {
                    label: '回覆 AI 文字結果',
                    actionType: 'action_line_reply',
                    config: {
                        replyToken: '{{replyToken}}',
                        message: '{{ai_output}}'
                    }
                }
            }
        ],
        edges: [
            { id: 'e1-2', source: 'node_1', target: 'node_2', type: 'smoothstep', animated: true },
            { id: 'e2-3', source: 'node_2', target: 'node_3', sourceHandle: 'true', type: 'smoothstep', animated: true },
            { id: 'e2-4', source: 'node_2', target: 'node_4', sourceHandle: 'false', type: 'smoothstep', animated: true },
            { id: 'e3-5', source: 'node_3', target: 'node_5', type: 'smoothstep', animated: true },
            { id: 'e4-6', source: 'node_4', target: 'node_6', type: 'smoothstep', animated: true }
        ]
    },
    {
        id: 'student-enrollment',
        name: '學生報名流程',
        description: '完整的點數購買、課程註冊及教室登入生命週期管理。',
        category: 'business',
        icon: '🎓',
        isFeatured: true,
        nodes: [
            { id: 'node_1', type: 'trigger', position: { x: 250, y: 50 }, data: { label: '報名請求', triggerType: 'trigger_api_call' } },
            { id: 'node_2', type: 'logic', position: { x: 250, y: 150 }, data: { label: '檢查點數餘額', actionType: 'logic_condition', config: { variable: '{{user.credits}}', operator: 'greater_than', value: '{{course.price}}' } } },
            { id: 'node_3', type: 'action', position: { x: 50, y: 250 }, data: { label: '重新導向至結帳頁面', actionType: 'action_redirect', config: { url: '/pricing' } } },
            { id: 'node_4', type: 'action', position: { x: 450, y: 250 }, data: { label: '註冊報名資訊', actionType: 'action_db_create', config: { collection: 'enrollments', data: { studentId: '{{user.id}}', courseId: '{{course.id}}' } } } },
            { id: 'node_5', type: 'notification', position: { x: 450, y: 350 }, data: { label: '歡迎電子郵件', actionType: 'action_notification_email', config: { template: 'course_welcome', to: '{{user.email}}' } } }
        ],
        edges: [
            { id: 'e1-2', source: 'node_1', target: 'node_2', type: 'smoothstep', animated: true },
            { id: 'e2-3', source: 'node_2', target: 'node_3', sourceHandle: 'false', type: 'smoothstep', animated: true },
            { id: 'e2-4', source: 'node_2', target: 'node_4', sourceHandle: 'true', type: 'smoothstep', animated: true },
            { id: 'e4-5', source: 'node_4', target: 'node_5', type: 'smoothstep', animated: true }
        ]
    },
    {
        id: 'context7-figma',
        name: 'Context7 MCP × Figma 設計擷取',
        description: '透過 Context7 MCP Server 解析 Figma 函式庫 ID → 擷取設計文件 → 匯出節點資料 → AI 分析生成設計說明。',
        category: 'integration',
        icon: '🎨',
        nodes: [
            {
                id: 'node_1', type: 'input', position: { x: 320, y: 30 },
                data: {
                    label: '輸入：Figma 設計參數',
                    actionType: 'action_import_file',
                    config: {
                        testPayload: JSON.stringify({
                            figma_file_key: 'YOUR_FIGMA_FILE_KEY',
                            node_id: '1:2',
                            library_query: 'design system components button'
                        }, null, 2)
                    }
                }
            },
            {
                id: 'node_2', type: 'action', position: { x: 320, y: 150 },
                data: {
                    label: '設定 MCP 連接配置',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'mcp_server', value: 'https://mcp.context7.com' },
                            { key: 'figma_file_key', value: '{{figma_file_key}}' },
                            { key: 'figma_node_id', value: '{{node_id}}' },
                            { key: 'library_query', value: '{{library_query}}' }
                        ]
                    }
                }
            },
            {
                id: 'node_3', type: 'http', position: { x: 320, y: 280 },
                data: {
                    label: 'Step 1｜Context7 解析函式庫 ID',
                    actionType: 'action_http_request',
                    config: {
                        method: 'POST',
                        url: '{{mcp_server}}/resolve-library-id',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            libraryName: 'figma',
                            query: '{{library_query}}'
                        }),
                        outputField: 'resolved_library'
                    }
                }
            },
            {
                id: 'node_4', type: 'action', position: { x: 320, y: 410 },
                data: {
                    label: 'Step 2｜Context7 擷取設計文件',
                    actionType: 'action_context7_retrieval',
                    config: {
                        libraryId: '{{resolved_library.libraryId}}',
                        query: '{{library_query}}',
                        maxTokens: 5000,
                        outputField: 'design_docs'
                    }
                }
            },
            {
                id: 'node_5', type: 'action', position: { x: 320, y: 540 },
                data: {
                    label: 'Step 3｜Figma 匯出節點資料',
                    actionType: 'action_figma_export',
                    config: {
                        fileKey: '{{figma_file_key}}',
                        nodeId: '{{figma_node_id}}',
                        format: 'json',
                        outputField: 'figma_node_data'
                    }
                }
            },
            {
                id: 'node_6', type: 'transform', position: { x: 320, y: 670 },
                data: {
                    label: '轉換：提取設計 Token',
                    actionType: 'action_data_transform',
                    config: {
                        input: '{{figma_node_data}}',
                        transformations: [
                            { field: 'component_name', expression: '{{figma_node_data.name}}' },
                            { field: 'fills', expression: '{{figma_node_data.fills}}' },
                            { field: 'typography', expression: '{{figma_node_data.style}}' },
                            { field: 'constraints', expression: '{{figma_node_data.constraints}}' }
                        ],
                        outputField: 'design_tokens'
                    }
                }
            },
            {
                id: 'node_7', type: 'ai', position: { x: 320, y: 800 },
                data: {
                    label: 'AI 分析設計並生成說明',
                    actionType: 'action_ai_summarize',
                    config: {
                        userPrompt: '你是一位設計系統專家。請根據以下從 Context7 MCP 取得的 Figma 設計資料，生成一份完整的設計說明文件：\n\n【Context7 文件】\n{{design_docs}}\n\n【Figma 節點資料】\n元件名稱：{{component_name}}\n填色：{{fills}}\n字體樣式：{{typography}}\n限制條件：{{constraints}}\n\n請提供：\n1. 元件用途說明\n2. 設計 Token 清單\n3. 使用建議\n4. 可能的實作注意事項'
                    }
                }
            },
            {
                id: 'node_8', type: 'output', position: { x: 320, y: 960 },
                data: { label: '輸出：設計分析報告', actionType: 'output_workflow' }
            }
        ],
        edges: [
            { id: 'e1-2', source: 'node_1', target: 'node_2', type: 'smoothstep', animated: true },
            { id: 'e2-3', source: 'node_2', target: 'node_3', type: 'smoothstep', animated: true },
            { id: 'e3-4', source: 'node_3', target: 'node_4', type: 'smoothstep', animated: true },
            { id: 'e4-5', source: 'node_4', target: 'node_5', type: 'smoothstep', animated: true },
            { id: 'e5-6', source: 'node_5', target: 'node_6', type: 'smoothstep', animated: true },
            { id: 'e6-7', source: 'node_6', target: 'node_7', type: 'smoothstep', animated: true },
            { id: 'e7-8', source: 'node_7', target: 'node_8', type: 'smoothstep', animated: true }
        ]
    },
    {
        id: 'figma-test-generation',
        name: 'Figma → 測試案例生成',
        description: '業界推薦流程：擷取 Figma 設計稿 → 解析元件狀態與互動 → AI 產生 BDD 情境 → 輸出完整 Playwright 測試程式碼。',
        category: 'testing',
        icon: '🧪',
        nodes: [
            {
                id: 'node_1', type: 'input', position: { x: 320, y: 30 },
                data: {
                    label: '輸入：Figma 設計參數',
                    actionType: 'action_import_file',
                    config: {
                        testPayload: JSON.stringify({
                            figma_file_key: 'YOUR_FIGMA_FILE_KEY',
                            frame_node_id: '1:23',
                            page_name: '登入頁面',
                            test_framework: 'playwright',
                            base_url: 'http://localhost:3000'
                        }, null, 2)
                    }
                }
            },
            {
                id: 'node_2', type: 'action', position: { x: 320, y: 150 },
                data: {
                    label: '正規化測試參數',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'file_key',      value: '{{figma_file_key}}' },
                            { key: 'node_id',       value: '{{frame_node_id}}' },
                            { key: 'page_name',     value: '{{page_name}}' },
                            { key: 'framework',     value: '{{test_framework}}' },
                            { key: 'app_base_url',  value: '{{base_url}}' },
                            { key: 'figma_api_url', value: 'https://api.figma.com/v1' }
                        ]
                    }
                }
            },
            {
                id: 'node_3', type: 'http', position: { x: 320, y: 280 },
                data: {
                    label: 'Step 1｜Figma API — 取得 Frame 節點資料',
                    actionType: 'action_http_request',
                    config: {
                        method: 'GET',
                        url: '{{figma_api_url}}/files/{{file_key}}/nodes?ids={{node_id}}&geometry=paths',
                        headers: { 'X-Figma-Token': '{{FIGMA_ACCESS_TOKEN}}' },
                        outputField: 'figma_raw'
                    }
                }
            },
            {
                id: 'node_4', type: 'logic', position: { x: 320, y: 410 },
                data: {
                    label: 'Step 2｜節點是否成功擷取？',
                    actionType: 'logic_condition',
                    config: { variable: '{{figma_raw.nodes}}', operator: 'not_empty' }
                }
            },
            {
                id: 'node_5', type: 'action', position: { x: 660, y: 540 },
                data: {
                    label: '錯誤：記錄 Figma API 失敗原因',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'error_msg',   value: 'Figma API 存取失敗，請確認 File Key 與 Access Token 是否正確。錯誤：{{figma_raw.err}}' },
                            { key: 'test_status', value: 'failed' }
                        ]
                    }
                }
            },
            {
                id: 'node_6', type: 'transform', position: { x: -20, y: 540 },
                data: {
                    label: 'Step 3｜解析元件、狀態與互動',
                    actionType: 'action_data_transform',
                    config: {
                        input: '{{figma_raw.nodes}}',
                        transformations: [
                            { field: 'components',    expression: '{{figma_raw.nodes[node_id].document.children}}' },
                            { field: 'frame_name',    expression: '{{figma_raw.nodes[node_id].document.name}}' },
                            { field: 'interactions',  expression: '{{figma_raw.nodes[node_id].document.interactions}}' },
                            { field: 'component_sets', expression: 'variants: default / hover / focus / error / disabled / loading / success' },
                            { field: 'text_contents', expression: '{{figma_raw.nodes[node_id].document.characters}}' }
                        ],
                        outputField: 'parsed_design'
                    }
                }
            },
            {
                id: 'node_7', type: 'http', position: { x: -20, y: 680 },
                data: {
                    label: 'Step 4｜Context7 MCP — 擷取 Playwright 最佳實踐',
                    actionType: 'action_http_request',
                    config: {
                        method: 'POST',
                        url: 'https://mcp.context7.com/resolve-library-id',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ libraryName: 'playwright', query: 'e2e testing best practices accessibility assertions' }),
                        outputField: 'playwright_lib'
                    }
                }
            },
            {
                id: 'node_8', type: 'ai', position: { x: -20, y: 820 },
                data: {
                    label: 'Step 5｜AI 分析使用者流程與無障礙需求',
                    actionType: 'action_ai_summarize',
                    config: {
                        userPrompt: `你是資深 QA 工程師，擅長從 Figma 設計稿產生完整測試策略。

請分析以下 Figma 「{{frame_name}}」頁面設計資料，識別所有：
1. 互動元素（按鈕、輸入框、下拉選單、連結、Modal 等）
2. 元件狀態（default / hover / focus / active / error / disabled / loading / success）
3. 使用者操作流程（Happy Path 主流程 與 Sad Path 錯誤流程）
4. 表單驗證規則（必填欄位、格式檢查、錯誤提示文字）
5. 條件顯示邏輯（登入後顯示、空狀態、權限限制）
6. 無障礙需求（ARIA labels、Tab 鍵盤導覽、螢幕閱讀器）

【Figma 元件清單】
{{components}}

【頁面互動定義】
{{interactions}}

【元件 Variants】
{{component_sets}}

【文字內容】
{{text_contents}}

請以 JSON 格式輸出分析結果：
{
  "page": "{{frame_name}}",
  "interactive_elements": [{ "name": "", "type": "", "selector_hint": "", "states": [] }],
  "user_flows": { "happy_path": [], "sad_path": [], "edge_cases": [] },
  "validation_rules": [{ "field": "", "rules": [], "error_messages": [] }],
  "conditional_logic": [],
  "accessibility_requirements": []
}`
                    }
                }
            },
            {
                id: 'node_9', type: 'ai', position: { x: 320, y: 1000 },
                data: {
                    label: 'Step 6｜AI 生成 BDD 測試情境 (Gherkin)',
                    actionType: 'action_ai_summarize',
                    config: {
                        userPrompt: `根據以下設計分析，請產生完整 BDD Gherkin 測試情境，涵蓋 Happy Path、Edge Case、Error State 與 Accessibility。

【設計分析結果】
{{ai_output}}

【頁面名稱】：{{frame_name}}
【應用程式 URL】：{{app_base_url}}

輸出格式：

Feature: {{frame_name}} 頁面完整測試

  Background:
    Given 使用者開啟應用程式 "{{app_base_url}}"

  # ── Happy Path ──────────────────────────────────
  Scenario: 主要使用流程成功完成
    Given ...
    When ...
    Then ...

  # ── Edge Cases ──────────────────────────────────
  Scenario Outline: 邊界值輸入處理
    Given ...
    When 使用者輸入 "<input>"
    Then 頁面顯示 "<expected_result>"
    Examples:
      | input | expected_result |

  # ── Error / Sad Path ────────────────────────────
  Scenario: 表單驗證錯誤顯示正確提示
    Given ...
    When ...
    Then 應顯示錯誤提示 "..."

  # ── Component States ────────────────────────────
  Scenario: 元件狀態切換正確
    Given ...

  # ── Accessibility ────────────────────────────────
  Scenario: 支援鍵盤導覽與螢幕閱讀器
    Given ...`
                    }
                }
            },
            {
                id: 'node_10', type: 'ai', position: { x: 320, y: 1180 },
                data: {
                    label: 'Step 7｜AI 產生 Playwright TypeScript 測試程式碼',
                    actionType: 'action_ai_summarize',
                    config: {
                        userPrompt: `你是 Playwright 測試專家。請將以下 BDD Gherkin 情境，轉換為可直接執行的 Playwright TypeScript 完整測試程式碼。

【BDD 情境】
{{ai_output}}

【應用程式 Base URL】：{{app_base_url}}

撰寫規範：
1. 使用 @playwright/test，import { test, expect } from '@playwright/test'
2. 用 test.describe('Happy Path', ...) / test.describe('Edge Cases', ...) / test.describe('Error States', ...) / test.describe('Accessibility', ...) 分組
3. 優先使用語意化選擇器：getByRole()、getByLabel()、getByPlaceholder()、getByText()、getByTestId()
4. 每個 test() 都加入中文註解說明測試意圖
5. test.beforeEach 處理：page.goto(BASE_URL) 與必要的登入前置作業
6. 加入適當的 await expect(...).toBeVisible() / toHaveValue() / toHaveURL() 斷言
7. 使用 page.waitForLoadState('networkidle') 等待頁面穩定
8. Accessibility 測試使用 @axe-core/playwright 的 checkA11y()
9. 加入 const BASE_URL = '{{app_base_url}}' 常數宣告
10. 程式碼應完整，不得省略任何部分

輸出完整 TypeScript 程式碼（.spec.ts 格式）。`
                    }
                }
            },
            {
                id: 'node_11', type: 'action', position: { x: 320, y: 1360 },
                data: {
                    label: 'Step 8｜整合：建立測試套件摘要',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'test_suite_name',  value: '{{frame_name}} — Figma 自動生成測試套件' },
                            { key: 'generated_at',     value: '{{timestamp}}' },
                            { key: 'framework_used',   value: '{{framework}}' },
                            { key: 'source_file_key',  value: '{{file_key}}' },
                            { key: 'source_node_id',   value: '{{node_id}}' },
                            { key: 'playwright_code',  value: '{{ai_output}}' },
                            { key: 'test_status',      value: 'generated' }
                        ]
                    }
                }
            },
            {
                id: 'node_12', type: 'output', position: { x: 320, y: 1480 },
                data: {
                    label: '輸出：完整 Playwright 測試程式碼',
                    actionType: 'output_workflow'
                }
            }
        ],
        edges: [
            { id: 'e1-2',   source: 'node_1',  target: 'node_2',  type: 'smoothstep', animated: true },
            { id: 'e2-3',   source: 'node_2',  target: 'node_3',  type: 'smoothstep', animated: true },
            { id: 'e3-4',   source: 'node_3',  target: 'node_4',  type: 'smoothstep', animated: true },
            { id: 'e4-6',   source: 'node_4',  target: 'node_6',  sourceHandle: 'true',  label: '取得成功', type: 'smoothstep', animated: true },
            { id: 'e4-5',   source: 'node_4',  target: 'node_5',  sourceHandle: 'false', label: 'API 失敗', type: 'smoothstep', animated: true },
            { id: 'e5-12',  source: 'node_5',  target: 'node_12', type: 'smoothstep', animated: true },
            { id: 'e6-7',   source: 'node_6',  target: 'node_7',  type: 'smoothstep', animated: true },
            { id: 'e7-8',   source: 'node_7',  target: 'node_8',  type: 'smoothstep', animated: true },
            { id: 'e8-9',   source: 'node_8',  target: 'node_9',  type: 'smoothstep', animated: true },
            { id: 'e9-10',  source: 'node_9',  target: 'node_10', type: 'smoothstep', animated: true },
            { id: 'e10-11', source: 'node_10', target: 'node_11', type: 'smoothstep', animated: true },
            { id: 'e11-12', source: 'node_11', target: 'node_12', type: 'smoothstep', animated: true }
        ]
    },
    {
        id: 'figma-test-markdown-doc',
        name: 'Figma → 測試文檔生成 (Markdown)',
        description: '業界推薦流程：擷取 Figma 設計稿 → 解析元件狀態 → AI 產生 BDD 情境 → 輸出完整 Markdown 測試文檔（包含 Happy Path、Edge Case、Error State、Accessibility）。',
        category: 'testing',
        icon: '📄',
        nodes: [
            {
                id: 'node_1', type: 'input', position: { x: 320, y: 30 },
                data: {
                    label: '輸入：Figma 設計參數',
                    actionType: 'action_import_file',
                    config: {
                        testPayload: JSON.stringify({
                            figma_file_key: 'YOUR_FIGMA_FILE_KEY',
                            frame_node_id: '1:23',
                            page_name: '購物車頁面',
                            doc_format: 'markdown',
                            base_url: 'http://localhost:3000'
                        }, null, 2)
                    }
                }
            },
            {
                id: 'node_2', type: 'action', position: { x: 320, y: 150 },
                data: {
                    label: '正規化測試參數',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'file_key',      value: '{{figma_file_key}}' },
                            { key: 'node_id',       value: '{{frame_node_id}}' },
                            { key: 'page_name',     value: '{{page_name}}' },
                            { key: 'doc_format',    value: '{{doc_format}}' },
                            { key: 'app_base_url',  value: '{{base_url}}' },
                            { key: 'figma_api_url', value: 'https://api.figma.com/v1' }
                        ]
                    }
                }
            },
            {
                id: 'node_3', type: 'http', position: { x: 320, y: 280 },
                data: {
                    label: 'Step 1｜Figma API — 取得 Frame 節點資料',
                    actionType: 'action_http_request',
                    config: {
                        method: 'GET',
                        url: '{{figma_api_url}}/files/{{file_key}}/nodes?ids={{node_id}}&geometry=paths',
                        headers: { 'X-Figma-Token': '{{FIGMA_ACCESS_TOKEN}}' },
                        outputField: 'figma_raw'
                    }
                }
            },
            {
                id: 'node_4', type: 'logic', position: { x: 320, y: 410 },
                data: {
                    label: 'Step 2｜節點是否成功擷取？',
                    actionType: 'logic_condition',
                    config: { variable: '{{figma_raw.nodes}}', operator: 'not_empty' }
                }
            },
            {
                id: 'node_5', type: 'action', position: { x: 660, y: 540 },
                data: {
                    label: '錯誤：記錄 Figma API 失敗原因',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'error_msg',   value: 'Figma API 存取失敗，請確認 File Key 與 Access Token 是否正確。錯誤：{{figma_raw.err}}' },
                            { key: 'doc_status',  value: 'failed' }
                        ]
                    }
                }
            },
            {
                id: 'node_6', type: 'transform', position: { x: -20, y: 540 },
                data: {
                    label: 'Step 3｜解析元件、狀態與互動',
                    actionType: 'action_data_transform',
                    config: {
                        input: '{{figma_raw.nodes}}',
                        transformations: [
                            { field: 'components',    expression: '{{figma_raw.nodes[node_id].document.children}}' },
                            { field: 'frame_name',    expression: '{{figma_raw.nodes[node_id].document.name}}' },
                            { field: 'interactions',  expression: '{{figma_raw.nodes[node_id].document.interactions}}' },
                            { field: 'component_sets', expression: 'variants: default / hover / focus / error / disabled / loading / success' },
                            { field: 'text_contents', expression: '{{figma_raw.nodes[node_id].document.characters}}' }
                        ],
                        outputField: 'parsed_design'
                    }
                }
            },
            {
                id: 'node_7', type: 'http', position: { x: -20, y: 680 },
                data: {
                    label: 'Step 4｜Context7 MCP — 擷取測試最佳實踐',
                    actionType: 'action_http_request',
                    config: {
                        method: 'POST',
                        url: 'https://mcp.context7.com/resolve-library-id',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ libraryName: 'testing', query: 'test documentation best practices user flows accessibility' }),
                        outputField: 'testing_lib'
                    }
                }
            },
            {
                id: 'node_8', type: 'ai', position: { x: -20, y: 820 },
                data: {
                    label: 'Step 5｜AI 分析使用者流程與無障礙需求',
                    actionType: 'action_ai_summarize',
                    config: {
                        userPrompt: `你是資深 QA 工程師，擅長從 Figma 設計稿產生完整測試策略。

請分析以下 Figma 「{{frame_name}}」頁面設計資料，識別所有：
1. 互動元素（按鈕、輸入框、下拉選單、連結、Modal 等）
2. 元件狀態（default / hover / focus / active / error / disabled / loading / success）
3. 使用者操作流程（Happy Path 主流程 與 Sad Path 錯誤流程）
4. 表單驗證規則（必填欄位、格式檢查、錯誤提示文字）
5. 條件顯示邏輯（登入後顯示、空狀態、權限限制）
6. 無障礙需求（ARIA labels、Tab 鍵盤導覽、螢幕閱讀器）

【Figma 元件清單】
{{components}}

【頁面互動定義】
{{interactions}}

【元件 Variants】
{{component_sets}}

【文字內容】
{{text_contents}}

請以 JSON 格式輸出分析結果：
{
  "page": "{{frame_name}}",
  "interactive_elements": [{ "name": "", "type": "", "selector_hint": "", "states": [] }],
  "user_flows": { "happy_path": [], "sad_path": [], "edge_cases": [] },
  "validation_rules": [{ "field": "", "rules": [], "error_messages": [] }],
  "conditional_logic": [],
  "accessibility_requirements": []
}`
                    }
                }
            },
            {
                id: 'node_9', type: 'ai', position: { x: 320, y: 1000 },
                data: {
                    label: 'Step 6｜AI 生成 BDD 測試情境 (Gherkin)',
                    actionType: 'action_ai_summarize',
                    config: {
                        userPrompt: `根據以下設計分析，請產生完整 BDD Gherkin 測試情境，涵蓋 Happy Path、Edge Case、Error State 與 Accessibility。

【設計分析結果】
{{ai_output}}

【頁面名稱】：{{frame_name}}
【應用程式 URL】：{{app_base_url}}

輸出格式：

Feature: {{frame_name}} 頁面完整測試

  Background:
    Given 使用者開啟應用程式 "{{app_base_url}}"

  # ── Happy Path ──────────────────────────────────
  Scenario: 主要使用流程成功完成
    Given ...
    When ...
    Then ...

  # ── Edge Cases ──────────────────────────────────
  Scenario Outline: 邊界值輸入處理
    Given ...
    When 使用者輸入 "<input>"
    Then 頁面顯示 "<expected_result>"
    Examples:
      | input | expected_result |

  # ── Error / Sad Path ────────────────────────────
  Scenario: 表單驗證錯誤顯示正確提示
    Given ...
    When ...
    Then 應顯示錯誤提示 "..."

  # ── Component States ────────────────────────────
  Scenario: 元件狀態切換正確
    Given ...

  # ── Accessibility ────────────────────────────────
  Scenario: 支援鍵盤導覽與螢幕閱讀器
    Given ...`
                    }
                }
            },
            {
                id: 'node_10', type: 'ai', position: { x: 320, y: 1180 },
                data: {
                    label: 'Step 7｜AI 產生完整 Markdown 測試文檔',
                    actionType: 'action_ai_summarize',
                    config: {
                        userPrompt: `你是技術文檔撰寫專家。請將以下 BDD Gherkin 情境，轉換為專業、結構清晰的 Markdown 測試文檔。

【BDD 情境】
{{ai_output}}

【應用程式 Base URL】：{{app_base_url}}
【頁面名稱】：{{frame_name}}

撰寫規範（Markdown 格式）：
1. 頁首包含：| 欄位 | 內容 |
   | --- | --- |
   | 頁面 | {{frame_name}} |
   | 測試環境 | {{app_base_url}} |
   | 測試框架 | Playwright |
   | 生成時間 | {{timestamp}} |

2. 使用 ## 區隔主要章節，### 用於小節
   - ## 1. 系統概述
   - ## 2. Happy Path — 主要使用流程
   - ## 3. Edge Cases — 邊界值與特殊情況
   - ## 4. Error States — 錯誤處理與驗證
   - ## 5. Component States — 元件狀態切換
   - ## 6. Accessibility — 無障礙支援
   - ## 7. 預檢清單 (Pre-flight Checklist)
   - ## 8. 附錄：選擇器參考

3. 每個 Scenario 轉換為 subsection：
   ### Scenario: [情境描述]
   **Given** — 前置條件
   **When** — 使用者操作
   **Then** — 預期結果
   
4. 使用表格列舉 Edge Cases Examples：
   | 輸入值 | 預期結果 | 優先級 |
   | --- | --- | --- |
   
5. 為關鍵的互動元素加入 **粗體** 強調
6. 使用代碼區塊強調選擇器：\`\`\`selector\`\`\` 或 \`\`\`xpath\`\`\`
7. 無障礙需求用 ⚠️ 、✅ 符號標記
8. 最後加入 「提交前檢查清單」（checkbox 格式）

輸出完整 Markdown 文檔（可直接作為測試規格書）。`
                    }
                }
            },
            {
                id: 'node_11', type: 'action', position: { x: 320, y: 1360 },
                data: {
                    label: 'Step 8｜整合：建立文檔元數據',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'doc_title',        value: '{{frame_name}} — Figma 自動生成測試文檔' },
                            { key: 'generated_at',     value: '{{timestamp}}' },
                            { key: 'source_file_key',  value: '{{file_key}}' },
                            { key: 'source_node_id',   value: '{{node_id}}' },
                            { key: 'markdown_content', value: '{{ai_output}}' },
                            { key: 'doc_status',       value: 'generated' }
                        ]
                    }
                }
            },
            {
                id: 'node_12', type: 'output', position: { x: 320, y: 1480 },
                data: {
                    label: '輸出：Markdown 測試規格文檔',
                    actionType: 'output_workflow'
                }
            }
        ],
        edges: [
            { id: 'e1-2',   source: 'node_1',  target: 'node_2',  type: 'smoothstep', animated: true },
            { id: 'e2-3',   source: 'node_2',  target: 'node_3',  type: 'smoothstep', animated: true },
            { id: 'e3-4',   source: 'node_3',  target: 'node_4',  type: 'smoothstep', animated: true },
            { id: 'e4-6',   source: 'node_4',  target: 'node_6',  sourceHandle: 'true',  label: '取得成功', type: 'smoothstep', animated: true },
            { id: 'e4-5',   source: 'node_4',  target: 'node_5',  sourceHandle: 'false', label: 'API 失敗', type: 'smoothstep', animated: true },
            { id: 'e5-12',  source: 'node_5',  target: 'node_12', type: 'smoothstep', animated: true },
            { id: 'e6-7',   source: 'node_6',  target: 'node_7',  type: 'smoothstep', animated: true },
            { id: 'e7-8',   source: 'node_7',  target: 'node_8',  type: 'smoothstep', animated: true },
            { id: 'e8-9',   source: 'node_8',  target: 'node_9',  type: 'smoothstep', animated: true },
            { id: 'e9-10',  source: 'node_9',  target: 'node_10', type: 'smoothstep', animated: true },
            { id: 'e10-11', source: 'node_10', target: 'node_11', type: 'smoothstep', animated: true },
            { id: 'e11-12', source: 'node_11', target: 'node_12', type: 'smoothstep', animated: true }
        ]
    },
    {
        id: 'smtp-email-send',
        name: 'Gmail SMTP 郵件發送',
        description: '透過 Node.js SMTP 寄送 HTML 格式郵件至指定信箱。支援範本變數替換、品牌樣式信件與發送結果記錄。',
        category: 'messaging',
        icon: '📧',
        nodes: [
            {
                id: 'node_1', type: 'trigger', position: { x: 300, y: 30 },
                data: {
                    label: '觸發：手動 / API 呼叫',
                    triggerType: 'trigger_api_call',
                    config: {
                        testPayload: JSON.stringify({
                            to: 'recipient@example.com',
                            recipient_name: '王小明',
                            course_name: 'Next.js 全端開發',
                            message: '感謝您報名本次課程，期待與您一同學習！'
                        }, null, 2)
                    }
                }
            },
            {
                id: 'node_2', type: 'action', position: { x: 300, y: 160 },
                data: {
                    label: '設定郵件變數',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'email_to',      value: '{{to}}' },
                            { key: 'email_name',    value: '{{recipient_name}}' },
                            { key: 'email_course',  value: '{{course_name}}' },
                            { key: 'email_message', value: '{{message}}' }
                        ]
                    }
                }
            },
            {
                id: 'node_3', type: 'action', position: { x: 300, y: 290 },
                data: {
                    label: '發送 Gmail SMTP 郵件',
                    actionType: 'action_send_gmail',
                    config: {
                        to: '{{email_to}}',
                        subject: '【JV Tutor】{{email_course}} 報名確認通知',
                        body: `<p>親愛的 <strong>{{email_name}}</strong> 您好，</p>
<p>{{email_message}}</p>
<p>課程名稱：<strong>{{email_course}}</strong></p>
<p>如有任何問題，歡迎與我們聯繫。</p>
<p style="color:#6b7280;font-size:13px;margin-top:24px;">JV Tutor Corner 團隊 敬上</p>`
                    }
                }
            },
            {
                id: 'node_4', type: 'action', position: { x: 300, y: 420 },
                data: {
                    label: '記錄發送結果',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'sent_at', value: '{{timestamp}}' },
                            { key: 'sent_to',  value: '{{email_to}}' }
                        ]
                    }
                }
            },
            {
                id: 'node_5', type: 'output', position: { x: 300, y: 540 },
                data: { label: '完成：郵件已發送', actionType: 'output_workflow' }
            }
        ],
        edges: [
            { id: 'e1-2', source: 'node_1', target: 'node_2', type: 'smoothstep', animated: true },
            { id: 'e2-3', source: 'node_2', target: 'node_3', type: 'smoothstep', animated: true },
            { id: 'e3-4', source: 'node_3', target: 'node_4', type: 'smoothstep', animated: true },
            { id: 'e4-5', source: 'node_4', target: 'node_5', type: 'smoothstep', animated: true }
        ]
    },
    {
        id: 'resend-email-send',
        name: 'Resend 報名確認郵件',
        description: '完整 Resend 郵件流程：驗證收件者 → AI 生成個人化內容 → 透過 /apps Resend 整合發送 HTML 品牌郵件 → 成功/失敗分流處理。',
        category: 'messaging',
        icon: '🚀',
        nodes: [
            {
                id: 'node_1', type: 'trigger', position: { x: 350, y: 30 },
                data: {
                    label: '觸發：報名事件 / API 呼叫',
                    triggerType: 'trigger_enrollment',
                    config: {
                        testPayload: JSON.stringify({
                            to: 'student@example.com',
                            student_name: '王小明',
                            course_name: 'Next.js 全端開發課程',
                            course_date: '2026-04-15',
                            teacher_name: '陳老師',
                            amount: 2000
                        }, null, 2)
                    }
                }
            },
            {
                id: 'node_2', type: 'action', position: { x: 350, y: 155 },
                data: {
                    label: '正規化輸入變數',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'email_to',       value: '{{to}}' },
                            { key: 'student_name',   value: '{{student_name}}' },
                            { key: 'course_name',    value: '{{course_name}}' },
                            { key: 'course_date',    value: '{{course_date}}' },
                            { key: 'teacher_name',   value: '{{teacher_name}}' },
                            { key: 'amount',         value: '{{amount}}' }
                        ]
                    }
                }
            },
            {
                id: 'node_3', type: 'logic', position: { x: 350, y: 280 },
                data: {
                    label: '收件者信箱是否有效？',
                    actionType: 'logic_condition',
                    config: { variable: '{{email_to}}', operator: 'not_empty' }
                }
            },
            {
                id: 'node_4', type: 'ai', position: { x: 130, y: 420 },
                data: {
                    label: 'AI 生成個人化郵件內容',
                    actionType: 'action_ai_summarize',
                    config: {
                        userPrompt: `你是 JV Tutor Corner 的郵件撰寫助理。請根據以下資訊，生成一封繁體中文、語氣親切且專業的報名確認郵件內文（HTML 格式，不要加 <!DOCTYPE> 或 <html> 標籤，只需 <p> 等片段）：

學生姓名：{{student_name}}
課程名稱：{{course_name}}
上課日期：{{course_date}}
授課老師：{{teacher_name}}
付款金額：NT$ {{amount}}

要求：
1. 開頭問候學生
2. 確認報名成功，列出課程資訊
3. 提醒提前 10 分鐘進入等待室
4. 友善結尾並署名 JV Tutor Corner 團隊`
                    }
                }
            },
            {
                id: 'node_5', type: 'action', position: { x: 650, y: 420 },
                data: {
                    label: '收件者無效：記錄警告',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'send_error', value: '收件者信箱為空，已略過郵件發送' },
                            { key: 'send_status', value: 'skipped' }
                        ]
                    }
                }
            },
            {
                id: 'node_6', type: 'action', position: { x: 130, y: 570 },
                data: {
                    label: '透過 Resend 發送 HTML 郵件',
                    actionType: 'action_send_resend',
                    config: {
                        to: '{{email_to}}',
                        subject: '🎉 【JV Tutor】{{course_name}} 報名成功確認',
                        body: `{{ai_output}}`
                    }
                }
            },
            {
                id: 'node_7', type: 'logic', position: { x: 130, y: 700 },
                data: {
                    label: '郵件是否發送成功？',
                    actionType: 'logic_condition',
                    config: { variable: '{{resend_sent.ok}}', operator: 'equals', value: 'true' }
                }
            },
            {
                id: 'node_8', type: 'action', position: { x: -60, y: 840 },
                data: {
                    label: '記錄成功：存入 Message ID',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'send_status',  value: 'sent' },
                            { key: 'message_id',   value: '{{resend_sent.data.messageId}}' },
                            { key: 'sent_at',      value: '{{resend_sent.data.timestamp}}' }
                        ]
                    }
                }
            },
            {
                id: 'node_9', type: 'action', position: { x: 330, y: 840 },
                data: {
                    label: '記錄失敗原因',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'send_status',  value: 'failed' },
                            { key: 'send_error',   value: '{{resend_sent.error}}' }
                        ]
                    }
                }
            },
            {
                id: 'node_10', type: 'output', position: { x: 350, y: 980 },
                data: { label: '完成：輸出發送結果', actionType: 'output_workflow' }
            }
        ],
        edges: [
            { id: 'e1-2',  source: 'node_1',  target: 'node_2',  type: 'smoothstep', animated: true },
            { id: 'e2-3',  source: 'node_2',  target: 'node_3',  type: 'smoothstep', animated: true },
            { id: 'e3-4',  source: 'node_3',  target: 'node_4',  sourceHandle: 'true',  label: '有效', type: 'smoothstep', animated: true },
            { id: 'e3-5',  source: 'node_3',  target: 'node_5',  sourceHandle: 'false', label: '無效', type: 'smoothstep', animated: true },
            { id: 'e4-6',  source: 'node_4',  target: 'node_6',  type: 'smoothstep', animated: true },
            { id: 'e6-7',  source: 'node_6',  target: 'node_7',  type: 'smoothstep', animated: true },
            { id: 'e7-8',  source: 'node_7',  target: 'node_8',  sourceHandle: 'true',  label: '成功', type: 'smoothstep', animated: true },
            { id: 'e7-9',  source: 'node_7',  target: 'node_9',  sourceHandle: 'false', label: '失敗', type: 'smoothstep', animated: true },
            { id: 'e5-10', source: 'node_5',  target: 'node_10', type: 'smoothstep', animated: true },
            { id: 'e8-10', source: 'node_8',  target: 'node_10', type: 'smoothstep', animated: true },
            { id: 'e9-10', source: 'node_9',  target: 'node_10', type: 'smoothstep', animated: true }
        ]
    },
    {
        id: 'device-diagnostics-agent',
        name: '裝置診斷 Agent',
        description: '接收用戶裝置問題描述 → 分類問題類型 → 應用程式診斷 Agent 深度分析 → 結構化診斷報告 → 逐步解決指引 → 必要時引導前往 /checkDevices 進行環境自動檢測。',
        category: 'ai',
        icon: '🔧',
        isFeatured: true,
        nodes: [
            {
                id: 'node_1', type: 'trigger', position: { x: 350, y: 30 },
                data: {
                    label: '觸發：用戶回報裝置問題',
                    triggerType: 'trigger_chat_message',
                    config: {
                        testPayload: JSON.stringify({
                            message: { content: '我的攝影機在平台上無法使用，進入教室後畫面是黑的', type: 'text' },
                            user: { email: 'user@example.com', name: 'Alex', os: 'macOS', browser: 'Safari 16' }
                        }, null, 2)
                    }
                }
            },
            {
                id: 'node_2', type: 'action', position: { x: 350, y: 155 },
                data: {
                    label: '正規化輸入與環境變數',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'user_query',   value: '{{message.content}}' },
                            { key: 'user_name',    value: '{{user.name}}' },
                            { key: 'user_os',      value: '{{user.os}}' },
                            { key: 'user_browser', value: '{{user.browser}}' }
                        ]
                    }
                }
            },
            {
                id: 'node_3', type: 'logic', position: { x: 350, y: 280 },
                data: {
                    label: '問題描述是否有效？',
                    actionType: 'logic_condition',
                    config: { variable: '{{user_query}}', operator: 'not_empty' }
                }
            },
            {
                id: 'node_4', type: 'action', position: { x: 680, y: 400 },
                data: {
                    label: '空訊息：請求補充說明',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'ai_output', value: '您好！請描述您遇到的具體裝置問題（例如：攝影機黑屏、麥克風沒聲音、無法進入教室等），我將立即為您診斷。' }
                        ]
                    }
                }
            },
            {
                id: 'node_5', type: 'ai', position: { x: 100, y: 400 },
                data: {
                    label: 'AI 分類問題類型',
                    actionType: 'action_ai_summarize',
                    config: {
                        userPrompt: '你是裝置問題分類器。根據以下用戶描述，以 JSON 格式輸出問題分類：\n\n用戶描述：{{user_query}}\n作業系統：{{user_os}}\n瀏覽器：{{user_browser}}\n\n輸出格式：\n{\n  "category": "video|audio|network|permission|browser|unknown",\n  "severity": "high|medium|low",\n  "keywords": ["關鍵症狀1", "關鍵症狀2"],\n  "needsDeviceCheck": true/false\n}'
                    }
                }
            },
            {
                id: 'node_6', type: 'logic', position: { x: 100, y: 560 },
                data: {
                    label: '是否需要環境自動檢測？',
                    actionType: 'logic_condition',
                    config: { variable: '{{ai_output.needsDeviceCheck}}', operator: 'equals', value: 'true' }
                }
            },
            {
                id: 'node_7', type: 'action', position: { x: -80, y: 700 },
                data: {
                    label: '設定：引導前往 checkDevices',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'check_url', value: '/checkDevices' },
                            { key: 'suggest_check', value: 'true' }
                        ]
                    }
                }
            },
            {
                id: 'node_8', type: 'ai', position: { x: 350, y: 700 },
                data: {
                    label: '應用程式診斷 Agent 深度分析',
                    actionType: 'action_agent_execute',
                    config: {
                        agentId: 'device-diagnostics',
                        inputField: '{{user_query}}',
                        contextFields: {
                            os: '{{user_os}}',
                            browser: '{{user_browser}}',
                            problemCategory: '{{ai_output.category}}',
                            severity: '{{ai_output.severity}}'
                        },
                        outputField: 'diagnosis_result'
                    }
                }
            },
            {
                id: 'node_9', type: 'action', position: { x: 350, y: 870 },
                data: {
                    label: '建構診斷報告結構',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'report_title',    value: '🔧 裝置診斷報告 — {{user_name}}' },
                            { key: 'problem_type',    value: '{{ai_output.category}}' },
                            { key: 'severity_level',  value: '{{ai_output.severity}}' },
                            { key: 'diagnosis',       value: '{{diagnosis_result}}' },
                            { key: 'suggest_check',   value: '{{suggest_check}}' },
                            { key: 'report_time',     value: '{{timestamp}}' }
                        ]
                    }
                }
            },
            {
                id: 'node_10', type: 'logic', position: { x: 350, y: 1010 },
                data: {
                    label: '嚴重程度是否為 HIGH？',
                    actionType: 'logic_condition',
                    config: { variable: '{{severity_level}}', operator: 'equals', value: 'high' }
                }
            },
            {
                id: 'node_11', type: 'notification', position: { x: 130, y: 1150 },
                data: {
                    label: '高優先級：發送技術支援通知 Email',
                    actionType: 'action_notification_email',
                    config: {
                        template: 'device_issue_alert',
                        to: 'support@jvtutorcorner.com',
                        subject: '⚠️ 用戶裝置問題需要關注 — {{user_name}}',
                        body: '用戶：{{user_name}}\n問題類型：{{problem_type}}\n描述：{{user_query}}\n環境：{{user_os}} / {{user_browser}}\n\n診斷結果：\n{{diagnosis}}'
                    }
                }
            },
            {
                id: 'node_12', type: 'output', position: { x: 350, y: 1310 },
                data: { label: '回傳診斷報告與解決方案', actionType: 'output_workflow' }
            }
        ],
        edges: [
            { id: 'e1-2',   source: 'node_1',  target: 'node_2',  type: 'smoothstep', animated: true },
            { id: 'e2-3',   source: 'node_2',  target: 'node_3',  type: 'smoothstep', animated: true },
            { id: 'e3-5',   source: 'node_3',  target: 'node_5',  sourceHandle: 'true',  label: '有描述', type: 'smoothstep', animated: true },
            { id: 'e3-4',   source: 'node_3',  target: 'node_4',  sourceHandle: 'false', label: '空訊息', type: 'smoothstep', animated: true },
            { id: 'e5-6',   source: 'node_5',  target: 'node_6',  type: 'smoothstep', animated: true },
            { id: 'e6-7',   source: 'node_6',  target: 'node_7',  sourceHandle: 'true',  label: '需要環境檢測', type: 'smoothstep', animated: true },
            { id: 'e6-8',   source: 'node_6',  target: 'node_8',  sourceHandle: 'false', label: '直接診斷', type: 'smoothstep', animated: true },
            { id: 'e7-8',   source: 'node_7',  target: 'node_8',  type: 'smoothstep', animated: true },
            { id: 'e8-9',   source: 'node_8',  target: 'node_9',  type: 'smoothstep', animated: true },
            { id: 'e9-10',  source: 'node_9',  target: 'node_10', type: 'smoothstep', animated: true },
            { id: 'e10-11', source: 'node_10', target: 'node_11', sourceHandle: 'true',  label: '高嚴重', type: 'smoothstep', animated: true },
            { id: 'e10-12', source: 'node_10', target: 'node_12', sourceHandle: 'false', label: '中低嚴重', type: 'smoothstep', animated: true },
            { id: 'e11-12', source: 'node_11', target: 'node_12', type: 'smoothstep', animated: true },
            { id: 'e4-12',  source: 'node_4',  target: 'node_12', type: 'smoothstep', animated: true }
        ]
    }
];

export default function WorkflowsList() {
    const [workflows, setWorkflows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showMoreTemplates, setShowMoreTemplates] = useState(false);
    const router = useRouter();

    useEffect(() => {
        fetchWorkflows();
    }, []);

    const fetchWorkflows = async () => {
        try {
            const res = await fetch('/api/workflows');
            const data = await res.json();
            if (data.ok) {
                setWorkflows(data.workflows);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateFromTemplate = async (template: any) => {
        try {
            const res = await fetch('/api/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: template.name === '空白畫布' ? '新工作流' : `${template.name} (範本)`, 
                    nodes: template.nodes, 
                    edges: template.edges,
                    description: template.description
                })
            });
            const data = await res.json();
            if (data.ok && data.workflow) {
                router.push(`/workflows/${data.workflow.id}`);
            }
        } catch (e) {
            console.error('Failed to create workflow', e);
        }
    };

    const toggleActive = async (id: string, currentStatus: boolean) => {
        try {
            await fetch(`/api/workflows/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !currentStatus })
            });
            fetchWorkflows();
        } catch (e) {
            console.error('Failed to update', e);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('您確定要刪除此工作流嗎？')) return;
        try {
            await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
            fetchWorkflows();
        } catch (e) {
            console.error('Failed to delete', e);
        }
    };

    const filteredTemplates = activeCategory === 'all' 
        ? TEMPLATES 
        : TEMPLATES.filter(t => t.category === activeCategory);
    
    // 搜尋功能
    const searchedTemplates = searchQuery.trim() === ''
        ? filteredTemplates
        : filteredTemplates.filter(t => 
            t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.description.toLowerCase().includes(searchQuery.toLowerCase())
          );
    
    // 分離 featured 和其他範本
    const featuredTemplates = searchedTemplates.filter(t => t.isFeatured);
    const otherTemplates = searchedTemplates.filter(t => !t.isFeatured);
    const displayedOtherTemplates = showMoreTemplates ? otherTemplates : [];

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-12">
            {/* Header Section */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">工作流自動化</h1>
                    <p className="text-slate-500 mt-2 text-lg">構建、管理並擴展您的視覺化自動化管線。</p>
                </div>
                <div className="hidden md:block">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                        {workflows.length} 個啟用的工作流
                    </span>
                </div>
            </div>

            {/* Templates Section */}
            <section className="space-y-6">
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">✨</span>
                            從範本開始
                        </h2>
                        
                        <div className="flex flex-wrap gap-2">
                            {TEMPLATE_CATEGORIES.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setActiveCategory(cat.id)}
                                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                                        activeCategory === cat.id 
                                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                                        : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                                    }`}
                                >
                                    <span className="mr-1.5">{cat.icon}</span>
                                    {cat.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Search Box */}
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="🔍 搜尋範本..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        />
                    </div>
                </div>

                {/* Featured Templates */}
                {featuredTemplates.length > 0 && (
                    <div>
                        <div className="mb-3 flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-600">⭐ 常用範本</span>
                            <div className="flex-1 h-px bg-gradient-to-r from-amber-200 to-transparent"></div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {featuredTemplates.map(template => (
                                <div 
                                    key={template.id}
                                    onClick={() => handleCreateFromTemplate(template)}
                                    className="group cursor-pointer bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-50 transition-all duration-300 flex flex-col h-full ring-1 ring-amber-100"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-2xl mb-4 group-hover:bg-indigo-50 group-hover:scale-110 transition-transform">
                                        {template.icon}
                                    </div>
                                    <h3 className="font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">{template.name}</h3>
                                    <p className="text-sm text-slate-500 leading-relaxed flex-grow">
                                        {template.description}
                                    </p>
                                    <div className="mt-4 pt-4 border-t border-slate-50 flex items-center text-indigo-600 font-semibold text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                        建立工作流 <span className="ml-2">→</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Other Templates */}
                {otherTemplates.length > 0 && (
                    <div>
                        <button
                            onClick={() => setShowMoreTemplates(!showMoreTemplates)}
                            className="mb-4 flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold text-sm transition-all"
                        >
                            <span className="text-xl">{showMoreTemplates ? '▼' : '▶'}</span>
                            {showMoreTemplates ? '收起更多範本' : `更多範本 (${otherTemplates.length})`}
                        </button>

                        {showMoreTemplates && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {displayedOtherTemplates.map(template => (
                                    <div 
                                        key={template.id}
                                        onClick={() => handleCreateFromTemplate(template)}
                                        className="group cursor-pointer bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-50 transition-all duration-300 flex flex-col h-full"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-2xl mb-4 group-hover:bg-indigo-50 group-hover:scale-110 transition-transform">
                                            {template.icon}
                                        </div>
                                        <h3 className="font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">{template.name}</h3>
                                        <p className="text-sm text-slate-500 leading-relaxed flex-grow">
                                            {template.description}
                                        </p>
                                        <div className="mt-4 pt-4 border-t border-slate-50 flex items-center text-indigo-600 font-semibold text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                            建立工作流 <span className="ml-2">→</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {searchedTemplates.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                        <p className="text-lg">找不到相符的範本</p>
                        <p className="text-sm">試試其他關鍵字</p>
                    </div>
                )}
            </section>

            {/* My Workflows Section */}
            <section className="space-y-6">
                <div className="border-b border-slate-200 pb-4">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">⚙️</span>
                        現有的工作流
                    </h2>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-44 bg-slate-100 animate-pulse rounded-2xl"></div>
                        ))}
                    </div>
                ) : workflows.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        <div className="text-5xl mb-4">🚀</div>
                        <h3 className="text-xl font-bold text-slate-900">找不到任何工作流</h3>
                        <p className="text-slate-500 mb-6 max-w-sm mx-auto">點擊上方的範本來啟動您的第一個自動化流程。</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {workflows.map(wf => (
                            <div key={wf.id} className="relative bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all group">
                                <div className="p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="overflow-hidden">
                                            <h3 className="font-bold text-lg text-slate-900 truncate" title={wf.name}>{wf.name}</h3>
                                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                                {wf.nodes?.length || 0} 個節點
                                            </span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" className="sr-only peer" checked={wf.isActive} onChange={() => toggleActive(wf.id, wf.isActive)} />
                                            <div className="w-10 h-5.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                        </label>
                                    </div>
                                    
                                    <p className="text-sm text-slate-500 mb-6 line-clamp-2 h-10">
                                        {wf.description || '此工作流尚未提供描述。'}
                                    </p>

                                    <div className="flex gap-3 pt-4 border-t border-slate-50">
                                        <Link 
                                            href={`/workflows/${wf.id}`} 
                                            className="flex-grow text-center text-sm font-bold bg-indigo-50 text-indigo-700 py-2.5 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                        >
                                            開啟畫布
                                        </Link>
                                        <button 
                                            onClick={(e) => { e.preventDefault(); handleDelete(wf.id); }} 
                                            className="px-3 py-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                            title="刪除工作流"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                {wf.isActive && (
                                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
