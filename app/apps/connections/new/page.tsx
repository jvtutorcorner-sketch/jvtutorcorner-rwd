'use client';

// app/apps/connections/new/page.tsx
// 新增連線：?type=STRIPE。同一份 SchemaForm，可在儲存前測試。

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import SchemaForm from '@/components/integrations/SchemaForm';
import { useCatalog } from '../../_hooks/useCatalog';
import { useSchemaAux } from '../../_hooks/useSchemaAux';
import { createConnection, testNewConnection } from '@/lib/integrations/clientApi';

export default function NewConnectionPage() {
    const router = useRouter();
    const params = useSearchParams();
    const type = (params.get('type') || '').toUpperCase();
    const { getProvider, loading } = useCatalog();
    const { aux } = useSchemaAux();
    const provider = getProvider(type);

    const initialConfig = useMemo(() => {
        const cfg: Record<string, any> = {};
        for (const f of provider?.fields || []) {
            if (f.default !== undefined) cfg[f.key] = f.default;
        }
        return cfg;
    }, [provider]);

    const [config, setConfig] = useState<Record<string, any>>({});
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const merged = { ...initialConfig, ...config };

    if (loading) return <div className="p-6 text-gray-500">載入中…</div>;
    if (!provider) return (
        <div className="p-6">
            <p className="text-red-600">未知的服務類型：{type}</p>
            <Link href="/apps?tab=catalog" className="text-purple-600 underline">回到服務目錄</Link>
        </div>
    );

    const doTest = async () => {
        setTestResult(null);
        try { setTestResult(await testNewConnection(provider.type, merged)); }
        catch (e: any) { setTestResult({ success: false, message: e.message }); }
    };

    const doSave = async () => {
        setSaving(true); setError(null);
        try {
            const rec = await createConnection({ type: provider.type, name: name || provider.defaults.label, config: merged });
            router.push(`/apps/connections/${rec.integrationId}`);
        } catch (e: any) {
            setError(e.message || '建立失敗');
            setSaving(false);
        }
    };

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <Link href="/apps?tab=catalog" className="text-sm text-gray-500 hover:text-gray-700">← 服務目錄</Link>
            <div className="flex items-center gap-3 mt-2 mb-6">
                <div className="text-3xl">{provider.defaults.icon}</div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">新增 {provider.defaults.label}</h1>
                    <p className="text-sm text-gray-500">{provider.defaults.desc}</p>
                </div>
            </div>

            {provider.hint && <p className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg mb-4">💡 {provider.hint}</p>}

            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">連線名稱</label>
                <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" placeholder={provider.defaults.label} value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <SchemaForm provider={provider} value={merged} onChange={setConfig} mode="create" aux={aux} />

            {testResult && <div className={`mt-4 text-sm p-2 rounded-lg ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{testResult.success ? '✓ ' : '✗ '}{testResult.message}</div>}
            {error && <div className="mt-4 text-sm p-2 rounded-lg bg-red-50 text-red-700">{error}</div>}

            <div className="flex gap-2 mt-6">
                <button onClick={doSave} disabled={saving} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5 py-2 rounded-lg disabled:opacity-50">{saving ? '建立中…' : '建立連線'}</button>
                {provider.capabilities.testConnection && (
                    <button onClick={doTest} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-semibold px-5 py-2 rounded-lg">測試</button>
                )}
            </div>
        </div>
    );
}
