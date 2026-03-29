'use client';

import React, { useState, useCallback, useRef } from 'react';
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
            { icon: '⏱️', name: '等待 / 延遲', type: 'delay', subtype: 'action_delay' },
            { icon: '🔄', name: '迴圈疊代器', type: 'logic', subtype: 'logic_loop' },
            { icon: '🔁', name: '遍歷項目', type: 'logic', subtype: 'logic_loop_items' },
        ],
    },
    {
        label: '處理器',
        color: 'rose',
        items: [
            { icon: '👑', name: '主管代理', type: 'ai', subtype: 'action_ai_supervisor' },
            { icon: '🧭', name: '代理派遣器', type: 'ai', subtype: 'action_ai_dispatch' },
            { icon: '🤖', name: '執行代理', type: 'ai', subtype: 'action_agent_execute' },
            { icon: '🧐', name: '反思代理', type: 'ai', subtype: 'action_ai_reflect' },
            { icon: '✨', name: '通用 AI', type: 'ai', subtype: 'action_ai_summarize' },
            { icon: '📝', name: 'Markdown 轉 HTML', type: 'transform', subtype: 'transform_markdown_html' },
            { icon: '🐍', name: 'Python 腳本', type: 'python', subtype: 'action_python_script' },
            { icon: '📜', name: 'JavaScript 腳本', type: 'action', subtype: 'action_js_script' },
            { icon: '🌐', name: 'HTTP 請求', type: 'http', subtype: 'action_http_request' },
            { icon: '⚙️', name: '提取 / 轉換', type: 'transform', subtype: 'action_data_transform' },
            { icon: '🔍', name: '影像分析 (藥物辨識)', type: 'action', subtype: 'action_image_analysis' },
        ],
    },
    {
        label: '執行動作',
        color: 'blue',
        items: [
            { icon: '📧', name: '發送電子郵件', type: 'action', subtype: 'action_send_email' },
            { icon: '📩', name: 'Gmail', type: 'action', subtype: 'action_send_gmail' },
            { icon: '💬', name: 'Slack 通知', type: 'notification', subtype: 'action_notification_slack' },
            { icon: '🟢', name: 'LINE 訊息', type: 'notification', subtype: 'action_notification_line' },
            { icon: '💎', name: '贈送點數', type: 'action', subtype: 'action_grant_points' },
            { icon: '📄', name: '匯出為 CSV', type: 'export', subtype: 'action_export_csv' },
        ],
    },
    {
        label: '數據輸入/輸出',
        color: 'indigo',
        items: [
            { icon: '📥', name: '工作流輸入', type: 'input', subtype: 'input_workflow' },
            { icon: '📤', name: '工作流輸出', type: 'output', subtype: 'output_workflow' },
        ],
    },
];

const COLOR_MAP: Record<string, string> = {
    green: 'hover:bg-green-50 hover:border-green-500',
    orange: 'hover:bg-orange-50 hover:border-orange-500',
    rose: 'hover:bg-rose-50 hover:border-rose-500',
    blue: 'hover:bg-blue-50 hover:border-blue-500',
    indigo: 'hover:bg-indigo-50 hover:border-indigo-500',
};

function NodePalette({ onAdd }: { onAdd: (type: string, subtype: string) => void }) {
    const [open, setOpen] = useState(false);
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
                onClick={() => setOpen((v) => !v)}
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
                config: subtype === 'action_python_script'
                    ? { script: '# Access data using the "data" variable\nname = data.get("student_name", "Explorer")\nprint(f"👋 Hello {name} from Python!")\ndata["result"] = "Ready to process!"' }
                    : subtype === 'action_js_script'
                    ? { script: '// data is the current workflow payload\n// return an object to merge it into data\ndata.timestamp = Date.now();\nreturn { processed: true };' }
                    : subtype === 'action_send_gmail'
                    ? { subject: 'Automated Message', body: 'Hello,\n\nThis is an automated message from JV Tutor Workflow.' }
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

                        <NodePalette onAdd={addNode} />
                        
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
                                        onClick={() => (document.querySelector('button[onClick*="setOpen"]') as HTMLButtonElement | null)?.click()}
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
            {(selectedNodeId || selectedEdgeId) && (
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
