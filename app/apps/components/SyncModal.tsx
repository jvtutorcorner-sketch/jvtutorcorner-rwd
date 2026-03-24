'use client';

import React from 'react';
import { AI_META } from '../_types';
import { SyncPreview } from '../_hooks/useAppsPage';

interface SyncModalProps {
    aiModelOptions: Record<string, string[]>;
    selectedSyncProvider: string;
    syncPreview: SyncPreview | null;
    isSyncing: boolean;
    syncActionStatus: { type: 'success' | 'error'; message: string } | null;
    setSelectedSyncProvider: (p: string) => void;
    setSyncPreview: (p: SyncPreview | null) => void;
    setSyncActionStatus: (s: { type: 'success' | 'error'; message: string } | null) => void;
    onClose: () => void;
    onPreview: (provider: string) => Promise<void>;
    onApply: (provider: string, models: string[]) => Promise<void>;
}

const SpinnerIcon = () => (
    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
);

export default function SyncModal({
    aiModelOptions, selectedSyncProvider, syncPreview,
    isSyncing, syncActionStatus,
    setSelectedSyncProvider, setSyncPreview, setSyncActionStatus,
    onClose, onPreview, onApply,
}: SyncModalProps) {
    const handleClose = () => {
        onClose();
        setSyncPreview(null);
        setSyncActionStatus(null);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-indigo-600">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">🔄 AI 模型同步管理</h3>
                    <button onClick={handleClose} className="text-white/70 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                        您可以在此同步各家 AI 供應商最新的模型清單。同步後，所有相關的 AI 服務設定都會自動載入最新模型。
                    </p>

                    <div className="flex flex-col gap-6">
                        {/* Provider selector */}
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">選擇供應商 (AI Provider):</label>
                            <div className="flex gap-2">
                                {(['GEMINI', 'OPENAI', 'ANTHROPIC'] as const).map(p => (
                                    <button
                                        key={p}
                                        onClick={() => { setSelectedSyncProvider(p); setSyncPreview(null); setSyncActionStatus(null); }}
                                        className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all border-2 ${selectedSyncProvider === p ? 'bg-indigo-50 border-indigo-600 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-400 dark:text-indigo-300' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-200 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400'}`}
                                    >
                                        {AI_META[p]?.label || p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Current models */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-end">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">目前資料庫中的模型：</label>
                                <span className="text-xs text-gray-400">共 {aiModelOptions[selectedSyncProvider]?.length || 0} 個</span>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700 min-h-[100px] max-h-[200px] overflow-y-auto">
                                {aiModelOptions[selectedSyncProvider]?.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {aiModelOptions[selectedSyncProvider].map((m: string) => (
                                            <span key={m} className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-xs text-gray-600 dark:text-gray-300 shadow-sm">{m}</span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 italic flex items-center justify-center h-full">尚未建立此供應商的模型清單</p>
                                )}
                            </div>
                        </div>

                        {/* Sync button */}
                        <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                            <button
                                onClick={() => onPreview(selectedSyncProvider)}
                                disabled={isSyncing || selectedSyncProvider !== 'GEMINI'}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex justify-center items-center gap-2"
                            >
                                {isSyncing ? <><SpinnerIcon />正在連線至 API...</> : <>🔍 檢查 {AI_META[selectedSyncProvider as keyof typeof AI_META]?.label} 最新模型</>}
                            </button>
                            {selectedSyncProvider !== 'GEMINI' && (
                                <p className="text-[10px] text-gray-400 mt-2 text-center italic">* 目前僅支援 Gemini 自動同步，其他供應商請聯繫開發團隊。</p>
                            )}
                        </div>

                        {/* Status message */}
                        {syncActionStatus && (
                            <div className={`p-4 rounded-xl text-sm font-medium ${syncActionStatus.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                                {syncActionStatus.message}
                            </div>
                        )}

                        {/* Preview diff */}
                        {syncPreview && (
                            <div className="p-5 bg-indigo-50/50 dark:bg-indigo-900/20 border-2 border-indigo-100 dark:border-indigo-800 rounded-2xl">
                                <h5 className="text-sm font-bold text-indigo-800 dark:text-indigo-300 mb-4 flex items-center gap-2">
                                    <span className="p-1 bg-indigo-100 dark:bg-indigo-800 rounded">⚠️</span> 預覽比對結果
                                </h5>
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                                        <span className="text-[10px] text-gray-400 block mb-0.5 uppercase tracking-wider font-bold">目前資料庫</span>
                                        <span className="text-lg font-bold text-gray-800 dark:text-gray-200">{syncPreview.currentCount} <small className="text-[10px] font-normal">models</small></span>
                                    </div>
                                    <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                                        <span className="text-[10px] text-indigo-400 block mb-0.5 uppercase tracking-wider font-bold">API 最新抓取</span>
                                        <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{syncPreview.fetchedCount} <small className="text-[10px] font-normal text-indigo-400">models</small></span>
                                    </div>
                                </div>
                                <div className="space-y-3 mb-6">
                                    {syncPreview.added.length > 0 && (
                                        <div>
                                            <span className="text-xs font-bold text-green-600 dark:text-green-400 block mb-2">➕ 即將新增 ({syncPreview.added.length}):</span>
                                            <div className="flex flex-wrap gap-1.5 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                                                {syncPreview.added.map(m => <span key={m} className="px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded text-[10px] font-medium border border-green-200 dark:border-green-800">{m}</span>)}
                                            </div>
                                        </div>
                                    )}
                                    {syncPreview.removed.length > 0 && (
                                        <div>
                                            <span className="text-xs font-bold text-red-600 dark:text-red-400 block mb-2">➖ 即將淘汰 ({syncPreview.removed.length}):</span>
                                            <div className="flex flex-wrap gap-1.5 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                                                {syncPreview.removed.map(m => <span key={m} className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded text-[10px] font-medium border border-red-200 dark:border-red-800 line-through">{m}</span>)}
                                            </div>
                                        </div>
                                    )}
                                    {syncPreview.added.length === 0 && syncPreview.removed.length === 0 && (
                                        <div className="p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-xl text-center text-xs font-bold border border-green-100 dark:border-green-800">
                                            ✅ 模型清單已是最新，無需更新。
                                        </div>
                                    )}
                                </div>
                                {(syncPreview.added.length > 0 || syncPreview.removed.length > 0) && (
                                    <button
                                        onClick={() => onApply(selectedSyncProvider, syncPreview.allLatestModels)}
                                        disabled={isSyncing}
                                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl transition-all flex justify-center items-center gap-2"
                                    >
                                        {isSyncing ? '正在套用更新...' : '確認並套用更新'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/80 border-t border-gray-100 dark:border-gray-700 flex justify-end">
                    <button onClick={handleClose} className="px-6 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-semibold transition-colors">
                        關閉內容
                    </button>
                </div>
            </div>
        </div>
    );
}
