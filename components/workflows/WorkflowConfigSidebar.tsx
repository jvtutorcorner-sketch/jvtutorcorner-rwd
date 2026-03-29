'use client';

import React from 'react';

interface SidebarProps {
    selectedNode: any;
    setNodes: any;
    onDelete?: (id: string) => void;
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

export function WorkflowConfigSidebar({ selectedNode, setNodes, onDelete }: SidebarProps) {
    if (!selectedNode) {
        return (
            <div className="w-80 border-l bg-gray-50 flex flex-col p-6 text-gray-400 items-center justify-center gap-2">
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
    };

    return (
        <div className="w-80 border-l bg-white flex flex-col h-full shadow-xl">
            {/* Header */}
            <div className="p-4 border-b font-bold bg-gradient-to-r from-gray-50 to-gray-100 flex items-center gap-2 text-sm">
                {nodeTypeLabel[selectedNode.type] || '⚙️ Node Settings'}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
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
                        <Field label="Secret Key (optional)">
                            <input
                                type="text"
                                className={inputClass}
                                value={selectedNode.data?.config?.secret || ''}
                                onChange={(e) => handleConfigUpdate({ secret: e.target.value })}
                                placeholder="HMAC verification secret"
                            />
                        </Field>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-[10px] text-emerald-700">
                            <div className="font-bold mb-1">📋 Webhook URL</div>
                            <code className="block font-mono break-all">
                                POST /api/wh/{selectedNode.data?.config?.endpoint || '<endpoint>'}
                            </code>
                        </div>
                    </div>
                )}

                {/* ── Schedule / Cron ── */}
                {selectedNode.data?.triggerType === 'trigger_schedule' && (
                    <div className="space-y-3 border-t pt-4">
                        <h3 className="font-semibold text-sm text-green-700">Schedule Settings</h3>
                        <Field label="Cron Expression">
                            <input
                                type="text"
                                className={`${inputClass} font-mono`}
                                value={selectedNode.data?.config?.cron || ''}
                                onChange={(e) => handleConfigUpdate({ cron: e.target.value })}
                                placeholder="0 9 * * 1 (Every Mon 9am)"
                            />
                        </Field>
                        <div className="text-[10px] text-gray-400 grid grid-cols-5 gap-1">
                            {['Min', 'Hour', 'Day', 'Month', 'Weekday'].map((f) => (
                                <div key={f} className="bg-gray-50 border rounded text-center py-0.5 font-medium">{f}</div>
                            ))}
                        </div>
                        <Field label="Timezone">
                            <select
                                className={selectClass}
                                value={selectedNode.data?.config?.timezone || 'Asia/Taipei'}
                                onChange={(e) => handleConfigUpdate({ timezone: e.target.value })}
                            >
                                <option value="Asia/Taipei">Asia/Taipei (UTC+8)</option>
                                <option value="UTC">UTC</option>
                                <option value="America/New_York">America/New_York</option>
                                <option value="Europe/London">Europe/London</option>
                            </select>
                        </Field>
                    </div>
                )}

                {/* ── Email Action ── */}
                {selectedNode.data?.actionType === 'action_send_email' && (
                    <div className="space-y-3 border-t pt-4">
                        <h3 className="font-semibold text-sm text-blue-600">Email Settings</h3>
                        <Field label="Subject Template">
                            <input
                                type="text"
                                className={inputClass}
                                value={selectedNode.data?.config?.subject || ''}
                                onChange={(e) => handleConfigUpdate({ subject: e.target.value })}
                                placeholder="Welcome to {{courseName}}!"
                            />
                        </Field>
                        <Field label="Body Template">
                            <textarea
                                className={textareaClass}
                                rows={6}
                                value={selectedNode.data?.config?.body || ''}
                                onChange={(e) => handleConfigUpdate({ body: e.target.value })}
                                placeholder={'Hello {{studentName}},\n\nYou have successfully enrolled in {{courseName}}.'}
                            />
                        </Field>
                        <p className="text-[10px] text-gray-400 italic">
                            Variables: {'{{studentName}}'}, {'{{courseName}}'}, {'{{teacherName}}'}
                        </p>
                    </div>
                )}

                {/* ── Grant Points ── */}
                {selectedNode.data?.actionType === 'action_grant_points' && (
                    <div className="space-y-3 border-t pt-4">
                        <h3 className="font-semibold text-sm text-blue-600">Points Settings</h3>
                        <Field label="Points Amount">
                            <input
                                type="number"
                                className={inputClass}
                                value={selectedNode.data?.config?.amount || 0}
                                onChange={(e) => handleConfigUpdate({ amount: Number(e.target.value) })}
                                min={0}
                            />
                        </Field>
                        <Field label="Reason / Note">
                            <input
                                type="text"
                                className={inputClass}
                                value={selectedNode.data?.config?.reason || ''}
                                onChange={(e) => handleConfigUpdate({ reason: e.target.value })}
                                placeholder="Bonus for enrollment"
                            />
                        </Field>
                    </div>
                )}

                {/* ── If/Else Logic ── */}
                {selectedNode.data?.actionType === 'logic_condition' && (
                    <div className="space-y-3 border-t pt-4">
                        <h3 className="font-semibold text-sm text-orange-600">Condition Settings</h3>
                        <Field label="Variable to Check">
                            <input
                                type="text"
                                className={`${inputClass} font-mono`}
                                value={selectedNode.data?.config?.variable || ''}
                                onChange={(e) => handleConfigUpdate({ variable: e.target.value })}
                                placeholder="{{trigger.amount}}"
                            />
                        </Field>
                        <Field label="Operator">
                            <select
                                className={selectClass}
                                value={selectedNode.data?.config?.operator || 'equals'}
                                onChange={(e) => handleConfigUpdate({ operator: e.target.value })}
                            >
                                <option value="equals">= Equals</option>
                                <option value="not_equals">≠ Not Equals</option>
                                <option value="greater_than">&gt; Greater Than</option>
                                <option value="less_than">&lt; Less Than</option>
                                <option value="contains">Contains</option>
                                <option value="starts_with">Starts With</option>
                                <option value="is_empty">Is Empty</option>
                                <option value="is_not_empty">Is Not Empty</option>
                            </select>
                        </Field>
                        <Field label="Comparison Value">
                            <input
                                type="text"
                                className={`${inputClass} font-mono`}
                                value={selectedNode.data?.config?.value || ''}
                                onChange={(e) => handleConfigUpdate({ value: e.target.value })}
                                placeholder="100"
                            />
                        </Field>
                        <div className="flex gap-2 text-[10px]">
                            <div className="flex-1 bg-green-50 border border-green-200 rounded p-2 text-green-700 text-center font-bold">
                                ✓ TRUE → next true branch
                            </div>
                            <div className="flex-1 bg-red-50 border border-red-200 rounded p-2 text-red-600 text-center font-bold">
                                ✗ FALSE → next false branch
                            </div>
                        </div>
                    </div>
                )}

                {/* ── AI Node ── */}
                {selectedNode.data?.actionType === 'action_ai_summarize' && (
                    <div className="space-y-3 border-t pt-4">
                        <h3 className="font-semibold text-sm text-purple-600">✨ AI Prompt Settings</h3>
                        <Field label="Model">
                            <select
                                className={selectClass}
                                value={selectedNode.data?.config?.model || 'gemini'}
                                onChange={(e) => handleConfigUpdate({ model: e.target.value })}
                            >
                                <option value="gemini">Google Gemini</option>
                                <option value="gpt4">OpenAI GPT-4</option>
                                <option value="claude">Anthropic Claude</option>
                            </select>
                        </Field>
                        <Field label="System Instruction">
                            <textarea
                                className={textareaClass}
                                rows={3}
                                value={selectedNode.data?.config?.systemPrompt || ''}
                                onChange={(e) => handleConfigUpdate({ systemPrompt: e.target.value })}
                                placeholder="You are a helpful assistant summarizing student progress."
                            />
                        </Field>
                        <Field label="User Input (supports variables)">
                            <textarea
                                className={textareaClass}
                                rows={4}
                                value={selectedNode.data?.config?.userPrompt || ''}
                                onChange={(e) => handleConfigUpdate({ userPrompt: e.target.value })}
                                placeholder={'Summarize this: {{trigger.student_bio}}'}
                            />
                        </Field>
                    </div>
                )}

                {/* ── Python Script ── */}
                {(selectedNode.data?.actionType === 'action_python_script' || selectedNode.type === 'python') && (
                    <div className="space-y-3 border-t pt-4">
                        <h3 className="font-semibold text-sm text-yellow-600">🐍 Python Script</h3>
                        <Field label="Script">
                            <textarea
                                className={`${textareaClass} bg-gray-900 text-green-300 border-gray-700 text-xs`}
                                rows={12}
                                value={selectedNode.data?.config?.script || ''}
                                onChange={(e) => handleConfigUpdate({ script: e.target.value })}
                                placeholder={'# data contains the trigger payload\nname = data.get("name", "World")\nprint(f"Hello {name}")'}
                            />
                        </Field>
                        <p className="text-[10px] text-gray-400 italic">
                            Use <code className="bg-gray-100 px-1 rounded">data</code> to access trigger payload. Click <strong>▶ Test</strong> on the node to run.
                        </p>
                    </div>
                )}

                {/* ── HTTP Request ── */}
                {selectedNode.data?.actionType === 'action_http_request' && (
                    <div className="space-y-3 border-t pt-4">
                        <h3 className="font-semibold text-sm text-sky-600">🌐 HTTP Request</h3>
                        <Field label="Method">
                            <select
                                className={selectClass}
                                value={selectedNode.data?.config?.method || 'GET'}
                                onChange={(e) => handleConfigUpdate({ method: e.target.value })}
                            >
                                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="URL">
                            <input
                                type="text"
                                className={`${inputClass} font-mono`}
                                value={selectedNode.data?.config?.url || ''}
                                onChange={(e) => handleConfigUpdate({ url: e.target.value })}
                                placeholder="https://api.example.com/endpoint"
                            />
                        </Field>
                        <Field label="Request Body (JSON)">
                            <textarea
                                className={`${textareaClass} text-xs`}
                                rows={5}
                                value={selectedNode.data?.config?.body || ''}
                                onChange={(e) => handleConfigUpdate({ body: e.target.value })}
                                placeholder={'{\n  "key": "{{trigger.value}}"\n}'}
                            />
                        </Field>
                        <Field label="Custom Headers (JSON)">
                            <textarea
                                className={`${textareaClass} text-xs`}
                                rows={3}
                                value={selectedNode.data?.config?.headers || ''}
                                onChange={(e) => handleConfigUpdate({ headers: e.target.value })}
                                placeholder={'{\n  "Authorization": "Bearer TOKEN"\n}'}
                            />
                        </Field>
                    </div>
                )}

                {/* ── Delay ── */}
                {selectedNode.data?.actionType === 'action_delay' && (
                    <div className="space-y-3 border-t pt-4">
                        <h3 className="font-semibold text-sm text-slate-600">⏱️ Delay Settings</h3>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <Field label="Amount">
                                    <input
                                        type="number"
                                        className={inputClass}
                                        min={1}
                                        value={selectedNode.data?.config?.amount || 1}
                                        onChange={(e) => handleConfigUpdate({ amount: Number(e.target.value) })}
                                    />
                                </Field>
                            </div>
                            <div className="flex-1">
                                <Field label="Unit">
                                    <select
                                        className={selectClass}
                                        value={selectedNode.data?.config?.unit || 'minutes'}
                                        onChange={(e) => handleConfigUpdate({ unit: e.target.value })}
                                    >
                                        <option value="seconds">Seconds</option>
                                        <option value="minutes">Minutes</option>
                                        <option value="hours">Hours</option>
                                        <option value="days">Days</option>
                                    </select>
                                </Field>
                            </div>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 text-center">
                            Pause for{' '}
                            <strong>{selectedNode.data?.config?.amount || 1}</strong>{' '}
                            {selectedNode.data?.config?.unit || 'minutes'}
                        </div>
                    </div>
                )}

                {/* ── Notification ── */}
                {selectedNode.data?.actionType === 'action_notification' && (
                    <div className="space-y-3 border-t pt-4">
                        <h3 className="font-semibold text-sm text-violet-600">🔔 Notification Settings</h3>
                        <Field label="Channel">
                            <select
                                className={selectClass}
                                value={selectedNode.data?.config?.channel || 'push'}
                                onChange={(e) => handleConfigUpdate({ channel: e.target.value })}
                            >
                                <option value="push">📱 Push Notification</option>
                                <option value="slack">💬 Slack</option>
                                <option value="discord">🎮 Discord</option>
                                <option value="telegram">✈️ Telegram</option>
                                <option value="line">🟢 LINE Notify</option>
                            </select>
                        </Field>
                        <Field label="Message">
                            <textarea
                                className={textareaClass}
                                rows={4}
                                value={selectedNode.data?.config?.message || ''}
                                onChange={(e) => handleConfigUpdate({ message: e.target.value })}
                                placeholder={'{{studentName}} just enrolled in {{courseName}}'}
                            />
                        </Field>
                        {['slack', 'discord', 'telegram', 'line'].includes(selectedNode.data?.config?.channel) && (
                            <Field label="Webhook URL / Token">
                                <input
                                    type="text"
                                    className={`${inputClass} font-mono text-xs`}
                                    value={selectedNode.data?.config?.webhookUrl || ''}
                                    onChange={(e) => handleConfigUpdate({ webhookUrl: e.target.value })}
                                    placeholder="https://hooks.slack.com/..."
                                />
                            </Field>
                        )}
                    </div>
                )}

                {/* ── Data Transform ── */}
                {selectedNode.data?.actionType === 'action_transform' && (
                    <div className="space-y-3 border-t pt-4">
                        <h3 className="font-semibold text-sm text-rose-600">⚙️ Data Transform</h3>
                        <Field label="Transform Type">
                            <select
                                className={selectClass}
                                value={selectedNode.data?.config?.transformType || 'map'}
                                onChange={(e) => handleConfigUpdate({ transformType: e.target.value })}
                            >
                                <option value="map">🗺️ Map (transform each item)</option>
                                <option value="filter">🔽 Filter (keep matching items)</option>
                                <option value="merge">🔗 Merge (combine arrays)</option>
                                <option value="split">✂️ Split (split array)</option>
                                <option value="sort">🔢 Sort</option>
                            </select>
                        </Field>
                        <Field label="Expression (JS-like)">
                            <textarea
                                className={`${textareaClass} text-xs`}
                                rows={5}
                                value={selectedNode.data?.config?.expression || ''}
                                onChange={(e) => handleConfigUpdate({ expression: e.target.value })}
                                placeholder={
                                    selectedNode.data?.config?.transformType === 'filter'
                                        ? 'item.points > 100'
                                        : 'item.name.toUpperCase()'
                                }
                            />
                        </Field>
                    </div>
                )}

                {/* ── CSV Export ── */}
                {selectedNode.data?.actionType === 'action_export_csv' && (
                    <div className="space-y-3 border-t pt-4">
                        <h3 className="font-semibold text-sm text-green-700">📄 CSV Export Settings</h3>
                        <Field label="File Name Prefix">
                            <input
                                type="text"
                                className={inputClass}
                                value={selectedNode.data?.config?.fileNamePrefix || 'export_'}
                                onChange={(e) => handleConfigUpdate({ fileNamePrefix: e.target.value })}
                                placeholder="enrollments_"
                            />
                        </Field>
                        <Field label="Columns (comma-separated, leave empty for auto)">
                            <input
                                type="text"
                                className={`${inputClass} font-mono text-xs`}
                                value={selectedNode.data?.config?.columns || ''}
                                onChange={(e) => handleConfigUpdate({ columns: e.target.value })}
                                placeholder="id,name,email,enrolledAt"
                            />
                        </Field>
                        <div className="bg-green-50 border border-green-100 rounded-lg p-2 text-[10px] text-green-700 italic">
                            Output path: /exports/{selectedNode.data?.config?.fileNamePrefix || 'export_'}YYYYMMDD.csv
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-gray-50">
                <button
                    onClick={() => {
                        if (confirm('Remove this node? Connected edges will also be removed.')) {
                            if (onDelete) {
                                onDelete(selectedNode.id);
                            } else {
                                setNodes((nds: any[]) => nds.filter((n) => n.id !== selectedNode.id));
                            }
                        }
                    }}
                    className="w-full py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors font-semibold flex items-center justify-center gap-2"
                >
                    <span>🗑️</span> Remove Node
                </button>
            </div>
        </div>
    );
}
