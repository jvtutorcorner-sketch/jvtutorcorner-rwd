'use client';

import React from 'react';

interface SidebarProps {
    selectedNode: any;
    setNodes: any;
    onDelete?: (id: string) => void;
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

export function WorkflowConfigSidebar({ selectedNode, setNodes, onDelete, activeTab = 'config', setActiveTab, executionTrails = [] }: SidebarProps) {
    if (!selectedNode) {
        return (
            <div className="w-96 border-l bg-gray-50 flex flex-col p-6 text-gray-400 items-center justify-center gap-2">
                <div className="text-3xl">🖱️</div>
                <div className="text-sm font-medium">Select a node to configure</div>
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
        trigger: '⚡ Trigger Settings',
        webhook: '🔗 Webhook Settings',
        action: '⚙️ Action Settings',
        logic: '🔀 Logic Settings',
        ai: '✨ AI Settings',
        python: '🐍 Python Settings',
        export: '📄 Export Settings',
        http: '🌐 HTTP Request Settings',
        delay: '⏱️ Delay Settings',
        notification: '🔔 Notification Settings',
        transform: '⚙️ Transform Settings',
        input: '📥 Input Settings',
        output: '📤 Output Settings',
    };

    // Find logs for this specific node
    const nodeLogs = executionTrails.flatMap(t => t.logs || []).filter(l => l.nodeId === selectedNode.id);

    return (
        <div className="w-96 border-l bg-white flex flex-col h-full shadow-xl">
            {/* Tab Header */}
            <div className="flex border-b text-[10px] font-bold uppercase tracking-wider">
                <button
                    onClick={() => setActiveTab?.('config')}
                    className={`flex-1 py-3 text-center transition-colors ${activeTab === 'config' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'bg-gray-50 text-gray-400 hover:text-gray-600'}`}
                >
                    Configuration
                </button>
                <button
                    onClick={() => setActiveTab?.('debug')}
                    className={`flex-1 py-3 text-center transition-colors ${activeTab === 'debug' ? 'bg-white text-orange-600 border-b-2 border-orange-600' : 'bg-gray-50 text-gray-400 hover:text-gray-600'}`}
                >
                    Debug {nodeLogs.length > 0 && `(${nodeLogs.length})`}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {activeTab === 'config' ? (
                    <div className="p-4 space-y-5">
                        {/* Header */}
                        <div className="pb-4 border-b font-bold text-gray-800 flex items-center gap-2 text-sm">
                            {nodeTypeLabel[selectedNode.type] || '⚙️ Node Settings'}
                        </div>

                        {/* Common fields */}
                        <div className="space-y-3">
                            <Field label="Label">
                                <input
                                    type="text"
                                    className={inputClass}
                                    value={selectedNode.data?.label || ''}
                                    onChange={(e) => handleUpdate({ label: e.target.value })}
                                />
                            </Field>
                            <Field label="Description">
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
                                <h3 className="font-semibold text-sm text-emerald-600">Webhook Configuration</h3>
                                <Field label="Endpoint Path">
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

                        {/* ── Email Action ── */}
                        {selectedNode.data?.actionType === 'action_send_gmail' && (
                            <div className="space-y-3 border-t pt-4">
                                <h3 className="font-semibold text-sm text-blue-600">Gmail Settings</h3>
                                <Field label="Recipient Email">
                                    <input
                                        type="text"
                                        className={inputClass}
                                        value={selectedNode.data?.config?.to || ''}
                                        onChange={(e) => handleConfigUpdate({ to: e.target.value })}
                                        placeholder="{{email}}"
                                    />
                                </Field>
                                <Field label="Subject">
                                    <input
                                        type="text"
                                        className={inputClass}
                                        value={selectedNode.data?.config?.subject || ''}
                                        onChange={(e) => handleConfigUpdate({ subject: e.target.value })}
                                    />
                                </Field>
                                <Field label="Body">
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
                                <h3 className="font-semibold text-sm text-blue-500">📜 JavaScript Script</h3>
                                <Field label="Script">
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
                                <h3 className="font-semibold text-sm text-sky-600">🌐 HTTP Request</h3>
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
                        {selectedNode.type === 'logic' && (
                            <div className="space-y-3 border-t pt-4">
                                <h3 className="font-semibold text-sm text-orange-600">Condition Settings</h3>
                                <Field label="Variable to Check">
                                    <input
                                        type="text"
                                        className={inputClass}
                                        value={selectedNode.data?.config?.variable || ''}
                                        onChange={(e) => handleConfigUpdate({ variable: e.target.value })}
                                        placeholder="{{amount}}"
                                    />
                                </Field>
                                <Field label="Operator">
                                    <select
                                        className={selectClass}
                                        value={selectedNode.data?.config?.operator || 'equals'}
                                        onChange={(e) => handleConfigUpdate({ operator: e.target.value })}
                                    >
                                        <option value="equals">= Equals</option>
                                        <option value="greater_than">&gt; Greater Than</option>
                                        <option value="less_than">&lt; Less Than</option>
                                        <option value="contains">Contains</option>
                                    </select>
                                </Field>
                                <Field label="Comparison Value">
                                    <input
                                        type="text"
                                        className={inputClass}
                                        value={selectedNode.data?.config?.value || ''}
                                        onChange={(e) => handleConfigUpdate({ value: e.target.value })}
                                    />
                                </Field>
                            </div>
                        )}

                        {/* ... (More blocks can be added as needed) ... */}
                    </div>
                ) : (
                    <div className="p-4 space-y-4">
                        <h3 className="font-bold text-sm text-orange-600 flex items-center gap-2 uppercase tracking-tight">
                            <span>🐞</span> Debug Trail
                        </h3>
                        
                        {nodeLogs.length === 0 ? (
                            <div className="bg-gray-50 border border-dashed rounded-xl p-10 text-center flex flex-col items-center gap-3">
                                <div className="text-3xl grayscale opacity-50">📤</div>
                                <div className="text-[11px] text-gray-400 font-medium max-w-[180px]">No logs for this node. Run a test to capture data flow.</div>
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
                                                        <span>📥</span> INPUT PAYLOAD
                                                    </div>
                                                    <pre className="text-[10px] bg-slate-900 text-green-400 p-2.5 rounded-lg max-h-40 overflow-auto font-mono custom-scrollbar">
                                                        {JSON.stringify(log.payload, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                            {log.output && (
                                                <div>
                                                    <div className="text-[9px] text-gray-400 font-bold mb-1.5 flex items-center gap-1">
                                                        <span>📤</span> OUTPUT
                                                    </div>
                                                    <pre className="text-[10px] bg-slate-900 text-blue-400 p-2.5 rounded-lg max-h-40 overflow-auto font-mono custom-scrollbar">
                                                        {JSON.stringify(log.output, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                            {log.error && (
                                                <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-[10px] text-red-700 font-mono leading-relaxed">
                                                    <div className="font-bold flex items-center gap-1 mb-1">
                                                        <span>❌</span> ERROR:
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
                <button
                    onClick={() => {
                        if (confirm('Remove this node? Connected edges will also be removed.')) {
                            if (onDelete) {
                                onDelete(selectedNode.id);
                            } else {
                                setNodes((nds: any[]) => nds.filter((n: any) => n.id !== selectedNode.id));
                            }
                        }
                    }}
                    className="w-full py-2.5 bg-white text-rose-500 border border-rose-100 rounded-xl hover:bg-rose-50 transition-all font-bold flex items-center justify-center gap-2 text-xs shadow-sm active:scale-95"
                >
                    <span>🗑️</span> Remove Node
                </button>
            </div>
        </div>
    );
}
