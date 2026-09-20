'use client';

// app/apps/page.tsx
// 應用程式後台（重構版）：服務目錄 + 已連線清單（schema 驅動、可完整編輯），
// 保留 AI 技能 / 平台 Agents / 自動化 分頁（Phase 4 會把技能與 Agents 改為可編輯）。

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConnections } from './_hooks/useConnections';
import { useCatalog } from './_hooks/useCatalog';
import { useAppsPage } from './_hooks/useAppsPage';
import ConnectionsTable from './components/ConnectionsTable';
import CatalogGrid from './components/CatalogGrid';
import AutomationSection from './components/sections/AutomationSection';
import SkillsSection from './components/sections/SkillsSection';
import PlatformAgentsSection from './components/sections/PlatformAgentsSection';
import SkillPreviewModal from './components/SkillPreviewModal';

type Tab = 'connected' | 'catalog' | 'skills' | 'agents' | 'automation';

function AppsPageContent() {
    const router = useRouter();
    const params = useSearchParams();
    const { connections, loading: connLoading, toggleStatus, makeDefault, remove, countByType } = useConnections();
    const { providers, categories, loading: catLoading, getProvider } = useCatalog();

    // 保留分頁（技能 / Agents / 自動化）仍沿用既有狀態
    const aux = useAppsPage();

    const [tab, setTab] = useState<Tab>('connected');
    useEffect(() => {
        const t = params.get('tab');
        if (t === 'catalog' || params.get('type')) setTab('catalog');
        else if (t === 'skills' || t === 'agents' || t === 'automation' || t === 'connected') setTab(t as Tab);
    }, [params]);

    const tabs: { id: Tab; label: string }[] = [
        { id: 'connected', label: '已連線' },
        { id: 'catalog', label: '服務目錄' },
        { id: 'skills', label: 'AI 技能' },
        { id: 'agents', label: '平台 Agents' },
        { id: 'automation', label: '自動化' },
    ];

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

            {tab === 'catalog' && (
                catLoading ? <Spinner /> : <CatalogGrid providers={providers} categories={categories} countByType={countByType} />
            )}

            {tab === 'skills' && <SkillsSection setSelectedSkillPreview={aux.setSelectedSkillPreview} />}

            {tab === 'agents' && <PlatformAgentsSection />}

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

            {aux.selectedSkillPreview && (
                <SkillPreviewModal
                    skill={aux.selectedSkillPreview}
                    copySuccess={aux.copySuccess}
                    onClose={() => aux.setSelectedSkillPreview(null)}
                    onCopyToken={aux.handleCopyToken}
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

// useSearchParams 必須包在 Suspense 內，否則這頁在 build 期預先渲染會失敗
// （Next.js: missing-suspense-with-csr-bailout）。同專案其他頁面亦採此寫法。
export default function AppsPage() {
    return (
        <Suspense fallback={<Spinner />}>
            <AppsPageContent />
        </Suspense>
    );
}
