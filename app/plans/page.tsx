'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { getStoredUser, StoredUser, PLAN_LABELS } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';
import Pagination from '@/components/Pagination';

interface PlanUpgrade {
    upgradeId: string;
    userId: string;
    planId: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
}

function PlansPageContent() {
    const t = useT();
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const [user, setUser] = useState<StoredUser | null>(null);
    const [upgrades, setUpgrades] = useState<PlanUpgrade[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pricingSettings, setPricingSettings] = useState<any>(null);

    // Filter and Pagination state
    const limitParam = parseInt(searchParams.get('limit') || '20', 10);
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const qSearch = searchParams.get('search') || '';
    const qTimeFrom = searchParams.get('timeFrom') || '';
    const qTimeTo = searchParams.get('timeTo') || '';
    const activeTab = searchParams.get('tab') || 'subscription';
    const qSortField = searchParams.get('sortField') || 'createdAt';
    const qSortOrder = searchParams.get('sortOrder') || 'desc';

    const [searchInput, setSearchInput] = useState(qSearch);
    const [searchInputTimeFrom, setSearchInputTimeFrom] = useState(qTimeFrom);
    const [searchInputTimeTo, setSearchInputTimeTo] = useState(qTimeTo);

    useEffect(() => {
        const storedUser = getStoredUser();
        if (!storedUser) {
            router.push('/login');
            return;
        }
        setUser(storedUser);
        fetchUpgrades(storedUser);
        fetchPricingSettings();
    }, [router]);

    async function fetchPricingSettings() {
        try {
            const res = await fetch('/api/admin/pricing');
            const data = await res.json();
            if (data.ok) {
                setPricingSettings(data.settings);
            }
        } catch (err) {
            console.error('Failed to fetch pricing settings:', err);
        }
    }

    async function fetchUpgrades(currentUser: StoredUser) {
        setLoading(true);
        setError(null);
        try {
            const isAdmin = currentUser.role === 'admin';
            const userId = currentUser.roid_id || currentUser.id || currentUser.email;
            const url = isAdmin
                ? '/api/plan-upgrades'
                : `/api/plan-upgrades?userId=${encodeURIComponent(userId)}`;

            const res = await fetch(url);
            const data = await res.json();

            if (data.ok) {
                setUpgrades(data.data || []);
            } else {
                setError(data.error || 'Failed to fetch plans');
            }
        } catch (err) {
            console.error('Error fetching upgrades:', err);
            setError('An error occurred while fetching plans');
        } finally {
            setLoading(false);
        }
    }

    const formatDate = (dateValue: any) => {
        const d = new Date(dateValue);
        if (!dateValue || isNaN(d.getTime())) return '—';
        return d.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    /** 取得訂閱方案的結束日期 */
    const getSubscriptionEndDate = (upgrade: PlanUpgrade): string => {
        const date = new Date(upgrade.createdAt);
        if (isNaN(date.getTime())) return '—';

        if (!pricingSettings) {
            // fallback: 1 month
            date.setMonth(date.getMonth() + 1);
            return formatDate(date);
        }
        const plan = pricingSettings.plans?.find((p: any) => p.id === upgrade.planId);
        const durationDays = plan?.durationDays;
        if (durationDays) {
            date.setDate(date.getDate() + durationDays);
        } else {
            date.setMonth(date.getMonth() + 1);
        }
        return formatDate(date);
    };

    const getPlanLabel = (planId: string) => {
        if ((PLAN_LABELS as any)[planId]) return (PLAN_LABELS as any)[planId];
        if (pricingSettings) {
            const plan = pricingSettings.plans?.find((p: any) => p.id === planId);
            if (plan) return plan.label;
            const pkg = pricingSettings.pointPackages?.find((p: any) => p.id === planId);
            if (pkg) return pkg.name;
        }
        return planId;
    };

    /** 取得點數套餐購買的點數數量 */
    const getPointsAmount = (planId: string): number | null => {
        if (!pricingSettings) return null;
        const pkg = pricingSettings.pointPackages?.find((p: any) => p.id === planId);
        return pkg?.points ?? null;
    };

    /** 取得關聯的應用方案列表 */
    const getAssociatedAppPlans = (planId: string) => {
        if (!pricingSettings) return [];

        let appPlanIds: string[] = [];
        const plan = pricingSettings.plans?.find((p: any) => p.id === planId);
        if (plan) {
            appPlanIds = plan.appPlanIds || [];
        } else {
            const pkg = pricingSettings.pointPackages?.find((p: any) => p.id === planId);
            if (pkg) appPlanIds = pkg.appPlanIds || [];
        }

        if (appPlanIds.length === 0) return [];

        return appPlanIds.map(id => {
            const appPlan = pricingSettings.appPlans?.find((ap: any) => ap.id === id);
            if (!appPlan) return { name: id, durationDays: null, pointsCost: null };
            return {
                name: appPlan.name,
                durationDays: appPlan.durationDays ?? null,
                pointsCost: appPlan.pointsCost ?? null,
            };
        });
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', '1');
        if (searchInput.trim()) params.set('search', searchInput.trim());
        else params.delete('search');
        if (searchInputTimeFrom) params.set('timeFrom', searchInputTimeFrom);
        else params.delete('timeFrom');
        if (searchInputTimeTo) params.set('timeTo', searchInputTimeTo);
        else params.delete('timeTo');
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleTabChange = (newTab: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', newTab);
        params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleSort = (field: string) => {
        const params = new URLSearchParams(searchParams.toString());
        const currentField = params.get('sortField') || 'createdAt';
        const currentOrder = params.get('sortOrder') || 'desc';

        if (currentField === field) {
            params.set('sortOrder', currentOrder === 'asc' ? 'desc' : 'asc');
        } else {
            params.set('sortField', field);
            params.set('sortOrder', 'asc');
        }
        params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    };

    const SortIcon = ({ field }: { field: string }) => {
        if (qSortField !== field) return <svg className="w-3 h-3 ml-1 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
        return qSortOrder === 'asc' 
            ? <svg className="w-3 h-3 ml-1 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            : <svg className="w-3 h-3 ml-1 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
    };

    // 1. Filter by Tab Type first
    let tabFilteredUpgrades = upgrades.filter(u => {
        const isPoints = u.planId && u.planId.startsWith('points_');
        return activeTab === 'points' ? isPoints : !isPoints;
    });

    // 2. Filter by search criteria
    if (qSearch) {
        const lowerQ = qSearch.toLowerCase();
        tabFilteredUpgrades = tabFilteredUpgrades.filter(u => {
            const planLabel = getPlanLabel(u.planId).toLowerCase();
            const userId = u.userId.toLowerCase();
            return planLabel.includes(lowerQ) || userId.includes(lowerQ);
        });
    }
    if (qTimeTo) {
        const toMs = new Date(qTimeTo).getTime();
        tabFilteredUpgrades = tabFilteredUpgrades.filter(u => new Date(u.createdAt).getTime() <= toMs);
    }

    // 2.5 Sort Data
    const sortedUpgrades = [...tabFilteredUpgrades].sort((a, b) => {
        let valA: any = a[qSortField as keyof PlanUpgrade];
        let valB: any = b[qSortField as keyof PlanUpgrade];

        if (qSortField === 'title') {
            valA = getPlanLabel(a.planId);
            valB = getPlanLabel(b.planId);
        }

        if (valA < valB) return qSortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return qSortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    // 3. Paginate
    const totalItems = sortedUpgrades.length;
    const startIndex = (pageParam - 1) * limitParam;
    const paginatedUpgrades = sortedUpgrades.slice(startIndex, startIndex + limitParam);

    const StatusBadge = ({ status }: { status: string }) => (
        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${status === 'PAID' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}>
            {status === 'PAID' ? '已付款' : '處理中'}
        </span>
    );

    /** 渲染「訂閱方案」表格 */
    const renderSubscriptionTable = (data: PlanUpgrade[]) => {
        // columns: 購買時間 | [使用者] | 項目 | 金額 | 生效日期 | 結束日期 | 狀態
        const colCount = user?.role === 'admin' ? 7 : 6;
        return (
            <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200 mb-12">
                <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-4 flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </span>
                    <div>
                        <h2 className="text-xl font-bold text-indigo-900">訂閱方案紀錄</h2>
                        <p className="text-xs text-indigo-500 mt-0.5">包含訂閱期間與金額資訊</p>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th 
                                    className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                                    onClick={() => handleSort('createdAt')}
                                >
                                    <div className="flex items-center">購買時間 <SortIcon field="createdAt" /></div>
                                </th>
                                {user?.role === 'admin' && (
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">使用者</th>
                                )}
                                <th 
                                    className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                                    onClick={() => handleSort('title')}
                                >
                                    <div className="flex items-center">訂閱方案 <SortIcon field="title" /></div>
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">金額</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">生效日期</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">結束日期</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">狀態</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.length > 0 ? data.map((upgrade) => {
                                const appPlans = getAssociatedAppPlans(upgrade.planId);
                                return (
                                    <React.Fragment key={upgrade.upgradeId}>
                                        <tr className="hover:bg-indigo-50/30 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                {formatDate(upgrade.createdAt)}
                                            </td>
                                            {user?.role === 'admin' && (
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                    {upgrade.userId}
                                                </td>
                                            )}
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <span className="font-semibold text-indigo-600">
                                                    {getPlanLabel(upgrade.planId)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {upgrade.currency} {(upgrade.amount ?? 0).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                {formatDate(upgrade.createdAt)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                {getSubscriptionEndDate(upgrade)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <StatusBadge status={upgrade.status} />
                                            </td>
                                        </tr>
                                        {appPlans.length > 0 && (
                                            <tr className="bg-indigo-50/20">
                                                <td colSpan={colCount} className="px-12 py-3 border-t border-indigo-100/50">
                                                    <div className="flex flex-col space-y-2 border-l-2 border-indigo-300/40 pl-4 py-1">
                                                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                                                            關聯應用方案
                                                        </span>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                            {appPlans.map((ap: any, idx: number) => (
                                                                <div key={idx} className="flex flex-col p-2.5 bg-white rounded border border-indigo-100 shadow-sm">
                                                                    <span className="text-sm font-semibold text-gray-800">{ap.name}</span>
                                                                    <div className="flex flex-wrap gap-2 mt-1.5">
                                                                        {ap.durationDays != null && (
                                                                            <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
                                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                                                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                                </svg>
                                                                                有效期 {ap.durationDays} 天
                                                                            </span>
                                                                        )}
                                                                        {ap.pointsCost != null && ap.pointsCost > 0 && (
                                                                            <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                                                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                                </svg>
                                                                                消耗 {ap.pointsCost} 點
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={colCount} className="px-6 py-8 text-center text-gray-400 italic">
                                        尚無訂閱方案紀錄
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    /** 渲染「點數購買」表格 */
    const renderPointsTable = (data: PlanUpgrade[]) => {
        // columns: 購買時間 | [使用者] | 點數套餐 | 購買點數 | 金額 | 狀態
        const colCount = user?.role === 'admin' ? 6 : 5;
        return (
            <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200 mb-12">
                <div className="bg-blue-50 border-b border-blue-100 px-6 py-4 flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </span>
                    <div>
                        <h2 className="text-xl font-bold text-blue-900">點數購買紀錄</h2>
                        <p className="text-xs text-blue-500 mt-0.5">點數無使用期限，購買後永久有效</p>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th 
                                    className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                                    onClick={() => handleSort('createdAt')}
                                >
                                    <div className="flex items-center">購買時間 <SortIcon field="createdAt" /></div>
                                </th>
                                {user?.role === 'admin' && (
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">使用者</th>
                                )}
                                <th 
                                    className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                                    onClick={() => handleSort('title')}
                                >
                                    <div className="flex items-center">點數套餐 <SortIcon field="title" /></div>
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">購買點數</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">金額</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">狀態</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.length > 0 ? data.map((upgrade) => {
                                const points = getPointsAmount(upgrade.planId);
                                const appPlans = getAssociatedAppPlans(upgrade.planId);
                                return (
                                    <React.Fragment key={upgrade.upgradeId}>
                                        <tr className="hover:bg-blue-50/30 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                {formatDate(upgrade.createdAt)}
                                            </td>
                                            {user?.role === 'admin' && (
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                    {upgrade.userId}
                                                </td>
                                            )}
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <span className="font-semibold text-blue-600">
                                                    {getPlanLabel(upgrade.planId)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                {points != null ? (
                                                    <span className="inline-flex items-center gap-1.5 font-bold text-blue-700">
                                                        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        {points.toLocaleString()} 點
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {upgrade.currency} {(upgrade.amount ?? 0).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <StatusBadge status={upgrade.status} />
                                            </td>
                                        </tr>
                                        {appPlans.length > 0 && (
                                            <tr className="bg-blue-50/20">
                                                <td colSpan={colCount} className="px-12 py-3 border-t border-blue-100/50">
                                                    <div className="flex flex-col space-y-2 border-l-2 border-blue-300/40 pl-4 py-1">
                                                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">
                                                            關聯應用方案
                                                        </span>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                            {appPlans.map((ap: any, idx: number) => (
                                                                <div key={idx} className="flex flex-col p-2.5 bg-white rounded border border-blue-100 shadow-sm">
                                                                    <span className="text-sm font-semibold text-gray-800">{ap.name}</span>
                                                                    <div className="flex flex-wrap gap-2 mt-1.5">
                                                                        {ap.durationDays != null && (
                                                                            <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
                                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                                                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                                </svg>
                                                                                有效期 {ap.durationDays} 天
                                                                            </span>
                                                                        )}
                                                                        {ap.pointsCost != null && ap.pointsCost > 0 && (
                                                                            <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                                                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                                </svg>
                                                                                消耗 {ap.pointsCost} 點
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={colCount} className="px-6 py-8 text-center text-gray-400 italic">
                                        尚無點數購買紀錄
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="page max-w-7xl mx-auto p-6">
            <header className="page-header mb-8 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            {user?.role === 'admin' ? '全站購買與方案紀錄' : '我的方案紀錄'}
                        </h1>
                        <p className="text-gray-600 mt-2">
                            {user?.role === 'admin'
                                ? '管理員可在此查看所有使用者的方案購買、點數儲值與使用期限。'
                                : '您可以在此查看您過去購買的所有方案、點數儲值與有效期限。'}
                        </p>
                    </div>
                </div>

                {/* 搜尋欄位 */}
                <form onSubmit={handleSearch} className="flex gap-4 mt-8 items-end flex-wrap">
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-bold text-gray-700">搜尋關鍵字</label>
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder={user?.role === 'admin' ? "搜尋使用者或方案..." : "搜尋方案名稱..."}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[200px]"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-bold text-gray-700">開始日期</label>
                        <input
                            type="date"
                            value={searchInputTimeFrom}
                            onChange={(e) => setSearchInputTimeFrom(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-bold text-gray-700">結束日期</label>
                        <input
                            type="date"
                            value={searchInputTimeTo}
                            onChange={(e) => setSearchInputTimeTo(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <button type="submit" className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors shadow-sm h-[42px]">
                        {t('search')}
                    </button>
                    <button 
                        type="button" 
                        onClick={() => {
                            setSearchInput('');
                            setSearchInputTimeFrom('');
                            setSearchInputTimeTo('');
                            router.push(pathname);
                        }}
                        className="px-4 py-2 text-gray-600 font-medium hover:text-gray-900 h-[42px]"
                    >
                        清除重置
                    </button>
                </form>

                {/* Tab 切換器 - 現代化設計 */}
                <div className="mt-10 mb-2">
                    <div className="inline-flex p-1 bg-gray-100/80 backdrop-blur-sm rounded-xl border border-gray-200/50 shadow-sm">
                        <button
                            onClick={() => handleTabChange('subscription')}
                            className={`flex items-center gap-2.5 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${activeTab === 'subscription'
                                ? 'bg-white text-indigo-600 shadow-md transform scale-[1.02]'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            <svg className={`w-4 h-4 ${activeTab === 'subscription' ? 'text-indigo-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            訂閱方案紀錄
                        </button>
                        <button
                            onClick={() => handleTabChange('points')}
                            className={`flex items-center gap-2.5 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${activeTab === 'points'
                                ? 'bg-white text-blue-600 shadow-md transform scale-[1.02]'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            <svg className={`w-4 h-4 ${activeTab === 'points' ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            點數購買紀錄
                        </button>
                    </div>
                </div>
            </header>

            {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-8">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />
                </div>
            ) : (
                <>
                    {activeTab === 'subscription' ? renderSubscriptionTable(paginatedUpgrades) : renderPointsTable(paginatedUpgrades)}
                    
                    {paginatedUpgrades.length === 0 && (
                        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-100">
                            <p className="text-gray-400 italic">目前分類下沒有符合條件的紀錄</p>
                        </div>
                    )}

                    <Pagination
                        totalItems={totalItems}
                        pageSize={limitParam}
                        currentPage={pageParam}
                    />
                </>
            )}
        </div>
    );
}

export default function PlansPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" /></div>}>
            <PlansPageContent />
        </Suspense>
    );
}
