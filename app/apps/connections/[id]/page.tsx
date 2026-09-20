'use client';

// app/apps/connections/[id]/page.tsx
// 連線詳情：設定 / 測試工具 / 進階(customScript) / 危險區域。
// 密鑰 write-only（留空＝不變更）；測試工具以 DB 密鑰 + 未儲存編輯執行。

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import SchemaForm from '@/components/integrations/SchemaForm';
import ConnectionTools from '../../components/tools/ConnectionTools';
import { useCatalog } from '../../_hooks/useCatalog';
import { useSchemaAux } from '../../_hooks/useSchemaAux';
import { getConnection, updateConnection, deleteConnection, type ConnectionView } from '@/lib/integrations/clientApi';

type Tab = 'settings' | 'tools' | 'advanced' | 'danger';

export default function ConnectionDetailPage() {
    const router = useRouter();
    const params = useParams();
    const id = String(params.id);
    const { getProvider, loading: catalogLoading } = useCatalog();
    const { aux } = useSchemaAux();

    const [conn, setConn] = useState<ConnectionView | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<Tab>('settings');
    const [name, setName] = useState('');
    const [edited, setEdited] = useState<Record<string, any>>({});
    const [script, setScript] = useState('');
    const [scriptEnabled, setScriptEnabled] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const c = await getConnection(id);
                if (!alive) return;
                setConn(c); setName(c.name); setEdited({}); setScript(c.customScript || ''); setScriptEnabled(!!c.scriptEnabled);
            } catch (e: any) {
                if (alive) setMsg({ ok: false, text: e.message || '載入失敗' });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [id]);

    const provider = conn ? getProvider(conn.type) : undefined;
    const mergedConfig = useMemo(() => ({ ...(conn?.config || {}), ...edited }), [conn, edited]);

    if (loading || catalogLoading) return <div className="p-6 text-gray-500">載入中…</div>;
    if (!conn) return <div className="p-6"><p className="text-red-600">找不到此連線。</p><Link href="/apps" className="text-purple-600 underline">回到應用程式</Link></div>;
    if (!provider) return <div className="p-6"><p className="text-red-600">未知的服務類型：{conn.type}（僅能刪除）。</p></div>;

    const webhookUrl = provider.hasWebhook ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/line/webhook/${conn.integrationId}` : null;

    const doSave = async () => {
        setSaving(true); setMsg(null);
        try {
            const updated = await updateConnection(id, {
                name,
                config: edited,   // 只送有動過的欄位；空/遮罩密鑰後端保留原值
                customScript: scriptEnabled ? script : null,
                scriptEnabled,
            });
            setConn(updated); setName(updated.name); setEdited({});
            setMsg({ ok: true, text: '已儲存' });
        } catch (e: any) {
            setMsg({ ok: false, text: e.message || '儲存失敗' });
        } finally {
            setSaving(false);
        }
    };

    const tabs: { id: Tab; label: string }[] = [
        { id: 'settings', label: '設定' },
        ...(provider.capabilities.testConnection || (provider.capabilities.toolPanels || []).length ? [{ id: 'tools' as Tab, label: '測試工具' }] : []),
        ...(provider.capabilities.customScript ? [{ id: 'advanced' as Tab, label: '進階' }] : []),
        { id: 'danger', label: '危險區域' },
    ];

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <Link href="/apps" className="text-sm text-gray-500 hover:text-gray-700">← 應用程式</Link>
            <div className="flex items-center gap-3 mt-2 mb-4">
                <div className="text-3xl">{provider.defaults.icon}</div>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{conn.name}</h1>
                    <p className="text-sm text-gray-500">{provider.defaults.label} · {conn.status === 'ACTIVE' ? '啟用中' : '已停用'}{conn.isDefault ? ' · 預設' : ''}</p>
                </div>
            </div>

            <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-5">
                {tabs.map((t) => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === t.id ? 'text-purple-600 border-purple-600' : 'text-gray-500 border-transparent hover:text-gray-800'}`}>{t.label}</button>
                ))}
            </div>

            {msg && <div className={`mb-4 text-sm p-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

            {tab === 'settings' && (
                <div>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">連線名稱</label>
                        <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    {webhookUrl && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Webhook URL（唯讀）</label>
                            <div className="flex gap-2">
                                <input readOnly className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs font-mono" value={webhookUrl} />
                                <button onClick={() => navigator.clipboard?.writeText(webhookUrl)} className="text-sm px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700">複製</button>
                            </div>
                        </div>
                    )}
                    <SchemaForm provider={provider} value={mergedConfig} onChange={(next) => {
                        // 只保留與原值不同的欄位為「已編輯」
                        const diff: Record<string, any> = {};
                        for (const k of Object.keys(next)) if (JSON.stringify(next[k]) !== JSON.stringify(conn.config?.[k])) diff[k] = next[k];
                        setEdited(diff);
                    }} mode="edit" secretsSet={conn.secretsSet} aux={aux} />
                    <button onClick={doSave} disabled={saving} className="mt-6 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5 py-2 rounded-lg disabled:opacity-50">{saving ? '儲存中…' : '儲存設定'}</button>
                </div>
            )}

            {tab === 'tools' && <ConnectionTools connection={conn} provider={provider} pendingConfig={Object.keys(edited).length ? edited : undefined} />}

            {tab === 'advanced' && provider.capabilities.customScript && (
                <div>
                    <label className="inline-flex items-center gap-2 mb-2">
                        <input type="checkbox" checked={scriptEnabled} onChange={(e) => setScriptEnabled(e.target.checked)} className="rounded text-purple-600" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">啟用自訂 Webhook 腳本</span>
                    </label>
                    <textarea className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-mono" rows={10} value={script} onChange={(e) => setScript(e.target.value)} placeholder="// 自訂處理邏輯" disabled={!scriptEnabled} />
                    <button onClick={doSave} disabled={saving} className="mt-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5 py-2 rounded-lg disabled:opacity-50">{saving ? '儲存中…' : '儲存'}</button>
                </div>
            )}

            {tab === 'danger' && (
                <div className="border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <h4 className="font-semibold text-red-700 mb-1">刪除連線</h4>
                    <p className="text-sm text-gray-500 mb-3">刪除後無法復原{provider.hasWebhook ? '，且 Webhook URL 會立即失效' : ''}。</p>
                    <button
                        onClick={async () => {
                            if (!confirm(`確定要刪除「${conn.name}」嗎？此動作無法復原。`)) return;
                            try { await deleteConnection(id); router.push('/apps'); }
                            catch (e: any) { setMsg({ ok: false, text: e.message || '刪除失敗' }); }
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg"
                    >刪除此連線</button>
                </div>
            )}
        </div>
    );
}
