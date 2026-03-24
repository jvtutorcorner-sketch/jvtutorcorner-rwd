'use client';

import Link from 'next/link';
import { AISkill } from '@/lib/ai-skills';

interface SkillPreviewModalProps {
    skill: AISkill;
    copySuccess: string | null;
    onClose: () => void;
    onCopyToken: (text: string, type: string) => void;
}

export default function SkillPreviewModal({ skill, copySuccess, onClose, onCopyToken }: SkillPreviewModalProps) {
    return (
        <div className="fixed inset-0 z-[999] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:p-0">
                <div
                    className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity z-[999]"
                    aria-hidden="true"
                    onClick={onClose}
                />
                <div className="relative inline-block align-middle bg-white dark:bg-gray-800 rounded-3xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full z-[1000] border border-gray-100 dark:border-gray-700">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-700 px-8 py-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white text-2xl shadow-inner">
                                {skill.icon}
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white tracking-tight">{skill.label}</h3>
                                <p className="text-indigo-100 text-xs font-medium opacity-90">技能指令預覽</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-all"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="p-8">
                        {/* Description */}
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="w-1.5 h-4 bg-indigo-500 rounded-full" />
                                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">技能描述</h4>
                            </div>
                            <p className="text-base text-gray-700 dark:text-gray-300 bg-gray-50/80 dark:bg-gray-900/40 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 leading-relaxed shadow-sm">
                                {skill.desc}
                            </p>
                        </div>

                        {/* Prompt */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-4 bg-purple-500 rounded-full" />
                                    <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">System Prompt (系統提示詞)</h4>
                                </div>
                                <button
                                    onClick={() => onCopyToken(skill.prompt, 'prompt')}
                                    className={`text-xs font-bold px-4 py-1.5 rounded-full transition-all flex items-center gap-2 shadow-sm ${
                                        copySuccess === 'prompt'
                                            ? 'bg-green-500 text-white'
                                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    {copySuccess === 'prompt' ? (
                                        <>
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                            </svg>
                                            已複製
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                            </svg>
                                            複製指令
                                        </>
                                    )}
                                </button>
                            </div>
                            <div className="relative group">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-1000" />
                                <div className="relative bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl max-h-[350px] overflow-y-auto custom-scrollbar">
                                    <pre className="text-[14px] text-slate-200 font-mono whitespace-pre-wrap leading-relaxed selection:bg-indigo-500/30">
                                        {skill.prompt}
                                    </pre>
                                </div>
                            </div>
                            <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2 font-medium">
                                <span className="flex items-center justify-center w-5 h-5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full">!</span>
                                您可以直接複製此指令運用到您的 AI 機器人設定中。
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={onClose}
                                className="flex-1 py-4 px-6 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-2xl text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all border border-transparent shadow-sm"
                            >
                                暫時關閉
                            </button>
                            <Link
                                href={`/add-app?type=ai&provider=AI_CHATROOM&name=${encodeURIComponent(skill.label)}&prompt=${encodeURIComponent(skill.prompt)}`}
                                className="flex-[2] py-4 px-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl text-sm font-black hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-indigo-500/25 transition-all text-center flex items-center justify-center gap-2 group"
                            >
                                使用此技能建立 AI 服務
                                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
