'use client';

// app/apps/page.tsx
// 應用程式後台（重構版）：服務目錄 + 已連線清單（schema 驅動、可完整編輯），
// AI 技能 / 平台 Agents / 目錄管理（皆 admin 可編輯），以及自動化。

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConnections } from './_hooks/useConnections';
import { useCatalog } from './_hooks/useCatalog';
import { useAppsPage } from './_hooks/useAppsPage';
import ConnectionsTable from './components/ConnectionsTable';
import CatalogGrid from './components/CatalogGrid';
import CatalogAdmin from './components/CatalogAdmin';
import SkillsEditor from './components/SkillsEditor';
import AgentsEditor from './components/AgentsEditor';
import AutomationSection from './components/sections/AutomationSection';

type Tab = 'connected' | 'catalog' | 'skills' | 'agents' | 'catalog-admin' | 'automation';

export default function AppsPage() {
    const router = useRouter();
    const params = useSearchParams();
    const { connections, loading: connLoading, toggleStatus, makeDefault, remove, countByType } = useConnections();
    const { providers, categories, loading: catLoading, getProvider } = useCatalog();
    const aux = useAppsPage(); // 自動化分頁仍沿用既有 cron 狀態

    const [isAdmin, setIsAdmin] = useState(false);
    useEffect(() => {
        try {
            const raw = localStorage.getItem('tutor_mock_user');
            if (raw) setIsAdmin(JSON.parse(raw)?.role === 'admin');
        } catch { /* ignore */ }
    }, []);

    const [tab, setTab] = useState<Tab>('connected');
    useEffect(() => {
        const t = params.get('tab');
        if (t === 'catalog' || params.get('type')) setTab('catalog');
        else if (['connected', 'skills', 'agents', 'catalog-admin', 'automation'].includes(t || '')) setTab(t as Tab);
    }, [params]);

    const allTabs: { id: Tab; label: string; admin?: boolean }[] = [
        { id: 'connected', label: '已連線' },
        { id: 'catalog', label: '服務目錄' },
        { id: 'skills', label: 'AI 技能', admin: true },
        { id: 'agents', label: '平台 Agents', admin: true },
        { id: 'catalog-admin', label: '目錄管理', admin: true },
        { id: 'automation', label: '自動化' },
    ];
    const tabs = allTabs.filter((t) => !t.admin || isAdmin);

    return (
        <div className="page p-6 max-w-5xl mx-auto">
            <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">應用程式</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">管理通訊、金流、郵件、AI 等第三方服務串接</p>
                </div>
                <Link href="/apps/page-permissions" className="text-sm bg-purple-100 hover:bg-purple-200 text-purple-700 font-semibold py-2 px-4 rounded-lg transition-colors self-start">
                    頁面存取權限
                </Link>
            </header>

            <div className="mb-6 flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                {tabs.map((t) => (
                    <button key={t.id} onClick={() => { setTab(t.id); router.replace(`/apps?tab=${t.id}`); }}
                        className={`px-4 py-3 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${tab === t.id ? 'text-purple-600 border-purple-600' : 'text-gray-500 border-transparent hover:text-gray-800'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'connected' && (
                connLoading ? <Spinner /> : (
                    <ConnectionsTable
                        connections={connections}
                        getProvider={getProvider}
                        onToggle={toggleStatus}
                        onSetDefault={makeDefault}
                        onDelete={remove}
                        onBrowseCatalog={() => { setTab('catalog'); router.replace('/apps?tab=catalog'); }}
                    />
                )
            )}

            {tab === 'catalog' && (catLoading ? <Spinner /> : <CatalogGrid providers={providers} categories={categories} countByType={countByType} />)}

            {tab === 'skills' && isAdmin && <SkillsEditor />}
            {tab === 'agents' && isAdmin && <AgentsEditor />}
            {tab === 'catalog-admin' && isAdmin && <CatalogAdmin />}

            {tab === 'automation' && (
                <AutomationSection
                    cronStatus={aux.cronStatus}
                    fetchingCronStatus={aux.fetchingCronStatus}
                    copySuccess={aux.copySuccess}
                    fetchCronStatus={aux.fetchCronStatus}
                    handleCopyToken={aux.handleCopyToken}
                    handleOpenReport={() => router.push('/dashboard/daily-report')}
                />
            )}
        </div>
    );
}

function Spinner() {
    return (
        <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600" />
        </div>
    );
}
