'use client';

// app/apps/components/ConnectionsTable.tsx
// 「已連線」清單：狀態、預設星號、上次測試、啟用開關、列動作（編輯/停用/刪除）。

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ConnectionView, CatalogProvider } from '@/lib/integrations/clientApi';

interface Props {
    connections: ConnectionView[];
    getProvider: (type: string) => CatalogProvider | undefined;
    onToggle: (id: string, next: 'ACTIVE' | 'INACTIVE') => Promise<void>;
    onSetDefault: (id: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onBrowseCatalog: () => void;
}

function StatusBadge({ c }: { c: ConnectionView }) {
    if (c.status !== 'ACTIVE') return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">已停用</span>;
    if (c.lastTestStatus === 'FAIL') return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">測試失敗</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">啟用中</span>;
}

export default function ConnectionsTable({ connections, getProvider, onToggle, onSetDefault, onDelete, onBrowseCatalog }: Props) {
    const router = useRouter();
    const [confirmDelete, setConfirmDelete] = useState<ConnectionView | null>(null);
    const [confirmText, setConfirmText] = useState('');
    const [busy, setBusy] = useState<string | null>(null);

    if (connections.length === 0) {
        return (
            <div className="text-center py-16 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl">
                <p className="text-gray-500 mb-4">目前沒有任何已連線的服務。</p>
                <button onClick={onBrowseCatalog} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-4 py-2 rounded-lg">前往服務目錄</button>
            </div>
        );
    }

    const doDelete = async () => {
        if (!confirmDelete) return;
        setBusy(confirmDelete.integrationId);
        try {
            await onDelete(confirmDelete.integrationId);
            setConfirmDelete(null);
            setConfirmText('');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="space-y-2">
            {connections.map((c) => {
                const p = getProvider(c.type);
                return (
                    <div key={c.integrationId} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <div className="text-2xl w-8 text-center">{p?.defaults.icon || '🔌'}</div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-900 dark:text-white truncate">{c.name}</span>
                                <button
                                    title={c.isDefault ? '目前的預設連線' : '設為預設'}
                                    onClick={() => !c.isDefault && onSetDefault(c.integrationId)}
                                    className={c.isDefault ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-400'}
                                >★</button>
                                <StatusBadge c={c} />
                            </div>
                            <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                                <span>{p?.defaults.label || c.type}</span>
                                {c.lastTestedAt && <span>上次測試 {new Date(c.lastTestedAt).toLocaleString('zh-TW')}{c.lastTestStatus === 'OK' ? ' ✓' : c.lastTestStatus === 'FAIL' ? ' ✗' : ''}</span>}
                            </div>
                        </div>
                        {/* 啟用開關 */}
                        <button
                            role="switch"
                            aria-checked={c.status === 'ACTIVE'}
                            onClick={() => onToggle(c.integrationId, c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}
                            className={`relative w-10 h-6 rounded-full transition-colors ${c.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${c.status === 'ACTIVE' ? 'translate-x-4' : ''}`} />
                        </button>
                        <button
                            onClick={() => router.push(`/apps/connections/${c.integrationId}`)}
                            className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                        >編輯</button>
                        <button
                            onClick={() => { setConfirmDelete(c); setConfirmText(''); }}
                            className="text-sm px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >刪除</button>
                    </div>
                );
            })}

            {confirmDelete && (
                <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDelete(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">刪除連線</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                            即將刪除「<strong>{confirmDelete.name}</strong>」。此動作無法復原。
                            {confirmDelete.type === 'LINE' && <span className="block mt-1 text-red-600">⚠ 此 LINE 連線的 Webhook URL 將立即失效。</span>}
                        </p>
                        <p className="text-sm text-gray-500 mb-2">請輸入連線名稱以確認：</p>
                        <input
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm mb-4"
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder={confirmDelete.name}
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-700">取消</button>
                            <button
                                disabled={confirmText !== confirmDelete.name || busy === confirmDelete.integrationId}
                                onClick={doDelete}
                                className="px-4 py-2 rounded-lg text-sm bg-red-600 text-white disabled:opacity-40"
                            >{busy === confirmDelete.integrationId ? '刪除中…' : '確認刪除'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
