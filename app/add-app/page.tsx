'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

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
    const isPayment = searchParams.get('type') === 'payment';

    const [loading, setLoading] = useState(false);

    // Communication channel type selector - pre-select from URL ?channel=TELEGRAM
    const channelFromUrl = searchParams.get('channel')?.toUpperCase() || 'LINE';
    const [selectedChannelType, setSelectedChannelType] = useState(
        ['LINE','TELEGRAM','WHATSAPP','MESSENGER','SLACK','TEAMS','DISCORD','WECHAT'].includes(channelFromUrl) ? channelFromUrl : 'LINE'
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
    });

    // For Payment
    const [selectedPaymentProvider, setSelectedPaymentProvider] = useState(
        ['ECPAY','PAYPAL','STRIPE'].includes(providerFromUrl) ? providerFromUrl : 'ECPAY'
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
            } else {
                // 通訊渠道 - 依選擇的渠道類型取出對應 config 欄位
                const channelCfg = CHANNEL_CONFIG_MAP[selectedChannelType];
                const config: Record<string, string> = {};
                if (channelCfg) {
                    for (const f of channelCfg.fields) {
                        const val = (channelData as any)[f.name];
                        if (val) config[f.name] = val;
                    }
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

            alert(isPayment ? '金流設定新增成功！' : '應用程式新增成功！');
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
                <div className={`${isPayment ? 'bg-green-600' : 'bg-blue-600'} p-6 text-white relative`}>
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
                        <h1 className="text-2xl font-bold">{isPayment ? '新增金流服務' : '新增應用程式'}</h1>
                        <p className={`mt-2 ${isPayment ? 'text-green-100' : 'text-blue-100'}`}>
                            {isPayment ? '設定您的 ECPay、Stripe 或 PayPal 金流服務設定' : '設定通訊渠道串接參數 (LINE、Telegram、WhatsApp 等)'}
                        </p>
                    </div>
                </div>

                <div className="p-8">
                    {/* 參數說明區塊 */}
                    <div className={`${isPayment ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'} border rounded-lg p-6 mb-8`}>
                        <h3 className={`${isPayment ? 'text-green-800' : 'text-blue-800'} font-bold mb-4 flex items-center`}>
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {isPayment ? '安全提示' : '參數說明'}
                        </h3>
                        <div className="space-y-3">
                            {isPayment ? (
                                <p className="text-sm text-green-800">
                                    此處填寫的金鑰將被安全加密儲存，專門用於您的課程結帳，確保學生的付款能直接匯入您的金流帳戶中。請勿將您的 HashKey 或 Secret Key 洩漏給他人。
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
                                                className={`px-3 py-2 text-sm rounded-lg border-2 font-medium transition-all ${
                                                    selectedChannelType === key
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
                                className={`w-2/3 ${isPayment ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed`}
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
