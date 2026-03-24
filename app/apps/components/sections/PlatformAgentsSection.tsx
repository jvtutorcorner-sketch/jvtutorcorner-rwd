'use client';

import Link from 'next/link';
import { PLATFORM_AGENTS } from '@/lib/platform-agents';

export default function PlatformAgentsSection() {
    return (
        <>
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                    <span className="text-xl mr-2">🧭</span>
                    Platform Agents
                    <span className="ml-3 inline-flex items-center gap-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                        <span className="px-2.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-semibold">
                            {PLATFORM_AGENTS.length}
                        </span>
                    </span>
                </h2>
                <Link href="/apps/ai-chat" className="text-sm bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-semibold py-1.5 px-4 rounded-full transition-colors flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    開啟 AI 聊天室
                </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {PLATFORM_AGENTS.map(agent => (
                    <div key={agent.id} className="relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-5 flex flex-col transition-all hover:shadow-md">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg">{agent.icon}</div>
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-white text-sm">{agent.name}</h3>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{agent.desc}</p>
                            </div>
                        </div>
                        <p className="text-[11px] text-gray-600 dark:text-gray-300 flex-1 mb-3 line-clamp-4">{agent.longDesc}</p>
                        <div className="flex items-center gap-2 mt-2">
                            <button
                                onClick={() => window.location.assign('/apps/ai-chat')}
                                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-3 rounded-lg transition-colors"
                            >
                                開啟聊天室
                            </button>
                            <button
                                onClick={() => navigator.clipboard?.writeText(agent.exampleQuestions.join('\n'))}
                                className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 font-medium py-2 px-3 rounded-lg transition-colors"
                            >
                                複製範例問題
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}
