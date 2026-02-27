'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AppIntegration {
    integrationId: string;
    userId: string;
    type: string; // 'LINE', 'ECPAY', 'PAYPAL', 'STRIPE'
    name: string;
    config?: Record<string, string>;
    status: string;
    createdAt: string;
}

const PAYMENT_TYPES = ['ECPAY', 'PAYPAL', 'STRIPE'];


export default function AppsPage() {
    const [apps, setApps] = useState<AppIntegration[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAppConfig, setSelectedAppConfig] = useState<AppIntegration | null>(null);
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

    return (
        <div className="page p-6 max-w-4xl mx-auto">
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
                    {apps.filter(app => !PAYMENT_TYPES.includes(app.type)).length === 0 ? (
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 text-center border border-dashed border-gray-300 dark:border-gray-700 mb-8">
                            <p className="text-gray-500 dark:text-gray-400 mb-4">尚未設定任何通訊工具。</p>
                            <Link href="/add-app" className="inline-block bg-white text-blue-600 border border-blue-600 hover:bg-blue-50 font-medium py-1.5 px-6 rounded-lg transition-colors">
                                新增通訊 App
                            </Link>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                            {apps.filter(app => !PAYMENT_TYPES.includes(app.type)).map((app) => (
                                <IntegrationCard key={app.integrationId} app={app} />
                            ))}
                        </div>
                    )}

                    <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2 mt-10">
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

                    {apps.filter(app => PAYMENT_TYPES.includes(app.type)).length === 0 ? (
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 text-center border border-dashed border-gray-300 dark:border-gray-700">
                            <p className="text-gray-500 dark:text-gray-400 mb-4">尚未綁定任何收款帳號。</p>
                            <Link href="/add-app?type=payment" className="inline-block bg-white text-green-600 border border-green-600 hover:bg-green-50 font-medium py-1.5 px-6 rounded-lg transition-colors">
                                新增金流服務設定
                            </Link>
                        </div>
                    ) : (
                        <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">服務類型</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">名稱</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">狀態</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">建立時間</th>
                                        <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {apps.filter(app => PAYMENT_TYPES.includes(app.type)).map((app) => {
                                        let badgeColor = 'bg-blue-100 text-blue-800';
                                        if (app.type === 'PAYPAL') badgeColor = 'bg-blue-100 text-blue-800';
                                        if (app.type === 'ECPAY') badgeColor = 'bg-emerald-100 text-emerald-800';
                                        if (app.type === 'STRIPE') badgeColor = 'bg-indigo-100 text-indigo-800';

                                        return (
                                            <tr key={app.integrationId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                    <span className={`px-2 py-1 text-xs font-bold rounded ${badgeColor}`}>
                                                        {app.type}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                                    {app.name}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    <span className={`px-2 py-1 text-xs font-bold rounded ${app.status === 'ACTIVE' ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}`}>
                                                        {app.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                    {new Date(app.createdAt).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                                    <button onClick={() => setSelectedAppConfig(app)} className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 font-semibold transition-colors">
                                                        詳細資訊
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
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
                                            金流詳細資訊 - {selectedAppConfig.name}
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
                                                                    {key.toLowerCase().includes('secret') || key.toLowerCase().includes('hashkey') || key.toLowerCase().includes('hashiv')
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
                                                * 為保護您的金流帳戶安全，機敏密鑰如 SecretKey 和 HashKey 等資訊以星號隱藏顯示。
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
function IntegrationCard({ app }: { app: AppIntegration }) {
    const isPayment = PAYMENT_TYPES.includes(app.type);

    // Config colors based on app type
    let badgeColor = 'bg-blue-100 text-blue-800';
    if (app.type === 'LINE') badgeColor = 'bg-green-100 text-green-800';
    if (app.type === 'PAYPAL') badgeColor = 'bg-blue-100 text-blue-800';
    if (app.type === 'ECPAY') badgeColor = 'bg-emerald-100 text-emerald-800';
    if (app.type === 'STRIPE') badgeColor = 'bg-indigo-100 text-indigo-800';

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
            <div>
                <div className="flex justify-between items-start mb-4">
                    <span className={`px-2 py-1 text-xs font-bold rounded ${badgeColor}`}>
                        {app.type}
                    </span>
                    <span className={`px-2 py-1 text-xs font-bold rounded ${app.status === 'ACTIVE' ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}`}>
                        {app.status}
                    </span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">{app.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    建立於 {new Date(app.createdAt).toLocaleDateString()}
                </p>
                {isPayment && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                        用於向學生收取課程費用
                    </p>
                )}
            </div>
            <div className="mt-6 pt-4 border-t border-gray-50 dark:border-gray-700 flex justify-end">
                <button className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 text-sm font-medium mr-4">
                    編輯設定
                </button>
                <button className="text-gray-400 hover:text-red-600 dark:hover:text-red-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

