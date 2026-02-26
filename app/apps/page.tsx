'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AppIntegration {
    integrationId: string;
    userId: string;
    type: string;
    name: string;
    status: string;
    createdAt: string;
}

export default function AppsPage() {
    const [apps, setApps] = useState<AppIntegration[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const fetchApps = async () => {
            try {
                let userId = 'anonymous';
                const raw = localStorage.getItem('tutor_user');
                if (raw) {
                    const stored = JSON.parse(raw);
                    userId = stored.email || stored.id || 'anonymous';
                }

                const res = await fetch(`/api/app-integrations?userId=${userId}`);
                const result = await res.json();

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
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">應用程式管理</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">管理您的通訊渠道串接</p>
                </div>
                <Link href="/add-app" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center shadow-md">
                    <svg className="w-5 h-5 mr-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span className="text-white">新增應用程式</span>
                </Link>
            </header>

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            ) : apps.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-12 text-center border border-dashed border-gray-300 dark:border-gray-700">
                    <div className="bg-blue-50 dark:bg-gray-700 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">尚無應用程式</h3>
                    <p className="text-gray-500 dark:text-gray-400 mb-6">您尚未建立任何應用程式串接。點擊上方按鈕開始新增。</p>
                    <Link href="/add-app" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-8 rounded-lg transition-colors shadow-lg">
                        <span className="text-white">立即新增</span>
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {apps.map((app) => (
                        <div key={app.integrationId} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-start mb-4">
                                    <span className={`px-2 py-1 text-xs font-bold rounded ${app.type === 'LINE' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
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
                            </div>
                            <div className="mt-6 pt-4 border-t border-gray-50 dark:border-gray-700 flex justify-end">
                                <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
