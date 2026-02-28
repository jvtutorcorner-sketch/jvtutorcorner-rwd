'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AppIntegration {
    integrationId: string;
    userId: string;
    type: string;
    name: string;
    config?: Record<string, string>;
    status: string;
    createdAt: string;
}

const PAYMENT_TYPES = ['ECPAY', 'PAYPAL', 'STRIPE'];
const CHANNEL_TYPES = ['LINE', 'TELEGRAM', 'WHATSAPP', 'MESSENGER', 'SLACK', 'TEAMS', 'DISCORD', 'WECHAT'];

/** 各通訊渠道的顏色、圖標與顯示名稱 */
const CHANNEL_META: Record<string, { badge: string; label: string; icon: string; desc: string }> = {
    LINE:      { badge: 'bg-green-100 text-green-800', label: 'LINE', icon: '💬', desc: '台灣、日本最常用的即時通訊軟體' },
    TELEGRAM:  { badge: 'bg-sky-100 text-sky-800', label: 'Telegram', icon: '✈️', desc: '加密即時通訊，支援 Bot API' },
    WHATSAPP:  { badge: 'bg-emerald-100 text-emerald-800', label: 'WhatsApp', icon: '📱', desc: '全球超過 20 億用戶的即時通訊' },
    MESSENGER: { badge: 'bg-blue-100 text-blue-800', label: 'Messenger', icon: '💙', desc: 'Facebook / Meta 即時通訊平台' },
    SLACK:     { badge: 'bg-purple-100 text-purple-800', label: 'Slack', icon: '🔗', desc: '企業團隊協作與訊息通知' },
    TEAMS:     { badge: 'bg-violet-100 text-violet-800', label: 'Teams', icon: '👥', desc: 'Microsoft 企業通訊與會議' },
    DISCORD:   { badge: 'bg-indigo-100 text-indigo-800', label: 'Discord', icon: '🎮', desc: '社群伺服器，適合線上課程群組' },
    WECHAT:    { badge: 'bg-lime-100 text-lime-800', label: 'WeChat', icon: '🟢', desc: '中國大陸最普及的通訊平台' },
};

const PAYMENT_META: Record<string, { badge: string; label: string; icon: string; desc: string }> = {
    ECPAY:  { badge: 'bg-emerald-100 text-emerald-800', label: '綠界科技 ECPay', icon: '🏦', desc: '台灣本地金流，支援超商/ATM/信用卡' },
    PAYPAL: { badge: 'bg-blue-100 text-blue-800', label: 'PayPal', icon: '🅿️', desc: '全球最大線上支付平台' },
    STRIPE: { badge: 'bg-indigo-100 text-indigo-800', label: 'Stripe', icon: '💳', desc: '全球開發者首選線上刷卡服務' },
};


