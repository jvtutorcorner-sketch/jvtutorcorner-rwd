'use client';

import Link from 'next/link';
import { AI_SKILLS, AISkill } from '@/lib/ai-skills';

interface SkillsSectionProps {
    setSelectedSkillPreview: (skill: AISkill) => void;
}

export default function SkillsSection({ setSelectedSkillPreview }: SkillsSectionProps) {
    return (
        <>
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                    <span className="text-xl mr-2">✨</span>
                    實用 AI 技能 (Skills)
                </h2>
                <span className="text-sm text-gray-500 dark:text-gray-400">熱門社群推薦</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                {AI_SKILLS.map((skill) => (
                    <div key={skill.id} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-lg transition-all group flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-2xl group-hover:scale-110 transition-transform">
                                    {skill.icon}
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{skill.label}</h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">{skill.desc}</p>
                        </div>
                        <div className="space-y-2">
                            <button
                                onClick={() => setSelectedSkillPreview(skill)}
                                className="w-full py-3 px-4 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 rounded-xl text-sm font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors flex items-center justify-center gap-2"
                            >
                                查看技能指令
                                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            </button>
                            <Link
                                href={`/add-app?type=ai&provider=AI_CHATROOM&name=${encodeURIComponent(skill.label)}&prompt=${encodeURIComponent(skill.prompt)}`}
                                className="w-full py-2 px-4 text-center text-[11px] text-gray-400 hover:text-indigo-500 transition-colors"
                            >
                                直接串接為 AI 聊天室
                            </Link>
                        </div>
                    </div>
                ))}

                {/* Placeholder */}
                <div className="bg-gray-50/50 dark:bg-gray-900/20 rounded-2xl p-6 border-2 border-dashed border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-400 mb-3 shadow-inner">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-500">更多實用技能</p>
                    <p className="text-xs text-gray-400 mt-1">開發者社群持續徵集中...</p>
                </div>
            </div>
        </>
    );
}
