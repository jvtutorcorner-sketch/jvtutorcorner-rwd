'use client';

// app/apps/components/SkillsEditor.tsx
// AI 技能後台編輯：列表 + 抽屜編輯（label/icon/desc/prompt/enabled）、新增、刪除、還原預設。

import { useEffect, useState } from 'react';

interface Skill {
    id: string; label: string; icon: string; desc: string; prompt: string;
    enabled: boolean; source: 'seed' | 'seed-override' | 'custom';
}

const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm';
const blank: Skill = { id: '', label: '', icon: '🧩', desc: '', prompt: '', enabled: true, source: 'custom' };

export default function SkillsEditor() {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Skill | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/ai-skills', { credentials: 'same-origin' });
            const data = await res.json();
            if (data.ok) setSkills(data.skills);
            else setErr(data.error || '載入失敗');
        } catch (e: any) { setErr(e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const save = async () => {
        if (!editing) return;
        setSaving(true); setErr(null);
        try {
            const url = isNew ? '/api/admin/ai-skills' : `/api/admin/ai-skills/${editing.id}`;
            const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || '儲存失敗');
            setEditing(null); await load();
        } catch (e: any) { setErr(e.message); }
        finally { setSaving(false); }
    };

    const del = async (s: Skill) => {
        if (!confirm(`確定刪除技能「${s.label}」？`)) return;
        await fetch(`/api/admin/ai-skills/${s.id}`, { method: 'DELETE', credentials: 'same-origin' });
        await load();
    };
    const reset = async (s: Skill) => {
        await fetch(`/api/admin/ai-skills/${s.id}/reset`, { method: 'POST', credentials: 'same-origin' });
        await load();
    };

    if (loading) return <p className="text-gray-500">載入中…</p>;

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-500">聊天室可套用的 AI 技能。程式內建技能可覆寫或還原，也可新增自訂技能。</p>
                <button onClick={() => { setEditing({ ...blank }); setIsNew(true); }} className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg">新增技能</button>
            </div>
            {err && <div className="mb-3 text-sm p-2 rounded-lg bg-red-50 text-red-700">{err}</div>}
            <div className="space-y-2">
                {skills.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <span className="text-2xl">{s.icon}</span>
                        <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                {s.label}
                                {!s.enabled && <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">停用</span>}
                                {s.source === 'seed-override' && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">已覆寫</span>}
                                {s.source === 'custom' && <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">自訂</span>}
                            </div>
                            <div className="text-xs text-gray-500 truncate">{s.desc}</div>
                        </div>
                        <button onClick={() => { setEditing({ ...s }); setIsNew(false); }} className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700">編輯</button>
                        {s.source === 'seed-override' && <button onClick={() => reset(s)} className="text-sm px-3 py-1.5 rounded-lg text-amber-700 hover:bg-amber-50">還原預設</button>}
                        <button onClick={() => del(s)} className="text-sm px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50">{s.source === 'custom' ? '刪除' : '隱藏'}</button>
                    </div>
                ))}
            </div>

            {editing && (
                <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">{isNew ? '新增技能' : '編輯技能'}</h3>
                        <div className="space-y-3">
                            <div className="flex gap-3">
                                <div className="w-20"><label className="block text-xs text-gray-500 mb-1">圖示</label><input className={inputCls} value={editing.icon} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} /></div>
                                <div className="flex-1"><label className="block text-xs text-gray-500 mb-1">名稱</label><input className={inputCls} value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} /></div>
                            </div>
                            <div><label className="block text-xs text-gray-500 mb-1">說明</label><input className={inputCls} value={editing.desc} onChange={(e) => setEditing({ ...editing, desc: e.target.value })} /></div>
                            <div><label className="block text-xs text-gray-500 mb-1">系統提示 (Prompt)</label><textarea className={inputCls} rows={8} value={editing.prompt} onChange={(e) => setEditing({ ...editing, prompt: e.target.value })} /></div>
                            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} className="rounded text-purple-600" /><span className="text-sm text-gray-600">啟用</span></label>
                        </div>
                        {err && <div className="mt-3 text-sm p-2 rounded-lg bg-red-50 text-red-700">{err}</div>}
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-700">取消</button>
                            <button disabled={saving || !editing.label || !editing.prompt} onClick={save} className="px-4 py-2 rounded-lg text-sm bg-purple-600 text-white disabled:opacity-40">{saving ? '儲存中…' : '儲存'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
