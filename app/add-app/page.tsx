'use client';

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Editor from '@monaco-editor/react';

export default function AddAppPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">載入中...</div>}>
            <AddAppForm />
        </Suspense>
    );
}

function AddAppForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const typeFromUrl = searchParams.get('type');
    const isPayment = typeFromUrl === 'payment';
    const isAI = typeFromUrl === 'ai';
    const isEmail = typeFromUrl === 'email';

    const AI_MODEL_OPTIONS: Record<string, string[]> = {
        OPENAI: ['gpt-5.2', 'gpt-5.2-pro', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'o3-deep-research', 'o1-pro'],
        ANTHROPIC: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-3-5-sonnet'],
        GEMINI: ['gemini-3.1-pro-preview', 'gemini-3-flash', 'gemini-2.5-pro', 'gemini-2.5-flash']
    };

    const [loading, setLoading] = useState(false);

    // Communication channel type selector - pre-select from URL ?channel=TELEGRAM
    const channelFromUrl = searchParams.get('channel')?.toUpperCase() || 'LINE';
    const [selectedChannelType, setSelectedChannelType] = useState(
        ['LINE', 'TELEGRAM', 'WHATSAPP', 'MESSENGER', 'SLACK', 'TEAMS', 'DISCORD', 'WECHAT'].includes(channelFromUrl) ? channelFromUrl : 'LINE'
    );

    // Payment provider from URL ?provider=STRIPE
    const providerFromUrl = searchParams.get('provider')?.toUpperCase() || 'ECPAY';

    // For Communication - generic fields
    const [channelData, setChannelData] = useState({
        name: '',
        // LINE
        channelAccessToken: '',
        channelSecret: '',
        // Telegram
        botToken: '',
        // WhatsApp
        phoneNumberId: '',
        whatsappAccessToken: '',
        // Messenger
        pageAccessToken: '',
        appSecret: '',
        // Slack
        botOAuthToken: '',
        signingSecret: '',
        // Teams
        appId: '',
        appPassword: '',
        // Discord
        discordBotToken: '',
        applicationId: '',
        // WeChat
        wechatAppId: '',
        wechatAppSecret: '',
        // Custom Scripting (for Webhooks)
        enableCustomScript: false,
        customScript: `function doPost(event) {
  // Use event object from Webhook Provider
  // return your reply payload
  const incoming = event.events[0]?.message?.text;
  return "You said: " + incoming;
}`
    });

    // For Payment
    const [selectedPaymentProvider, setSelectedPaymentProvider] = useState(
        ['ECPAY', 'PAYPAL', 'STRIPE'].includes(providerFromUrl) ? providerFromUrl : 'ECPAY'
    );
    const [paymentData, setPaymentData] = useState({
        name: '',
        ecpayMerchantId: '',
        ecpayHashKey: '',
        ecpayHashIV: '',
        stripeAccountId: '',
        stripePublicKey: '',
        stripeSecretKey: '',
        paypalClientId: '',
        paypalSecretKey: ''
    });

    // For AI
    const [selectedAIProvider, setSelectedAIProvider] = useState(
        ['OPENAI', 'ANTHROPIC', 'GEMINI'].includes(providerFromUrl) ? providerFromUrl : 'OPENAI'
    );
    const [aiData, setAiData] = useState<{
        name: string;
        openaiApiKey: string;
        anthropicApiKey: string;
        geminiApiKey: string;
        models: string[];
    }>({
        name: '',
        openaiApiKey: '',
        anthropicApiKey: '',
        geminiApiKey: '',
        models: []
    });

    const handleAiChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setAiData({ ...aiData, [e.target.name]: e.target.value });
    };

    // For Email
    const [selectedEmailProvider, setSelectedEmailProvider] = useState(
        ['SMTP'].includes(providerFromUrl) ? providerFromUrl : 'SMTP'
    );
    const [emailData, setEmailData] = useState({
        name: '',
        smtpHost: '',
        smtpPort: '',
        smtpUser: '',
        smtpPass: '',
        fromAddress: ''
    });

    const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setEmailData({ ...emailData, [e.target.name]: e.target.value });
    };

    const handleChannelChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setChannelData({ ...channelData, [e.target.name]: e.target.value });
    };

    const handlePaymentChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setPaymentData({ ...paymentData, [e.target.name]: e.target.value });
    };

    /** 各通訊渠道的 config 欄位定義 */
    const CHANNEL_CONFIG_MAP: Record<string, { fields: { name: string; label: string; type: string; placeholder: string; required: boolean; rows?: number }[]; hint: string }> = {
        LINE: {
            hint: '前往 LINE Developers Console 取得 Channel Access Token 和 Channel Secret。',
            fields: [
                { name: 'channelAccessToken', label: 'Channel Access Token', type: 'textarea', placeholder: '請輸入 Channel Access Token (用於發信)', required: true, rows: 3 },
                { name: 'channelSecret', label: 'Channel Secret', type: 'text', placeholder: '請輸入 Channel Secret (用於驗證)', required: true },
            ],
        },
        TELEGRAM: {
            hint: '透過 BotFather (@BotFather) 建立 Bot 後取得 Bot Token。',
            fields: [
                { name: 'botToken', label: 'Bot Token', type: 'text', placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11', required: true },
            ],
        },
        WHATSAPP: {
            hint: '前往 Meta for Developers → WhatsApp Business API 取得 Phone Number ID 和 Access Token。',
            fields: [
                { name: 'phoneNumberId', label: 'Phone Number ID', type: 'text', placeholder: '請輸入 Phone Number ID', required: true },
                { name: 'whatsappAccessToken', label: 'Access Token', type: 'text', placeholder: '請輸入 WhatsApp Business Access Token', required: true },
            ],
        },
        MESSENGER: {
            hint: '前往 Meta for Developers → Messenger Platform 取得 Page Access Token 和 App Secret。',
            fields: [
                { name: 'pageAccessToken', label: 'Page Access Token', type: 'textarea', placeholder: '請輸入 Page Access Token', required: true, rows: 3 },
                { name: 'appSecret', label: 'App Secret', type: 'text', placeholder: '請輸入 App Secret (用於驗證)', required: true },
            ],
        },
        SLACK: {
            hint: '前往 Slack API (api.slack.com) → Your Apps 建立 Bot，取得 OAuth Token 和 Signing Secret。',
            fields: [
                { name: 'botOAuthToken', label: 'Bot User OAuth Token', type: 'text', placeholder: 'xoxb-XXXX-XXXX-XXXX', required: true },
                { name: 'signingSecret', label: 'Signing Secret', type: 'text', placeholder: '請輸入 Signing Secret', required: true },
            ],
        },
        TEAMS: {
            hint: '前往 Azure Bot Service / Teams Developer Portal 取得 App ID 和 App Password。',
            fields: [
                { name: 'appId', label: 'App ID (Microsoft)', type: 'text', placeholder: '請輸入 Microsoft App ID', required: true },
                { name: 'appPassword', label: 'App Password', type: 'password', placeholder: '請輸入 App Password', required: true },
            ],
        },
        DISCORD: {
            hint: '前往 Discord Developer Portal 建立 Application 及 Bot，取得 Bot Token。',
            fields: [
                { name: 'discordBotToken', label: 'Bot Token', type: 'text', placeholder: '請輸入 Discord Bot Token', required: true },
                { name: 'applicationId', label: 'Application ID', type: 'text', placeholder: '請輸入 Application ID', required: true },
            ],
        },
        WECHAT: {
            hint: '前往微信公眾平台 (mp.weixin.qq.com) 取得 AppID 和 AppSecret。',
            fields: [
                { name: 'wechatAppId', label: 'AppID', type: 'text', placeholder: '請輸入 AppID', required: true },
                { name: 'wechatAppSecret', label: 'AppSecret', type: 'text', placeholder: '請輸入 AppSecret', required: true },
            ],
        },
    };

    const CHANNEL_LABELS: Record<string, string> = {
        LINE: 'LINE',
        TELEGRAM: 'Telegram',
        WHATSAPP: 'WhatsApp Business',
        MESSENGER: 'Facebook Messenger',
        SLACK: 'Slack',
        TEAMS: 'Microsoft Teams',
        DISCORD: 'Discord',
        WECHAT: 'WeChat 微信',
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            let userId = 'anonymous';
            if (typeof window !== 'undefined') {
                try {
                    const raw = localStorage.getItem('tutor_user');
                    if (raw) {
                        const stored = JSON.parse(raw);
                        userId = stored.id || stored.email || 'anonymous';
                    }
                } catch (_) { }
            }

            let payload: any;

            if (isPayment) {
                let config: any = {};
                if (selectedPaymentProvider === 'ECPAY') {
                    config = {
                        merchantId: paymentData.ecpayMerchantId,
                        hashKey: paymentData.ecpayHashKey,
                        hashIV: paymentData.ecpayHashIV
                    };
                } else if (selectedPaymentProvider === 'STRIPE') {
                    config = {
                        accountId: paymentData.stripeAccountId,
                        publicKey: paymentData.stripePublicKey,
                        secretKey: paymentData.stripeSecretKey
                    };
                } else if (selectedPaymentProvider === 'PAYPAL') {
                    config = {
                        clientId: paymentData.paypalClientId,
                        secretKey: paymentData.paypalSecretKey
                    };
                }

                payload = {
                    userId,
                    type: selectedPaymentProvider,
                    name: paymentData.name || `${selectedPaymentProvider} 收款帳號`,
                    config
                };
            } else if (isAI) {
                let config: any = {};
                if (selectedAIProvider === 'OPENAI') {
                    config = { apiKey: aiData.openaiApiKey, models: aiData.models };
                } else if (selectedAIProvider === 'ANTHROPIC') {
                    config = { apiKey: aiData.anthropicApiKey, models: aiData.models };
                } else if (selectedAIProvider === 'GEMINI') {
                    config = { apiKey: aiData.geminiApiKey, models: aiData.models };
                }

                payload = {
                    userId,
                    type: selectedAIProvider,
                    name: aiData.name || `${selectedAIProvider} 模型服務`,
                    config
                };
            } else if (isEmail) {
                let config: any = {};
                if (selectedEmailProvider === 'SMTP') {
                    config = {
                        smtpHost: emailData.smtpHost,
                        smtpPort: emailData.smtpPort,
                        smtpUser: emailData.smtpUser,
                        smtpPass: emailData.smtpPass,
                        fromAddress: emailData.fromAddress,
                    };
                }

                payload = {
                    userId,
                    type: selectedEmailProvider,
                    name: emailData.name || `自訂 ${selectedEmailProvider} 服務`,
                    config
                };
            } else {
                // 通訊渠道 - 依選擇的渠道類型取出對應 config 欄位
                const channelCfg = CHANNEL_CONFIG_MAP[selectedChannelType];
                const config: Record<string, any> = {};
                if (channelCfg) {
                    for (const f of channelCfg.fields) {
                        const val = (channelData as any)[f.name];
                        if (val) config[f.name] = val;
                    }
                }

                // Attach custom script if enabled
                if (channelData.enableCustomScript && channelData.customScript.trim()) {
                    config.customScript = channelData.customScript;
                }

                payload = {
                    userId,
                    type: selectedChannelType,
                    name: channelData.name || `${CHANNEL_LABELS[selectedChannelType] || selectedChannelType} 通知`,
                    config,
                };
            }

            const res = await fetch('/api/app-integrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }

            alert(isPayment ? '金流設定新增成功！' : isAI ? 'AI 服務新增成功！' : isEmail ? '郵件服務新增成功！' : '應用程式新增成功！');
            router.push('/apps');
        } catch (error: any) {
            console.error('Save failed:', error);
            alert(`新增失敗：${error?.message || '請稍後再試'}`);
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
            <div className="max-w-xl w-full bg-white dark:bg-gray-800 shadow-lg rounded-xl overflow-hidden">
                <div className={`${isPayment ? 'bg-green-600' : isAI ? 'bg-indigo-600' : isEmail ? 'bg-yellow-600' : 'bg-blue-600'} p-6 text-white relative`}>
                    <Link
                        href="/apps"
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 hover:bg-white/20 rounded-full transition-colors"
                        title="返回系統設定"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </Link>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold">{isPayment ? '新增金流服務' : isAI ? '新增 AI 服務' : isEmail ? '新增郵件服務' : '新增應用程式'}</h1>
                        <p className={`mt-2 ${isPayment ? 'text-green-100' : isAI ? 'text-indigo-100' : isEmail ? 'text-yellow-100' : 'text-blue-100'}`}>
                            {isPayment ? '設定您的 ECPay、Stripe 或 PayPal 金流服務設定' : isAI ? '設定您要串接的 AI 模型 API 金鑰' : isEmail ? '設定您的 SMTP 伺服器資訊以發送郵件' : '設定通訊渠道串接參數 (LINE、Telegram、WhatsApp 等)'}
                        </p>
                    </div>
                </div>

                <div className="p-8">
                    {/* 參數說明區塊 */}
                    <div className={`${isPayment ? 'bg-green-50 border-green-200' : isAI ? 'bg-indigo-50 border-indigo-200' : isEmail ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200'} border rounded-lg p-6 mb-8`}>
                        <h3 className={`${isPayment ? 'text-green-800' : isAI ? 'text-indigo-800' : isEmail ? 'text-yellow-800' : 'text-blue-800'} font-bold mb-4 flex items-center`}>
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {isPayment ? '安全提示' : isAI ? '安全提示' : isEmail ? '參數說明' : '參數說明'}
                        </h3>
                        <div className="space-y-3">
                            {isPayment ? (
                                <p className="text-sm text-green-800">
                                    此處填寫的金鑰將被安全加密儲存，專門用於您的課程結帳，確保學生的付款能直接匯入您的金流帳戶中。請勿將您的 HashKey 或 Secret Key 洩漏給他人。
                                </p>
                            ) : isAI ? (
                                <p className="text-sm text-indigo-800">
                                    請前往各 AI 服務提供商 (OpenAI, Anthropic 等) 獲取對應的 API Key。這些金鑰將被安全加密儲存，用於呼叫 AI 模型服務。
                                </p>
                            ) : isEmail ? (
                                <p className="text-sm text-yellow-800">
                                    請填寫您的 SMTP 伺服器資訊，這將用於系統的密碼重置、通知信件等功能。密碼將被加密儲存。
                                </p>
                            ) : (
                                <p className="text-sm text-blue-800">
                                    {CHANNEL_CONFIG_MAP[selectedChannelType]?.hint || '請依照各平台的開發者後台取得對應的金鑰與權杖。'}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* 表單區塊 */}
                    <form onSubmit={handleSave} className="space-y-6">
                        {isPayment ? (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        設定名稱 (僅供您辨識)
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={paymentData.name}
                                        onChange={handlePaymentChange}
                                        placeholder="例如：我的綠界個人帳戶"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        選擇金流服務供應商 <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedPaymentProvider}
                                            onChange={(e) => setSelectedPaymentProvider(e.target.value)}
                                            className="w-full pl-4 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        >
                                            <option value="ECPAY">綠界科技 (ECPay)</option>
                                            <option value="STRIPE">Stripe</option>
                                            <option value="PAYPAL">PayPal</option>
                                        </select>
                                    </div>
                                </div>

                                {selectedPaymentProvider === 'ECPAY' && (
                                    <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                特店編號 (MerchantID) <span className="text-red-500">*</span>
                                            </label>
                                            <input type="text" name="ecpayMerchantId" value={paymentData.ecpayMerchantId} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                HashKey <span className="text-red-500">*</span>
                                            </label>
                                            <input type="text" name="ecpayHashKey" value={paymentData.ecpayHashKey} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                HashIV <span className="text-red-500">*</span>
                                            </label>
                                            <input type="text" name="ecpayHashIV" value={paymentData.ecpayHashIV} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                    </div>
                                )}

                                {selectedPaymentProvider === 'STRIPE' && (
                                    <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Connect Account ID (選填)
                                            </label>
                                            <input type="text" name="stripeAccountId" value={paymentData.stripeAccountId} onChange={handlePaymentChange} placeholder="acct_1Ou..." className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Public Key <span className="text-red-500">*</span>
                                            </label>
                                            <input type="text" name="stripePublicKey" value={paymentData.stripePublicKey} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Secret Key <span className="text-red-500">*</span>
                                            </label>
                                            <input type="password" name="stripeSecretKey" value={paymentData.stripeSecretKey} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                    </div>
                                )}

                                {selectedPaymentProvider === 'PAYPAL' && (
                                    <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Client ID <span className="text-red-500">*</span>
                                            </label>
                                            <input type="text" name="paypalClientId" value={paymentData.paypalClientId} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Secret Key <span className="text-red-500">*</span>
                                            </label>
                                            <input type="password" name="paypalSecretKey" value={paymentData.paypalSecretKey} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : isAI ? (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        設定名稱 (僅供您辨識)
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={aiData.name}
                                        onChange={handleAiChange}
                                        placeholder={`例如：我的 ${selectedAIProvider} 模型設定`}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        選擇 AI 服務供應商 <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedAIProvider}
                                            onChange={(e) => setSelectedAIProvider(e.target.value)}
                                            className="w-full pl-4 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        >
                                            <option value="OPENAI">OpenAI (ChatGPT)</option>
                                            <option value="ANTHROPIC">Anthropic (Claude)</option>
                                            <option value="GEMINI">Google Gemini</option>
                                        </select>
                                    </div>
                                </div>

                                {selectedAIProvider === 'OPENAI' && (
                                    <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                API Key <span className="text-red-500">*</span>
                                            </label>
                                            <input type="password" name="openaiApiKey" value={aiData.openaiApiKey} onChange={handleAiChange} placeholder="sk-..." className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                    </div>
                                )}

                                {selectedAIProvider === 'ANTHROPIC' && (
                                    <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                API Key <span className="text-red-500">*</span>
                                            </label>
                                            <input type="password" name="anthropicApiKey" value={aiData.anthropicApiKey} onChange={handleAiChange} placeholder="sk-ant-..." className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                    </div>
                                )}

                                {selectedAIProvider === 'GEMINI' && (
                                    <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                API Key <span className="text-red-500">*</span>
                                            </label>
                                            <input type="password" name="geminiApiKey" value={aiData.geminiApiKey} onChange={handleAiChange} placeholder="AIza..." className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 mt-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        可使用的模型 (Models)
                                        <p className="text-xs text-gray-500 font-normal mt-1">選取要開放在平台中使用的模型（可複選）</p>
                                    </label>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {(AI_MODEL_OPTIONS[selectedAIProvider] || []).map(model => (
                                            <label key={model} className="flex items-center gap-1.5 bg-white dark:bg-gray-800 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={aiData.models.includes(model)}
                                                    onChange={(e) => {
                                                        let newModels = [...aiData.models];
                                                        if (e.target.checked) {
                                                            if (!newModels.includes(model)) newModels.push(model);
                                                        } else {
                                                            newModels = newModels.filter(m => m !== model);
                                                        }
                                                        setAiData({ ...aiData, models: newModels });
                                                    }}
                                                    className="rounded text-indigo-600 focus:ring-indigo-500 bg-gray-100 border-gray-300"
                                                />
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{model}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : isEmail ? (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        設定名稱 (僅供您辨識)
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={emailData.name}
                                        onChange={handleEmailChange}
                                        placeholder="例如：我的 SMTP 伺服器"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-yellow-500 focus:border-yellow-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        選擇郵件服務 <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedEmailProvider}
                                            onChange={(e) => setSelectedEmailProvider(e.target.value)}
                                            className="w-full pl-4 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        >
                                            <option value="SMTP">SMTP 伺服器</option>
                                        </select>
                                    </div>
                                </div>

                                {selectedEmailProvider === 'SMTP' && (
                                    <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                主機位置 (Host) <span className="text-red-500">*</span>
                                            </label>
                                            <input type="text" name="smtpHost" value={emailData.smtpHost} onChange={handleEmailChange} placeholder="smtp.gmail.com" className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                通訊埠 (Port) <span className="text-red-500">*</span>
                                            </label>
                                            <input type="text" name="smtpPort" value={emailData.smtpPort} onChange={handleEmailChange} placeholder="465 或 587" className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                使用者帳號 (User) <span className="text-red-500">*</span>
                                            </label>
                                            <input type="text" name="smtpUser" value={emailData.smtpUser} onChange={handleEmailChange} placeholder="user@example.com" className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                密碼 (Password) <span className="text-red-500">*</span>
                                            </label>
                                            <input type="password" name="smtpPass" value={emailData.smtpPass} onChange={handleEmailChange} placeholder="密碼或應用程式密碼" className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                寄件者信箱 (From Address) <span className="text-red-500">*</span>
                                            </label>
                                            <input type="text" name="fromAddress" value={emailData.fromAddress} onChange={handleEmailChange} placeholder="noreply@example.com" className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        選擇通訊渠道 <span className="text-red-500">*</span>
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                                        {Object.entries(CHANNEL_LABELS).map(([key, label]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setSelectedChannelType(key)}
                                                className={`px-3 py-2 text-sm rounded-lg border-2 font-medium transition-all ${selectedChannelType === key
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-400'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50/50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                                                    }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        應用程式名稱
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={channelData.name}
                                        onChange={handleChannelChange}
                                        placeholder={`例如：我的 ${CHANNEL_LABELS[selectedChannelType]} 通知`}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        required
                                    />
                                </div>

                                {/* 動態渲染所選通訊渠道的設定欄位 */}
                                <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                        {CHANNEL_CONFIG_MAP[selectedChannelType]?.hint}
                                    </p>
                                    {CHANNEL_CONFIG_MAP[selectedChannelType]?.fields.map((field) => (
                                        <div key={field.name}>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                {field.label} {field.required && <span className="text-red-500">*</span>}
                                            </label>
                                            {field.type === 'textarea' ? (
                                                <textarea
                                                    name={field.name}
                                                    value={(channelData as any)[field.name] || ''}
                                                    onChange={handleChannelChange}
                                                    placeholder={field.placeholder}
                                                    rows={field.rows || 3}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm"
                                                    required={field.required}
                                                />
                                            ) : (
                                                <input
                                                    type={field.type}
                                                    name={field.name}
                                                    value={(channelData as any)[field.name] || ''}
                                                    onChange={handleChannelChange}
                                                    placeholder={field.placeholder}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm"
                                                    required={field.required}
                                                />
                                            )}
                                        </div>
                                    ))}

                                    {/* Webhook Javascript Editor Feature */}
                                    <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
                                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                                            <input
                                                type="checkbox"
                                                checked={channelData.enableCustomScript}
                                                onChange={(e) => setChannelData({ ...channelData, enableCustomScript: e.target.checked })}
                                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                                啟用自訂 Webhook 腳本 (實驗性)
                                            </span>
                                        </label>
                                        <p className="text-xs text-gray-500 mb-3 ml-6">
                                            撰寫 JavaScript 程式碼來自訂接收到 Webhook 時的處理邏輯，類似 Google Apps Script 的結構。
                                        </p>

                                        {channelData.enableCustomScript && (
                                            <div className="ml-6 border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
                                                <Editor
                                                    height="300px"
                                                    defaultLanguage="javascript"
                                                    theme="vs-dark"
                                                    value={channelData.customScript}
                                                    onChange={(value) => setChannelData({ ...channelData, customScript: value || '' })}
                                                    options={{
                                                        minimap: { enabled: false },
                                                        fontSize: 14,
                                                        lineNumbers: 'on',
                                                        scrollBeyondLastLine: false,
                                                        automaticLayout: true
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>

                                </div>
                            </>
                        )}

                        <div className="pt-4 flex gap-4">
                            <Link
                                href="/apps"
                                className="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                            >
                                返回列表
                            </Link>
                            <button
                                type="submit"
                                disabled={loading}
                                className={`w-2/3 ${isPayment ? 'bg-green-600 hover:bg-green-700' : isAI ? 'bg-indigo-600 hover:bg-indigo-700' : isEmail ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-blue-600 hover:bg-blue-700'} text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {loading ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        儲存中...
                                    </>
                                ) : (
                                    '確認新增'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
