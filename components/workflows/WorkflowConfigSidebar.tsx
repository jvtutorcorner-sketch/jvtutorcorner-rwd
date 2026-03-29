'use client';

import React from 'react';

interface SidebarProps {
    selectedNode?: any;
    selectedEdge?: any;
    setNodes: any;
    setEdges?: any;
    onDelete?: (id: string) => void;
    onEdgeDelete?: (id: string) => void;
    activeTab?: 'config' | 'debug';
    setActiveTab?: (tab: 'config' | 'debug') => void;
    executionTrails?: any[];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
            {children}
        </div>
    );
}

const inputClass = 'w-full border rounded-lg p-2 text-sm shadow-sm focus:ring-2 focus:ring-blue-400 outline-none transition';
const textareaClass = `${inputClass} font-mono resize-y`;
const selectClass = `${inputClass} bg-white`;

export function WorkflowConfigSidebar({ 
    selectedNode, 
    selectedEdge,
    setNodes, 
    setEdges,
    onDelete, 
    onEdgeDelete,
    activeTab = 'config', 
    setActiveTab, 
    executionTrails = [] 
}: SidebarProps) {
    if (!selectedNode && !selectedEdge) {
        return (
            <div className="w-96 border-l bg-gray-50 flex flex-col p-6 text-gray-400 items-center justify-center gap-2">
                <div className="text-3xl">🖱️</div>
                <div className="text-sm font-medium">選取節點或連線以進行配置</div>
            </div>
        );
    }

    const handleUpdate = (updates: any) => {
        setNodes((nds: any[]) =>
            nds.map((n) => {
                if (n.id === selectedNode.id) {
                    return { ...n, data: { ...n.data, ...updates } };
                }
                return n;
            })
        );
    };

    const handleConfigUpdate = (configUpdates: any) => {
        handleUpdate({ config: { ...selectedNode.data?.config, ...configUpdates } });
    };

    const nodeTypeLabel: Record<string, string> = {
        trigger: '⚡ 觸發器設定',
        webhook: '🔗 Webhook 設定',
        action: '⚙️ 動作設定',
        logic: '🔀 邏輯設定',
        ai: '✨ AI 設定',
        python: '🐍 Python 設定',
        export: '📄 匯出設定',
        http: '🌐 HTTP 請求設定',
        delay: '⏱️ 延遲設定',
        notification: '🔔 通知設定',
        transform: '⚙️ 轉換設定',
        input: '📥 輸入設定',
        output: '📤 輸出設定',
    };

    // Find logs for this specific node
    const nodeLogs = selectedNode ? executionTrails.flatMap(t => t.logs || []).filter(l => l.nodeId === selectedNode.id) : [];

    return (
        <div className="w-96 border-l bg-white flex flex-col h-full shadow-xl">
            {/* Tab Header */}
            <div className="flex border-b text-[10px] font-bold uppercase tracking-wider">
                <button
                    onClick={() => setActiveTab?.('config')}
                    className={`flex-1 py-3 text-center transition-colors ${activeTab === 'config' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'bg-gray-50 text-gray-400 hover:text-gray-600'}`}
                >
                    節點配置
                </button>
                <button
                    onClick={() => setActiveTab?.('debug')}
                    className={`flex-1 py-3 text-center transition-colors ${activeTab === 'debug' ? 'bg-white text-orange-600 border-b-2 border-orange-600' : 'bg-gray-50 text-gray-400 hover:text-gray-600'}`}
                >
                    主控台 {nodeLogs.length > 0 && `(${nodeLogs.length})`}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {activeTab === 'config' ? (
                    <div className="p-4 space-y-5">
                        {/* Edge Configuration */}
                        {selectedEdge && (
                            <div className="space-y-4">
                                <div className="pb-4 border-b font-bold text-gray-800 flex items-center gap-2 text-sm">
                                    <span>🔗</span> 連線設定
                                </div>
                                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-400 font-medium">來源節點 ID</span>
                                        <span className="font-mono bg-white px-2 py-0.5 rounded border shadow-sm">{selectedEdge.source}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-400 font-medium">目標節點 ID</span>
                                        <span className="font-mono bg-white px-2 py-0.5 rounded border shadow-sm">{selectedEdge.target}</span>
                                    </div>
                                    {selectedEdge.sourceHandle && (
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-400 font-medium">來源接口</span>
                                            <span className="font-mono bg-white px-2 py-0.5 rounded border shadow-sm uppercase">{selectedEdge.sourceHandle}</span>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2">
                                    <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">運作原理</div>
                                    <p className="text-[11px] text-blue-800 leading-relaxed">
                                        此連線將數據從來源節點的輸出傳輸至目標節點的輸入。
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Node Configuration */}
                        {selectedNode && (
                            <div className="space-y-5">
                                <div className="pb-4 border-b font-bold text-gray-800 flex items-center gap-2 text-sm">
                                    {nodeTypeLabel[selectedNode.type] || '⚙️ 節點設定'}
                                </div>

                                {/* Common fields */}
                                <div className="space-y-3">
                                    <Field label="標籤">
                                        <input
                                            type="text"
                                            className={inputClass}
                                            value={selectedNode.data?.label || ''}
                                            onChange={(e) => handleUpdate({ label: e.target.value })}
                                        />
                                    </Field>
                                    <Field label="描述">
                                        <textarea
                                            className={textareaClass}
                                            rows={2}
                                            value={selectedNode.data?.description || ''}
                                            onChange={(e) => handleUpdate({ description: e.target.value })}
                                        />
                                    </Field>
                                </div>

                                {/* ── Webhook Trigger ── */}
                                {selectedNode.type === 'webhook' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-emerald-600">Webhook 配置</h3>
                                        <Field label="端點路徑">
                                            <div className="flex items-center border rounded-lg overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-emerald-400">
                                                <span className="px-2 bg-gray-100 text-gray-500 text-xs border-r py-2 font-mono">/api/wh/</span>
                                                <input
                                                    type="text"
                                                    className="flex-1 p-2 text-sm outline-none font-mono"
                                                    value={selectedNode.data?.config?.endpoint || ''}
                                                    onChange={(e) => handleConfigUpdate({ endpoint: e.target.value })}
                                                    placeholder="my-endpoint"
                                                />
                                            </div>
                                        </Field>
                                    </div>
                                )}

                                {/* ── Trigger / Webhook / Input Common Test Payload ── */}
                                {(selectedNode.type === 'trigger' || selectedNode.type === 'webhook' || selectedNode.type === 'input') && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-amber-600 flex items-center gap-2">
                                            <span>🎯</span> 測試負載 (JSON)
                                        </h3>
                                        <Field label="用於手動測試的輸入 JSON">
                                            <textarea
                                                className={`${textareaClass} bg-slate-900 text-emerald-400 border-gray-700 text-[10px] h-64 leading-normal`}
                                                value={selectedNode.data?.config?.testPayload || ''}
                                                onChange={(e) => handleConfigUpdate({ testPayload: e.target.value })}
                                                placeholder={'{\n  "message": {\n    "content": "Hello world"\n  },\n  "user": {\n    "email": "test@example.com"\n  }\n}'}
                                            />
                                        </Field>
                                        <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100/50">
                                            <p className="text-[10px] text-amber-700 italic leading-relaxed">
                                                在執行「手動測試」時，此 JSON 數據將作為初始狀態。可用於模擬來自真實觸發器的傳入數據。
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* ── Email Action ── */}
                                {selectedNode.data?.actionType === 'action_send_gmail' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-blue-600">Gmail 設定</h3>
                                        <Field label="收件者電子郵件">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.to || ''}
                                                onChange={(e) => handleConfigUpdate({ to: e.target.value })}
                                                placeholder="{{email}}"
                                            />
                                        </Field>
                                        <Field label="主旨">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.subject || ''}
                                                onChange={(e) => handleConfigUpdate({ subject: e.target.value })}
                                            />
                                        </Field>
                                        <Field label="內容">
                                            <textarea
                                                className={textareaClass}
                                                rows={6}
                                                value={selectedNode.data?.config?.body || ''}
                                                onChange={(e) => handleConfigUpdate({ body: e.target.value })}
                                            />
                                        </Field>
                                    </div>
                                )}

                                {/* ── JavaScript Script ── */}
                                {selectedNode.data?.actionType === 'action_js_script' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-blue-500">📜 JavaScript 腳本</h3>
                                        <Field label="腳本">
                                            <textarea
                                                className={`${textareaClass} bg-gray-900 text-blue-300 border-gray-700 text-xs`}
                                                rows={12}
                                                value={selectedNode.data?.config?.script || ''}
                                                onChange={(e) => handleConfigUpdate({ script: e.target.value })}
                                            />
                                        </Field>
                                    </div>
                                )}

                                {/* ── HTTP Request ── */}
                                {selectedNode.data?.actionType === 'action_http_request' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-sky-600">🌐 HTTP 請求</h3>
                                        <Field label="URL">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.url || ''}
                                                onChange={(e) => handleConfigUpdate({ url: e.target.value })}
                                            />
                                        </Field>
                                    </div>
                                )}
                                
                                {/* ── If/Else Logic ── */}
                                {selectedNode.type === 'logic' && (!selectedNode.data?.actionType || selectedNode.data.actionType === 'logic_condition') && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-orange-600">條件設定</h3>
                                        <Field label="檢查變數">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.variable || ''}
                                                onChange={(e) => handleConfigUpdate({ variable: e.target.value })}
                                                placeholder="{{amount}}"
                                            />
                                        </Field>
                                        <Field label="運算子">
                                            <select
                                                className={selectClass}
                                                value={selectedNode.data?.config?.operator || 'equals'}
                                                onChange={(e) => handleConfigUpdate({ operator: e.target.value })}
                                            >
                                                <option value="equals">= 等於 (Equals)</option>
                                                <option value="greater_than">&gt; 大於 (Greater Than)</option>
                                                <option value="less_than">&lt; 小於 (Less Than)</option>
                                                <option value="contains">包含 (Contains)</option>
                                            </select>
                                        </Field>
                                        <Field label="比較值">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.value || ''}
                                                onChange={(e) => handleConfigUpdate({ value: e.target.value })}
                                            />
                                        </Field>
                                    </div>
                                )}

                                {/* ── Loop Over Items ── */}
                                {selectedNode.type === 'logic' && selectedNode.data?.actionType === 'logic_loop_items' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-orange-600">迴圈項目設定</h3>
                                        <Field label="項目變數路徑">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.itemsField || ''}
                                                onChange={(e) => handleConfigUpdate({ itemsField: e.target.value })}
                                                placeholder="items"
                                            />
                                        </Field>
                                        <Field label="輸出變數名稱">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.outputField || ''}
                                                onChange={(e) => handleConfigUpdate({ outputField: e.target.value })}
                                                placeholder="currentItem"
                                            />
                                        </Field>
                                    </div>
                                )}

                                {/* ── Supervisor Agent ── */}
                                {selectedNode.data?.actionType === 'action_ai_supervisor' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-purple-600">主管代理設定</h3>
                                        <Field label="FastAPI 端點">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.apiEndpoint || ''}
                                                onChange={(e) => handleConfigUpdate({ apiEndpoint: e.target.value })}
                                                placeholder="/plan"
                                            />
                                        </Field>
                                        <Field label="次級代理 (Sub-Agents)">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.subAgents || ''}
                                                onChange={(e) => handleConfigUpdate({ subAgents: e.target.value })}
                                                placeholder="Weather, Planner, Advisor"
                                            />
                                        </Field>
                                        <Field label="指令 (Instructions)">
                                            <textarea
                                                className={textareaClass}
                                                rows={3}
                                                value={selectedNode.data?.config?.instructions || ''}
                                                onChange={(e) => handleConfigUpdate({ instructions: e.target.value })}
                                                placeholder="協調天氣、景點與建議。"
                                            />
                                        </Field>
                                    </div>
                                )}

                                {/* ── Agent Dispatcher ── */}
                                {selectedNode.data?.actionType === 'action_ai_dispatch' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-purple-600">代理派遣器設定</h3>
                                        <Field label="查詢變數路徑">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.queryField || ''}
                                                onChange={(e) => handleConfigUpdate({ queryField: e.target.value })}
                                                placeholder="{{message.content}}"
                                            />
                                        </Field>
                                        <Field label="輸出結果名稱">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.outputField || ''}
                                                onChange={(e) => handleConfigUpdate({ outputField: e.target.value })}
                                                placeholder="dispatchResult"
                                            />
                                        </Field>
                                    </div>
                                )}

                                {/* ── Execute Agent ── */}
                                {selectedNode.data?.actionType === 'action_agent_execute' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-purple-600">執行平台代理設定</h3>
                                        <Field label="代理 ID 變數路徑">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.agentIdField || ''}
                                                onChange={(e) => handleConfigUpdate({ agentIdField: e.target.value })}
                                                placeholder="{{dispatchResult.primary.id}}"
                                            />
                                        </Field>
                                        <Field label="輸入查詢變數路徑">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.inputField || ''}
                                                onChange={(e) => handleConfigUpdate({ inputField: e.target.value })}
                                                placeholder="{{message.content}}"
                                            />
                                        </Field>
                                        <div className="flex flex-col gap-2 mt-4 pt-2 border-t border-dashed">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    id="useSmartRouter"
                                                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                                                    checked={!!selectedNode.data?.config?.useSmartRouter}
                                                    onChange={(e) => handleConfigUpdate({ useSmartRouter: e.target.checked })}
                                                />
                                                <label htmlFor="useSmartRouter" className="text-sm font-semibold text-gray-700 cursor-pointer">
                                                    使用智慧模型路由
                                                </label>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    id="usePromptCache"
                                                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                                                    checked={!!selectedNode.data?.config?.usePromptCache}
                                                    onChange={(e) => handleConfigUpdate({ usePromptCache: e.target.checked })}
                                                />
                                                <label htmlFor="usePromptCache" className="text-sm font-semibold text-gray-700 cursor-pointer">
                                                    使用 Prompt 快取優化
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── Reflect Agent ── */}
                                {selectedNode.data?.actionType === 'action_ai_reflect' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-purple-600">反思代理設定</h3>
                                        <Field label="分析欄位">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.analyzeField || ''}
                                                onChange={(e) => handleConfigUpdate({ analyzeField: e.target.value })}
                                                placeholder="feedback"
                                            />
                                        </Field>
                                        <Field label="輸出欄位名稱">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.outputField || ''}
                                                onChange={(e) => handleConfigUpdate({ outputField: e.target.value })}
                                                placeholder="correction"
                                            />
                                        </Field>
                                        <div className="flex items-center gap-2 mt-4 pt-2 border-t border-dashed">
                                            <input
                                                type="checkbox"
                                                id="useMemory"
                                                className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                                                checked={!!selectedNode.data?.config?.useMemory}
                                                onChange={(e) => handleConfigUpdate({ useMemory: e.target.checked })}
                                            />
                                            <label htmlFor="useMemory" className="text-sm font-semibold text-gray-700 cursor-pointer">
                                                使用記憶 (存入反思)
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {/* ── Markdown to HTML ── */}
                                {selectedNode.data?.actionType === 'transform_markdown_html' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-rose-600">Markdown 轉 HTML 設定</h3>
                                        <Field label="來源欄位 (Markdown)">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.sourceField || ''}
                                                onChange={(e) => handleConfigUpdate({ sourceField: e.target.value })}
                                                placeholder="content"
                                            />
                                        </Field>
                                        <Field label="目標欄位 (HTML)">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.targetField || ''}
                                                onChange={(e) => handleConfigUpdate({ targetField: e.target.value })}
                                                placeholder="htmlContent"
                                            />
                                        </Field>
                                    </div>
                                )}

                                {/* ── Notifications ── */}
                                {selectedNode.type === 'notification' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-violet-600">
                                            {selectedNode.data?.config?.channel === 'line' ? '🟢 LINE Push' : '💬 Slack Notification'}
                                        </h3>
                                        {selectedNode.data?.config?.channel === 'line' && (
                                            <>
                                                <Field label="收件者電子郵件">
                                                    <input
                                                        type="text"
                                                        className={inputClass}
                                                        value={selectedNode.data?.config?.userEmail || ''}
                                                        onChange={(e) => handleConfigUpdate({ userEmail: e.target.value })}
                                                        placeholder="{{email}}"
                                                    />
                                                </Field>
                                                <Field label="訊息標題">
                                                    <input
                                                        type="text"
                                                        className={inputClass}
                                                        value={selectedNode.data?.config?.title || ''}
                                                        onChange={(e) => handleConfigUpdate({ title: e.target.value })}
                                                        placeholder="Important Notification"
                                                    />
                                                </Field>
                                            </>
                                        )}
                                        <Field label="訊息範本">
                                            <textarea
                                                className={textareaClass}
                                                rows={4}
                                                value={selectedNode.data?.config?.message || ''}
                                                onChange={(e) => handleConfigUpdate({ message: e.target.value })}
                                                placeholder="Hello! The status is {{status}}."
                                            />
                                        </Field>
                                        {selectedNode.data?.config?.channel !== 'line' && (
                                            <Field label={selectedNode.data?.config?.channel === 'slack' ? 'Webhook URL' : 'Endpoint URL'}>
                                                <input
                                                    type="text"
                                                    className={inputClass}
                                                    value={selectedNode.data?.config?.webhookUrl || ''}
                                                    onChange={(e) => handleConfigUpdate({ webhookUrl: e.target.value })}
                                                    placeholder={selectedNode.data?.config?.channel === 'slack' ? 'https://hooks.slack.com/services/...' : ''}
                                                />
                                            </Field>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ... (More blocks can be added as needed) ... */}
                    </div>
                ) : (
                    <div className="p-4 space-y-4">
                        <h3 className="font-bold text-sm text-orange-600 flex items-center gap-2 uppercase tracking-tight">
                            <span>📟</span> 主控台
                        </h3>
                        
                        {nodeLogs.length === 0 ? (
                            <div className="bg-gray-50 border border-dashed rounded-xl p-10 text-center flex flex-col items-center gap-3">
                                <div className="text-3xl grayscale opacity-50">📤</div>
                                <div className="text-[11px] text-gray-400 font-medium max-w-[180px]">此節點尚無日誌。請執行測試以擷取數據流。</div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {nodeLogs.map((log, i) => (
                                    <div key={i} className="border rounded-xl overflow-hidden bg-white shadow-sm ring-1 ring-gray-100 transition-all hover:shadow-md">
                                        <div className={`px-3 py-2 text-[10px] font-extrabold flex justify-between items-center border-b ${
                                            log.status === 'success' ? 'bg-green-50 text-green-700 border-green-100' : 
                                            log.status === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100'
                                        }`}>
                                            <div className="flex items-center gap-1.5">
                                                <div className={`w-1.5 h-1.5 rounded-full ${
                                                    log.status === 'success' ? 'bg-green-500' : 
                                                    log.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
                                                }`} />
                                                {log.status.toUpperCase()}
                                            </div>
                                            <span className="font-mono opacity-60">{new Date(log.time).toLocaleTimeString()}</span>
                                        </div>
                                        <div className="p-3 space-y-3">
                                            {log.payload && (
                                                <div>
                                                    <div className="text-[9px] text-gray-400 font-bold mb-1.5 flex items-center gap-1">
                                                        <span>📥</span> 輸入負載 (INPUT PAYLOAD)
                                                    </div>
                                                    <pre className="text-[10px] bg-slate-900 text-green-400 p-2.5 rounded-lg max-h-40 overflow-auto font-mono custom-scrollbar">
                                                        {JSON.stringify(log.payload, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                            {log.output && (
                                                <div>
                                                    <div className="text-[9px] text-gray-400 font-bold mb-1.5 flex items-center gap-1">
                                                        <span>📤</span> 輸出結果 (OUTPUT)
                                                    </div>
                                                    <pre className="text-[10px] bg-slate-900 text-blue-400 p-2.5 rounded-lg max-h-40 overflow-auto font-mono custom-scrollbar">
                                                        {JSON.stringify(log.output, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                            {log.error && (
                                                <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-[10px] text-red-700 font-mono leading-relaxed">
                                                    <div className="font-bold flex items-center gap-1 mb-1">
                                                        <span>❌</span> 錯誤:
                                                    </div>
                                                    {log.error}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-gray-50/50 backdrop-blur-sm">
                {selectedNode && (
                    <button
                        onClick={() => {
                            if (confirm('確定要刪除此節點嗎？相關的連線也將一併被刪除。')) {
                                if (onDelete) {
                                    onDelete(selectedNode.id);
                                } else {
                                    setNodes((nds: any[]) => nds.filter((n: any) => n.id !== selectedNode.id));
                                }
                            }
                        }}
                        className="w-full py-2.5 bg-white text-rose-500 border border-rose-100 rounded-xl hover:bg-rose-50 transition-all font-bold flex items-center justify-center gap-2 text-xs shadow-sm active:scale-95"
                    >
                        <span>🗑️</span> 刪除節點
                    </button>
                )}
                {selectedEdge && (
                    <button
                        onClick={() => {
                            if (confirm('確定要刪除此連線嗎？')) {
                                if (onEdgeDelete) {
                                    onEdgeDelete(selectedEdge.id);
                                } else if (setEdges) {
                                    setEdges((eds: any[]) => eds.filter((e: any) => e.id !== selectedEdge.id));
                                }
                            }
                        }}
                        className="w-full py-2.5 bg-white text-rose-500 border border-rose-100 rounded-xl hover:bg-rose-50 transition-all font-bold flex items-center justify-center gap-2 text-xs shadow-sm active:scale-95"
                    >
                        <span>🔗</span> 刪除連線
                    </button>
                )}
            </div>
        </div>
    );
}
