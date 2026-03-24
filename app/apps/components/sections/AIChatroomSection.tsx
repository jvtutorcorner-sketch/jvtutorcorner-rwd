'use client';

import Link from 'next/link';
import { AppIntegration, AI_META } from '../../_types';
import { getSkillById } from '@/lib/ai-skills';

interface AIChatroomSectionProps {
    apps: AppIntegration[];
    getConnectedApps: (type: string) => AppIntegration[];
    openModal: (app: AppIntegration) => void;
}

export default function AIChatroomSection({ apps, getConnectedApps }: AIChatroomSectionProps) {
    const type = 'AI_CHATROOM';
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
                    <span className="text-xl mr-2">🤖</span>
                    AI 聊天室
                    <span className="ml-3 inline-flex items-center gap-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                        <span className="px-2.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-semibold">
                            {apps.filter(a => a.type === 'AI_CHATROOM' && a.status === 'ACTIVE').length}/{apps.filter(a => a.type === 'AI_CHATROOM').length}
                        </span>
                    </span>
                </h2>
                <Link href="/add-app?type=ai&provider=AI_CHATROOM" className="text-sm bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-semibold py-1.5 px-4 rounded-full transition-colors flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    新增聊天室設定
                </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-6 flex flex-col transition-all hover:shadow-md ${isConnected ? 'border-indigo-300 dark:border-indigo-600' : 'border-gray-200 dark:border-gray-700'}`}>
                    <div className="absolute top-3 right-3">
                        {isConnected ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500" />
                                </span>
                                已連接
                            </span>
                        ) : (
                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">未設定</span>
                        )}
                    </div>

                    <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl">{meta?.icon}</span>
                        <h3 className="font-bold text-gray-900 dark:text-white">{meta?.label || 'AI 聊天室'}</h3>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 flex-1">{meta?.desc}</p>

                    {activeApp && (() => {
                        const linked = apps.find(a => a.integrationId === activeApp.config?.linkedServiceId);
                        const skill = getSkillById(activeApp.config?.linkedSkillId);
                        const model = Array.isArray(linked?.config?.models)
                            ? linked?.config?.models[0]
                            : typeof linked?.config?.models === 'string'
                                ? linked?.config?.models.split(',').filter(Boolean)[0]
                                : null;
                        return (
                            <div className="mb-3 space-y-1">
                                <p className="text-xs text-indigo-600 dark:text-indigo-400 truncate">
                                    ✓ {activeApp.name}
                                    {activeApp.createdAt && (
                                        <span className="text-gray-400 ml-1">· {new Date(activeApp.createdAt).toLocaleDateString()}</span>
                                    )}
                                </p>
                                {linked && (
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                        {AI_META[linked.type]?.icon} {linked.name}{model ? ` · ${model}` : ''}
                                    </p>
                                )}
                                {skill && (
                                    <p className="text-[10px] text-indigo-500 dark:text-indigo-400 flex items-center gap-1 font-medium">
                                        {skill.icon} 串接技能：{skill.label}
                                    </p>
                                )}
                            </div>
                        );
                    })()}

                    {connected.length > 0 && (
                        <div className="mb-3 p-2.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                            <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                                <span>已設定: <strong className="text-indigo-600 dark:text-indigo-400">{activeCount}</strong></span>
                                <span>未設定: <strong className="text-orange-600 dark:text-orange-400">{inactiveCount}</strong></span>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        {isConnected ? (
                            <>
                                <Link
                                    href="/apps/ai-chat"
                                    className="w-full text-center text-xs bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-2 px-3 rounded-lg transition-all shadow-sm flex items-center justify-center gap-1.5"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                    </svg>
                                    開啟聊天室
                                </Link>
                                <Link
                                    href={`/add-app?type=ai&provider=${type}`}
                                    className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 font-medium py-2 px-3 rounded-lg transition-colors w-full text-center block"
                                >
                                    新增服務
                                </Link>
                            </>
                        ) : (
                            <Link
                                href={`/add-app?type=ai&provider=${type}`}
                                className="w-full text-center text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border border-indigo-300 font-semibold py-2 px-3 rounded-lg transition-colors"
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
