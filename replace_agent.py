import re

with open('app/workflows/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

start_str = "    {\n        id: 'device-diagnostics-agent',"
end_str = "        ]\n    },"

start = content.find(start_str)
end = content.find(end_str, start) + len(end_str)

old_block = content[start:end]

new_block = '''    {
        id: 'device-diagnostics-agent',
        name: '裝置診斷 Agent',
        description: '支援圖片上傳辨識！接收用戶裝置問題描述與錯誤截圖  圖片分析(擷取錯誤訊息)  分類問題類型  應用程式診斷 Agent 深度分析  結構化診斷報告  引導前往 /checkDevices。',
        category: 'ai',
        icon: '',
        isFeatured: true,
        nodes: [
            {
                id: 'node_1', type: 'trigger', position: { x: 350, y: 30 },
                data: {
                    label: '觸發：用戶回報裝置問題',
                    triggerType: 'trigger_chat_message',
                    config: {
                        testPayload: JSON.stringify({
                            message: { content: '進入教室後畫面是黑的', type: 'image_and_text', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' },
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
                            { key: 'user_image',   value: '{{message.image}}' },
                            { key: 'user_name',    value: '{{user.name}}' },
                            { key: 'user_os',      value: '{{user.os}}' },
                            { key: 'user_browser', value: '{{user.browser}}' }
                        ]
                    }
                }
            },
            {
                id: 'node_has_image', type: 'logic', position: { x: 350, y: 280 },
                data: {
                    label: '包含圖片？',
                    actionType: 'logic_condition',
                    config: { variable: '{{user_image}}', operator: 'not_empty' }
                }
            },
            {
                id: 'node_image_analysis', type: 'action', position: { x: 600, y: 280 },
                data: {
                    label: '圖片 Vision 辨識',
                    actionType: 'action_image_analysis',
                    config: { 
                        inputField: '{{user_image}}', 
                        outputField: 'image_analysis_result',
                        prompt: '你是一個 IT 支援助理。請分析這張圖片，找出所有的錯誤訊息或介面異常的狀況，並以純文字總結。'
                    }
                }
            },
            {
                id: 'node_merge_query', type: 'action', position: { x: 600, y: 400 },
                data: {
                    label: '合併圖片與文字',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'user_query_combined', value: '文字：{{user_query}} / 圖片診斷：{{image_analysis_result}}' }
                        ]
                    }
                }
            },
            {
                id: 'node_use_original_query', type: 'action', position: { x: 350, y: 400 },
                data: {
                    label: '僅使用文字',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'user_query_combined', value: '{{user_query}}' }
                        ]
                    }
                }
            },
            {
                id: 'node_3', type: 'logic', position: { x: 475, y: 550 },
                data: {
                    label: '問題描述是否有效？',
                    actionType: 'logic_condition',
                    config: { variable: '{{user_query_combined}}', operator: 'not_empty' }
                }
            },
            {
                id: 'node_4', type: 'action', position: { x: 750, y: 680 },
                data: {
                    label: '空訊息：請求補充說明',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'ai_output', value: '您好！請描述您遇到的具體裝置問題，或上傳錯誤截圖，我將立即為您診斷。' }
                        ]
                    }
                }
            },
            {
                id: 'node_5', type: 'ai', position: { x: 250, y: 680 },
                data: {
                    label: 'AI 分類問題類型',
                    actionType: 'action_ai_summarize',
                    config: {
                        userPrompt: '你是裝置問題分類器。根據以下用戶描述，以 JSON 格式輸出問題分類：\\n\\n問題描述：{{user_query_combined}}\\n作系統：{{user_os}}\\n瀏覽器：{{user_browser}}\\n\\n輸出格式：\\n{\\n  "category": "video|audio|network|permission|browser|unknown",\\n  "severity": "high|medium|low",\\n  "keywords": ["症狀1", "症狀2"],\\n  "needsDeviceCheck": true/false\\n}'
                    }
                }
            },
            {
                id: 'node_6', type: 'logic', position: { x: 250, y: 850 },
                data: {
                    label: '是否需要自動檢測？',
                    actionType: 'logic_condition',
                    config: { variable: '{{ai_output.needsDeviceCheck}}', operator: 'equals', value: 'true' }
                }
            },
            {
                id: 'node_7', type: 'action', position: { x: -50, y: 1000 },
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
                id: 'node_8', type: 'ai', position: { x: 400, y: 1000 },
                data: {
                    label: 'Agent 深度分析',
                    actionType: 'action_agent_execute',
                    config: {
                        agentId: 'device-diagnostics',
                        inputField: '{{user_query_combined}}',
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
                id: 'node_9', type: 'action', position: { x: 400, y: 1150 },
                data: {
                    label: '建構診斷報告結構',
                    actionType: 'action_set_variable',
                    config: {
                        variables: [
                            { key: 'report_title',    value: ' 裝置診斷報告  {{user_name}}' },
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
                id: 'node_10', type: 'logic', position: { x: 400, y: 1300 },
                data: {
                    label: '嚴重程度為 HIGH？',
                    actionType: 'logic_condition',
                    config: { variable: '{{severity_level}}', operator: 'equals', value: 'high' }
                }
            },
            {
                id: 'node_11', type: 'notification', position: { x: 100, y: 1450 },
                data: {
                    label: '高優先級：通知 Email',
                    actionType: 'action_notification_email',
                    config: {
                        template: 'device_issue_alert',
                        to: 'support@jvtutorcorner.com',
                        subject: ' 裝置問題  {{user_name}}',
                        body: '用戶：{{user_name}}\\n類型：{{problem_type}}\\n描述：{{user_query_combined}}\\n環境：{{user_os}} / {{user_browser}}\\n\\n診斷：\\n{{diagnosis}}'
                    }
                }
            },
            {
                id: 'node_12', type: 'output', position: { x: 400, y: 1600 },
                data: { label: '回傳診斷報告', actionType: 'output_workflow' }
            }
        ],
        edges: [
            { id: 'e1-2',   source: 'node_1',  target: 'node_2',  type: 'smoothstep', animated: true },
            { id: 'e2-has_img', source: 'node_2', target: 'node_has_image', type: 'smoothstep', animated: true },
            { id: 'eha_img-t', source: 'node_has_image', target: 'node_image_analysis', sourceHandle: 'true', label: '有圖片', type: 'smoothstep', animated: true },
            { id: 'eha_img-f', source: 'node_has_image', target: 'node_use_original_query', sourceHandle: 'false', label: '無圖片', type: 'smoothstep', animated: true },
            { id: 'eimg-merge', source: 'node_image_analysis', target: 'node_merge_query', type: 'smoothstep', animated: true },
            
            { id: 'em-3', source: 'node_merge_query', target: 'node_3', type: 'smoothstep', animated: true },
            { id: 'eu-3', source: 'node_use_original_query', target: 'node_3', type: 'smoothstep', animated: true },

            { id: 'e3-5',   source: 'node_3',  target: 'node_5',  sourceHandle: 'true',  label: '有描述', type: 'smoothstep', animated: true },
            { id: 'e3-4',   source: 'node_3',  target: 'node_4',  sourceHandle: 'false', label: '空訊息', type: 'smoothstep', animated: true },
            
            { id: 'e5-6',   source: 'node_5',  target: 'node_6',  type: 'smoothstep', animated: true },
            { id: 'e6-7',   source: 'node_6',  target: 'node_7',  sourceHandle: 'true',  label: '需要檢測', type: 'smoothstep', animated: true },
            { id: 'e6-8',   source: 'node_6',  target: 'node_8',  sourceHandle: 'false', label: '直接診斷', type: 'smoothstep', animated: true },
            { id: 'e7-8',   source: 'node_7',  target: 'node_8',  type: 'smoothstep', animated: true },
            { id: 'e8-9',   source: 'node_8',  target: 'node_9',  type: 'smoothstep', animated: true },
            { id: 'e9-10',  source: 'node_9',  target: 'node_10', type: 'smoothstep', animated: true },
            { id: 'e10-11', source: 'node_10', target: 'node_11', sourceHandle: 'true',  label: '高嚴重', type: 'smoothstep', animated: true },
            { id: 'e10-12', source: 'node_10', target: 'node_12', sourceHandle: 'false', label: '中低嚴重', type: 'smoothstep', animated: true },
            { id: 'e11-12', source: 'node_11', target: 'node_12', type: 'smoothstep', animated: true },
            { id: 'e4-12',  source: 'node_4',  target: 'node_12', type: 'smoothstep', animated: true }
        ]
    },'''

with open('app/workflows/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content.replace(old_block, new_block))
print("Replaced!")