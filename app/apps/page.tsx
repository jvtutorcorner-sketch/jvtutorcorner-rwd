'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Editor from '@monaco-editor/react';

interface AppIntegration {
    integrationId: string;
    userId: string;
    type: string;
    name: string;
    config?: Record<string, any>;
    status: string;
    createdAt: string;
}

const PAYMENT_TYPES = ['ECPAY', 'PAYPAL', 'STRIPE'];
const CHANNEL_TYPES = ['LINE', 'TELEGRAM', 'WHATSAPP', 'MESSENGER', 'SLACK', 'TEAMS', 'DISCORD', 'WECHAT'];

/** 各通訊渠道的顏色、圖標與顯示名稱 */
const CHANNEL_META: Record<string, { badge: string; label: string; icon: string; desc: string }> = {
    LINE: { badge: 'bg-green-100 text-green-800', label: 'LINE', icon: '💬', desc: '台灣、日本最常用的即時通訊軟體' },
    TELEGRAM: { badge: 'bg-sky-100 text-sky-800', label: 'Telegram', icon: '✈️', desc: '加密即時通訊，支援 Bot API' },
    WHATSAPP: { badge: 'bg-emerald-100 text-emerald-800', label: 'WhatsApp', icon: '📱', desc: '全球超過 20 億用戶的即時通訊' },
    MESSENGER: { badge: 'bg-blue-100 text-blue-800', label: 'Messenger', icon: '💙', desc: 'Facebook / Meta 即時通訊平台' },
    SLACK: { badge: 'bg-purple-100 text-purple-800', label: 'Slack', icon: '🔗', desc: '企業團隊協作與訊息通知' },
    TEAMS: { badge: 'bg-violet-100 text-violet-800', label: 'Teams', icon: '👥', desc: 'Microsoft 企業通訊與會議' },
    DISCORD: { badge: 'bg-indigo-100 text-indigo-800', label: 'Discord', icon: '🎮', desc: '社群伺服器，適合線上課程群組' },
    WECHAT: { badge: 'bg-lime-100 text-lime-800', label: 'WeChat', icon: '🟢', desc: '中國大陸最普及的通訊平台' },
};

const PAYMENT_META: Record<string, { badge: string; label: string; icon: string; desc: string }> = {
    ECPAY: { badge: 'bg-emerald-100 text-emerald-800', label: '綠界科技 ECPay', icon: '🏦', desc: '台灣本地金流，支援超商/ATM/信用卡' },
    PAYPAL: { badge: 'bg-blue-100 text-blue-800', label: 'PayPal', icon: '🅿️', desc: '全球最大線上支付平台' },
    STRIPE: { badge: 'bg-indigo-100 text-indigo-800', label: 'Stripe', icon: '💳', desc: '全球開發者首選線上刷卡服務' },
};

const AI_TYPES = ['OPENAI', 'ANTHROPIC', 'GEMINI'];

const AI_META: Record<string, { badge: string; label: string; icon: string; desc: string }> = {
    OPENAI: { badge: 'bg-gray-100 text-gray-800', label: 'OpenAI ChatGPT', icon: '🧠', desc: '強大的通用大語言模型' },
    ANTHROPIC: { badge: 'bg-orange-100 text-orange-800', label: 'Anthropic (Claude)', icon: '🎭', desc: '專注於安全性與長文本理解的 AI 模型' },
    GEMINI: { badge: 'bg-blue-100 text-blue-800', label: 'Google Gemini', icon: '✨', desc: 'Google 的強大原生多模態大模型' },
};

const EMAIL_TYPES = ['SMTP'];

const EMAIL_META: Record<string, { badge: string; label: string; icon: string; desc: string }> = {
    SMTP: { badge: 'bg-yellow-100 text-yellow-800', label: 'SMTP 郵件伺服器', icon: '✉️', desc: '自訂郵件伺服器，用於系統通知與密碼重置' },
};

const AI_MODEL_OPTIONS: Record<string, string[]> = {
    OPENAI: ['gpt-5.2', 'gpt-5.2-pro', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'o3-deep-research', 'o1-pro'],
    ANTHROPIC: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-3-5-sonnet'],
    GEMINI: ['gemini-3.1-pro-preview', 'gemini-3-flash', 'gemini-2.5-pro', 'gemini-2.5-flash']
};

const LABEL_MAP: Record<string, string> = {
    apiKey: 'API Key',
    channelAccessToken: 'Channel Access Token',
    channelSecret: 'Channel Secret',
    ecpayMerchantId: '特店編號 (MerchantID)',
    ecpayHashKey: 'HashKey',
    ecpayHashIV: 'HashIV',
    stripeAccountId: 'Connect Account ID',
    stripePublicKey: 'Public Key',
    stripeSecretKey: 'Secret Key',
    paypalClientId: 'Client ID',
    paypalSecretKey: 'Secret Key',
    smtpHost: 'SMTP 主機位置 (Host)',
    smtpPort: '通訊埠 (Port)',
    smtpUser: '使用者帳號 (User)',
    smtpPass: '密碼 (Password)',
    fromAddress: '寄件者信箱 (From Address)',
};


