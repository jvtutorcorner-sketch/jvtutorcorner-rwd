'use client';

import Link from 'next/link';
import { AppIntegration, AI_META } from '../../_types';

interface AskPlanAgentSectionProps {
    apps: AppIntegration[];
    getConnectedApps: (type: string) => AppIntegration[];
    openModal: (app: AppIntegration) => void;
}

export default function AskPlanAgentSection({ apps, getConnectedApps }: AskPlanAgentSectionProps) {
    const type = 'ASK_PLAN_AGENT';
    const meta = AI_META[type];
    const connected = getConnectedApps(type);
    const isConnected = connected.length > 0;
    const activeApp = connected.find(a => a.status === 'ACTIVE');
    const activeCount = connected.filter(a => a.status === 'ACTIVE').length;
    const inactiveCount = connected.filter(a => a.status !== 'ACTIVE').length;

    return (
        <>
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                    <span className="text-xl mr-2">🧠</span>
                    Ask Plan Agent
                    <span className="ml-3 inline-flex items-center gap-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                        <span className="px-2.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-semibold">
                            {apps.filter(a => a.type === 'ASK_PLAN_AGENT' && a.status === 'ACTIVE').length}/{apps.filter(a => a.type === 'ASK_PLAN_AGENT').length}
                        </span>
                    </span>
                </h2>
                <Link href="/add-app?type=ai&provider=ASK_PLAN_AGENT" className="text-sm bg-purple-100 hover:bg-purple-200 text-purple-700 font-semibold py-1.5 px-4 rounded-full transition-colors flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    新增 Ask Plan Agent
                </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-6 flex flex-col transition-all hover:shadow-md ${isConnected ? 'border-purple-300 dark:border-purple-600' : 'border-gray-200 dark:border-gray-700'}`}>
                    <div className="absolute top-3 right-3">
                        {isConnected ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500" />
                                </span>
                                已連接
                            </span>
                        ) : (
                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">未設定</span>
                        )}
                    </div>

                    <div className="flex items-center gap-3 mb-3 mt-2">
                        <span className="text-2xl">{meta.icon}</span>
                        <h3 className="font-bold text-gray-900 dark:text-white">{meta.label}</h3>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 flex-1">{meta.desc}</p>

                    {activeApp && (
                        <p className="text-xs text-purple-600 dark:text-purple-400 mb-3 truncate font-medium">
                            ✓ {activeApp.name}
                        </p>
                    )}

                    {connected.length > 0 && (
                        <div className="mb-4 p-2.5 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                            <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                                <span>已設定: <strong className="text-purple-600 dark:text-purple-400">{activeCount}</strong></span>
                                <span>未設定: <strong className="text-orange-600 dark:text-orange-400">{inactiveCount}</strong></span>
                            </div>
                        </div>
                    )}

                    <div className="mt-auto space-y-2">
                        {isConnected ? (
                            <Link
                                href={`/add-app?type=ai&provider=${type}`}
                                className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 font-medium py-2 px-3 rounded-lg transition-colors w-full text-center block"
                            >
                                新增服務
                            </Link>
                        ) : (
                            <Link
                                href={`/add-app?type=ai&provider=${type}`}
                                className="w-full text-center text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-300 font-semibold py-2 px-3 rounded-lg transition-colors"
                            >
                                立即設定
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
