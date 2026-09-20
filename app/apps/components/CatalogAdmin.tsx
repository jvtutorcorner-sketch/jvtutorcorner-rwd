'use client';

// app/apps/components/CatalogAdmin.tsx
// 目錄管理（僅 admin）：上下架、排序、名稱/說明覆寫、還原預設，整份 PUT 儲存。

import { useEffect, useMemo, useState } from 'react';

interface Provider { type: string; category: string; defaults: { label: string; desc: string; icon: string; sortOrder: number; visible: boolean }; deprecated: boolean }
interface Override { visible?: boolean; sortOrder?: number; label?: string; desc?: string; category?: string }

export default function CatalogAdmin() {
    const [providers, setProviders] = useState<Provider[]>([]);
    const [overrides, setOverrides] = useState<Record<string, Override>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/admin/integrations/catalog', { credentials: 'same-origin' });
                const data = await res.json();
                if (data.ok) { setProviders(data.providers); setOverrides(data.overrides || {}); }
                else setMsg({ ok: false, text: data.error || '載入失敗' });
            } catch (e: any) { setMsg({ ok: false, text: e.message }); }
            finally { setLoading(false); }
        })();
    }, []);

    // 有效值 = override ?? default
    const eff = (p: Provider) => ({
        visible: overrides[p.type]?.visible ?? p.defaults.visible,
        sortOrder: overrides[p.type]?.sortOrder ?? p.defaults.sortOrder,
        label: overrides[p.type]?.label ?? p.defaults.label,
        desc: overrides[p.type]?.desc ?? p.defaults.desc,
    });

    const setOv = (type: string, patch: Override) => setOverrides((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
    const clearOv = (type: string) => setOverrides((prev) => { const n = { ...prev }; delete n[type]; return n; });

    const sorted = useMemo(() => [...providers].sort((a, b) => eff(a).sortOrder - eff(b).sortOrder), [providers, overrides]);

    const save = async () => {
        setSaving(true); setMsg(null);
        try {
            const res = await fetch('/api/admin/integrations/catalog', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overrides }) });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || '儲存失敗');
            setMsg({ ok: true, text: '已儲存' });
        } catch (e: any) { setMsg({ ok: false, text: e.message }); }
        finally { setSaving(false); }
    };

    if (loading) return <p className="text-gray-500">載入中…</p>;

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-500">調整服務目錄的顯示：上下架、排序、名稱與說明。不影響已連線的服務運作。</p>
                <button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">{saving ? '儲存中…' : '儲存變更'}</button>
            </div>
            {msg && <div className={`mb-3 text-sm p-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
            <div className="space-y-2">
                {sorted.map((p) => {
                    const e = eff(p);
                    const hasOverride = !!overrides[p.type] && Object.keys(overrides[p.type]).length > 0;
                    return (
                        <div key={p.type} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                            <span className="text-2xl">{p.defaults.icon}</span>
                            <div className="flex-1 min-w-0 space-y-1">
                                <input className="w-full bg-transparent font-semibold text-gray-900 dark:text-white text-sm border-b border-transparent focus:border-purple-400 outline-none" value={e.label} onChange={(ev) => setOv(p.type, { label: ev.target.value })} />
                                <input className="w-full bg-transparent text-xs text-gray-500 border-b border-transparent focus:border-purple-400 outline-none" value={e.desc} onChange={(ev) => setOv(p.type, { desc: ev.target.value })} />
                                <span className="text-[10px] text-gray-400">{p.type} · {p.category}</span>
                            </div>
                            <input type="number" title="排序" className="w-16 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm" value={e.sortOrder} onChange={(ev) => setOv(p.type, { sortOrder: Number(ev.target.value) })} />
                            <button
                                onClick={() => setOv(p.type, { visible: !e.visible })}
                                className={`text-xs px-2.5 py-1 rounded-full ${e.visible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                            >{e.visible ? '上架中' : '已下架'}</button>
                            {hasOverride && <button onClick={() => clearOv(p.type)} className="text-xs text-amber-700 hover:underline">還原</button>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
