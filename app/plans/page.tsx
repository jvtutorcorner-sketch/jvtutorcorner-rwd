'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, StoredUser, PLAN_LABELS } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';

interface PlanUpgrade {
    upgradeId: string;
    userId: string;
    planId: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
}

export default function PlansPage() {
    const t = useT();
    const router = useRouter();
    const [user, setUser] = useState<StoredUser | null>(null);
    const [upgrades, setUpgrades] = useState<PlanUpgrade[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pricingSettings, setPricingSettings] = useState<any>(null);

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
            const url = isAdmin
                ? '/api/plan-upgrades'
                : `/api/plan-upgrades?userId=${encodeURIComponent(currentUser.email)}`;

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

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getEndTime = (upgrade: PlanUpgrade) => {
        const isPoint = upgrade.planId.startsWith('points_');
        if (isPoint) return '永久有效';

        // Subscription plans: 1 month duration
        const date = new Date(upgrade.createdAt);
        date.setMonth(date.getMonth() + 1);
        return formatDate(date.toISOString());
    };

    const getPlanLabel = (planId: string) => {
        // 1. Check mock auth labels
        if ((PLAN_LABELS as any)[planId]) return (PLAN_LABELS as any)[planId];

        // 2. Check dynamic pricing settings
        if (pricingSettings) {
            const plan = pricingSettings.plans?.find((p: any) => p.id === planId);
            if (plan) return plan.label;

            const pkg = pricingSettings.pointPackages?.find((p: any) => p.id === planId);
            if (pkg) return pkg.name;
        }

        return planId;
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

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

            <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    購買時間
                                </th>
                                {user?.role === 'admin' && (
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        使用者
                                    </th>
                                )}
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    項目
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    金額
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    生效日期
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    結束日期
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    狀態
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {upgrades.length > 0 ? (
                                upgrades.map((upgrade) => (
                                    <tr key={upgrade.upgradeId} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {formatDate(upgrade.createdAt)}
                                        </td>
                                        {user?.role === 'admin' && (
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {upgrade.userId}
                                            </td>
                                        )}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            <span className={`font-semibold ${upgrade.planId.startsWith('points_') ? 'text-blue-600' : 'text-indigo-600'}`}>
                                                {getPlanLabel(upgrade.planId)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {upgrade.currency} {upgrade.amount.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {formatDate(upgrade.createdAt)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {getEndTime(upgrade)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${upgrade.status === 'PAID'
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                {upgrade.status === 'PAID' ? '已付款' : '處理中'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={user?.role === 'admin' ? 7 : 6} className="px-6 py-12 text-center text-gray-500">
                                        <div className="flex flex-col items-center">
                                            <svg className="h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                            </svg>
                                            <p className="text-lg font-medium">尚無購買紀錄</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
