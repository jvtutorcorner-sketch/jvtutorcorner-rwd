'use client';

import Link from 'next/link';
import { AppIntegration, DATABASE_TYPES, DATABASE_META, TestResult } from '../../_types';

interface DatabaseSectionProps {
    apps: AppIntegration[];
    getConnectedApps: (type: string) => AppIntegration[];
    testingId: string | null;
    testResults: Record<string, TestResult>;
    handleTest: (app: AppIntegration) => void;
    openModal: (app: AppIntegration) => void;
}

export default function DatabaseSection({ apps, getConnectedApps }: DatabaseSectionProps) {
    return (
        <>
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                    <span className="text-xl mr-2">🗄️</span>
                    資料庫管理
                    <span className="ml-3 inline-flex items-center gap-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                        <span className="px-2.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs font-semibold">
                            {apps.filter(a => DATABASE_TYPES.includes(a.type) && a.status === 'ACTIVE').length}/{apps.filter(a => DATABASE_TYPES.includes(a.type)).length}
                        </span>
                    </span>
                </h2>
                <Link href="/add-app?type=database" className="text-sm bg-orange-100 hover:bg-orange-200 text-orange-700 font-semibold py-1.5 px-4 rounded-full transition-colors flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    新增資料庫
                </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {DATABASE_TYPES.map((type) => {
                    const meta = DATABASE_META[type];
                    const connected = getConnectedApps(type);
                    const isConnected = connected.length > 0;
                    const activeApp = connected.find(a => a.status === 'ACTIVE');
                    const activeCount = connected.filter(a => a.status === 'ACTIVE').length;
                    const inactiveCount = connected.filter(a => a.status !== 'ACTIVE').length;

                    return (
                        <div key={type} className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-6 flex flex-col transition-all hover:shadow-md ${isConnected ? 'border-orange-300 dark:border-orange-600' : 'border-gray-200 dark:border-gray-700'}`}>
                            <div className="absolute top-3 right-3">
                                {isConnected ? (
                                    <span className="flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                                        <span className="relative flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
                                        </span>
                                        已連接
                                    </span>
                                ) : (
                                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500">未設定</span>
                                )}
                            </div>

                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl">{meta.icon}</span>
                                <h3 className="font-bold text-gray-900 dark:text-white">{meta.label}</h3>
                            </div>

                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 flex-1">{meta.desc}</p>

                            {activeApp && (
                                <p className="text-xs text-orange-600 dark:text-orange-400 mb-3 truncate">
                                    ✓ {activeApp.name}
                                    {activeApp.createdAt && (
                                        <span className="text-gray-400 ml-1">· {new Date(activeApp.createdAt).toLocaleDateString()}</span>
                                    )}
                                </p>
                            )}

                            {connected.length > 0 && (
                                <div className="mb-3 p-2.5 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                                    <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                                        <span>已設定: <strong className="text-orange-600 dark:text-orange-400">{activeCount}</strong></span>
                                        <span>未設定: <strong className="text-orange-600 dark:text-orange-400">{inactiveCount}</strong></span>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2">
                                {isConnected ? (
                                    <Link
                                        href={`/add-app?type=database&provider=${type}`}
                                        className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 font-medium py-2 px-3 rounded-lg transition-colors w-full text-center"
                                    >
                                        新增資料庫
                                    </Link>
                                ) : (
                                    <Link
                                        href={`/add-app?type=database&provider=${type}`}
                                        className="w-full text-center text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 border border-orange-300 font-semibold py-2 px-3 rounded-lg transition-colors"
                                    >
                                        立即設定
                                    </Link>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
