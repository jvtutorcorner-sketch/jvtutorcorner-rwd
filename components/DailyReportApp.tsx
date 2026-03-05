'use client';

import { useState, useEffect, useCallback } from 'react';

type ReportStatus = {
    loading: boolean;
    generating: boolean;
    lastReport?: {
        reportDate: string;
        success: boolean;
        emailSent: boolean;
        generatedAt?: string;
        tier?: string;
    };
    error?: string;
};

export function DailyReportApp() {
    const [reportStatus, setReportStatus] = useState<ReportStatus>({ loading: false, generating: false });

    // Fetch report status
    const fetchReportStatus = useCallback(async () => {
        setReportStatus(prev => ({ ...prev, loading: true, error: undefined }));
        try {
            const res = await fetch('/api/cron/daily-report/status');
            const data = await res.json();
            if (data.ok && data.hasReport) {
                setReportStatus(prev => ({
                    ...prev,
                    loading: false,
                    lastReport: data.report,
                }));
            } else {
                setReportStatus(prev => ({
                    ...prev,
                    loading: false,
                    lastReport: undefined,
                    error: data.hasReport === false ? undefined : (data.message || '無法取得報告狀態')
                }));
            }
        } catch {
            setReportStatus(prev => ({ ...prev, loading: false, error: '無法連接到報告服務' }));
        }
    }, []);

    const triggerDailyReport = async (tier: string = 'full') => {
        setReportStatus(prev => ({ ...prev, generating: true, error: undefined }));
        try {
            const res = await fetch('/api/cron/daily-report/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tier })
            });
            const data = await res.json();
            if (data.ok) {
                setReportStatus(prev => ({
                    ...prev,
                    generating: false,
                    lastReport: data.result,
                }));
            } else {
                setReportStatus(prev => ({
                    ...prev,
                    generating: false,
                    error: data.error || '報告生成失敗',
                }));
            }
        } catch (err: any) {
            setReportStatus(prev => ({
                ...prev,
                generating: false,
                error: '報告生成請求失敗',
            }));
        }
    };

    useEffect(() => {
        fetchReportStatus();
    }, [fetchReportStatus]);

    return (
        <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
            {/* Header / Summary Card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 text-2xl">
                            📊
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">AI 每日自動報告系統</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                全球 EdTech 趨勢監控、平台風險分析與技術升級建議
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => fetchReportStatus()}
                            className="p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
                            title="重新整理狀態"
                        >
                            <svg className={`w-5 h-5 ${reportStatus.loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">報告狀態</p>
                        {reportStatus.loading ? (
                            <div className="animate-pulse h-5 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                        ) : reportStatus.lastReport ? (
                            <div className="flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full ${reportStatus.lastReport.success ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    {reportStatus.lastReport.success ? '正常生成' : '生成失敗'}
                                </span>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400">今日尚未生成</p>
                        )}
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">最後生成時間</p>
                        {reportStatus.loading ? (
                            <div className="animate-pulse h-5 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                        ) : reportStatus.lastReport?.generatedAt ? (
                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                {new Date(reportStatus.lastReport.generatedAt).toLocaleString('zh-TW')}
                            </p>
                        ) : (
                            <p className="text-sm text-gray-400">-</p>
                        )}
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Email 發送狀態</p>
                        {reportStatus.loading ? (
                            <div className="animate-pulse h-5 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                        ) : reportStatus.lastReport ? (
                            <div className="flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full ${reportStatus.lastReport.emailSent ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    {reportStatus.lastReport.emailSent ? '已發送' : '發送失敗/跳過'}
                                </span>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400">-</p>
                        )}
                    </div>
                </div>

                {reportStatus.error && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg flex items-center gap-2 border border-red-100 dark:border-red-900/30">
                        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {reportStatus.error}
                    </div>
                )}
            </div>

            {/* Actions Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Manual Control */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <span>🚀</span> 手動生成控制
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                        您可以隨時要求 AI 重新掃描並生成最新報告。系統預設會自動在每日 00:00 執行。
                    </p>

                    <div className="space-y-3">
                        <button
                            onClick={() => triggerDailyReport('full')}
                            disabled={reportStatus.generating}
                            className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 disabled:bg-blue-300 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                        >
                            {reportStatus.generating ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    正在生成完整平台報告...
                                </>
                            ) : (
                                <>📰 立即生成完整報告 (Full Report)</>
                            )}
                        </button>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => triggerDailyReport('daily')}
                                disabled={reportStatus.generating}
                                className="py-2.5 px-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                                快速每日報告
                            </button>
                            <button
                                onClick={() => triggerDailyReport('health')}
                                disabled={reportStatus.generating}
                                className="py-2.5 px-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                                系統健康檢查
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content Overview */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <span>📋</span> 報告內容摘要
                    </h3>
                    <ul className="space-y-4">
                        <li className="flex items-start gap-4">
                            <div className="mt-1 w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                                📰
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">教育平台相關新聞</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    AI 自動搜尋全球 EdTech 趨勢、台灣數位學習動態、以及競爭對手最新發展消息。
                                </p>
                            </div>
                        </li>
                        <li className="flex items-start gap-4">
                            <div className="mt-1 w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                                ⚠️
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">技術架構風險分析</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    檢查過時套件、已知安全漏洞、API 相容性問題，並提供具體的風險緩解方案。
                                </p>
                            </div>
                        </li>
                        <li className="flex items-start gap-4">
                            <div className="mt-1 w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                                🔮
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">技術趨勢與升級建議</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    針對平台現狀，提供未來半年的技術棧升級路徑、效能優化策略。
                                </p>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            {/* footer info */}
            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-2xl p-5 border border-blue-100 dark:border-blue-900/30">
                <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 mb-2 flex items-center gap-2">
                    <span>⚙️</span> 系統整合資訊
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-blue-700 dark:text-blue-400">分析引擎</span>
                        <span className="font-mono bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded text-blue-800 dark:text-blue-200">Google Gemini 2.0+</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-blue-700 dark:text-blue-400">發送服務</span>
                        <span className="font-mono bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded text-blue-800 dark:text-blue-200">SMTP / Resend</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-blue-700 dark:text-blue-400">排程機制</span>
                        <span className="font-mono bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded text-blue-800 dark:text-blue-200">Github Actions Cron</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-blue-700 dark:text-blue-400">紀錄儲存</span>
                        <span className="font-mono bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded text-blue-800 dark:text-blue-200">AWS DynamoDB</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
