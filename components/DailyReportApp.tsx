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

// Initial data for new automations layout
const INITIAL_WORKFLOWS = [
    {
        id: 'w-1',
        title: '平台營運日報 (EdTech Trends)',
        description: '自動分析全球 EdTech 趨勢、平台風險與技術升級建議。',
        icon: '📊',
        frequency: '每日 00:00',
        status: 'active',
        lastRun: '2 小時前',
        color: 'blue'
    },
    {
        id: 'w-2',
        title: '每週異常登入安全稽核',
        description: '掃描全站異常登入行為並產生安全示警報表。',
        icon: '🛡️',
        frequency: '每週一 02:00',
        status: 'active',
        lastRun: '3 天前',
        color: 'red'
    },
    {
        id: 'w-3',
        title: '每月營收與退款結算分析',
        description: '統整當月金流與退費原因，由 LLM 提供營收優化策略。',
        icon: '💰',
        frequency: '每月 1 日 01:00',
        status: 'paused',
        lastRun: '10 天前',
        color: 'green'
    }
];

export function DailyReportApp() {
    const [activeTab, setActiveTab] = useState<'overview' | 'workflows' | 'settings'>('overview');
    const [reportStatus, setReportStatus] = useState<ReportStatus>({ loading: false, generating: false });

    // AI Integrations & Models State
    const [activeAIApps, setActiveAIApps] = useState<any[]>([]);
    const [aiModelOptions, setAiModelOptions] = useState<Record<string, string[]>>({});
    const [loadingIntegrations, setLoadingIntegrations] = useState(false);

    // Settings State
    const [settings, setSettings] = useState({
        bccEmail: '',
        selectedModel: ''
    });
    const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const handleSaveSettings = () => {
        setSaveStatus({ type: 'success', message: '設定已成功儲存' });
        setTimeout(() => setSaveStatus(null), 3000);
        // Persist to local storage as mock logic
        localStorage.setItem('daily_report_settings', JSON.stringify(settings));
    };

    const [workflows, setWorkflows] = useState(INITIAL_WORKFLOWS);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newWfData, setNewWfData] = useState({
        title: '',
        description: '',
        icon: '⚙️',
        frequency: '每日 00:00',
        color: 'blue'
    });

    const handleAddWorkflow = () => {
        setIsAddModalOpen(true);
    };

    const handleCreateWorkflow = (e: React.FormEvent) => {
        e.preventDefault();
        const id = `w-${Date.now()}`;
        const newWorkflow = {
            ...newWfData,
            id,
            status: 'active' as const,
            lastRun: '尚未執行'
        };
        setWorkflows(prev => [newWorkflow, ...prev]);
        setIsAddModalOpen(false);
        setNewWfData({
            title: '',
            description: '',
            icon: '⚙️',
            frequency: '每日 00:00',
            color: 'blue'
        });
    };

    const handleViewAll = () => {
        setActiveTab('workflows');
    };

    // Fetch AI integrations and models
    useEffect(() => {
        const fetchIntegrations = async () => {
            setLoadingIntegrations(true);
            try {
                // Fetch active AI services
                const appsRes = await fetch('/api/app-integrations');
                const appsJson = await appsRes.json();
                if (appsJson.ok) {
                    const aiApps = (appsJson.data || []).filter((a: any) =>
                        ['OPENAI', 'ANTHROPIC', 'GEMINI'].includes(a.type) &&
                        a.status === 'ACTIVE'
                    );
                    setActiveAIApps(aiApps);
                }

                // Fetch model options
                const modelsRes = await fetch('/api/admin/ai-models');
                const modelsJson = await modelsRes.json();
                if (modelsJson.ok && modelsJson.data) {
                    const options: Record<string, string[]> = {};
                    modelsJson.data.forEach((item: any) => {
                        options[item.provider] = item.models;
                    });
                    setAiModelOptions(options);
                }
            } catch (error) {
                console.error('Failed to fetch AI configuration:', error);
            } finally {
                setLoadingIntegrations(false);
            }
        };

        fetchIntegrations();
    }, []);

    // Fetch report status (Legacy EdTech Report)
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
        <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto">
            {/* ─── Premium Dashboard Tabs ─── */}
            <div className="flex gap-2 p-1.5 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-md rounded-2xl w-fit shadow-inner">
                {([
                    { id: 'overview', icon: '📈', label: '總覽 (Overview)' },
                    { id: 'workflows', icon: '⚡', label: '工作流程 (Workflows)' },
                    { id: 'settings', icon: '⚙️', label: '通用設定 (Settings)' },
                ] as const).map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${activeTab === tab.id
                            ? 'bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-300 shadow-sm ring-1 ring-gray-200/50 dark:ring-gray-600/50'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-700/50'
                            }`}
                    >
                        <span className="text-lg">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ─── Tab Content ─── */}
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        {/* Summary Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Card 1 */}
                            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-500/20 relative overflow-hidden group">
                                <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500"></div>
                                <div className="relative z-10 flex flex-col h-full justify-between">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl backdrop-blur-sm">⚡</div>
                                        <h3 className="font-semibold text-blue-50">活躍工作流程</h3>
                                    </div>
                                    <div>
                                        <div className="text-4xl font-black tracking-tight mb-1">2 <span className="text-lg text-blue-200 font-medium">/ 3</span></div>
                                        <p className="text-xs text-blue-100 font-medium">+1 本週新增</p>
                                    </div>
                                </div>
                            </div>
                            {/* Card 2 */}
                            <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden group">
                                <div className="absolute right-0 top-0 w-32 h-32 bg-green-500/5 dark:bg-green-500/10 rounded-full blur-3xl group-hover:bg-green-500/10 transition-all duration-500"></div>
                                <div className="relative z-10 flex flex-col h-full justify-between">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-xl flex items-center justify-center text-xl text-green-600 dark:text-green-400">✅</div>
                                        <h3 className="font-semibold text-gray-600 dark:text-gray-300">本月成功率</h3>
                                    </div>
                                    <div>
                                        <div className="text-4xl font-black text-gray-900 dark:text-white tracking-tight mb-1">98.5%</div>
                                        <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                                            <span>↗</span> 較上月提升 2.1%
                                        </p>
                                    </div>
                                </div>
                            </div>
                            {/* Card 3 */}
                            <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden group">
                                <div className="absolute right-0 top-0 w-32 h-32 bg-purple-500/5 dark:bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/10 transition-all duration-500"></div>
                                <div className="relative z-10 flex flex-col h-full justify-between">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-xl flex items-center justify-center text-xl text-purple-600 dark:text-purple-400">🤖</div>
                                        <h3 className="font-semibold text-gray-600 dark:text-gray-300">AI 節省時間</h3>
                                    </div>
                                    <div>
                                        <div className="text-4xl font-black text-gray-900 dark:text-white tracking-tight mb-1">14 <span className="text-lg text-gray-400 font-medium">小時</span></div>
                                        <p className="text-xs text-purple-600 dark:text-purple-400 font-medium flex items-center gap-1">
                                            <span>✨</span> 自動化產生的效益
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Recent Activity / Integration Info */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Activity Log */}
                            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700">
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <span>📜</span> 最近運行紀錄 (Recent Runs)
                                    </h3>
                                    <button
                                        onClick={handleViewAll}
                                        className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
                                    >
                                        查看全部 →
                                    </button>
                                </div>
                                <div className="space-y-6">
                                    {/* Real Data representation for the EDTech report */}
                                    <div className="relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-[-20px] before:w-[2px] before:bg-gray-100 dark:before:bg-gray-700 last:before:hidden">
                                        <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/50 border-2 border-white dark:border-gray-800 flex items-center justify-center">
                                            <div className={`w-2 h-2 rounded-full ${reportStatus.lastReport?.success ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div>
                                                <p className="font-bold text-gray-900 dark:text-white text-sm">平台營運日報 (EdTech Trends) 已執行</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                    {reportStatus.loading ? '正在同步狀態...' : reportStatus.lastReport?.generatedAt ? `生成時間：${new Date(reportStatus.lastReport.generatedAt).toLocaleString('zh-TW')} \u00B7 ${reportStatus.lastReport.success ? '成功' : '失敗'}` : '尚未有近期紀錄'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${reportStatus.lastReport?.emailSent ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                                                    {reportStatus.lastReport?.emailSent ? '已發送郵件' : '無發送動作'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Mock historical data */}
                                    <div className="relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-[-20px] before:w-[2px] before:bg-gray-100 dark:before:bg-gray-700 last:before:hidden">
                                        <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-red-100 dark:bg-red-900/50 border-2 border-white dark:border-gray-800 flex items-center justify-center">
                                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div>
                                                <p className="font-bold text-gray-900 dark:text-white text-sm">每週異常登入安全稽核 已執行</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">掃描了 14,230 筆登入紀錄，發現 2 筆高風險來源。</p>
                                            </div>
                                            <span className="text-[11px] font-medium text-gray-400">3 天前</span>
                                        </div>
                                    </div>
                                    <div className="relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-[-20px] before:w-[2px] before:bg-gray-100 dark:before:bg-gray-700 last:before:hidden">
                                        <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/50 border-2 border-white dark:border-gray-800 flex items-center justify-center">
                                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div>
                                                <p className="font-bold text-gray-900 dark:text-white text-sm">平台營運日報 (EdTech Trends) 已執行</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">順利產生昨日摘要報告。</p>
                                            </div>
                                            <span className="text-[11px] font-medium text-gray-400">昨天</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* System Status */}
                            <div className="bg-gradient-to-b from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                                    <span>⚙️</span> 系統引擎狀態
                                </h3>
                                <div className="space-y-4 flex-1">
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">AI</div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Google Gemini 2.0</p>
                                                <p className="text-[10px] text-gray-500">預設分析引擎</p>
                                            </div>
                                        </div>
                                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center text-yellow-600 dark:text-yellow-400 text-sm">📧</div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">SMTP / Resend</p>
                                                <p className="text-[10px] text-gray-500">郵件發送服務</p>
                                            </div>
                                        </div>
                                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 text-sm">⏱️</div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Cron Scheduler</p>
                                                <p className="text-[10px] text-gray-500">排程觸發器</p>
                                            </div>
                                        </div>
                                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                                    </div>
                                </div>
                                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                                    <p className="text-[11px] text-gray-400 text-center flex items-center justify-center gap-1">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                        所有系統連線正常
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'workflows' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white">自動化工作流程</h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">管理排程任務與手動觸發設定</p>
                            </div>
                            <button
                                onClick={handleAddWorkflow}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm shadow-blue-500/30 flex items-center gap-2"
                            >
                                <span>+</span> 新增流程
                            </button>
                        </div>

                        <div className="space-y-4">
                            {workflows.map((wf) => (
                                <div key={wf.id} className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 group transition-all hover:shadow-md hover:border-blue-200 dark:hover:border-blue-900/50">
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                        <div className="flex items-start gap-4 flex-1">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 mt-1 ${wf.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : wf.color === 'red' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'}`}>
                                                {wf.icon}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-3">
                                                    <h3 className="text-base font-bold text-gray-900 dark:text-white">{wf.title}</h3>
                                                    {wf.status === 'active' ? (
                                                        <span className="px-2 py-0.5 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-[10px] font-bold rounded-full uppercase tracking-wide">Active</span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px] font-bold rounded-full uppercase tracking-wide">Paused</span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{wf.description}</p>

                                                <div className="flex flex-wrap items-center gap-4 mt-4">
                                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                                                        <span className="text-gray-400">⏱️ 排程:</span> {wf.frequency}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                                                        <span className="text-gray-400">🕒 上次執行:</span> {wf.id === 'w-1' && reportStatus.lastReport?.generatedAt ? new Date(reportStatus.lastReport.generatedAt).toLocaleString('zh-TW') : wf.lastRun}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-4 pl-0 lg:pl-6 lg:border-l border-gray-100 dark:border-gray-700/50">
                                            {/* Legacy Real Manual Trigger logic attached to the first mock item */}
                                            {wf.id === 'w-1' ? (
                                                <button
                                                    onClick={() => triggerDailyReport('full')}
                                                    disabled={reportStatus.generating}
                                                    className="w-full lg:w-36 py-2.5 px-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group-hover:border-blue-300 dark:group-hover:border-blue-800"
                                                >
                                                    {reportStatus.generating ? (
                                                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                                                    ) : (
                                                        <span>▶</span>
                                                    )}
                                                    手動執行
                                                </button>
                                            ) : (
                                                <button className="w-full lg:w-36 py-2.5 px-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2">
                                                    <span>▶</span> 模擬執行
                                                </button>
                                            )}

                                            <div className="flex items-center gap-3">
                                                <button className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 underline underline-offset-2">發送設定</button>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input type="checkbox" className="sr-only peer" checked={wf.status === 'active'} readOnly />
                                                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action specific sub-menu */}
                                    {wf.id === 'w-1' && (
                                        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 overflow-x-auto pb-1">
                                            <span className="text-[10px] uppercase font-bold text-gray-400 shrink-0 mr-2">快速操作:</span>
                                            <button onClick={() => triggerDailyReport('daily')} disabled={reportStatus.generating} className="shrink-0 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-700 dark:text-gray-300 hover:border-blue-300 transition-colors">
                                                產生摘要日報 (Daily)
                                            </button>
                                            <button onClick={() => triggerDailyReport('health')} disabled={reportStatus.generating} className="shrink-0 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-700 dark:text-gray-300 hover:border-green-300 transition-colors">
                                                執行健康檢查 (Health)
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {reportStatus.error && (
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-semibold rounded-2xl flex items-center gap-2 border border-red-100 dark:border-red-900/30">
                                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                執行錯誤：{reportStatus.error}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="max-w-xl">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">自動化通用設定</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">管理報表發送預設對象、API 串接等全域設定。</p>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">預設報告接收信箱 (BCC)</label>
                                    <input
                                        type="email"
                                        value={settings.bccEmail}
                                        onChange={(e) => setSettings(prev => ({ ...prev, bccEmail: e.target.value }))}
                                        placeholder="admin@jvtutorcorner.com"
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all text-sm text-gray-800 dark:text-gray-200"
                                    />
                                    <p className="text-xs text-gray-400 mt-2">當工作流程未特別指定收件者時，將自動副本發送至此信箱。</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">預設分析引擎模型</label>
                                    <select
                                        value={settings.selectedModel}
                                        onChange={(e) => setSettings(prev => ({ ...prev, selectedModel: e.target.value }))}
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all text-sm text-gray-800 dark:text-gray-200"
                                    >
                                        <option value="">請選擇預設模型 (Leave empty for default Google Gemini 2.0)</option>
                                        {activeAIApps.length > 0 ? (
                                            activeAIApps.map(app => (
                                                <optgroup key={app.integrationId} label={`${app.name} (${app.type})`}>
                                                    {(() => {
                                                        const configuredModels = app.config?.models || [];
                                                        const allProviderModels = aiModelOptions[app.type] || [];

                                                        // If user has specific models selected in config, only show those.
                                                        // Otherwise show all available models for that provider.
                                                        const modelsToShow = configuredModels.length > 0
                                                            ? allProviderModels.filter((m: string) => configuredModels.includes(m))
                                                            : allProviderModels;

                                                        if (modelsToShow.length === 0) {
                                                            return <option disabled>無可用模型</option>;
                                                        }

                                                        return modelsToShow.map((model: string) => (
                                                            <option key={`${app.integrationId}-${model}`} value={`${app.integrationId}:${model}`}>
                                                                {model}
                                                            </option>
                                                        ));
                                                    })()}
                                                </optgroup>
                                            ))
                                        ) : (
                                            <>
                                                <option disabled>未連接任何 AI 服務</option>
                                                <option value="gemini-2.0-flash">Google Gemini 2.0 Flash (預設)</option>
                                            </>
                                        )}
                                    </select>
                                    {activeAIApps.length === 0 && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                                            <span>⚠️</span> 您尚未連接任何 AI 服務，請先前往「新增服務」進行配置。
                                        </p>
                                    )}
                                </div>

                                <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4">
                                    <button
                                        onClick={handleSaveSettings}
                                        className="px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-xl text-sm transition-transform hover:scale-[1.02] shadow-sm"
                                    >
                                        儲存設定
                                    </button>
                                    {saveStatus && (
                                        <span className={`text-sm font-bold ${saveStatus.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600'}`}>
                                            {saveStatus.type === 'success' ? '✓ ' : '✕ '}{saveStatus.message}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ─── Add Workflow Modal ─── */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-gray-950/40 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)}></div>
                    <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-black text-gray-900 dark:text-white">建立新工作流程</h2>
                                <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>

                            <form onSubmit={handleCreateWorkflow} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">流程名稱</label>
                                    <input
                                        required
                                        type="text"
                                        value={newWfData.title}
                                        onChange={e => setNewWfData(prev => ({ ...prev, title: e.target.value }))}
                                        placeholder="例如：每日庫存警告通知"
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">描述</label>
                                    <textarea
                                        rows={3}
                                        value={newWfData.description}
                                        onChange={e => setNewWfData(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="簡述此流程自動化的內容..."
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">圖示/Emoji</label>
                                        <input
                                            type="text"
                                            value={newWfData.icon}
                                            onChange={e => setNewWfData(prev => ({ ...prev, icon: e.target.value }))}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-center text-xl"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">觸發頻率</label>
                                        <select
                                            value={newWfData.frequency}
                                            onChange={e => setNewWfData(prev => ({ ...prev, frequency: e.target.value }))}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                                        >
                                            <option>每日 00:00</option>
                                            <option>每週一 09:00</option>
                                            <option>每月 1 日 01:00</option>
                                            <option>每 6 小時一次</option>
                                            <option>手動觸發</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">主題顏色</label>
                                    <div className="flex gap-3">
                                        {(['blue', 'red', 'green', 'purple', 'amber'] as const).map(c => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setNewWfData(prev => ({ ...prev, color: c }))}
                                                className={`w-8 h-8 rounded-full border-2 transition-all ${newWfData.color === c ? 'border-gray-900 dark:border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'} ${c === 'blue' ? 'bg-blue-500' : c === 'red' ? 'bg-red-500' : c === 'green' ? 'bg-green-500' : c === 'purple' ? 'bg-purple-500' : 'bg-amber-500'}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="pt-6 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsAddModalOpen(false)}
                                        className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-2xl text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                    >
                                        取消
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-2 px-8 py-3 bg-blue-600 text-white font-bold rounded-2xl text-sm shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-transform active:scale-95"
                                    >
                                        建立工作流程
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
