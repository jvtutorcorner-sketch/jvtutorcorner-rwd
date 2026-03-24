'use client';

interface CronStatus {
    hasReport: boolean;
    report?: {
        success: boolean;
        generatedAt: string;
        reportDate: string;
        tier: string;
        emailSent: boolean;
    };
}

interface AutomationSectionProps {
    cronStatus: CronStatus | null;
    fetchingCronStatus: boolean;
    copySuccess: string | null;
    fetchCronStatus: () => void;
    handleCopyToken: (text: string, type: string) => void;
    handleOpenReport: () => void;
}

export default function AutomationSection({
    cronStatus,
    fetchingCronStatus,
    copySuccess,
    fetchCronStatus,
    handleCopyToken,
    handleOpenReport,
}: AutomationSectionProps) {
    return (
        <>
            {/* AI Daily Report Block */}
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                    <span className="text-xl mr-2">⚡</span>
                    自動化服務助理
                </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-lg transition-all group flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-2xl group-hover:scale-110 transition-transform">
                                📊
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">AI 每日自動報告</h3>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                            自動搜尋全球教育技術新聞、進行平台架構風險分析，並每日定時寄送摘要報告。
                        </p>
                    </div>
                    <button
                        onClick={handleOpenReport}
                        className="w-full py-3 px-4 bg-gray-900 dark:bg-white dark:text-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                    >
                        進入報告面板 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </button>
                </div>

                <div className="bg-gray-50/50 dark:bg-gray-900/20 rounded-2xl p-6 border-2 border-dashed border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-400 mb-3 shadow-inner">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-500">更多自動化工具</p>
                    <p className="text-xs text-gray-400 mt-1">即將推出</p>
                </div>
            </div>

            {/* Automation Hub Block */}
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
                    <span className="text-2xl mr-2">⚙️</span>
                    自動化與排程管理 (Automation Hub)
                </h2>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400 italic">適合 AWS Amplify 部署環境</span>
                    <button
                        onClick={fetchCronStatus}
                        disabled={fetchingCronStatus}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500"
                        title="重新整理狀態"
                    >
                        <svg className={`w-5 h-5 ${fetchingCronStatus ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-12">
                <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Webhook URLs */}
                        <div className="lg:col-span-2 space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full" />
                                    外部觸發 Webhook 網址
                                </h3>
                                <div className="space-y-3">
                                    {[
                                        { label: '系統健康檢查 (Health)', tier: 'health', desc: '建議每 6 小時觸發一次' },
                                        { label: '每日摘要報告 (Daily)', tier: 'daily', desc: '建議每日 00:00 觸發' },
                                        { label: '每週分析與趨勢 (Weekly)', tier: 'weekly', desc: '建議週一 00:00 觸發' },
                                    ].map((hook) => (
                                        <div key={hook.tier} className="bg-gray-50 dark:bg-gray-900/50 p-5 rounded-xl border border-gray-100 dark:border-gray-700 group hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-base font-bold text-gray-800 dark:text-gray-200">{hook.label}</span>
                                                        <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded uppercase font-mono font-bold">POST</span>
                                                    </div>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">{hook.desc}</p>
                                                </div>
                                                <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-2 rounded-xl border border-gray-200 dark:border-gray-700">
                                                    <code className="text-sm text-indigo-600 dark:text-indigo-400 font-mono truncate max-w-[200px] sm:max-w-md px-3">
                                                        {`${typeof window !== 'undefined' ? window.location.origin : ''}/api/cron/daily-report?tier=${hook.tier}`}
                                                    </code>
                                                    <button
                                                        onClick={() => handleCopyToken(`${typeof window !== 'undefined' ? window.location.origin : ''}/api/cron/daily-report?tier=${hook.tier}`, hook.tier)}
                                                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                                    >
                                                        {copySuccess === hook.tier ? (
                                                            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Status & Security */}
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                                    排程執行狀態
                                </h3>
                                <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 shadow-xl overflow-hidden relative">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/10 blur-3xl rounded-full -mr-16 -mt-16" />
                                    <div className="relative z-10 space-y-6">
                                        <div className="flex justify-between items-start">
                                            <span className="text-xs text-gray-400 uppercase tracking-widest font-bold">上次執行結果</span>
                                            {fetchingCronStatus ? (
                                                <span className="animate-pulse text-xs text-indigo-400">更新中...</span>
                                            ) : (
                                                <span className={`text-xs px-3 py-1 rounded-full font-black ${cronStatus?.hasReport ? (cronStatus.report?.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20') : 'bg-gray-800 text-gray-500'}`}>
                                                    {cronStatus?.hasReport ? (cronStatus.report?.success ? 'SUCCESS' : 'FAILED') : 'NO DATA'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-3xl font-black text-white flex items-baseline gap-3">
                                                {cronStatus?.hasReport
                                                    ? new Date(cronStatus.report?.generatedAt ?? '').toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
                                                    : '--:--'}
                                                <small className="text-xs text-gray-500 font-normal">
                                                    {cronStatus?.hasReport ? new Date(cronStatus.report?.reportDate ?? '').toLocaleDateString() : '尚未執行'}
                                                </small>
                                            </p>
                                            <p className="text-sm text-gray-400 truncate">
                                                {cronStatus?.hasReport
                                                    ? `總結: ${cronStatus.report?.tier} tier · ${cronStatus.report?.emailSent ? '已發送' : '未發送'}`
                                                    : '尚無報告紀錄'}
                                            </p>
                                        </div>
                                        <div className="pt-5 border-t border-gray-800 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${cronStatus?.hasReport && cronStatus.report?.success ? 'bg-emerald-400' : 'bg-gray-600 animate-pulse'}`} />
                                                <span className="text-xs text-gray-500 uppercase font-black tracking-tight">System Pulse</span>
                                            </div>
                                            <button onClick={handleOpenReport} className="text-sm text-indigo-400 hover:text-indigo-300 font-black transition-colors">
                                                詳情面板 →
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/10 p-5 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                                <div className="flex gap-4">
                                    <div className="text-amber-500 text-xl">🔒</div>
                                    <div>
                                        <h4 className="text-sm font-black text-amber-800 dark:text-amber-400 mb-1.5 underline decoration-amber-500/30 underline-offset-4">安全性提醒</h4>
                                        <p className="text-xs text-amber-700/80 dark:text-amber-500/80 leading-relaxed font-medium">
                                            Webhook 觸發需要 `Authorization` 標頭 (Bearer Token)。請確保在 AWS Amplify 的「環境變數」中已正確設定 `CRON_SECRET`。
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
