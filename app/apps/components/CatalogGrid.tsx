'use client';

// app/apps/components/CatalogGrid.tsx
// 服務目錄（marketplace）：依分類的卡片 + 搜尋，點「連線」導向新增頁。
// 已連線的服務顯示數量；multiInstance 顯示「再新增一個」。

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogProvider, CatalogCategory } from '@/lib/integrations/clientApi';

interface Props {
    providers: CatalogProvider[];
    categories: CatalogCategory[];
    countByType: (type: string) => number;
}

export default function CatalogGrid({ providers, categories, countByType }: Props) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [activeCat, setActiveCat] = useState<string>('all');

    const visible = useMemo(() => providers.filter((p) => {
        if (!p.defaults.visible || p.deprecated) return false;
        if (activeCat !== 'all' && p.category !== activeCat) return false;
        if (query) {
            const q = query.toLowerCase();
            if (!(`${p.defaults.label} ${p.defaults.desc} ${p.type}`.toLowerCase().includes(q))) return false;
        }
        return true;
    }), [providers, activeCat, query]);

    const byCategory = useMemo(() => {
        const map = new Map<string, CatalogProvider[]>();
        for (const p of [...visible].sort((a, b) => a.defaults.sortOrder - b.defaults.sortOrder)) {
            if (!map.has(p.category)) map.set(p.category, []);
            map.get(p.category)!.push(p);
        }
        return map;
    }, [visible]);

    const catLabel = (id: string) => categories.find((c) => c.id === id)?.label || id;
    const orderedCats = [...categories].sort((a, b) => a.sortOrder - b.sortOrder).filter((c) => byCategory.has(c.id));

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <input
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                    placeholder="搜尋服務…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setActiveCat('all')} className={`px-3 py-1.5 rounded-full text-xs ${activeCat === 'all' ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>全部</button>
                    {categories.map((c) => (
                        <button key={c.id} onClick={() => setActiveCat(c.id)} className={`px-3 py-1.5 rounded-full text-xs ${activeCat === c.id ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{c.label}</button>
                    ))}
                </div>
            </div>

            {orderedCats.length === 0 && <p className="text-sm text-gray-500 py-8 text-center">找不到符合的服務。</p>}

            {orderedCats.map((cat) => (
                <div key={cat.id}>
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">{catLabel(cat.id)}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {byCategory.get(cat.id)!.map((p) => {
                            const count = countByType(p.type);
                            const canAddMore = count === 0 || p.capabilities.multiInstance;
                            return (
                                <div key={p.type} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
                                    <div className="flex items-start gap-3 mb-2">
                                        <div className="text-2xl">{p.defaults.icon}</div>
                                        <div className="min-w-0">
                                            <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                                {p.defaults.label}
                                                {count > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">已連線 {count}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 flex-1 mb-3">{p.defaults.desc}</p>
                                    <button
                                        disabled={!canAddMore}
                                        onClick={() => router.push(`/apps/connections/new?type=${p.type}`)}
                                        className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-40"
                                    >
                                        {count > 0 ? (p.capabilities.multiInstance ? '再新增一個' : '已連線') : '連線'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
