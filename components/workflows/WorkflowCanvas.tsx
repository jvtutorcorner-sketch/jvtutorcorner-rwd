'use client';

import React, { useState, useCallback } from 'react';
import {
    ReactFlow,
    ReactFlowProvider,
    addEdge,
    useNodesState,
    useEdgesState,
    Controls,
    Background,
    MiniMap,
    Connection,
    Edge,
    Node,
    ConnectionLineType,
    BackgroundVariant,
    Panel,
    useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { TriggerNode } from './nodes/TriggerNode';
import { ActionNode } from './nodes/ActionNode';
import { LogicNode } from './nodes/LogicNode';
import { AiNode } from './nodes/AiNode';
import { CodeNode } from './nodes/CodeNode';
import { ExportNode } from './nodes/ExportNode';
import { WebhookNode } from './nodes/WebhookNode';
import { HttpRequestNode } from './nodes/HttpRequestNode';
import { DelayNode } from './nodes/DelayNode';
import { NotificationNode } from './nodes/NotificationNode';
import { DataTransformNode } from './nodes/DataTransformNode';
import { InputNode } from './nodes/InputNode';
import { OutputNode } from './nodes/OutputNode';
import { WorkflowConfigSidebar } from './WorkflowConfigSidebar';

const nodeTypes = {
    trigger: TriggerNode,
    action: ActionNode,
    logic: LogicNode,
    ai: AiNode,
    python: CodeNode,
    export: ExportNode,
    webhook: WebhookNode,
    http: HttpRequestNode,
    delay: DelayNode,
    notification: NotificationNode,
    transform: DataTransformNode,
    input: InputNode,
    output: OutputNode,
};

/**
 * 從節點輸出中提取用戶友好的摘要消息
 * 保留完整 JSON，但優先顯示最相關的文本內容
 */
function extractUserFriendlyMessage(log: any): string | null {
    if (!log.output) return null;
    
    const output = log.output;
    const actionType = log.actionType || '';
    
    // 優先級順序：針對不同節點類型提取最相關的字段
    const priorityFields = [
        // AI/回覆相關
        'ai_output',
        'message',
        'reply',
        'text',
        'response',
        // 分析相關
        'analysisResult',
        'analysis_summary',
        'result',
        // LINE 回覆格式
        'analysis_shape',
        'analysis_color',
        // HTTP/API
        'data',
        'content',
        // 其他
        'output',
        'js_result',
        'python_result',
        'status'
    ];
    
    // 逐個檢查優先字段
    for (const field of priorityFields) {
        if (output[field]) {
            const value = output[field];
            // 如果是物件，轉為 JSON 字符串（最多顯示 200 字）
            if (typeof value === 'object') {
                const jsonStr = JSON.stringify(value);
                return jsonStr.length > 200 ? jsonStr.substring(0, 197) + '...' : jsonStr;
            }
            // 如果是字符串，截取 200 字
            if (typeof value === 'string') {
                return value.length > 200 ? value.substring(0, 197) + '...' : value;
            }
            // 其他類型則轉為字符串
            return String(value).substring(0, 200);
        }
    }
    
    return null;
}

interface WorkflowCanvasProps {
    initialWorkflow?: any;
    onSave?: (workflow: any) => void;
}

type NodeCategory = {
    label: string;
    color: string;
    items: { icon: string; name: string; type: string; subtype: string }[];
};

const NODE_PALETTE: NodeCategory[] = [
    {
        label: '觸發器',
        color: 'green',
        items: [
            { icon: '⚡', name: '學生報名', type: 'trigger', subtype: 'trigger_enrollment' },
            { icon: '💳', name: '購買點數', type: 'trigger', subtype: 'trigger_point_purchase' },
            { icon: '💰', name: '付款成功', type: 'trigger', subtype: 'trigger_payment_success' },
            { icon: '🔗', name: 'Webhook', type: 'webhook', subtype: 'trigger_webhook' },
            { icon: '🟢', name: 'LINE Webhook', type: 'webhook', subtype: 'trigger_line_webhook' },
            { icon: '💬', name: '用戶對話訊息', type: 'trigger', subtype: 'trigger_chat_message' },
        ],
    },
    {
        label: '流程控制',
        color: 'orange',
        items: [
            { icon: '🔀', name: 'If/Else 條件', type: 'logic', subtype: 'logic_condition' },
            { icon: '📦', name: 'Variable', type: 'action', subtype: 'action_set_variable' },
            { icon: '⏱️', name: '等待 / 延遲', type: 'delay', subtype: 'action_delay' },
        ],
    },
    {
        label: 'AI 生成',
        color: 'violet',
        items: [
            { icon: '✨', name: 'AI 文字回覆', type: 'ai', subtype: 'action_ai_summarize' },
            { icon: '🔍', name: '圖片 Vision 辨識', type: 'action', subtype: 'action_image_analysis' },
            { icon: '📝', name: 'Markdown 轉 HTML', type: 'transform', subtype: 'transform_markdown_html' },
        ],
    },
    {
        label: 'Agent 代理',
        color: 'rose',
        items: [
            { icon: '👑', name: '主管代理（多 Agent 協調）', type: 'ai', subtype: 'action_ai_supervisor' },
            { icon: '🧭', name: '代理派遣器（自動分配 Agent）', type: 'ai', subtype: 'action_ai_dispatch' },
            { icon: '🤖', name: '執行代理（運行指定 Agent）', type: 'ai', subtype: 'action_agent_execute' },
            { icon: '🧐', name: '反思代理（自我修正）', type: 'ai', subtype: 'action_ai_reflect' },
        ],
    },
    {
        label: '處理 / 腳本',
        color: 'amber',
        items: [
            { icon: '', name: 'JavaScript 腳本', type: 'javascript', subtype: 'action_js_script' },
            { icon: '🌐', name: 'HTTP 請求', type: 'http', subtype: 'action_http_request' },
            { icon: '⚙️', name: '提取 / 轉換欄位', type: 'transform', subtype: 'action_data_transform' },
        ],
    },
    {
        label: '傳送動作',
        color: 'blue',
        items: [
            { icon: '📧', name: '發送電子郵件', type: 'action', subtype: 'action_send_email' },
            { icon: '📩', name: 'Gmail', type: 'action', subtype: 'action_send_gmail' },
            { icon: '🚀', name: 'Resend 郵件', type: 'action', subtype: 'action_send_resend' },
            { icon: '💬', name: 'Slack 通知', type: 'notification', subtype: 'action_notification_slack' },
            { icon: '🟢', name: 'LINE 推播（主動通知）', type: 'notification', subtype: 'action_notification_line' },
            { icon: '↩️', name: 'LINE 回覆（replyToken）', type: 'action', subtype: 'action_line_reply' },
            { icon: '🖼️', name: 'LINE 圖片辨識', type: 'action', subtype: 'action_line_image_analyze' },
            { icon: '💎', name: '贈送點數', type: 'action', subtype: 'action_grant_points' },
        ],
    },
    {
        label: '外部集成',
        color: 'fuchsia',
        items: [
            { icon: '📚', name: 'Context7 文檔檢索', type: 'action', subtype: 'action_context7_retrieval' },
            { icon: '🔍', name: 'Gmail 發送郵件', type: 'action', subtype: 'action_gmail_send' },
            { icon: '🧠', name: 'Qdrant 知識庫', type: 'action', subtype: 'action_qdrant_knowledge_base' },
            { icon: '🎨', name: 'Figma 匯出', type: 'action', subtype: 'action_figma_export' },
        ],
    },
    {
        label: '輸入 / 輸出',
        color: 'indigo',
        items: [
            { icon: '📥', name: 'Import File', type: 'action', subtype: 'action_import_file' },
            { icon: '📤', name: 'Export File', type: 'export', subtype: 'action_export_file' },
        ],
    },
];

const COLOR_MAP: Record<string, string> = {
    green: 'hover:bg-green-50 hover:border-green-500',
    orange: 'hover:bg-orange-50 hover:border-orange-500',
    violet: 'hover:bg-violet-50 hover:border-violet-500',
    rose: 'hover:bg-rose-50 hover:border-rose-500',
    amber: 'hover:bg-amber-50 hover:border-amber-500',
    blue: 'hover:bg-blue-50 hover:border-blue-500',
    indigo: 'hover:bg-indigo-50 hover:border-indigo-500',
    fuchsia: 'hover:bg-fuchsia-50 hover:border-fuchsia-500',
};

const RESULT_COLOR_MAP: Record<string, { bg: string; border: string; accent: string }> = {
    green: { bg: 'bg-green-50', border: 'border-green-200', accent: 'text-green-700' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', accent: 'text-orange-700' },
    violet: { bg: 'bg-violet-50', border: 'border-violet-200', accent: 'text-violet-700' },
    rose: { bg: 'bg-rose-50', border: 'border-rose-200', accent: 'text-rose-700' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', accent: 'text-amber-700' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', accent: 'text-blue-700' },
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', accent: 'text-indigo-700' },
    fuchsia: { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', accent: 'text-fuchsia-700' },
};

// 根據 subtype 查找對應的色彩分類
function getColorForSubtype(subtype?: string): string {
    if (!subtype) return 'gray';
    const item = NODE_PALETTE.flatMap((cat) => cat.items).find((i) => i.subtype === subtype);
    const color = item ? NODE_PALETTE.find((cat) => cat.items.includes(item))?.color : undefined;
    return color || 'gray';
}

function NodePalette({ onAdd, open, setOpen }: { onAdd: (type: string, subtype: string) => void; open: boolean; setOpen: (v: boolean) => void }) {
    const [search, setSearch] = useState('');

    const filtered = NODE_PALETTE.map((cat) => ({
        ...cat,
        items: cat.items.filter(
            (item) =>
                !search ||
                item.name.toLowerCase().includes(search.toLowerCase())
        ),
    })).filter((cat) => cat.items.length > 0);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="px-4 py-2 border rounded-lg shadow-sm bg-white hover:bg-gray-50 text-sm font-semibold flex items-center gap-2 transition-colors"
            >
                <span className="text-blue-500 text-lg leading-none">+</span> 新增節點
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 mt-2 w-64 bg-white border rounded-xl shadow-2xl z-50 overflow-hidden">
                        <div className="p-2 border-b">
                            <input
                                autoFocus
                                type="text"
                                placeholder="搜尋節點..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full px-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                            {filtered.map((cat) => (
                                <div key={cat.label}>
                                    <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 border-b">
                                        {cat.label}
                                    </div>
                                    {cat.items.map((item) => (
                                        <button
                                            key={item.subtype}
                                            onClick={() => {
                                                onAdd(item.type, item.subtype);
                                                setOpen(false);
                                                setSearch('');
                                            }}
                                            className={`block w-full text-left px-4 py-2.5 text-sm border-l-4 border-transparent transition-colors flex items-center gap-2 ${COLOR_MAP[cat.color]}`}
                                        >
                                            <span>{item.icon}</span>
                                            <span>{item.name}</span>
                                        </button>
                                    ))}
                                </div>
                            ))}
                            {filtered.length === 0 && (
                                <div className="p-4 text-sm text-gray-400 text-center">找不到節點</div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function CanvasFlow({ initialWorkflow, onSave }: WorkflowCanvasProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialWorkflow?.nodes || []);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialWorkflow?.edges || []);
    const [title, setTitle] = useState(initialWorkflow?.name || '新工作流');
    const [isActive, setIsActive] = useState(initialWorkflow?.isActive || false);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [executionTrails, setExecutionTrails] = useState<any[]>([]);
    const [isExecuting, setIsExecuting] = useState(false);
    const [activeTab, setActiveTab] = useState<'config' | 'debug'>('config');
    const { screenToFlowPosition, getViewport } = useReactFlow();
    const [showGuide, setShowGuide] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);

    const onConnect = useCallback(
        (connection: Connection) => {
            setEdges((eds) =>
                addEdge(
                    {
                        ...connection,
                        type: 'smoothstep',
                        animated: true,
                        style: { stroke: '#6366f1', strokeWidth: 2 },
                    },
                    eds
                )
            );
        },
        [setEdges]
    );

    const onNodeClick = useCallback((_: any, node: Node) => {
        setSelectedNodeId(node.id);
        setSelectedEdgeId(null);
    }, []);

    const onEdgeClick = useCallback((_: any, edge: Edge) => {
        setSelectedEdgeId(edge.id);
        setSelectedNodeId(null);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
    }, []);

    const handleSave = useCallback(async () => {
        if (!onSave) return;
        setSaveStatus('saving');
        await onSave({ ...initialWorkflow, name: title, isActive, nodes, edges });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
    }, [onSave, initialWorkflow, title, isActive, nodes, edges]);

    const runManualTest = async () => {
        setIsExecuting(true);
        setActiveTab('debug');
        
        try {
            // Get test payload from the trigger node
            let testPayload = {};
            const triggerNode = nodes.find(n => n.type === 'trigger' || n.type === 'webhook') || nodes[0];
            if (triggerNode) {
                const configPayload = (triggerNode.data as any)?.config?.testPayload;
                if (configPayload) {
                    try {
                        testPayload = JSON.parse(configPayload);
                    } catch (e) {
                        console.error('Failed to parse test payload JSON', e);
                    }
                } else {
                    // Default fallback if no payload defined
                    testPayload = {
                        message: { content: "我想了解課程與退款的問題", type: "text", text: "測試文字" },
                        user: { email: "test@example.com", name: "Tester" },
                        amount: 100,
                        status: "success"
                    };
                }
            }

            // Gather variables from all input nodes
            const inputVariables: Record<string, any> = {};
            nodes.filter(n => n.type === 'input').forEach(n => {
                const vars = (n.data as any)?.config?.variables || [];
                vars.forEach((v: any) => {
                    if (v.key) inputVariables[v.key] = v.value;
                });
                
                // Also check if input node has its own test payload
                const inputPayloadStr = (n.data as any)?.config?.testPayload;
                if (inputPayloadStr) {
                    try {
                        const parsed = JSON.parse(inputPayloadStr);
                        Object.assign(inputVariables, parsed);
                    } catch (e) {}
                }
            });

            // Trigger the actual workflow via API
            const res = await fetch('/api/workflows/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    triggerType: triggerNode ? (triggerNode.data as any).triggerType || 'manual' : 'manual',
                    data: { 
                        ...testPayload,
                        ...inputVariables,
                        manual_test: true, 
                        timestamp: new Date().toISOString() 
                    },
                    testWorkflow: { nodes, edges }
                })
            });
            const result = await res.json();
            if (result.ok && result.trails) {
                setExecutionTrails(result.trails);
                
                // Update node statuses based on trails
                const trailLogs = result.trails[0]?.logs || [];
                setNodes(nds => nds.map(node => {
                    const nodeLog = trailLogs.find((l: any) => l.nodeId === node.id);
                    if (nodeLog) {
                        return { ...node, data: { ...node.data, status: nodeLog.status, lastOutput: nodeLog.output, lastPayload: nodeLog.payload } };
                    }
                    return node;
                }));
            }
        } catch (error) {
            console.error('Test run failed', error);
        } finally {
            setIsExecuting(false);
        }
    };

    const addNode = (type: string, subtype: string) => {
        const id = `${type}_${Date.now()}`;
        const friendlyName = NODE_PALETTE.flatMap((c) => c.items).find((i) => i.subtype === subtype)?.name || subtype;
        const { x, y, zoom } = getViewport();
        // Calculate the center of the visible canvas area
        // We assume the sidebar takes some space, so we adjust slightly for better visual centering
        const canvasElement = document.querySelector('.react-flow');
        const width = canvasElement?.clientWidth || window.innerWidth;
        const height = canvasElement?.clientHeight || window.innerHeight;
        
        const centerX = (width / 2 - x) / zoom;
        const centerY = (height / 2 - y) / zoom;

        const newNode: Node = {
            id,
            type,
            position: { x: centerX - 100, y: centerY - 40 }, // Offset by half node size roughly
            data: {
                label: friendlyName,
                description: '',
                triggerType: type === 'trigger' || type === 'webhook' ? subtype : undefined,
                actionType: !['trigger', 'webhook'].includes(type) ? subtype : undefined,
                config: subtype === 'action_js_script'
                    ? { 
                        script: `// ═══════════════════════════════════════════════════════════
// JavaScript Workflow Script — 初始化範例
// ═══════════════════════════════════════════════════════════
// 版本: Node.js 18+
// 超時: 3000ms (3 秒) — 支援通用計算
// 記憶體: 128MB (可在配置調整)
#
# 輸入: data (dict) — 工作流程資料
# 輸出: print() 會顯示在日誌，return 會作為結果
# ═══════════════════════════════════════════════════════════

import json
from datetime import datetime

# 📥 1️⃣ 存取輸入資料
student_name = data.get("student_name", "Explorer")
course_name = data.get("course_name", "Python 101")
try_count = data.get("try_count", 0)

# 🔄 2️⃣ 執行你的邏輯
timestamp = datetime.now().isoformat()
processed_try_count = try_count + 1

# ✅ 3️⃣ 建立結果
result = {
    "status": "success",
    "message": f"👋 Hello {student_name}! Welcome to {course_name}",
    "course": course_name,
    "timestamp": timestamp,
    "processed": True,
    "try_count": processed_try_count,
    "python_version": "3.11"
}

# 📋 4️⃣ 列印日誌 (會顯示在執行跟蹤中)
print(f"[Python] Processing {student_name}")
print(f"[Python] Course: {course_name}")
print(json.dumps(result))

# 📤 5️⃣ 回傳結果 (自動轉換為 JSON，合併入工作流程資料)
return result`
                    }
                    : false
                    ? { 
                        script: `// ═══════════════════════════════════════════════════════════
// JavaScript Workflow Script — 初始化範例
// ═══════════════════════════════════════════════════════════
// 版本: Node.js 18+ | isolated-vm 6.0.2+
// 超時: 3000ms (預設，可設定)
// 記憶體: 128MB (可設定)
//
// 注意：此執行環境是沙箱隔離的
// ❌ 不支援: fetch, setTimeout, 檔案系統
// ✅ 支援: 標準 JS, JSON, 資料轉換
// ═══════════════════════════════════════════════════════════

// 📥 1️⃣ 存取工作流程資料
const studentName = data?.student_name || 'Explorer';
const courseName = data?.course_name || 'JavaScript 101';
const processedCount = (data?.processed_count || 0) + 1;

// 📝 2️⃣ 執行你的邏輯
console.log('[JS] Starting workflow...');
console.log('[JS] Student:', studentName);
console.log('[JS] Course:', courseName);

const timestamp = new Date().toISOString();

// ✅ 3️⃣ 建立結果物件
const result = {
  status: 'success',
  message: \`👋 Hello \${studentName}! Processing \${courseName}\`,
  course: courseName,
  timestamp: timestamp,
  processed: true,
  processed_count: processedCount,
  from_javascript: true,
  runtime: 'Node.js 18+'
};

// 📋 4️⃣ 列印日誌
console.log('[JS] Result processed');
console.log(JSON.stringify(result, null, 2));

// 📤 5️⃣ 回傳結果 (自動合併入工作流程資料)
return result;`
                    }
                    : subtype === 'action_send_gmail'
                    ? {
                        to: '{{email_to}}',
                        subject: '【JV Tutor】{{email_course}} 報名確認通知',
                        body: `<p>親愛的 <strong>{{email_name}}</strong> 您好，</p>
<p>{{email_message}}</p>
<p>課程名稱：<strong>{{email_course}}</strong></p>
<p>如有任何問題，歡迎與我們聯繫。</p>
<p style="color:#6b7280;font-size:13px;margin-top:24px;">JV Tutor Corner 團隊 敬上</p>`
                    }
                    : subtype === 'action_line_reply'
                    ? { replyToken: '{{replyToken}}', message: '{{ai_output}}' }
                    : subtype === 'action_http_request'
                    ? { method: 'GET', url: 'https://api.example.com/endpoint', headers: '', body: '' }
                    : subtype === 'action_delay'
                    ? { milliseconds: 1000 }
                    : subtype === 'action_line_image_analyze'
                    ? { imageSource: 'line', messageIdField: '{{message.id}}', outputField: 'analysisResult' }
                    : subtype === 'action_set_variable'
                    ? { variables: [{ key: 'my_var', value: '{{ai_output}}' }] }
                    : subtype === 'action_notification_slack'
                    ? { channel: 'slack', message: 'Workflow notification: {{message}}', webhookUrl: '' }
                    : subtype === 'action_notification_line'
                    ? { channel: 'line', message: 'Workflow notification: {{message}}', userEmail: '{{email}}', title: 'Notification' }
                    : subtype === 'action_ai_summarize'
                    ? { userPrompt: 'Analyze this: {{data}}' }
                    : subtype === 'action_ai_supervisor'
                    ? { apiEndpoint: '/plan', subAgents: 'Weather, Planner, Advisor', instructions: '協調並整合天氣、景點與建議。' }
                    : subtype === 'action_ai_dispatch'
                    ? { queryField: '{{message.content}}', outputField: 'dispatchResult' }
                    : subtype === 'action_agent_execute'
                    ? { agentIdField: '{{dispatchResult.primary.id}}', inputField: '{{message.content}}', useSmartRouter: true, usePromptCache: true }
                    : subtype === 'action_ai_reflect'
                    ? { analyzeField: 'feedback', outputField: 'correction', useMemory: true }
                    : subtype === 'transform_markdown_html'
                    ? { sourceField: 'content', targetField: 'htmlContent' }
                    : subtype === 'logic_loop_items'
                    ? { itemsField: 'items', outputField: 'currentItem' }
                    : subtype === 'trigger_line_webhook'
                    ? { expectedPath: '/api/line/webhook', secret: '' }
                    : subtype === 'action_image_analysis'
                    ? { apiEndpoint: '/api/image-analysis', inputField: 'imageBase64', outputField: 'analysisResult' }
                    : subtype === 'action_context7_retrieval'
                    ? { query: '{{user_query}}', libraryId: '/mongodb/docs' }
                    : subtype === 'action_gmail_send'
                    ? {
                        to: '{{email_to}}',
                        subject: '【JV Tutor】{{email_course}} 報名確認通知',
                        body: `<p>親愛的 <strong>{{email_name}}</strong> 您好，</p>
<p>{{email_message}}</p>
<p>課程名稱：<strong>{{email_course}}</strong></p>
<p>如有任何問題，歡迎與我們聯繫。</p>
<p style="color:#6b7280;font-size:13px;margin-top:24px;">JV Tutor Corner 團隊 敬上</p>`
                    }
                    : subtype === 'action_send_resend'
                    ? {
                        to: '{{email_to}}',
                        subject: '【JV Tutor】{{email_course}} 報名確認通知',
                        body: `<p>親愛的 <strong>{{email_name}}</strong> 您好，</p>
<p>{{email_message}}</p>
<p>課程名稱：<strong>{{email_course}}</strong></p>
<p>如有任何問題，歡迎與我們聯繫。</p>
<p style="color:#6b7280;font-size:13px;margin-top:24px;">JV Tutor Corner 團隊 敬上</p>`
                    }
                    : subtype === 'action_qdrant_knowledge_base'
                    ? { title: 'New Document', content: 'Document content goes here' }
                    : subtype === 'action_figma_export'
                    ? { fileKey: '{{figmaFileKey}}', format: 'json' }
                    : subtype === 'action_import_file'
                    ? { fileName: '', fileType: 'json', fileContent: '' }
                    : subtype === 'action_export_file'
                    ? { format: 'json', fileName: 'export.json', dataField: '{{payloadData}}' }
                    : (type === 'trigger' || type === 'webhook' || type === 'input')
                    ? { testPayload: JSON.stringify({
                        message: { content: "我想了解課程與退款的問題", type: "text", text: "測試文字" },
                        user: { email: "test@example.com", name: "Tester" },
                        amount: 100,
                        status: "success"
                      }, null, 2) }
                    : {},
                // Map subtype back to the base action type if needed by notification node
                actionBaseType: subtype.startsWith('action_notification_') ? 'action_notification' : subtype
            },
        };
        setNodes((nds) => [...nds, newNode]);
    };

    const handleDeleteNode = useCallback(
        (nodeId: string) => {
            setNodes((nds) => nds.filter((node) => node.id !== nodeId));
            setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
            setSelectedNodeId(null);
        },
        [setNodes, setEdges]
    );

    const handleDeleteEdge = useCallback(
        (edgeId: string) => {
            setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
            setSelectedEdgeId(null);
        },
        [setEdges]
    );

    const selectedNode = nodes.find((n) => n.id === selectedNodeId);
    const selectedEdge = edges.find((e) => e.id === selectedEdgeId);

    return (
        <div className="flex h-[calc(100vh-100px)] w-full overflow-hidden border rounded-xl shadow-lg bg-white">
            {/* Canvas Area */}
            <div className="flex-1 flex flex-col h-full relative">
                {/* Toolbar */}
                <div className="p-3 border-b flex justify-between items-center bg-white z-10 w-full shadow-sm">
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            className="text-lg font-bold bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-blue-500 focus:outline-none focus:ring-0 px-1 py-0.5 w-56 transition-colors"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="工作流名稱"
                        />
                        <span className="text-xs text-gray-400">
                            {nodes.length} 個節點 · {edges.length} 條連線
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Live / Draft toggle */}
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold uppercase tracking-wider ${isActive ? 'text-green-600' : 'text-gray-400'}`}>
                                {isActive ? '● 已發佈' : '○ 草稿'}
                            </span>
                            <button
                                onClick={() => setIsActive(!isActive)}
                                className={`w-10 h-5 rounded-full relative transition-colors ${isActive ? 'bg-green-500' : 'bg-gray-300'}`}
                            >
                                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all shadow ${isActive ? 'right-1' : 'left-1'}`} />
                            </button>
                        </div>

                        <div className="h-6 w-px bg-gray-200" />

                        <NodePalette onAdd={addNode} open={paletteOpen} setOpen={setPaletteOpen} />
                        
                        {/* Help Guide Toggle */}
                        <div className="relative">
                            <button
                                onClick={() => setShowGuide(!showGuide)}
                                className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all ${showGuide ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                title="顯示幫助"
                            >
                                <span className="text-lg">❓</span>
                            </button>
                            
                            {showGuide && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowGuide(false)} />
                                    <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 p-4 transition-all animate-in fade-in zoom-in-95 duration-200">
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="font-bold text-blue-600 flex items-center gap-1.5 text-sm">
                                                <span>💡</span> 連線指南
                                            </div>
                                            <button onClick={() => setShowGuide(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                                        </div>
                                        <div className="space-y-3 text-xs text-gray-600">
                                            <div className="flex gap-3 items-start p-2 bg-blue-50/50 rounded-lg">
                                                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-0.5 border-2 border-white flex-shrink-0 shadow-sm" />
                                                <span>從節點<b>底部</b>的圓點拖曳至另一個節點<b>頂部</b>的圓點即可連線。</span>
                                            </div>
                                            <div className="flex gap-3 items-start p-2 bg-rose-50/50 rounded-lg">
                                                <div className="w-2.5 h-2.5 bg-red-500 mt-0.5 rounded-full flex-shrink-0 shadow-sm" />
                                                <span>邏輯節點具有 <b>TRUE/FALSE</b> 出口，可用於分支流程。</span>
                                            </div>
                                            <div className="pt-2 border-t border-gray-100 flex flex-col gap-2 uppercase tracking-tight font-semibold text-[10px] text-gray-400">
                                                <div className="flex justify-between">
                                                    <span>滾動 / 拖曳 (中鍵)</span>
                                                    <span>平移畫布</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Cmd + 滾動</span>
                                                    <span>縮放視圖</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>左鍵點選拖曳</span>
                                                    <span>選取方框</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Test Run Button */}
                        <button
                            onClick={runManualTest}
                            disabled={isExecuting || nodes.length === 0}
                            className={`px-4 py-2 rounded-lg border font-bold transition-all flex items-center gap-2 ${isExecuting ? 'bg-gray-100 text-gray-400' : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50'}`}
                        >
                            {isExecuting ? '執行中...' : '▶ 運行測試'}
                        </button>

                        <div className="h-6 w-px bg-gray-200" />
                        
                        {/* Save Button */}
                        <button
                            onClick={handleSave}
                            disabled={saveStatus === 'saving'}
                            className={`px-5 py-2 rounded-lg shadow-md font-bold transition-all active:scale-95 text-sm flex items-center gap-2
                                ${saveStatus === 'saved'
                                    ? 'bg-green-500 text-white'
                                    : saveStatus === 'saving'
                                    ? 'bg-gray-400 text-white cursor-wait'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                        >
                            {saveStatus === 'saved' ? '✓ 已儲存' : saveStatus === 'saving' ? '儲存中...' : '儲存並發佈'}
                        </button>
                    </div>
                </div>

                {/* React Flow Canvas */}
                <div className="flex-1 w-full h-full">
                    <ReactFlow
                        nodes={React.useMemo(() => nodes.map(n => ({
                            ...n,
                            data: {
                                ...n.data,
                                onSave: handleSave,
                                onDelete: handleDeleteNode
                            }
                        })), [nodes, handleSave, handleDeleteNode])}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onEdgeClick={onEdgeClick}
                        onPaneClick={onPaneClick}
                        nodeTypes={nodeTypes}
                        connectionLineType={ConnectionLineType.SmoothStep}
                        defaultEdgeOptions={{
                            type: 'smoothstep',
                            animated: true,
                            style: { stroke: '#6366f1', strokeWidth: 2 },
                        }}
                        fitView
                        fitViewOptions={{ padding: 0.4, maxZoom: 0.8 }}
                        className="bg-slate-50"
                        deleteKeyCode="Delete"
                        snapToGrid
                        snapGrid={[16, 16]}
                        minZoom={0.1}
                        maxZoom={2}
                        panOnScroll
                        selectionOnDrag
                        panOnDrag={[1, 2]} // Support middle and right click panning
                        nodeDragThreshold={5} // Prevent accidental micro-moves
                    >
                        <Controls showInteractive={false} />
                        <MiniMap
                            nodeStrokeWidth={3}
                            zoomable
                            pannable
                            className="rounded-lg shadow border"
                        />
                        <Background
                            color="#94a3b8"
                            gap={24}
                            variant={BackgroundVariant.Dots}
                            size={1}
                        />



                        {/* Empty state hint */}
                        {nodes.length === 0 && (
                            <Panel position="top-center">
                                <div className="mt-24 text-center bg-white/90 backdrop-blur border border-dashed border-gray-300 rounded-2xl px-12 py-10 shadow-sm text-gray-500">
                                    <div className="text-5xl mb-4 animate-bounce">🔧</div>
                                    <div className="font-extrabold text-xl text-gray-800 mb-2">構建您的自動化流程</div>
                                    <div className="text-sm max-w-xs mx-auto mb-6">透過新增並連線節點來建立強大的工作流。</div>
                                    <button 
                                        onClick={() => setPaletteOpen(true)}
                                        className="px-6 py-2.5 bg-blue-600 text-white rounded-full font-bold shadow-lg hover:bg-blue-700 transition-all hover:scale-105 active:scale-95"
                                    >
                                        + 新增您的第一個節點
                                    </button>
                                </div>
                            </Panel>
                        )}
                    </ReactFlow>
                </div>
            </div>

            {/* Config Sidebar */}
            {(selectedNodeId || selectedEdgeId) ? (
                <WorkflowConfigSidebar
                    selectedNode={selectedNode}
                    selectedEdge={selectedEdge}
                    setNodes={setNodes}
                    setEdges={setEdges}
                    onDelete={handleDeleteNode}
                    onEdgeDelete={handleDeleteEdge}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    executionTrails={executionTrails}
                />
            ) : executionTrails.length > 0 && (
                <div className="w-96 border-l bg-white flex flex-col h-full shadow-xl overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center justify-between bg-orange-50">
                        <span className="text-sm font-bold text-orange-700 flex items-center gap-2">▶ 執行結果</span>
                        <button onClick={() => setExecutionTrails([])} className="text-gray-400 hover:text-gray-600 text-xs">清除</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {/* ── Final Reply Banner ── 從最後一個有 _finalReply 的 log 中提取 */}
                        {(() => {
                            const allLogs = executionTrails.flatMap(t => t.logs || []);
                            const finalLog = [...allLogs].reverse().find((l: any) => l.output?._finalReply);
                            const finalReply = finalLog?.output?._finalReply as string | null;
                            if (!finalReply) return null;
                            return (
                                <div className="rounded-xl border-2 border-blue-400 bg-blue-50 p-4 space-y-2">
                                    <div className="text-[10px] font-bold text-blue-600 uppercase flex items-center gap-1.5">
                                        <span>🤖</span> 最終回覆（使用者看到的結果）
                                    </div>
                                    <div className="text-sm text-blue-900 whitespace-pre-wrap leading-relaxed font-medium">
                                        {finalReply}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* ── Per-node logs ── */}
                        {executionTrails.flatMap(t => t.logs || []).map((log: any, i: number) => {
                            const friendlyMsg = extractUserFriendlyMessage(log);
                            const color = getColorForSubtype(log.actionType);
                            const colorClasses = RESULT_COLOR_MAP[color] || { bg: 'bg-gray-50', border: 'border-gray-200', accent: 'text-gray-700' };
                            const nodeCardBg = log.status === 'error' ? 'bg-red-50 border-red-200' : log.status === 'success' ? `${colorClasses.bg} ${colorClasses.border}` : `${colorClasses.bg} ${colorClasses.border}`;
                            return (
                                <div key={i} className={`rounded-xl border p-3 text-xs space-y-2 ${nodeCardBg}`}>
                                    <div className="flex justify-between items-center font-semibold">
                                        <span>{log.nodeLabel || log.nodeId}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${log.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{log.status}</span>
                                    </div>
                                    {log.error && <div className="text-red-600 font-mono mt-1">{log.error}</div>}
                                    {friendlyMsg && friendlyMsg !== log.output?._finalReply && (
                                        <div className="bg-white bg-opacity-70 rounded p-2 border-l-2 border-blue-300 text-blue-900 break-words">
                                            <span className="text-[9px] text-gray-500 uppercase font-semibold block mb-1">💬 回覆摘要</span>
                                            <span>{friendlyMsg}</span>
                                        </div>
                                    )}
                                    {log.output && (
                                        <details className="mt-1">
                                            <summary className="cursor-pointer text-gray-500 hover:text-gray-700 text-[10px]">完整 JSON 輸出</summary>
                                            <pre className="mt-1 bg-gray-900 text-green-400 rounded p-2 text-[10px] overflow-auto max-h-40 whitespace-pre-wrap">{JSON.stringify(log.output, null, 2)}</pre>
                                        </details>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
    return (
        <ReactFlowProvider>
            <CanvasFlow {...props} />
        </ReactFlowProvider>
    );
}
