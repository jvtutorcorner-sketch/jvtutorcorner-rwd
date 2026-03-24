'use client';

import Link from 'next/link';
import { AppIntegration, AI_CONTAINER_TYPES, AI_META, TestResult } from '../../_types';

interface AIToolsSectionProps {
    apps: AppIntegration[];
    aiTypes: string[];
    getConnectedApps: (type: string) => AppIntegration[];
    testingId: string | null;
    testResults: Record<string, TestResult>;
    handleTest: (app: AppIntegration) => void;
    openModal: (app: AppIntegration) => void;
    setShowSyncModal: (show: boolean) => void;
}

export default function AIToolsSection({ apps, aiTypes, getConnectedApps, setShowSyncModal }: AIToolsSectionProps) {
    return (
        <>
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                    <span className="text-xl mr-2">🤖</span>
                    AI 工具串接
                    <span className="ml-3 inline-flex items-center gap-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                        <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold">
                            {apps.filter(a => !AI_CONTAINER_TYPES.includes(a.type) && a.status === 'ACTIVE').length}/{apps.filter(a => !AI_CONTAINER_TYPES.includes(a.type)).length}
                        </span>
                    </span>
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowSyncModal(true)}
                        className="text-sm bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-semibold py-1.5 px-4 rounded-full transition-colors flex items-center shadow-sm"
                    >
                        <span className="mr-1">🔄</span> AI 模型同步管理
                    </button>
                    <Link href="/add-app?type=ai" className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold py-1.5 px-4 rounded-full transition-colors flex items-center">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        新增 AI 服務設定
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {aiTypes.filter(t => !AI_CONTAINER_TYPES.includes(t)).map((type: string) => {
                    const meta = AI_META[type];
                    const connected = getConnectedApps(type);
                    const isConnected = connected.length > 0;
                    const activeApp = connected.find(a => a.status === 'ACTIVE');
                    const activeCount = connected.filter(a => a.status === 'ACTIVE').length;
                    const inactiveCount = connected.filter(a => a.status !== 'ACTIVE').length;

                    return (
                        <div key={type} className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-6 flex flex-col transition-all hover:shadow-md ${isConnected ? 'border-blue-300 dark:border-blue-600' : 'border-gray-200 dark:border-gray-700'}`}>
                            <div className="absolute top-3 right-3">
                                {isConnected ? (
                                    <span className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                                        <span className="relative flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                                        </span>
                                        已連接
                                    </span>
                                ) : (
                                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500">未設定</span>
                                )}
                            </div>

                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl">{meta?.icon}</span>
                                <h3 className="font-bold text-gray-900 dark:text-white">{meta?.label || type}</h3>
                            </div>

                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 flex-1">{meta?.desc}</p>

                            {activeApp && (
                                <p className="text-xs text-blue-600 dark:text-blue-400 mb-3 truncate">
                                    ✓ {activeApp.name}
                                    {activeApp.createdAt && (
                                        <span className="text-gray-400 ml-1">· {new Date(activeApp.createdAt).toLocaleDateString()}</span>
                                    )}
                                </p>
                            )}

                            {connected.length > 0 && (
                                <div className="mb-3 p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                                        <span>已設定: <strong className="text-blue-600 dark:text-blue-400">{activeCount}</strong></span>
                                        <span>未設定: <strong className="text-orange-600 dark:text-orange-400">{inactiveCount}</strong></span>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2">
                                {isConnected ? (
                                    <Link
                                        href={`/add-app?type=ai&provider=${type}`}
                                        className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 font-medium py-2 px-3 rounded-lg transition-colors w-full text-center"
                                    >
                                        新增服務
                                    </Link>
                                ) : (
                                    <Link
                                        href={`/add-app?type=ai&provider=${type}`}
                                        className="w-full text-center text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 font-semibold py-2 px-3 rounded-lg transition-colors"
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