export default function AppsPage() {
    const [apps, setApps] = useState<AppIntegration[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAppConfig, setSelectedAppConfig] = useState<AppIntegration | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);   // integrationId currently testing
    const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
    const router = useRouter();

    useEffect(() => {
        const fetchApps = async () => {
            try {
                let userId = 'anonymous';
                const raw = localStorage.getItem('tutor_user');
                if (raw) {
                    const stored = JSON.parse(raw);
                    userId = stored.id || stored.email || 'anonymous';
                }

                const res = await fetch(`/api/app-integrations?userId=${userId}`);
                const result = await res.json();

                console.log('[AppsPage] Fetch result:', { userId, ok: result.ok, total: result.total, data: result.data });

                if (result.ok) {
                    setApps(result.data);
                }
            } catch (err) {
                console.error('Failed to fetch apps:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchApps();
    }, []);

    /** 取得指定類型已連接的整合記錄 */
    const getConnectedApps = (type: string) => apps.filter(a => a.type === type);

    /** 測試指定整合的連線 */
    const handleTest = async (app: AppIntegration) => {
        const id = app.integrationId;
        setTestingId(id);
        // 清除先前結果
        setTestResults(prev => { const n = { ...prev }; delete n[id]; return n; });

        try {
            const res = await fetch('/api/app-integrations/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    integrationId: id,
                    type: app.type,
                    config: app.config,
                }),
            });
            const data = await res.json();
            if (data.ok && data.result) {
                setTestResults(prev => ({ ...prev, [id]: data.result }));
            } else {
                setTestResults(prev => ({ ...prev, [id]: { success: false, message: data.error || '測試失敗' } }));
            }
        } catch (e: any) {
            setTestResults(prev => ({ ...prev, [id]: { success: false, message: `請求失敗: ${e.message}` } }));
        } finally {
            setTestingId(null);
        }
    };

    return (
        <div className="page p-6 max-w-5xl mx-auto">
            <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">系統設定</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">管理您的通訊渠道與金流串接</p>
                </div>
                <div>
                    <Link href="/apps/page-permissions" className="text-sm bg-purple-100 hover:bg-purple-200 text-purple-700 font-semibold py-2 px-4 rounded-lg transition-colors flex items-center shadow-sm">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        頁面存取權限
                    </Link>
                </div>
            </header>

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            ) : (
                <>
                    {/* ─────────── 通訊渠道區塊 ─────────── */}
                    <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                            <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            通訊渠道
                        </h2>
                        <Link href="/add-app" className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold py-1.5 px-4 rounded-full transition-colors flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            新增通訊 App
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
                        {CHANNEL_TYPES.map((type) => {
                            const meta = CHANNEL_META[type];
                            const connected = getConnectedApps(type);
                            const isConnected = connected.length > 0;
                            const activeApp = connected.find(a => a.status === 'ACTIVE');

                            return (
                                <div key={type} className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-5 flex flex-col transition-all hover:shadow-md ${isConnected ? 'border-green-300 dark:border-green-600' : 'border-gray-200 dark:border-gray-700'}`}>
                                    {/* 連線狀態指示燈 */}
                                    <div className="absolute top-3 right-3">
                                        {isConnected ? (
                                            <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                                                <span className="relative flex h-2.5 w-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                                                </span>
                                                已連接
                                            </span>
                                        ) : (
                                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">未連接</span>
                                        )}
                                    </div>

                                    {/* 圖標與名稱 */}
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="text-2xl">{meta.icon}</span>
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white">{meta.label}</h3>
                                        </div>
                                    </div>

                                    {/* 說明文字 */}
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 flex-1">{meta.desc}</p>

                                    {/* 已連接的名稱 */}
                                    {activeApp && (
                                        <p className="text-xs text-green-600 dark:text-green-400 mb-3 truncate">
                                            ✓ {activeApp.name}
                                        </p>
                                    )}

                                    {/* 操作按鈕 */}
                                    <div className="space-y-2">
                                        {isConnected && (
                                            <>
                                                {/* 測試結果 */}
                                                {connected.map(c => testResults[c.integrationId] && (
                                                    <div key={c.integrationId} className={`text-xs p-2 rounded-lg ${testResults[c.integrationId].success ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                                                        <span className="font-bold">{testResults[c.integrationId].success ? '✓ 測試成功' : '✗ 測試失敗'}</span>
                                                        <p className="mt-0.5 break-all">{testResults[c.integrationId].message}</p>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                        <div className="flex gap-2">
                                            {isConnected ? (
                                                <>
                                                    <button
                                                        onClick={() => handleTest(connected[0])}
                                                        disabled={testingId === connected[0].integrationId}
                                                        className="flex-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50 font-medium py-2 px-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                                                    >
                                                        {testingId === connected[0].integrationId ? (
                                                            <><svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>測試中...</>
                                                        ) : (
                                                            <>🔍 測試連線</>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectedAppConfig(connected[0])}
                                                        className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 font-medium py-2 px-3 rounded-lg transition-colors"
                                                    >
                                                        設定
                                                    </button>
                                                    <Link
                                                        href={`/add-app?channel=${type}`}
                                                        className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 font-medium py-2 px-3 rounded-lg transition-colors"
                                                    >
                                                        新增
                                                    </Link>
                                                </>
                                            ) : (
                                                <Link
                                                    href={`/add-app?channel=${type}`}
                                                    className="w-full text-center text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 font-semibold py-2 px-3 rounded-lg transition-colors"
                                                >
                                                    立即串接
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ─────────── 金流服務區塊 ─────────── */}
                    <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                            <svg className="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                            金流服務設定
                        </h2>
                        <Link href="/add-app?type=payment" className="text-sm bg-green-100 hover:bg-green-200 text-green-700 font-semibold py-1.5 px-4 rounded-full transition-colors flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            新增金流服務設定
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                        {PAYMENT_TYPES.map((type) => {
                            const meta = PAYMENT_META[type];
                            const connected = getConnectedApps(type);
                            const isConnected = connected.length > 0;
                            const activeApp = connected.find(a => a.status === 'ACTIVE');

                            return (
                                <div key={type} className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-6 flex flex-col transition-all hover:shadow-md ${isConnected ? 'border-green-300 dark:border-green-600' : 'border-gray-200 dark:border-gray-700'}`}>
                                    {/* 連線狀態 */}
                                    <div className="absolute top-3 right-3">
                                        {isConnected ? (
                                            <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                                                <span className="relative flex h-2.5 w-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                                                </span>
                                                已連接
                                            </span>
                                        ) : (
                                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">未設定</span>
                                        )}
                                    </div>

                                    {/* 圖標與名稱 */}
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="text-2xl">{meta.icon}</span>
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white">{meta.label}</h3>
                                        </div>
                                    </div>

                                    {/* 說明文字 */}
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 flex-1">{meta.desc}</p>

                                    {/* 已連接的名稱 */}
                                    {activeApp && (
                                        <p className="text-xs text-green-600 dark:text-green-400 mb-3 truncate">
                                            ✓ {activeApp.name}
                                            {activeApp.createdAt && (
                                                <span className="text-gray-400 ml-1">· {new Date(activeApp.createdAt).toLocaleDateString()}</span>
                                            )}
                                        </p>
                                    )}

                                    {/* 操作按鈕 */}
                                    <div className="space-y-2">
                                        {isConnected && (
                                            <>
                                                {/* 測試結果 */}
                                                {connected.map(c => testResults[c.integrationId] && (
                                                    <div key={c.integrationId} className={`text-xs p-2 rounded-lg ${testResults[c.integrationId].success ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                                                        <span className="font-bold">{testResults[c.integrationId].success ? '✓ 測試成功' : '✗ 測試失敗'}</span>
                                                        <p className="mt-0.5 break-all">{testResults[c.integrationId].message}</p>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                        <div className="flex gap-2">
                                            {isConnected ? (
                                                <>
                                                    <button
                                                        onClick={() => handleTest(connected[0])}
                                                        disabled={testingId === connected[0].integrationId}
                                                        className="flex-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50 font-medium py-2 px-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                                                    >
                                                        {testingId === connected[0].integrationId ? (
                                                            <><svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>測試中...</>
                                                        ) : (
                                                            <>🔍 測試連線</>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectedAppConfig(connected[0])}
                                                        className="text-xs bg-green-50 hover:bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50 font-medium py-2 px-3 rounded-lg transition-colors"
                                                    >
                                                        設定
                                                    </button>
                                                    <Link
                                                        href={`/add-app?type=payment&provider=${type}`}
                                                        className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 font-medium py-2 px-3 rounded-lg transition-colors"
                                                    >
                                                        新增
                                                    </Link>
                                                </>
                                            ) : (
                                                <Link
                                                    href={`/add-app?type=payment&provider=${type}`}
                                                    className="w-full text-center text-xs bg-green-100 hover:bg-green-200 text-green-700 border border-green-300 font-semibold py-2 px-3 rounded-lg transition-colors"
                                                >
                                                    立即設定
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ─────────── 已連接的整合列表 ─────────── */}
                    {apps.length > 0 && (
                        <div className="mt-8">
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center border-b border-gray-200 dark:border-gray-700 pb-2">
                                <svg className="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                已連接的服務 ({apps.length})
                            </h2>
                            <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                                        <tr>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">類型</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">名稱</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">狀態</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">建立時間</th>
                                            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {apps.map((app) => {
                                            const isPayment = PAYMENT_TYPES.includes(app.type);
                                            const meta = isPayment ? PAYMENT_META[app.type] : CHANNEL_META[app.type];
                                            const badgeColor = meta?.badge || 'bg-gray-100 text-gray-800';
                                            const label = meta?.label || app.type;
                                            const icon = isPayment ? PAYMENT_META[app.type]?.icon : CHANNEL_META[app.type]?.icon;

                                            return (
                                                <tr key={app.integrationId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded ${badgeColor}`}>
                                                            {icon && <span>{icon}</span>}{label}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                                        {app.name}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                        <span className={`px-2 py-1 text-xs font-bold rounded ${app.status === 'ACTIVE' ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}`}>
                                                            {app.status === 'ACTIVE' ? '啟用' : '停用'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                        {new Date(app.createdAt).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium space-x-3">
                                                        <button
                                                            onClick={() => handleTest(app)}
                                                            disabled={testingId === app.integrationId}
                                                            className={`font-semibold transition-colors ${testingId === app.integrationId ? 'text-gray-400 cursor-wait' : 'text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300'}`}
                                                        >
                                                            {testingId === app.integrationId ? '測試中...' : '測試'}
                                                        </button>
                                                        <button onClick={() => setSelectedAppConfig(app)} className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 font-semibold transition-colors">
                                                            詳細
                                                        </button>
                                                        {/* 測試結果行內顯示 */}
                                                        {testResults[app.integrationId] && (
                                                            <span className={`text-xs ${testResults[app.integrationId].success ? 'text-green-600' : 'text-red-600'}`}>
                                                                {testResults[app.integrationId].success ? '✓' : '✗'}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Modal for viewing details */}
            {selectedAppConfig && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        {/* Background overlay */}
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setSelectedAppConfig(null)}></div>

                        {/* Centering trick */}
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                        {/* Modal Panel */}
                        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                            <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="sm:flex sm:items-start">
                                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900 sm:mx-0 sm:h-10 sm:w-10">
                                        <svg className="h-6 w-6 text-blue-600 dark:text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
                                            詳細資訊 - {selectedAppConfig.name}
                                        </h3>
                                        <div className="mt-4">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                                                <strong>服務類型：</strong> {selectedAppConfig.type}
                                            </p>
                                            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md border border-gray-200 dark:border-gray-700 overflow-x-auto text-sm">
                                                {selectedAppConfig.config ? (
                                                    <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                                                        {Object.entries(selectedAppConfig.config).map(([key, value]) => (
                                                            <li key={key} className="flex flex-col sm:flex-row sm:items-center">
                                                                <span className="font-semibold w-1/3 truncate text-gray-500 dark:text-gray-400 capitalize">{key}:</span>
                                                                <span className="w-2/3 break-all bg-white dark:bg-gray-800 px-2 py-1 rounded inline-block shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600">
                                                                    {key.toLowerCase().includes('secret') || key.toLowerCase().includes('hashkey') || key.toLowerCase().includes('hashiv') || key.toLowerCase().includes('token') || key.toLowerCase().includes('password')
                                                                        ? '**********'
                                                                        : value}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="text-gray-500 italic">無可用的詳細配置</p>
                                                )}
                                            </div>
                                            <p className="text-xs text-red-500 dark:text-red-400 mt-4 italic">
                                                * 為保護帳戶安全，機敏密鑰如 Token、Secret、Password 等資訊以星號隱藏顯示。
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                                <button
                                    type="button"
                                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                                    onClick={() => setSelectedAppConfig(null)}
                                >
                                    關閉
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

