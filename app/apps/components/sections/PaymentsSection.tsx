'use client';

import Link from 'next/link';
import { AppIntegration, PAYMENT_TYPES, PAYMENT_META, TestResult } from '../../_types';

interface PaymentsSectionProps {
    apps: AppIntegration[];
    getConnectedApps: (type: string) => AppIntegration[];
    testingId: string | null;
    testResults: Record<string, TestResult>;
    handleTest: (app: AppIntegration) => void;
    openModal: (app: AppIntegration) => void;
}

export default function PaymentsSection({ apps, getConnectedApps, testingId, testResults, handleTest, openModal }: PaymentsSectionProps) {
    return (
        <>
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    金流服務設定
                    <span className="ml-3 inline-flex items-center gap-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                        <span className="px-2.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-semibold">
                            {apps.filter(a => PAYMENT_TYPES.includes(a.type) && a.status === 'ACTIVE').length}/{apps.filter(a => PAYMENT_TYPES.includes(a.type)).length}
                        </span>
                    </span>
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
                    const activeCount = connected.filter(a => a.status === 'ACTIVE').length;
                    const inactiveCount = connected.filter(a => a.status !== 'ACTIVE').length;

                    return (
                        <div key={type} className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-6 flex flex-col transition-all hover:shadow-md ${isConnected ? 'border-green-300 dark:border-green-600' : 'border-gray-200 dark:border-gray-700'}`}>
                            <div className="absolute top-3 right-3">
                                {isConnected ? (
                                    <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                                        <span className="relative flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
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
                                <p className="text-xs text-green-600 dark:text-green-400 mb-3 truncate">
                                    ✓ {activeApp.name}
                                    {activeApp.createdAt && (
                                        <span className="text-gray-400 ml-1">· {new Date(activeApp.createdAt).toLocaleDateString()}</span>
                                    )}
                                </p>
                            )}

                            {connected.length > 0 && (
                                <div className="mb-3 p-2.5 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                    <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                                        <span>已設定: <strong className="text-green-600 dark:text-green-400">{activeCount}</strong></span>
                                        <span>未設定: <strong className="text-orange-600 dark:text-orange-400">{inactiveCount}</strong></span>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                {isConnected && connected.map(c => testResults[c.integrationId] && (
                                    <div key={c.integrationId} className={`text-xs p-2 rounded-lg ${testResults[c.integrationId].success ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                                        <span className="font-bold">{testResults[c.integrationId].success ? '✓ 測試成功' : '✗ 測試失敗'}</span>
                                        <p className="mt-0.5 break-all">{testResults[c.integrationId].message}</p>
                                    </div>
                                ))}
                                <div className="flex gap-2">
                                    {isConnected ? (
                                        <>
                                            <button
                                                onClick={() => handleTest(connected[0])}
                                                disabled={testingId === connected[0].integrationId}
                                                className="flex-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50 font-medium py-2 px-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                                            >
                                                {testingId === connected[0].integrationId ? (
                                                    <>
                                                        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                        </svg>
                                                        測試中...
                                                    </>
                                                ) : '🔍 測試連線代碼'}
                                            </button>
                                            <button
                                                onClick={() => openModal(connected[0])}
                                                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 font-medium py-2 px-3 rounded-lg transition-colors"
                                            >
                                                設定
                                            </button>
                                        </>
                                    ) : (
                                        <Link
                                            href={`/add-app?type=payment&provider=${type}`}
                                            className="w-full text-center text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 font-semibold py-2 px-3 rounded-lg transition-colors"
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
        </>
    );
}
