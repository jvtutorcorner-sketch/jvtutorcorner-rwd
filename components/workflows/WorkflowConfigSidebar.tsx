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

/**
 * 從節點輸出中提取用戶友好的摘要消息
 * 保留完整 JSON，但優先顯示最相關的文本內容
 */
function extractUserFriendlyMessage(output: any): string | null {
    if (!output) return null;
    
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
        javascript: '📜 JavaScript 設定',
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

                                {/* ── Python Script ── */}
                                {selectedNode.data?.actionType === 'action_python_script' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-green-600">🐍 Python 腳本</h3>
                                        
                                        {/* 版本信息提示 */}
                                        <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-700">
                                            <p className="font-semibold mb-1">✅ 版本: Python 3.9-3.12</p>
                                            <ul className="list-disc list-inside space-y-1 text-green-600">
                                                <li>超時: 30000ms (可調整)</li>
                                                <li>記憶體: 512MB - 3GB (Lambda)</li>
                                                <li>支援: NumPy, Pandas, 異步等</li>
                                                <li>返回結果自動合併入資料</li>
                                            </ul>
                                        </div>

                                        <Field label="腳本">
                                            <textarea
                                                className={`${textareaClass} bg-gray-900 text-green-300 border-gray-700 text-xs`}
                                                rows={15}
                                                placeholder="# data 變數包含工作流程資料&#10;# 使用 print() 輸出日誌&#10;# 使用 return 回傳結果"
                                                value={selectedNode.data?.config?.script || ''}
                                                onChange={(e) => handleConfigUpdate({ script: e.target.value })}
                                            />
                                        </Field>
                                    </div>
                                )}

                                {/* ── JavaScript Script ── */}
                                {selectedNode.data?.actionType === 'action_js_script' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-blue-500">📜 JavaScript 腳本</h3>
                                        
                                        {/* 版本信息提示 */}
                                        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-700">
                                            <p className="font-semibold mb-1">✅ 版本: Node.js 18+</p>
                                            <ul className="list-disc list-inside space-y-1 text-blue-600">
                                                <li>超時: 3000ms (可設定)</li>
                                                <li>記憶體: 128MB</li>
                                                <li>支援: async/await, JSON, 標準庫</li>
                                                <li>返回結果自動合併入資料</li>
                                            </ul>
                                        </div>

                                        <Field label="腳本">
                                            <textarea
                                                className={`${textareaClass} bg-gray-900 text-blue-300 border-gray-700 text-xs`}
                                                rows={15}
                                                placeholder="// return 物件自動合併入工作流程資料&#10;// 範例: return { processed: true };"
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
                                        <Field label="HTTP 方法">
                                            <select
                                                className={selectClass}
                                                value={selectedNode.data?.config?.method || 'GET'}
                                                onChange={(e) => handleConfigUpdate({ method: e.target.value })}
                                            >
                                                <option value="GET">GET</option>
                                                <option value="POST">POST</option>
                                                <option value="PUT">PUT</option>
                                                <option value="DELETE">DELETE</option>
                                                <option value="PATCH">PATCH</option>
                                            </select>
                                        </Field>
                                        <Field label="URL">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.url || ''}
                                                onChange={(e) => handleConfigUpdate({ url: e.target.value })}
                                                placeholder="https://api.example.com/endpoint"
                                            />
                                        </Field>
                                        <Field label="請求標頭 (Headers JSON)">
                                            <textarea
                                                className={textareaClass}
                                                rows={3}
                                                value={selectedNode.data?.config?.headers || ''}
                                                onChange={(e) => handleConfigUpdate({ headers: e.target.value })}
                                                placeholder='{"Authorization": "Bearer {{token}}"}'
                                            />
                                        </Field>
                                        <Field label="請求體 (Body JSON)">
                                            <textarea
                                                className={textareaClass}
                                                rows={3}
                                                value={selectedNode.data?.config?.body || ''}
                                                onChange={(e) => handleConfigUpdate({ body: e.target.value })}
                                                placeholder='{"key": "{{value}}"}'
                                            />
                                        </Field>
                                    </div>
                                )}
                                
                                {/* ── Delay ── */}
                                {selectedNode.type === 'delay' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-amber-600">⏱️ 延遲</h3>
                                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-700">
                                            暫停工作流執行指定的時間（以毫秒為單位）。
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 mb-1">延遲時間 (毫秒)</label>
                                            <input
                                                type="number"
                                                className={inputClass}
                                                min="0"
                                                value={selectedNode.data?.config?.milliseconds || 1000}
                                                onChange={(e) => handleConfigUpdate({ milliseconds: parseInt(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <div className="p-2 bg-gray-50 rounded border text-[10px] text-gray-600 font-medium">
                                            延遲時間：<strong>{selectedNode.data?.config?.milliseconds || 1000} ms</strong>
                                        </div>
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
                                        <div className="p-2.5 bg-orange-50 border border-orange-200 rounded-lg text-[10px] text-orange-700">
                                            遍歷陣列或物件中的每個項目，並在迴圈內執行後續節點。
                                        </div>
                                        <Field label="來源陣列欄位">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.itemsField || ''}
                                                onChange={(e) => handleConfigUpdate({ itemsField: e.target.value })}
                                                placeholder="{{items}}"
                                            />
                                        </Field>
                                        <Field label="迴圈變數名稱">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.outputField || ''}
                                                onChange={(e) => handleConfigUpdate({ outputField: e.target.value })}
                                                placeholder="currentItem"
                                            />
                                        </Field>
                                        <Field label="索引變數名稱 (可選)">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.indexField || ''}
                                                onChange={(e) => handleConfigUpdate({ indexField: e.target.value })}
                                                placeholder="currentIndex"
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

                                {/* ── Set Variable ── */}
                                {selectedNode.data?.actionType === 'action_set_variable' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-orange-600">📦 Variable</h3>
                                        <div className="p-2.5 bg-orange-50 border border-orange-200 rounded-lg text-[10px] text-orange-700">
                                            在此設定一個或多個變數，後續節點可透過 <code>{'{{變數名稱}}'}</code> 取用。值可使用模板語法，例如 <code>{'{{ai_output}}'}</code>。
                                        </div>
                                        {(selectedNode.data?.config?.variables || [{ key: '', value: '' }]).map((v: { key: string; value: string }, idx: number) => (
                                            <div key={idx} className="flex items-start gap-2">
                                                <div className="flex-1">
                                                    <input
                                                        type="text"
                                                        className={inputClass + ' text-xs'}
                                                        placeholder="變數名稱"
                                                        value={v.key || ''}
                                                        onChange={(e) => {
                                                            const vars = [...(selectedNode.data?.config?.variables || [])];
                                                            vars[idx] = { ...vars[idx], key: e.target.value };
                                                            handleConfigUpdate({ variables: vars });
                                                        }}
                                                    />
                                                </div>
                                                <div className="flex-[2]">
                                                    <input
                                                        type="text"
                                                        className={inputClass + ' text-xs font-mono'}
                                                        placeholder="值（支援 {{template}}）"
                                                        value={v.value || ''}
                                                        onChange={(e) => {
                                                            const vars = [...(selectedNode.data?.config?.variables || [])];
                                                            vars[idx] = { ...vars[idx], value: e.target.value };
                                                            handleConfigUpdate({ variables: vars });
                                                        }}
                                                    />
                                                </div>
                                                <button
                                                    className="mt-1 text-gray-400 hover:text-red-500 text-sm"
                                                    onClick={() => {
                                                        const vars = (selectedNode.data?.config?.variables || []).filter((_: any, i: number) => i !== idx);
                                                        handleConfigUpdate({ variables: vars });
                                                    }}
                                                >✕</button>
                                            </div>
                                        ))}
                                        <button
                                            className="text-xs text-orange-600 font-semibold hover:underline"
                                            onClick={() => {
                                                const vars = [...(selectedNode.data?.config?.variables || []), { key: '', value: '' }];
                                                handleConfigUpdate({ variables: vars });
                                            }}
                                        >+ 新增變數</button>
                                    </div>
                                )}

                                {/* ── AI Summarize (uses /apps active AI service — no hardcoded model) ── */}
                                {selectedNode.data?.actionType === 'action_ai_summarize' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-purple-600">✨ AI 文字回覆</h3>
                                        <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-[10px] text-purple-700">
                                            自動使用 <strong>/apps</strong> 中已啟用的 AI 服務（GEMINI / OPENAI / ANTHROPIC）與其設定的模型，不需手動填寫模型名稱。
                                        </div>
                                        <Field label="提示詞 (Prompt)">
                                            <textarea
                                                className={textareaClass}
                                                rows={4}
                                                value={selectedNode.data?.config?.userPrompt || selectedNode.data?.config?.prompt || ''}
                                                onChange={(e) => handleConfigUpdate({ userPrompt: e.target.value })}
                                                placeholder="{{message.content}}"
                                            />
                                        </Field>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="aiSumSmartRouter"
                                                className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                                                checked={!!selectedNode.data?.config?.useSmartRouter}
                                                onChange={(e) => handleConfigUpdate({ useSmartRouter: e.target.checked })}
                                            />
                                            <label htmlFor="aiSumSmartRouter" className="text-sm font-semibold text-gray-700 cursor-pointer">
                                                使用智慧模型路由
                                            </label>
                                        </div>
                                        <div className="p-2 bg-gray-50 rounded border text-[10px] text-gray-500">
                                            輸出結果存入 <code>{'{{ai_output}}'}</code>
                                        </div>
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
                                            {selectedNode.data?.config?.channel === 'line' ? '🟢 LINE Push (主動推播)' : '💬 Slack Notification'}
                                        </h3>
                                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-700">
                                            ⚠️ 此節點使用 LINE <strong>Push API</strong>，需要提前查詢用戶的 LINE UID。<br/>
                                            若要回覆 Webhook 訊息，請使用「↩️ LINE 回覆 (replyToken)」節點。
                                        </div>
                                        {selectedNode.data?.config?.channel === 'line' && (
                                            <>
                                                <Field label="收件者電子郵件 (查詢 LINE UID 用)">
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

                                {/* ── LINE Reply (replyToken — correct for webhook chatbot) ── */}
                                {selectedNode.data?.actionType === 'action_line_reply' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-green-600">↩️ LINE 回覆 (Reply API)</h3>
                                        <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-[10px] text-green-700">
                                            使用 LINE <strong>Reply API</strong>，直接用 <code>replyToken</code> 回覆 Webhook 觸發的訊息。無需查詢 LINE UID，符合 /apps LINE 整合的實際運作流程。
                                        </div>
                                        <Field label="replyToken 位置">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.replyToken || ''}
                                                onChange={(e) => handleConfigUpdate({ replyToken: e.target.value })}
                                                placeholder="{{replyToken}}"
                                            />
                                        </Field>
                                        <Field label="回覆訊息範本">
                                            <textarea
                                                className={textareaClass}
                                                rows={5}
                                                value={selectedNode.data?.config?.message || ''}
                                                onChange={(e) => handleConfigUpdate({ message: e.target.value })}
                                                placeholder="{{ai_output}}"
                                            />
                                        </Field>
                                    </div>
                                )}

                                {/* ── LINE Image Analyze ── */}
                                {selectedNode.data?.actionType === 'action_line_image_analyze' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-blue-600">🖼️ LINE 圖片辨識</h3>
                                        <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[10px] text-blue-700">
                                            匯入圖片檔案或從 LINE CDN 下載圖片，並用 /apps 中設定的 AI 服務（GEMINI/OPENAI/ANTHROPIC）進行 Vision 分析。
                                        </div>
                                        <Field label="圖片來源">
                                            <select
                                                className={selectClass}
                                                value={selectedNode.data?.config?.imageSource || 'file'}
                                                onChange={(e) => handleConfigUpdate({ imageSource: e.target.value })}
                                            >
                                                <option value="file">上傳圖片檔案</option>
                                                <option value="line">LINE 訊息圖片</option>
                                                <option value="url">圖片 URL</option>
                                            </select>
                                        </Field>
                                        {selectedNode.data?.config?.imageSource === 'file' && (
                                            <>
                                                <Field label="選擇圖片檔案">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className={`${inputClass} file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100`}
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                const reader = new FileReader();
                                                                reader.onload = (event) => {
                                                                    const content = event.target?.result;
                                                                    handleConfigUpdate({ 
                                                                        imageFile: file.name,
                                                                        imageBase64: content as string
                                                                    });
                                                                };
                                                                reader.readAsDataURL(file);
                                                            }
                                                        }}
                                                    />
                                                </Field>
                                                {selectedNode.data?.config?.imageFile && (
                                                    <div className="p-2 bg-green-50 border border-green-200 rounded-lg text-[10px] text-green-700 flex items-center gap-2">
                                                        <span>✓</span> 選定檔案: <strong>{selectedNode.data.config.imageFile}</strong>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {selectedNode.data?.config?.imageSource === 'line' && (
                                            <Field label="LINE message.id 路徑">
                                                <input
                                                    type="text"
                                                    className={inputClass}
                                                    value={selectedNode.data?.config?.messageIdField || ''}
                                                    onChange={(e) => handleConfigUpdate({ messageIdField: e.target.value })}
                                                    placeholder="{{message.id}}"
                                                />
                                            </Field>
                                        )}
                                        {selectedNode.data?.config?.imageSource === 'url' && (
                                            <Field label="圖片 URL">
                                                <input
                                                    type="text"
                                                    className={inputClass}
                                                    value={selectedNode.data?.config?.imageUrl || ''}
                                                    onChange={(e) => handleConfigUpdate({ imageUrl: e.target.value })}
                                                    placeholder="https://example.com/image.jpg"
                                                />
                                            </Field>
                                        )}
                                        <Field label="輸出欄位名稱">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.outputField || ''}
                                                onChange={(e) => handleConfigUpdate({ outputField: e.target.value })}
                                                placeholder="analysisResult"
                                            />
                                        </Field>
                                        <Field label="Vision 提示詞 (可選)">
                                            <textarea
                                                className={textareaClass}
                                                rows={4}
                                                value={selectedNode.data?.config?.prompt || ''}
                                                onChange={(e) => handleConfigUpdate({ prompt: e.target.value })}
                                                placeholder="（留空使用預設藥品辨識 Prompt）"
                                            />
                                        </Field>
                                    </div>
                                )}

                                {/* ── Context7 Retrieval ── */}
                                {selectedNode.data?.actionType === 'action_context7_retrieval' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-indigo-600">📚 Context7 文檔檢索</h3>
                                        <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-[10px] text-indigo-700">
                                            從 Context7 MCP 服務中檢索特定庫的文檔與資訊。結果將存入 <code>context7_result</code>。
                                        </div>
                                        <Field label="查詢內容">
                                            <textarea
                                                className={textareaClass}
                                                rows={3}
                                                value={selectedNode.data?.config?.query || ''}
                                                onChange={(e) => handleConfigUpdate({ query: e.target.value })}
                                                placeholder="{{user_query}}"
                                            />
                                        </Field>
                                        <Field label="庫 ID (Library ID)">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.libraryId || ''}
                                                onChange={(e) => handleConfigUpdate({ libraryId: e.target.value })}
                                                placeholder="/mongodb/docs"
                                            />
                                        </Field>
                                    </div>
                                )}

                                {/* ── Gmail Send ── */}
                                {selectedNode.data?.actionType === 'action_gmail_send' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-blue-600">📧 Gmail 發送郵件</h3>
                                        <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[10px] text-blue-700">
                                            透過 Gmail API 發送郵件。結果將存入 <code>gmail_sent</code>。
                                        </div>
                                        <Field label="收件者電子郵件">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.to || ''}
                                                onChange={(e) => handleConfigUpdate({ to: e.target.value })}
                                                placeholder="{{email_to}}"
                                            />
                                        </Field>
                                        <Field label="郵件主旨">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.subject || ''}
                                                onChange={(e) => handleConfigUpdate({ subject: e.target.value })}
                                                placeholder="{{emailSubject}}"
                                            />
                                        </Field>
                                        <Field label="郵件內容 (HTML)">
                                            <textarea
                                                className={textareaClass}
                                                rows={8}
                                                value={selectedNode.data?.config?.body || ''}
                                                onChange={(e) => handleConfigUpdate({ body: e.target.value })}
                                                placeholder="<p>{{emailContent}}</p>"
                                            />
                                        </Field>
                                    </div>
                                )}

                                {/* ── Resend Send ── */}
                                {selectedNode.data?.actionType === 'action_send_resend' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-indigo-600">🚀 Resend 郵件發送</h3>
                                        <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-[10px] text-indigo-700">
                                            透過 Resend API 發送郵件。需在 <strong>/apps</strong> 先完成 Resend 整合設定。結果將存入 <code>resend_sent</code>。
                                        </div>
                                        <Field label="收件者電子郵件">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.to || ''}
                                                onChange={(e) => handleConfigUpdate({ to: e.target.value })}
                                                placeholder="{{email_to}}"
                                            />
                                        </Field>
                                        <Field label="郵件主旨">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.subject || ''}
                                                onChange={(e) => handleConfigUpdate({ subject: e.target.value })}
                                                placeholder="{{emailSubject}}"
                                            />
                                        </Field>
                                        <Field label="郵件內容 (HTML)">
                                            <textarea
                                                className={textareaClass}
                                                rows={8}
                                                value={selectedNode.data?.config?.body || ''}
                                                onChange={(e) => handleConfigUpdate({ body: e.target.value })}
                                                placeholder="<p>{{emailContent}}</p>"
                                            />
                                        </Field>
                                    </div>
                                )}

                                {/* ── NotebookLM Create ── */}
                                {selectedNode.data?.actionType === 'action_notebooklm_create' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-purple-600">📓 NotebookLM 建立文檔</h3>
                                        <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-[10px] text-purple-700">
                                            建立新 NotebookLM 文檔並自動化處理。結果將存入 <code>notebooklm_result</code>。
                                        </div>
                                        <Field label="文檔標題">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.title || ''}
                                                onChange={(e) => handleConfigUpdate({ title: e.target.value })}
                                                placeholder="{{docTitle}}"
                                            />
                                        </Field>
                                        <Field label="文檔內容">
                                            <textarea
                                                className={textareaClass}
                                                rows={6}
                                                value={selectedNode.data?.config?.content || ''}
                                                onChange={(e) => handleConfigUpdate({ content: e.target.value })}
                                                placeholder="{{docContent}}"
                                            />
                                        </Field>
                                    </div>
                                )}

                                {/* ── Figma Export ── */}
                                {selectedNode.data?.actionType === 'action_figma_export' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-pink-600">🎨 Figma 匯出設計</h3>
                                        <div className="p-2.5 bg-pink-50 border border-pink-200 rounded-lg text-[10px] text-pink-700">
                                            從 Figma 導出設計資源或元件。結果將存入 <code>figma_export</code>。
                                        </div>
                                        <Field label="Figma 檔案 Key">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.fileKey || ''}
                                                onChange={(e) => handleConfigUpdate({ fileKey: e.target.value })}
                                                placeholder="{{figmaFileKey}}"
                                            />
                                        </Field>
                                        <Field label="匯出格式">
                                            <select
                                                className={selectClass}
                                                value={selectedNode.data?.config?.format || 'json'}
                                                onChange={(e) => handleConfigUpdate({ format: e.target.value })}
                                            >
                                                <option value="json">JSON</option>
                                                <option value="svg">SVG 向量圖</option>
                                                <option value="png">PNG 圖片</option>
                                            </select>
                                        </Field>
                                    </div>
                                )}

                                {/* ── Import File ── */}
                                {selectedNode.data?.actionType === 'action_import_file' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-amber-600">📥 Import File</h3>
                                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-700">
                                            選擇並讀取檔案內容。結果將存入 <code>imported_data</code>。
                                        </div>
                                        <Field label="選擇檔案">
                                            <input
                                                type="file"
                                                className={`${inputClass} file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100`}
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        const reader = new FileReader();
                                                        reader.onload = (event) => {
                                                            const content = event.target?.result;
                                                            const ext = file.name.split('.').pop()?.toLowerCase() || 'json';
                                                            handleConfigUpdate({ 
                                                                fileName: file.name,
                                                                fileType: ext,
                                                                fileContent: content as string
                                                            });
                                                        };
                                                        reader.readAsText(file);
                                                    }
                                                }}
                                            />
                                        </Field>
                                        {selectedNode.data?.config?.fileName && (
                                            <div className="p-2 bg-green-50 border border-green-200 rounded-lg text-[10px] text-green-700 flex items-center gap-2">
                                                <span>✓</span> 
                                                <div>
                                                    <div className="font-semibold">{selectedNode.data.config.fileName}</div>
                                                    <div className="text-gray-600">
                                                        ({selectedNode.data.config.fileContent ? Math.round(selectedNode.data.config.fileContent.length / 1024) : 0} KB)
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <Field label="檔案類型">
                                            <select
                                                className={selectClass}
                                                value={selectedNode.data?.config?.fileType || 'json'}
                                                onChange={(e) => handleConfigUpdate({ fileType: e.target.value })}
                                            >
                                                <option value="json">JSON</option>
                                                <option value="csv">CSV</option>
                                                <option value="xml">XML</option>
                                                <option value="txt">Text</option>
                                            </select>
                                        </Field>
                                    </div>
                                )}

                                {/* ── Export File ── */}
                                {selectedNode.data?.actionType === 'action_export_file' && (
                                    <div className="space-y-3 border-t pt-4">
                                        <h3 className="font-semibold text-sm text-emerald-600">📤 Export File</h3>
                                        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] text-emerald-700">
                                            生成並保存檔案。結果將存入 <code>export_result</code>。
                                        </div>
                                        <Field label="匯出格式">
                                            <select
                                                className={selectClass}
                                                value={selectedNode.data?.config?.format || 'json'}
                                                onChange={(e) => handleConfigUpdate({ format: e.target.value })}
                                            >
                                                <option value="json">JSON</option>
                                                <option value="csv">CSV</option>
                                                <option value="xml">XML</option>
                                            </select>
                                        </Field>
                                        <Field label="檔案名稱">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.fileName || ''}
                                                onChange={(e) => handleConfigUpdate({ fileName: e.target.value })}
                                                placeholder="export.json"
                                            />
                                        </Field>
                                        <Field label="資料欄位">
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={selectedNode.data?.config?.dataField || ''}
                                                onChange={(e) => handleConfigUpdate({ dataField: e.target.value })}
                                                placeholder="{{payloadData}}"
                                            />
                                        </Field>
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
                                {nodeLogs.map((log, i) => {
                                    const friendlyMsg = extractUserFriendlyMessage(log.output);
                                    return (
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
                                                {friendlyMsg && (
                                                    <div className="bg-blue-50 border-l-3 border-blue-400 p-2.5 rounded">
                                                        <div className="text-[9px] text-blue-600 font-bold mb-1.5 flex items-center gap-1">
                                                            <span>💬</span> 回覆摘要
                                                        </div>
                                                        <div className="text-[11px] text-blue-900 break-words leading-relaxed font-medium">
                                                            {friendlyMsg}
                                                        </div>
                                                    </div>
                                                )}
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
                                                            <span>📤</span> 完整 JSON 輸出
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
                                    );
                                })}
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