export default function AppsPage() {
    const [apps, setApps] = useState<AppIntegration[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAppConfig, setSelectedAppConfig] = useState<AppIntegration | null>(null);
    const [editedConfig, setEditedConfig] = useState<Record<string, any>>({});
    const [editedName, setEditedName] = useState('');
    const [editedStatus, setEditedStatus] = useState('ACTIVE');
    const [editedScriptEnabled, setEditedScriptEnabled] = useState(false);
    const [editedCustomScript, setEditedCustomScript] = useState('');
    const [showSecret, setShowSecret] = useState(false);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);   // integrationId currently testing
    const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string; details?: any }>>({});
    const [simulating, setSimulating] = useState(false);
    const [simInput, setSimInput] = useState('');
    const [simReply, setSimReply] = useState<string | null>(null);
    const [pushTesting, setPushTesting] = useState(false);
    const [pushMessage, setPushMessage] = useState('');
    const [pushTitle, setPushTitle] = useState('');
    const [pushResult, setPushResult] = useState<string | null>(null);
    const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
    const router = useRouter();

    // 控制 body overflow 當 modal 打開時
    useEffect(() => {
        if (selectedAppConfig) {
            document.body.style.overflow = 'hidden';
            // 按ESC鍵關閉Modal
            const handleEscape = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    setSelectedAppConfig(null);
                    setSimInput('');
                    setSimReply(null);
                }
            };
            document.addEventListener('keydown', handleEscape);
            return () => {
                document.removeEventListener('keydown', handleEscape);
                document.body.style.overflow = 'unset';
            };
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [selectedAppConfig]);

    useEffect(() => {
        const fetchApps = async () => {
            try {
                let userId = 'anonymous';
                const raw = localStorage.getItem('tutor_user');
                if (raw) {
                    const stored = JSON.parse(raw);
                    userId = stored.id || stored.email || 'anonymous';
                }

                const res = await fetch(`/api/app-integrations?userId=${userId}`);
                const result = await res.json();

                console.log('[AppsPage] Fetch result:', { userId, ok: result.ok, total: result.total, data: result.data });

                if (result.ok) {
                    setApps(result.data);
                }
            } catch (err) {
                console.error('Failed to fetch apps:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchApps();
    }, []);

    /** 取得指定類型已連接的整合記錄 */
    const getConnectedApps = (type: string) => apps.filter(a => a.type === type);

    /** 測試指定整合的連線 */
    const handleTest = async (app: AppIntegration) => {
        const id = app.integrationId;
        setTestingId(id);
        // 清除先前結果
        setTestResults(prev => { const n = { ...prev }; delete n[id]; return n; });

        try {
            console.log(`[AppsPage] 正在測試連線: ${app.name} (${app.type})`, {
                integrationId: id,
                type: app.type,
                configKeys: app.config ? Object.keys(app.config) : [],
            });
            const res = await fetch('/api/app-integrations/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    integrationId: id,
                    type: app.type,
                    config: app.config,
                }),
            });
            const data = await res.json();
            if (data.ok && data.result) {
                if (data.result.success) {
                    console.log(`[AppsPage] 測試成功: ${app.name}`, data.result);
                } else {
                    console.error(`[AppsPage] 測試失敗 (API回傳錯誤): ${app.name}`, data.result);
                }
                setTestResults(prev => ({ ...prev, [id]: data.result }));
            } else {
                console.error(`[AppsPage] 測試失敗: ${app.name}`, data.error || '未知錯誤');
                setTestResults(prev => ({ ...prev, [id]: { success: false, message: data.error || '測試失敗' } }));
            }
        } catch (e: any) {
            console.error(`[AppsPage] 測試請求異常: ${app.name}`, e);
            setTestResults(prev => ({ ...prev, [id]: { success: false, message: `請求失敗: ${e.message}` } }));
        } finally {
            setTestingId(null);
        }
    };

    /** 儲存設定 */
    // AI Prompt 測試
    const handleAiTestPrompt = async (app: AppIntegration) => {
        if (!simInput.trim() || simulating) return;

        setSimulating(true);
        setSimReply(null);

        try {
            const config = { ...app.config, ...editedConfig };
            const res = await fetch('/api/app-integrations/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    integrationId: app.integrationId,
                    type: app.type,
                    config,
                    prompt: simInput.trim()
                }),
            });

            const data = await res.json();
            if (data.ok && data.result.success) {
                setSimReply(data.result.message);
            } else {
                setSimReply(`❌ 錯誤: ${data.result?.message || data.error || '不明原因'}`);
            }
        } catch (error: any) {
            setSimReply(`❌ 測試失敗: ${error.message}`);
        } finally {
            setSimulating(false);
        }
    };

    const handleSaveConfig = async () => {
        if (!selectedAppConfig) return;
        setIsSavingConfig(true);
        try {
            const updatedConfig = { ...editedConfig };
            if (editedScriptEnabled && editedCustomScript.trim()) {
                updatedConfig.customScript = editedCustomScript;
            } else {
                delete updatedConfig.customScript;
            }

            const res = await fetch(`/api/app-integrations`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    integrationId: selectedAppConfig.integrationId,
                    userId: selectedAppConfig.userId,
                    type: selectedAppConfig.type,
                    config: updatedConfig,
                    name: editedName,
                    status: editedStatus
                })
            });
            const data = await res.json();
            if (data.ok) {
                setApps(prev => prev.map(a => a.integrationId === selectedAppConfig.integrationId ? { ...a, config: updatedConfig, name: editedName, status: editedStatus } : a));
                setSelectedAppConfig(prev => prev ? { ...prev, config: updatedConfig, name: editedName, status: editedStatus } : null);
                setSaveResult({ success: true, message: '✅ 設定於系統中儲存成功' });
                setTimeout(() => setSaveResult(null), 3000);
            } else {
                setSaveResult({ success: false, message: `❌ 儲存失敗: ${data.error}` });
            }
        } catch (e: any) {
            setSaveResult({ success: false, message: `❌ 系統錯誤: ${e.message}` });
        } finally {
            setIsSavingConfig(false);
        }
    };

    /** 模擬 LINE Webhook 訊息 */
    const handleSimulateLine = async (app: AppIntegration) => {
        if (!simInput.trim()) return;
        setSimulating(true);
        setSimReply(null);
        try {
            const res = await fetch(`/api/line/webhook/${app.integrationId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-simulation': 'true'
                },
                body: JSON.stringify({
                    events: [{
                        type: 'message',
                        replyToken: 'sim_token',
                        source: { userId: 'U_SIMULATION_USER' },
                        message: { type: 'text', text: simInput }
                    }]
                })
            });
            const data = await res.json();
            if (data.ok && data.replies?.length > 0) {
                setSimReply(data.replies[0].text);
            } else {
                setSimReply('系統無回應或回覆格式錯誤');
            }
        } catch (e: any) {
            setSimReply(`模擬失敗: ${e.message}`);
        } finally {
            setSimulating(false);
        }
    };

    /** 測試 LINE 推播功能 */
    const handlePushLine = async () => {
        if (!pushMessage.trim()) {
            setPushResult('訊息內容不能為空');
            return;
        }

        setPushTesting(true);
        setPushResult(null);

        try {
            const res = await fetch('/api/line/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userEmail: selectedAppConfig?.config?.testEmail, // 可選，測試用
                    message: pushMessage,
                    title: pushTitle || undefined
                })
            });

            const data = await res.json();
            if (data.ok) {
                setPushResult(`✅ 推播成功！${data.recipientCount ? `已發送給 ${data.recipientCount} 位使用者` : ''}`);
                setPushMessage('');
                setPushTitle('');
            } else {
                setPushResult(`❌ 推播失敗: ${data.error || '未知錯誤'}`);
            }
        } catch (e: any) {
            setPushResult(`❌ 推播失敗: ${e.message}`);
        } finally {
            setPushTesting(false);
        }
    };

    return (
        <div className="page p-6 max-w-5xl mx-auto">
            <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">系統設定</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">管理您的通訊渠道與金流串接</p>
                </div>
                <div>
                    <Link href="/apps/page-permissions" className="text-sm bg-purple-100 hover:bg-purple-200 text-purple-700 font-semibold py-2 px-4 rounded-lg transition-colors flex items-center shadow-sm">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        頁面存取權限
                    </Link>
                </div>
            </header>

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            ) : (
                <>
                    {/* ─────────── 通訊渠道區塊 ─────────── */}
                    <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                            <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            通訊渠道
                            <span className="ml-3 inline-flex items-center gap-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                                <span className="px-2.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-semibold">
                                    {apps.filter(a => CHANNEL_TYPES.includes(a.type) && a.status === 'ACTIVE').length}/{apps.filter(a => CHANNEL_TYPES.includes(a.type)).length}
                                </span>
                            </span>
                        </h2>
                        <Link href="/add-app" className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold py-1.5 px-4 rounded-full transition-colors flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            新增通訊 App
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
                        {CHANNEL_TYPES.map((type) => {
                            const meta = CHANNEL_META[type];
                            const connected = getConnectedApps(type);
                            const isConnected = connected.length > 0;
                            const activeApp = connected.find(a => a.status === 'ACTIVE');
                            const activeCount = connected.filter(a => a.status === 'ACTIVE').length;
                            const inactiveCount = connected.filter(a => a.status !== 'ACTIVE').length;

                            return (
                                <div key={type} className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-5 flex flex-col transition-all hover:shadow-md ${isConnected ? 'border-green-300 dark:border-green-600' : 'border-gray-200 dark:border-gray-700'}`}>
                                    {/* 連線狀態指示燈 */}
                                    <div className="absolute top-3 right-3">
                                        {isConnected ? (
                                            <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                                                <span className="relative flex h-2.5 w-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                                                </span>
                                                已連接
                                            </span>
                                        ) : (
                                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">未連接</span>
                                        )}
                                    </div>

                                    {/* 圖標與名稱 */}
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="text-2xl">{meta.icon}</span>
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white">{meta.label}</h3>
                                        </div>
                                    </div>

                                    {/* 說明文字 */}
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 flex-1">{meta.desc}</p>

                                    {/* 已連接的名稱 */}
                                    {activeApp && (
                                        <p className="text-xs text-green-600 dark:text-green-400 mb-3 truncate">
                                            ✓ {activeApp.name}
                                        </p>
                                    )}

                                    {/* 連接狀態計數 */}
                                    {connected.length > 0 && (
                                        <div className="mb-3 p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                            <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                                                <span>已連線: <strong className="text-green-600 dark:text-green-400">{activeCount}</strong></span>
                                                <span>未連線: <strong className="text-orange-600 dark:text-orange-400">{inactiveCount}</strong></span>
                                            </div>
                                        </div>
                                    )}

                                    {/* 操作按鈕 */}
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            {isConnected ? (
                                                <>
                                                    <Link
                                                        href={`/add-app?channel=${type}`}
                                                        className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 font-medium py-2 px-3 rounded-lg transition-colors w-full text-center"
                                                    >
                                                        新增服務
                                                    </Link>
                                                </>
                                            ) : (
                                                <Link
                                                    href={`/add-app?channel=${type}`}
                                                    className="w-full text-center text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 font-semibold py-2 px-3 rounded-lg transition-colors"
                                                >
                                                    立即串接
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ─────────── 金流服務區塊 ─────────── */}
                    <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                            <svg className="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                            金流服務設定
                            <span className="ml-3 inline-flex items-center gap-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                                <span className="px-2.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-semibold">
                                    {apps.filter(a => PAYMENT_TYPES.includes(a.type) && a.status === 'ACTIVE').length}/{apps.filter(a => PAYMENT_TYPES.includes(a.type)).length}
                                </span>
                            </span>
                        </h2>
                        <Link href="/add-app?type=payment" className="text-sm bg-green-100 hover:bg-green-200 text-green-700 font-semibold py-1.5 px-4 rounded-full transition-colors flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            新增金流服務設定
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                        {PAYMENT_TYPES.map((type) => {
                            const meta = PAYMENT_META[type];
                            const connected = getConnectedApps(type);
                            const isConnected = connected.length > 0;
                            const activeApp = connected.find(a => a.status === 'ACTIVE');
                            const activeCount = connected.filter(a => a.status === 'ACTIVE').length;
                            const inactiveCount = connected.filter(a => a.status !== 'ACTIVE').length;

                            return (
                                <div key={type} className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-6 flex flex-col transition-all hover:shadow-md ${isConnected ? 'border-green-300 dark:border-green-600' : 'border-gray-200 dark:border-gray-700'}`}>
                                    {/* 連線狀態 */}
                                    <div className="absolute top-3 right-3">
                                        {isConnected ? (
                                            <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                                                <span className="relative flex h-2.5 w-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                                                </span>
                                                已連接
                                            </span>
                                        ) : (
                                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">未設定</span>
                                        )}
                                    </div>

                                    {/* 圖標與名稱 */}
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="text-2xl">{meta.icon}</span>
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white">{meta.label}</h3>
                                        </div>
                                    </div>

                                    {/* 說明文字 */}
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 flex-1">{meta.desc}</p>

                                    {/* 已連接的名稱 */}
                                    {activeApp && (
                                        <p className="text-xs text-green-600 dark:text-green-400 mb-3 truncate">
                                            ✓ {activeApp.name}
                                            {activeApp.createdAt && (
                                                <span className="text-gray-400 ml-1">· {new Date(activeApp.createdAt).toLocaleDateString()}</span>
                                            )}
                                        </p>
                                    )}

                                    {/* 設定狀態計數 */}
                                    {connected.length > 0 && (
                                        <div className="mb-3 p-2.5 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                            <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                                                <span>已設定: <strong className="text-green-600 dark:text-green-400">{activeCount}</strong></span>
                                                <span>未設定: <strong className="text-orange-600 dark:text-orange-400">{inactiveCount}</strong></span>
                                            </div>
                                        </div>
                                    )}

                                    {/* 操作按鈕 */}
                                    <div className="space-y-2">
                                        {isConnected && (
                                            <>
                                                {/* 測試結果 */}
                                                {connected.map(c => testResults[c.integrationId] && (
                                                    <div key={c.integrationId} className={`text-xs p-2 rounded-lg ${testResults[c.integrationId].success ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                                                        <span className="font-bold">{testResults[c.integrationId].success ? '✓ 測試成功' : '✗ 測試失敗'}</span>
                                                        <p className="mt-0.5 break-all">{testResults[c.integrationId].message}</p>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                        <div className="flex gap-2">
                                            {isConnected ? (
                                                <>
                                                    <button
                                                        onClick={() => handleTest(connected[0])}
                                                        disabled={testingId === connected[0].integrationId}
                                                        className="flex-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50 font-medium py-2 px-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                                                    >
                                                        {testingId === connected[0].integrationId ? (
                                                            <><svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>測試中...</>
                                                        ) : (
                                                            <>🔍 測試連線</>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectedAppConfig(connected[0])}
                                                        className="text-xs bg-green-50 hover:bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50 font-medium py-2 px-3 rounded-lg transition-colors"
                                                    >
                                                        設定
                                                    </button>
                                                    <Link
                                                        href={`/add-app?type=payment&provider=${type}`}
                                                        className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 font-medium py-2 px-3 rounded-lg transition-colors"
                                                    >
                                                        新增
                                                    </Link>
                                                </>
                                            ) : (
                                                <Link
                                                    href={`/add-app?type=payment&provider=${type}`}
                                                    className="w-full text-center text-xs bg-green-100 hover:bg-green-200 text-green-700 border border-green-300 font-semibold py-2 px-3 rounded-lg transition-colors"
                                                >
                                                    立即設定
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ─────────── AI 工具區塊 ─────────── */}
                    <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                            <span className="text-xl mr-2">🤖</span>
                            AI 工具串接
                            <span className="ml-3 inline-flex items-center gap-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                                <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold">
                                    {apps.filter(a => AI_TYPES.includes(a.type) && a.status === 'ACTIVE').length}/{apps.filter(a => AI_TYPES.includes(a.type)).length}
                                </span>
                            </span>
                        </h2>
                        <Link href="/add-app?type=ai" className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold py-1.5 px-4 rounded-full transition-colors flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            新增 AI 服務設定
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                        {AI_TYPES.map((type) => {
                            const meta = AI_META[type];
                            const connected = getConnectedApps(type);
                            const isConnected = connected.length > 0;
                            const activeApp = connected.find(a => a.status === 'ACTIVE');
                            const activeCount = connected.filter(a => a.status === 'ACTIVE').length;
                            const inactiveCount = connected.filter(a => a.status !== 'ACTIVE').length;

                            return (
                                <div key={type} className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-6 flex flex-col transition-all hover:shadow-md ${isConnected ? 'border-blue-300 dark:border-blue-600' : 'border-gray-200 dark:border-gray-700'}`}>
                                    {/* 連線狀態 */}
                                    <div className="absolute top-3 right-3">
                                        {isConnected ? (
                                            <span className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                                                <span className="relative flex h-2.5 w-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                                                </span>
                                                已連接
                                            </span>
                                        ) : (
                                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">未設定</span>
                                        )}
                                    </div>

                                    {/* 圖標與名稱 */}
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="text-2xl">{meta.icon}</span>
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white">{meta.label}</h3>
                                        </div>
                                    </div>

                                    {/* 說明文字 */}
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 flex-1">{meta.desc}</p>

                                    {/* 已連接的名稱 */}
                                    {activeApp && (
                                        <p className="text-xs text-blue-600 dark:text-blue-400 mb-3 truncate">
                                            ✓ {activeApp.name}
                                            {activeApp.createdAt && (
                                                <span className="text-gray-400 ml-1">· {new Date(activeApp.createdAt).toLocaleDateString()}</span>
                                            )}
                                        </p>
                                    )}

                                    {/* 設定狀態計數 */}
                                    {connected.length > 0 && (
                                        <div className="mb-3 p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                            <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                                                <span>已設定: <strong className="text-blue-600 dark:text-blue-400">{activeCount}</strong></span>
                                                <span>未設定: <strong className="text-orange-600 dark:text-orange-400">{inactiveCount}</strong></span>
                                            </div>
                                        </div>
                                    )}

                                    {/* 操作按鈕 */}
                                    <div className="space-y-2">
                                        {/* 測試結果區塊移除 (依需求移除測試按鈕) */}
                                        <div className="flex gap-2">
                                            {isConnected ? (
                                                <>
                                                    <Link
                                                        href={`/add-app?type=ai&provider=${type}`}
                                                        className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 font-medium py-2 px-3 rounded-lg transition-colors w-full text-center"
                                                    >
                                                        新增服務
                                                    </Link>
                                                </>
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
                                </div>
                            );
                        })}
                    </div>

                    {/* ─────────── 郵件服務區塊 ─────────── */}
                    <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                            <span className="text-xl mr-2">✉️</span>
                            郵件服務設定
                            <span className="ml-3 inline-flex items-center gap-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                                <span className="px-2.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-full text-xs font-semibold">
                                    {apps.filter(a => EMAIL_TYPES.includes(a.type) && a.status === 'ACTIVE').length}/{apps.filter(a => EMAIL_TYPES.includes(a.type)).length}
                                </span>
                            </span>
                        </h2>
                        <Link href="/add-app?type=email" className="text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 font-semibold py-1.5 px-4 rounded-full transition-colors flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            新增郵件服務設定
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                        {EMAIL_TYPES.map((type) => {
                            const meta = EMAIL_META[type];
                            const connected = getConnectedApps(type);
                            const isConnected = connected.length > 0;
                            const activeApp = connected.find(a => a.status === 'ACTIVE');
                            const activeCount = connected.filter(a => a.status === 'ACTIVE').length;
                            const inactiveCount = connected.filter(a => a.status !== 'ACTIVE').length;

                            return (
                                <div key={type} className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-6 flex flex-col transition-all hover:shadow-md ${isConnected ? 'border-yellow-300 dark:border-yellow-600' : 'border-gray-200 dark:border-gray-700'}`}>
                                    {/* 連線狀態 */}
                                    <div className="absolute top-3 right-3">
                                        {isConnected ? (
                                            <span className="flex items-center gap-1 text-xs font-medium text-yellow-600 dark:text-yellow-400">
                                                <span className="relative flex h-2.5 w-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500"></span>
                                                </span>
                                                已連接
                                            </span>
                                        ) : (
                                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">未設定</span>
                                        )}
                                    </div>

                                    {/* 圖標與名稱 */}
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="text-2xl">{meta.icon}</span>
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white">{meta.label}</h3>
                                        </div>
                                    </div>

                                    {/* 說明文字 */}
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 flex-1">{meta.desc}</p>

                                    {/* 已連接的名稱 */}
                                    {activeApp && (
                                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-3 truncate">
                                            ✓ {activeApp.name}
                                            {activeApp.createdAt && (
                                                <span className="text-gray-400 ml-1">· {new Date(activeApp.createdAt).toLocaleDateString()}</span>
                                            )}
                                        </p>
                                    )}

                                    {/* 設定狀態計數 */}
                                    {connected.length > 0 && (
                                        <div className="mb-3 p-2.5 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                                            <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                                                <span>已設定: <strong className="text-yellow-600 dark:text-yellow-400">{activeCount}</strong></span>
                                                <span>未設定: <strong className="text-orange-600 dark:text-orange-400">{inactiveCount}</strong></span>
                                            </div>
                                        </div>
                                    )}

                                    {/* 操作按鈕 */}
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            {isConnected ? (
                                                <>
                                                    <Link
                                                        href={`/add-app?type=email&provider=${type}`}
                                                        className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 font-medium py-2 px-3 rounded-lg transition-colors w-full text-center"
                                                    >
                                                        新增服務
                                                    </Link>
                                                </>
                                            ) : (
                                                <Link
                                                    href={`/add-app?type=email&provider=${type}`}
                                                    className="w-full text-center text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300 font-semibold py-2 px-3 rounded-lg transition-colors"
                                                >
                                                    立即設定
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ─────────── 已連接的整合列表 ─────────── */}
                    {apps.length > 0 && (
                        <div className="mt-8">
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center border-b border-gray-200 dark:border-gray-700 pb-2">
                                <svg className="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                已連接的服務 ({apps.length})
                            </h2>
                            <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                                        <tr>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">類型</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">名稱</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">狀態</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">建立時間</th>
                                            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {apps.map((app) => {
                                            const isPayment = PAYMENT_TYPES.includes(app.type);
                                            const isAI = AI_TYPES.includes(app.type);
                                            const isEmail = EMAIL_TYPES.includes(app.type);

                                            // Determine correct meta depending on type
                                            let meta;
                                            if (isPayment) {
                                                meta = PAYMENT_META[app.type];
                                            } else if (isAI) {
                                                meta = AI_META[app.type];
                                            } else if (isEmail) {
                                                meta = EMAIL_META[app.type];
                                            } else {
                                                meta = CHANNEL_META[app.type];
                                            }

                                            const badgeColor = meta?.badge || 'bg-gray-100 text-gray-800';
                                            const label = meta?.label || app.type;
                                            const icon = meta?.icon;

                                            return (
                                                <tr key={app.integrationId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded ${badgeColor}`}>
                                                            {icon && <span>{icon}</span>}{label}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                                        {app.name}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                        <span className={`px-2 py-1 text-xs font-bold rounded ${app.status === 'ACTIVE' ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}`}>
                                                            {app.status === 'ACTIVE' ? '啟用' : '停用'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                        {new Date(app.createdAt).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedAppConfig(app);
                                                                setEditedConfig(app.config ? { ...app.config } : {});
                                                                setEditedName(app.name || '');
                                                                setEditedStatus(app.status || 'ACTIVE');
                                                                setEditedScriptEnabled(!!(app.config && app.config.customScript));
                                                                setEditedCustomScript(app.config && app.config.customScript ? app.config.customScript : `function doPost(event) {\n  const incoming = event.events[0]?.message?.text;\n  return "You said: " + incoming;\n}`);
                                                            }}
                                                            className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 font-medium py-2 px-4 rounded-lg transition-colors inline-block"
                                                        >
                                                            詳細
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Modal for viewing details */}
            {selectedAppConfig && (
                <div className="fixed inset-0 z-[999] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true" onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        setSelectedAppConfig(null);
                    }
                }}>
                    <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:p-0">
                        {/* Background overlay */}
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity z-[999]" aria-hidden="true" onClick={() => setSelectedAppConfig(null)}></div>

                        {/* Modal Panel */}
                        <div className="relative inline-block align-middle bg-white dark:bg-gray-800 rounded-lg text-left overflow-visible shadow-xl transform transition-all sm:align-middle sm:max-w-lg w-full max-h-[90vh] flex flex-col z-[1000]">
                            <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4 overflow-y-auto flex-1">
                                <div className="sm:flex sm:items-start">
                                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900 sm:mx-0 sm:h-10 sm:w-10 overflow-hidden border border-blue-200 dark:border-blue-700 shadow-sm">
                                        {selectedAppConfig.type.toUpperCase() === 'LINE' && testResults[selectedAppConfig.integrationId]?.details?.pictureUrl ? (
                                            <img src={testResults[selectedAppConfig.integrationId].details.pictureUrl} alt="Bot Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <svg className="h-6 w-6 text-blue-600 dark:text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
                                            詳細資訊 - {selectedAppConfig.name}
                                        </h3>
                                        <div className="mt-4">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                                                <strong>服務類型：</strong> {selectedAppConfig.type}
                                            </p>

                                            <div className="space-y-4 mb-6">
                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">服務名稱:</label>
                                                    <input
                                                        type="text"
                                                        className="w-full bg-white dark:bg-gray-800 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                        value={editedName}
                                                        onChange={(e) => setEditedName(e.target.value)}
                                                        placeholder="例如: 我的 LINE 機器人"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">連線狀態:</label>
                                                    <select
                                                        className="w-full bg-white dark:bg-gray-800 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                        value={editedStatus}
                                                        onChange={(e) => setEditedStatus(e.target.value)}
                                                    >
                                                        <option value="ACTIVE">啟用 (ACTIVE)</option>
                                                        <option value="INACTIVE">停用 (INACTIVE)</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <h4 className="font-bold text-sm text-gray-800 dark:text-white mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">進階配置參數</h4>
                                            {/* 測試結果 */}
                                            {testResults[selectedAppConfig.integrationId] && (
                                                <div className={`text-sm p-3 rounded-lg mb-4 ${testResults[selectedAppConfig.integrationId].success ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800'}`}>
                                                    <span className="font-bold text-base">{testResults[selectedAppConfig.integrationId].success ? '✓ 測試成功' : '✗ 測試失敗'}</span>
                                                    <p className="mt-1 break-all">{testResults[selectedAppConfig.integrationId].message}</p>
                                                </div>
                                            )}

                                            {/* 儲存結果提示 */}
                                            {saveResult && (
                                                <div className={`text-sm p-3 rounded-lg mb-4 animate-in fade-in slide-in-from-top-1 duration-300 flex items-center justify-between ${saveResult.success ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200 border border-green-200 dark:border-green-800' : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-200 dark:border-red-800'}`}>
                                                    <div className="flex items-center gap-2 font-bold">
                                                        <span>{saveResult.message}</span>
                                                    </div>
                                                    <button onClick={() => setSaveResult(null)} className="text-current opacity-50 hover:opacity-100">✕</button>
                                                </div>
                                            )}
                                            {/* 顯示/隱藏內容切換 */}
                                            <div className="flex items-center gap-2 mb-4 px-1">
                                                <input
                                                    type="checkbox"
                                                    id="show-secret-toggle"
                                                    checked={showSecret}
                                                    onChange={(e) => setShowSecret(e.target.checked)}
                                                    className="rounded text-blue-600 focus:ring-blue-500 bg-white border-gray-300"
                                                />
                                                <label htmlFor="show-secret-toggle" className="text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                                                    顯示隱藏的內容 (解除星號)
                                                </label>
                                            </div>

                                            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md border border-gray-200 dark:border-gray-700 overflow-x-auto text-sm">
                                                <ul className="space-y-4 text-gray-700 dark:text-gray-300">
                                                    {Object.keys(editedConfig).filter(k => k !== 'models').map(key => {
                                                        const label = LABEL_MAP[key] || (key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'));
                                                        const isSecretField = key.toLowerCase().includes('secret') || key.toLowerCase().includes('key') || key.toLowerCase().includes('token') || key.toLowerCase().includes('password');
                                                        return (
                                                            <li key={key} className="flex flex-col sm:flex-row sm:items-center">
                                                                <span className="font-semibold w-full sm:w-1/3 text-gray-500 dark:text-gray-400 mb-1 sm:mb-0">{label}:</span>
                                                                <input
                                                                    type={isSecretField && !showSecret ? 'password' : 'text'}
                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm pr-10"
                                                                    value={editedConfig[key] || ''}
                                                                    onChange={(e) => setEditedConfig({ ...editedConfig, [key]: e.target.value })}
                                                                />
                                                                {key === 'channelSecret' && (
                                                                    <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                                                                        * 此欄位於 Webhook 驗證時使用，「測試連線」僅驗證 Token。
                                                                    </p>
                                                                )}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>

                                                {AI_TYPES.includes(selectedAppConfig.type) && (
                                                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                                        <span className="block font-semibold text-gray-500 dark:text-gray-400 mb-2">可使用的模型 (Models):</span>
                                                        <div className="flex flex-wrap gap-2">
                                                            {(AI_MODEL_OPTIONS[selectedAppConfig.type] || []).map(model => {
                                                                const selectedModels = Array.isArray(editedConfig.models) ? editedConfig.models : (typeof editedConfig.models === 'string' ? editedConfig.models.split(',').filter(Boolean) : []);
                                                                const isChecked = selectedModels.includes(model);
                                                                return (
                                                                    <label key={model} className="flex items-center gap-1.5 bg-white dark:bg-gray-800 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isChecked}
                                                                            onChange={(e) => {
                                                                                // 限制只能選擇一個模型 (User requirement: Only one model at a time)
                                                                                if (e.target.checked) {
                                                                                    setEditedConfig({ ...editedConfig, models: [model] });
                                                                                } else {
                                                                                    setEditedConfig({ ...editedConfig, models: [] });
                                                                                }
                                                                            }}
                                                                            className="rounded text-blue-600 focus:ring-blue-500 bg-gray-100 border-gray-300"
                                                                        />
                                                                        <span>{model}</span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Webhook Script Editor inside Modal (Only for Channel integrations like LINE for now) */}
                                                {!['STRIPE', 'PAYPAL', 'ECPAY', 'OPENAI', 'ANTHROPIC', 'GEMINI'].includes(selectedAppConfig.type) && (
                                                    <div className="mt-8 pt-4 border-t border-gray-200 dark:border-gray-700">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editedScriptEnabled}
                                                                    onChange={(e) => setEditedScriptEnabled(e.target.checked)}
                                                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                                                />
                                                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                                                    使用自訂 Webhook 腳本
                                                                </span>
                                                            </label>
                                                        </div>
                                                        {editedScriptEnabled && (
                                                            <div className="border border-gray-300 dark:border-gray-700 rounded overflow-hidden shadow-inner">
                                                                <Editor
                                                                    height="350px"
                                                                    defaultLanguage="javascript"
                                                                    theme="vs-dark"
                                                                    value={editedCustomScript}
                                                                    onChange={(val) => setEditedCustomScript(val || '')}
                                                                    options={{
                                                                        minimap: { enabled: false },
                                                                        fontSize: 14,
                                                                        scrollBeyondLastLine: false,
                                                                        automaticLayout: true
                                                                    }}
                                                                />
                                                            </div>
                                                        )}
                                                        <p className="text-xs text-gray-500 mt-2">勾選後將在收到訊息時優先執行此腳本，停止將訊息傳送給 AI 或原始處理函式。</p>
                                                    </div>
                                                )}

                                                {/* AI Prompt 測試區塊 */}
                                                {AI_TYPES.includes(selectedAppConfig.type) && (
                                                    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                                                        <h4 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                                                            <span className="text-xl">💬</span> Prompt 功能測試
                                                        </h4>
                                                        <div className="space-y-3">
                                                            <p className="text-xs text-gray-500 mb-2">您可以輸入一段文字，測試 AI 是否能正確回應內容。</p>
                                                            <div className="flex flex-col gap-2">
                                                                <textarea
                                                                    value={simInput}
                                                                    onChange={(e) => setSimInput(e.target.value)}
                                                                    placeholder="請輸入測試問題 (例如：你好，請自我介紹)"
                                                                    rows={3}
                                                                    className="w-full px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                                                            handleAiTestPrompt(selectedAppConfig);
                                                                        }
                                                                    }}
                                                                />
                                                                <button
                                                                    onClick={() => handleAiTestPrompt(selectedAppConfig)}
                                                                    disabled={simulating || !simInput.trim()}
                                                                    className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                                                >
                                                                    {simulating ? (
                                                                        <>
                                                                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                                            AI 思考中...
                                                                        </>
                                                                    ) : (
                                                                        '🚀 傳送並測試 Prompt'
                                                                    )}
                                                                </button>
                                                            </div>
                                                            <div className="text-[10px] text-gray-400 text-right">支援 Ctrl + Enter 快速傳送</div>

                                                            {/* 回應內容區域 */}
                                                            <div className="mt-4">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <h5 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                                                        <span className="text-base">📋</span> AI 回應內容
                                                                    </h5>
                                                                    {simReply && (
                                                                        <button
                                                                            onClick={() => {
                                                                                navigator.clipboard.writeText(simReply.replace(/^❌ (錯誤|測試失敗)：/, ''));
                                                                            }}
                                                                            className="text-[10px] text-blue-600 hover:text-blue-700 dark:text-blue-400"
                                                                        >
                                                                            複製結果
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div className={`p-4 rounded-lg border-2 min-h-[120px] max-h-[400px] overflow-auto resize-y transition-all ${!simReply ? 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 border-dashed' :
                                                                    simReply.startsWith('❌') ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900/50' :
                                                                        'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-900/50'
                                                                    }`}>
                                                                    {simulating ? (
                                                                        <div className="flex flex-col items-center justify-center h-full min-h-[80px] text-gray-400 gap-3">
                                                                            <svg className="animate-spin h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24">
                                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                                            </svg>
                                                                            <span className="text-xs font-medium animate-pulse">正在取得 AI 回應...</span>
                                                                        </div>
                                                                    ) : simReply ? (
                                                                        <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-medium leading-relaxed selection:bg-blue-100 dark:selection:bg-blue-900/40">
                                                                            {simReply}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex flex-col items-center justify-center h-full min-h-[80px] text-gray-400 italic">
                                                                            <svg className="w-8 h-8 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                                                            </svg>
                                                                            <p className="text-xs">尚未執行測試，在上方輸入內容並點擊傳送</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* 測試按鈕 (金流服務和通訊渠道) */}
                                                {(() => {
                                                    const PAYMENT_TYPES = ['ECPAY', 'PAYPAL', 'STRIPE'];
                                                    const CHANNEL_TYPES = ['LINE', 'TELEGRAM', 'WHATSAPP', 'MESSENGER', 'SLACK', 'TEAMS', 'DISCORD', 'WECHAT'];
                                                    const AI_TYPES = ['OPENAI', 'ANTHROPIC', 'GEMINI'];
                                                    const EMAIL_TYPES = ['SMTP'];
                                                    const isPaymentService = PAYMENT_TYPES.includes(selectedAppConfig.type);
                                                    const isChannelService = CHANNEL_TYPES.includes(selectedAppConfig.type);
                                                    const isAIService = AI_TYPES.includes(selectedAppConfig.type);
                                                    const isEmailService = EMAIL_TYPES.includes(selectedAppConfig.type);
                                                    return (isPaymentService || isChannelService || isAIService || isEmailService) ? (
                                                        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                                                            <button
                                                                onClick={() => handleTest({ ...selectedAppConfig, config: editedConfig })}
                                                                disabled={testingId === selectedAppConfig.integrationId}
                                                                className={`w-full px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${testingId === selectedAppConfig.integrationId ? 'bg-gray-300 text-gray-600 cursor-wait dark:bg-gray-600' : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50'}`}
                                                            >
                                                                {testingId === selectedAppConfig.integrationId ? (
                                                                    <span className="flex items-center justify-center gap-2">
                                                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                                        測試連線中...
                                                                    </span>
                                                                ) : (
                                                                    '🔍 測試連線'
                                                                )}
                                                            </button>
                                                        </div>
                                                    ) : null;
                                                })()}

                                                {/* LINE 專端功能 */}
                                                {selectedAppConfig.type.toUpperCase() === 'LINE' && (
                                                    <div className="space-y-6">
                                                        {/* 模擬器 - 移到上方增加可見性 */}
                                                        <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
                                                            <h4 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                                                                <span className="text-xl">🤖</span> 訊息模擬測試
                                                            </h4>
                                                            <div className="space-y-3">
                                                                <p className="text-xs text-gray-500 mb-2">您可以輸入指令測試帳號綁定（例如：<code>BIND 您的電子信箱</code>）</p>
                                                                <div className="flex gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={simInput}
                                                                        onChange={(e) => setSimInput(e.target.value)}
                                                                        placeholder="輸入指令..."
                                                                        className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                                        onKeyDown={(e) => e.key === 'Enter' && handleSimulateLine(selectedAppConfig)}
                                                                    />
                                                                    <button
                                                                        onClick={() => handleSimulateLine(selectedAppConfig)}
                                                                        disabled={simulating || !simInput.trim()}
                                                                        className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                                                                    >
                                                                        {simulating ? '...' : '模擬傳送'}
                                                                    </button>
                                                                </div>
                                                                {simReply && (
                                                                    <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border-2 border-green-200 dark:border-green-900/50 animate-in fade-in slide-in-from-top-1 transition-all">
                                                                        <p className="text-[10px] font-bold text-green-600 dark:text-green-400 mb-1 uppercase tracking-wider">Bot 模擬回覆：</p>
                                                                        <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-medium">{simReply}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Webhook URL */}
                                                        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                                                            <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center">
                                                                <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                                                                Webhook URL 設定
                                                            </h4>
                                                            <p className="text-xs text-blue-700 dark:text-blue-400 mb-3 leading-relaxed">
                                                                請將以下網址複製並貼上至 LINE Developers Console 的 <strong>Webhook settings</strong>，並開啟「Use webhook」。
                                                            </p>
                                                            <div className="flex items-center gap-2">
                                                                <code className="flex-1 block bg-white dark:bg-gray-800 px-3 py-2 rounded shadow-inner border border-blue-200 dark:border-blue-700 text-[10px] font-mono text-gray-800 dark:text-gray-200 break-all">
                                                                    {typeof window !== 'undefined' ? `${window.location.origin}/api/line/webhook/${selectedAppConfig.integrationId}` : ''}
                                                                </code>
                                                                <button
                                                                    onClick={(e) => {
                                                                        const btn = e.currentTarget;
                                                                        navigator.clipboard.writeText(`${window.location.origin}/api/line/webhook/${selectedAppConfig.integrationId}`);
                                                                        const oldText = btn.innerText;
                                                                        btn.innerText = '已複製';
                                                                        setTimeout(() => btn.innerText = oldText, 2000);
                                                                    }}
                                                                    className="px-3 py-1.5 bg-blue-600 text-white font-medium text-xs rounded hover:bg-blue-700 transition-colors whitespace-nowrap"
                                                                >
                                                                    複製
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* LINE 推播測試 */}
                                                        <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-lg">
                                                            <h4 className="font-semibold text-purple-800 dark:text-purple-300 mb-3 flex items-center">
                                                                <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                                                                LINE 推播測試
                                                            </h4>
                                                            <p className="text-xs text-purple-700 dark:text-purple-400 mb-3">
                                                                向所有已綁定 LINE 的使用者發送推播通知
                                                            </p>
                                                            <div className="space-y-3">
                                                                <input
                                                                    type="text"
                                                                    value={pushTitle}
                                                                    onChange={(e) => setPushTitle(e.target.value)}
                                                                    placeholder="標題（可選）"
                                                                    className="w-full px-3 py-2 text-sm border border-purple-300 dark:border-purple-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                                                />
                                                                <textarea
                                                                    value={pushMessage}
                                                                    onChange={(e) => setPushMessage(e.target.value)}
                                                                    placeholder="推播訊息內容"
                                                                    rows={3}
                                                                    className="w-full px-3 py-2 text-sm border border-purple-300 dark:border-purple-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                                                                />
                                                                <button
                                                                    onClick={handlePushLine}
                                                                    disabled={pushTesting || !pushMessage.trim()}
                                                                    className="w-full px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {pushTesting ? '✉️ 推播中...' : '📤 發送推播'}
                                                                </button>
                                                                {pushResult && (
                                                                    <div className={`p-3 rounded-lg text-sm ${pushResult.startsWith('✅') ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                                                                        {pushResult}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 sm:px-6 flex justify-end gap-3 rounded-b-lg">
                                <button
                                    type="button"
                                    className="inline-flex justify-center items-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm transition-colors"
                                    onClick={() => {
                                        setSelectedAppConfig(null);
                                        setEditedConfig({});
                                        setShowSecret(false);
                                        setSimInput('');
                                        setSimReply(null);
                                        setPushMessage('');
                                        setPushTitle('');
                                        setPushResult(null);
                                        setSaveResult(null);
                                    }}
                                >
                                    關閉
                                </button>
                                <button
                                    type="button"
                                    className={`inline-flex justify-center items-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white transition-colors sm:text-sm ${isSavingConfig ||
                                        JSON.stringify(editedConfig) === JSON.stringify(selectedAppConfig.config || {}) ||
                                        (AI_TYPES.includes(selectedAppConfig.type) && (Array.isArray(editedConfig.models) ? editedConfig.models.length : 0) > 1) ||
                                        (AI_TYPES.includes(selectedAppConfig.type) && (Array.isArray(editedConfig.models) ? editedConfig.models.length : 0) === 0)
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-700'
                                        }`}
                                    onClick={handleSaveConfig}
                                    disabled={
                                        isSavingConfig ||
                                        (JSON.stringify(editedConfig) === JSON.stringify(selectedAppConfig.config || {}) &&
                                            editedName === selectedAppConfig.name &&
                                            editedStatus === selectedAppConfig.status) ||
                                        (AI_TYPES.includes(selectedAppConfig.type) && (Array.isArray(editedConfig.models) ? editedConfig.models.length : 0) > 1) ||
                                        (AI_TYPES.includes(selectedAppConfig.type) && (Array.isArray(editedConfig.models) ? editedConfig.models.length : 0) === 0)
                                    }
                                >
                                    {isSavingConfig ? '儲存中...' :
                                        (AI_TYPES.includes(selectedAppConfig.type) && (Array.isArray(editedConfig.models) ? editedConfig.models.length : 0) > 1) ? '模型限選一個' :
                                            (AI_TYPES.includes(selectedAppConfig.type) && (Array.isArray(editedConfig.models) ? editedConfig.models.length : 0) === 0) ? '請選擇模型' :
                                                '儲存設定'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
