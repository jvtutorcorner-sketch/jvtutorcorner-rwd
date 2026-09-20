'use client';

// app/apps/components/AgentsEditor.tsx
// 平台 Agents 後台編輯：列表 + 抽屜編輯（名稱/圖示/分類/說明/關鍵詞/各階段 prompt/啟用）、
// 新增、刪除、還原預設。dispatch 提示會依啟用中的 agents 自動組成，無需另編。

import { useEffect, useState } from 'react';

interface Agent {
    id: string; name: string; icon: string; category: string; desc: string;
    keywords: string[]; singlePrompt: string; askPrompt: string; planPrompt: string; executePrompt: string;
    enabled: boolean; source: 'seed' | 'seed-override' | 'custom';
    color?: string; badge?: string; longDesc?: string; capabilities?: string[]; exampleQuestions?: string[];
}

const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm';
const blank: Agent = { id: '', name: '', icon: '🤖', category: '一般', desc: '', keywords: [], singlePrompt: '', askPrompt: '', planPrompt: '', executePrompt: '', enabled: true, source: 'custom' };

export default function AgentsEditor() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Agent | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/platform-agents', { credentials: 'same-origin' });
            const data = await res.json();
            if (data.ok) setAgents(data.agents);
            else setErr(data.error || '載入失敗');
        } catch (e: any) { setErr(e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const save = async () => {
        if (!editing) return;
        setSaving(true); setErr(null);
        try {
            const url = isNew ? '/api/admin/platform-agents' : `/api/admin/platform-agents/${editing.id}`;
            const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || '儲存失敗');
            setEditing(null); await load();
        } catch (e: any) { setErr(e.message); }
        finally { setSaving(false); }
    };
    const del = async (a: Agent) => { if (!confirm(`確定刪除 Agent「${a.name}」？`)) return; await fetch(`/api/admin/platform-agents/${a.id}`, { method: 'DELETE', credentials: 'same-origin' }); await load(); };
    const reset = async (a: Agent) => { await fetch(`/api/admin/platform-agents/${a.id}/reset`, { method: 'POST', credentials: 'same-origin' }); await load(); };

    if (loading) return <p className="text-gray-500">載入中…</p>;

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-500">AI 聊天室可呼叫、或由調度器自動分派的平台 Agents。dispatch 提示會依啟用中的 Agents 自動更新。</p>
                <button onClick={() => { setEditing({ ...blank }); setIsNew(true); }} className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg">新增 Agent</button>
            </div>
            {err && <div className="mb-3 text-sm p-2 rounded-lg bg-red-50 text-red-700">{err}</div>}
            <div className="space-y-2">
                {agents.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <span className="text-2xl">{a.icon}</span>
                        <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                {a.name}
                                <span className="text-xs text-gray-400">{a.category}</span>
                                {!a.enabled && <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">停用</span>}
                                {a.source === 'seed-override' && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">已覆寫</span>}
                                {a.source === 'custom' && <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">自訂</span>}
                            </div>
                            <div className="text-xs text-gray-500 truncate">{a.desc}</div>
                        </div>
                        <button onClick={() => { setEditing({ ...a, keywords: a.keywords || [] }); setIsNew(false); }} className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700">編輯</button>
                        {a.source === 'seed-override' && <button onClick={() => reset(a)} className="text-sm px-3 py-1.5 rounded-lg text-amber-700 hover:bg-amber-50">還原預設</button>}
                        <button onClick={() => del(a)} className="text-sm px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50">{a.source === 'custom' ? '刪除' : '隱藏'}</button>
                    </div>
                ))}
            </div>

            {editing && (
                <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">{isNew ? '新增 Agent' : '編輯 Agent'}</h3>
                        <div className="space-y-3">
                            <div className="flex gap-3">
                                <div className="w-20"><label className="block text-xs text-gray-500 mb-1">圖示</label><input className={inputCls} value={editing.icon} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} /></div>
                                <div className="flex-1"><label className="block text-xs text-gray-500 mb-1">名稱</label><input className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                                <div className="w-28"><label className="block text-xs text-gray-500 mb-1">分類</label><input className={inputCls} value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></div>
                            </div>
                            <div><label className="block text-xs text-gray-500 mb-1">說明</label><input className={inputCls} value={editing.desc} onChange={(e) => setEditing({ ...editing, desc: e.target.value })} /></div>
                            <div><label className="block text-xs text-gray-500 mb-1">關鍵詞（逗號分隔）</label><input className={inputCls} value={(editing.keywords || []).join(', ')} onChange={(e) => setEditing({ ...editing, keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></div>
                            <div><label className="block text-xs text-gray-500 mb-1">聊天室系統提示 (singlePrompt)</label><textarea className={inputCls} rows={4} value={editing.singlePrompt} onChange={(e) => setEditing({ ...editing, singlePrompt: e.target.value })} /></div>
                            <details className="text-sm">
                                <summary className="cursor-pointer text-gray-500">三階段提示（Ask / Plan / Execute）</summary>
                                <div className="space-y-2 mt-2">
                                    <textarea className={inputCls} rows={3} placeholder="Ask 提示" value={editing.askPrompt} onChange={(e) => setEditing({ ...editing, askPrompt: e.target.value })} />
                                    <textarea className={inputCls} rows={3} placeholder="Plan 提示" value={editing.planPrompt} onChange={(e) => setEditing({ ...editing, planPrompt: e.target.value })} />
                                    <textarea className={inputCls} rows={3} placeholder="Execute 提示" value={editing.executePrompt} onChange={(e) => setEditing({ ...editing, executePrompt: e.target.value })} />
                                </div>
                            </details>
                            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} className="rounded text-purple-600" /><span className="text-sm text-gray-600">啟用</span></label>
                        </div>
                        {err && <div className="mt-3 text-sm p-2 rounded-lg bg-red-50 text-red-700">{err}</div>}
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-700">取消</button>
                            <button disabled={saving || !editing.name} onClick={save} className="px-4 py-2 rounded-lg text-sm bg-purple-600 text-white disabled:opacity-40">{saving ? '儲存中…' : '儲存'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
