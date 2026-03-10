'use client';

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Editor from '@monaco-editor/react';
import { AI_SKILLS, getSkillById } from '@/lib/ai-skills';
import { ExecutionEnvironment, EXECUTION_ENVIRONMENT_META } from '@/lib/platform-agents';

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
    const isDatabase = typeFromUrl === 'database';
    const providerPreCheck = searchParams.get('provider')?.toUpperCase() || '';
    const isAskPlanAgent = isAI && providerPreCheck === 'ASK_PLAN_AGENT';

    // AI Model options fetched from DB
    const [aiModelOptions, setAiModelOptions] = useState<Record<string, string[]>>({
        OPENAI: [],
        ANTHROPIC: [],
        GEMINI: []
    });

    const [allApps, setAllApps] = useState<any[]>([]);
    const [loadingApps, setLoadingApps] = useState(false);

    const [loading, setLoading] = useState(false);
    const [loadingModels, setLoadingModels] = useState(false);

    // Fetch AI model options from API
    useEffect(() => {
        if (isAI) {
            const fetchModels = async () => {
                setLoadingModels(true);
                try {
                    const res = await fetch('/api/admin/ai-models');
                    const json = await res.json();
                    if (json.ok && json.data) {
                        const options: Record<string, string[]> = {};
                        json.data.forEach((item: any) => {
                            options[item.provider] = item.models;
                        });
                        setAiModelOptions(options);
                    }
                } catch (error) {
                    console.error('Failed to fetch AI models:', error);
                } finally {
                    setLoadingModels(false);
                }
            };
            fetchModels();

            // Fetch app integrations to find active AI tools
            const fetchApps = async () => {
                setLoadingApps(true);
                try {
                    const res = await fetch('/api/app-integrations');
                    const json = await res.json();
                    if (json.ok) {
                        setAllApps(json.data || []);
                    }
                } catch (error) {
                    console.error('Failed to fetch apps:', error);
                } finally {
                    setLoadingApps(false);
                }
            };
            fetchApps();
        }
    }, [isAI]);

    const activeAIApps = allApps.filter(a =>
        ['OPENAI', 'ANTHROPIC', 'GEMINI'].includes(a.type) &&
        a.status === 'ACTIVE'
    );

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
        ['ECPAY', 'PAYPAL', 'STRIPE', 'LINEPAY', 'JKOPAY'].includes(providerFromUrl) ? providerFromUrl : 'ECPAY'
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
        paypalSecretKey: '',
        linePayChannelId: '',
        linePayChannelSecret: '',
        jkopayMerchantId: '',
        jkopaySecretKey: ''
    });

    // Gemini default prompt
    const GEMINI_DEFAULT_PROMPT = `# 角色設定
你是「jvtutorcorner」語言學習平台的專屬 AI 助教。你的任務是透過 LINE 提供高品質的語言指導，同時引導學生善用平台的線上教學資源。你的語氣必須親切、專業、充滿鼓勵，就像一位真實且充滿熱忱的家教。

# 核心任務
1. 語言解答 (純文字)：精準回答學生的單字、文法或翻譯問題。每次解答請務必提供 1 到 2 個實用的生活化英文例句，並附上中文翻譯。
2. 視覺學習 (圖片支援)：若學生傳送圖片，請仔細觀察圖片細節，挑選 3 到 5 個最相關的核心英文單字（附詞性與中文解釋），並利用其中一個單字造一個與圖片情境相符的句子。
3. 平台特色引導：在適當的教學時機，自然地提醒學生「語言需要實際開口練習」。主動引導並鼓勵他們預約 jvtutorcorner 的「1對1視訊教學」課程，並提及上課時可以利用專屬的「互動白板」與老師進行視覺化的即時演練，讓學習更有成效。

# 回覆限制與排版格式
- 內容必須條列式、段落分明，絕對避免產生密密麻麻的長篇大論，確保極佳的 LINE 手機閱讀體驗。
- 適度使用表情符號（如 💡、🗣️、✨、📸）增加對話的溫度與互動感。
- 每次回覆的結尾，請務必拋出一個與剛剛學習內容相關的「簡單英文問句」，引導學生繼續在 LINE 上用英文回覆你，達成連續互動。
- 若學生詢問與語言學習或平台操作完全無關的話題，請幽默且禮貌地將話題導回學習本身。`;

    // ─── Ask Plan Agent Presets & State ──────────────────────────────────────
    const AGENT_PRESET_TEMPLATES = [
        {
            id: 'general', icon: '🤖', label: '通用助理', color: 'blue',
            desc: '適用於各類問答與任務協助',
            ask: '你是一個問題釐清專家。你的任務是理解用戶的真實意圖，識別問題的核心，並整理出需要解決的關鍵要點。請以條列式方式輸出問題摘要與識別到的潛在需求。',
            plan: '你是一個任務規劃師。基於 Ask 階段分析的問題，制定清晰的多步驟執行計劃。請將複雜任務拆解為可執行的子任務，並標注每個步驟的優先級和預期產出。',
            execute: '你是一個執行專家。根據 Plan 階段制定的計劃，逐步執行並生成高品質的完整答案。請確保回答準確、有條理，並提供具體的行動建議。',
        },
        {
            id: 'code_review', icon: '💻', label: '程式碼審查', color: 'green',
            desc: '自動審查 PR、發現 Bug 與最佳化建議',
            ask: '你是一個程式碼分析師。仔細閱讀提交的程式碼，識別潛在問題類型（安全性、性能、可維護性、邏輯錯誤），並整理出需要深入審查的重點區域與文件範圍。',
            plan: '你是一個技術架構師。基於程式碼分析結果，制定系統性審查計劃：(1) 安全漏洞掃描 (2) 性能瓶頸分析 (3) 最佳實踐合規 (4) 測試覆蓋率評估。請列出具體審查項目清單。',
            execute: '你是一個資深工程師。執行程式碼審查計劃，為每個問題提供：問題描述、嚴重等級（🔴高/🟡中/🟢低）、具體修改建議與範例代碼。輸出結構化的審查報告。',
        },
        {
            id: 'teaching', icon: '📚', label: '教學助手', color: 'purple',
            desc: '個人化教學設計與學習引導',
            ask: '你是一個教育評估師。分析學生的問題，評估其當前知識水平與學習難點。識別是概念理解、練習應用還是延伸探索問題，整理出教學需聚焦的核心概念清單。',
            plan: '你是一個課程設計師。基於學生需求分析，設計個性化教學方案：選擇合適的教學方法（類比、示例、逐步說明），規劃知識點講解順序，設計互動檢核題目。',
            execute: '你是一個優秀家教老師。執行教學計劃，使用清晰語言、生動例子與逐步引導，幫助學生真正理解概念。結尾提供 1-2 道練習題以確認學習效果，並給予正向鼓勵。',
        },
        {
            id: 'research', icon: '🔍', label: '研究分析', color: 'orange',
            desc: '多角度深度研究與報告生成',
            ask: '你是一個研究問題分析師。深入解析研究問題的範圍、關鍵概念與研究角度。識別需要收集哪些類型資訊，以及分析此問題所需的專業知識領域，列出研究子問題清單。',
            plan: '你是一個研究策略師。制定系統性研究計劃：確定研究框架（SWOT / 比較分析 / 文獻回顧），規劃信息來源策略與數據收集方法，以及最終報告結構大綱。',
            execute: '你是一個分析師。執行研究計劃，整合多角度資訊進行深度分析，輸出結構化研究報告，包含：核心發現、數據支持、多方觀點比較、結論與行動建議。',
        },
    ];

    // Agent Tab State
    const [agentActiveTab, setAgentActiveTab] = useState<'basic' | 'stages' | 'behavior' | 'tools'>('basic');
    const [agentData, setAgentData] = useState({
        name: '',
        askSystemPrompt: '',
        planSystemPrompt: '',
        executeSystemPrompt: '',
        askLinkedServiceId: '',
        planLinkedServiceId: '',
        agentLinkedServiceId: '',
        maxLoops: 5,
        outputFormat: 'markdown',
        verbosity: 'standard',
        responseLanguage: 'zh-TW',
        allowDatabaseQuery: true,
        allowKnowledgeBase: true,
        allowWebSearch: false,
        allowCodeExecution: false,
        allowMathCalculation: true,
        agentPersonality: '',
        agentDomain: '',
        executionEnvironment: 'local' as ExecutionEnvironment,
    });

    // For AI
    const predefinedAIProvider = (providerFromUrl === 'AI_CHATROOM' || ['OPENAI', 'ANTHROPIC', 'GEMINI'].includes(providerFromUrl)) ? providerFromUrl : '';
    const presetPrompt = searchParams.get('prompt') || '';
    const presetName = searchParams.get('name') || '';

    const [selectedAIProvider, setSelectedAIProvider] = useState(predefinedAIProvider);
    const [aiData, setAiData] = useState<{
        name: string;
        openaiApiKey: string;
        anthropicApiKey: string;
        geminiApiKey: string;
        models: string[];
        systemInstruction: string;
        linkedServiceId: string;
    }>({
        name: presetName,
        openaiApiKey: '',
        anthropicApiKey: '',
        geminiApiKey: '',
        models: [],
        systemInstruction: presetPrompt ? presetPrompt : (selectedAIProvider === 'AI_CHATROOM' ? GEMINI_DEFAULT_PROMPT : ''),
        linkedServiceId: '',
        linkedSkillId: ''
    } as any);

    const handleAiChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setAiData({ ...aiData, [e.target.name]: e.target.value });
    };

    // For Email
    const [selectedEmailProvider, setSelectedEmailProvider] = useState(
        ['RESEND', 'BREVO'].includes(providerFromUrl) ? providerFromUrl : 'RESEND'
    );
    const [emailData, setEmailData] = useState({
        name: '',
        smtpHost: '',
        smtpPort: '',
        smtpUser: '',
        smtpPass: '',
        fromAddress: ''
    });

    const [showTestEmail, setShowTestEmail] = useState(false);
    const [testEmailData, setTestEmailData] = useState({
        to: '',
        subject: 'JVTutorCorner 整合測試郵件',
        html: '<p>這是一封從您的 Resend 整合發出的測試郵件。如果您收到這封信，代表您的 API Key 與寄件者設定已正確生效！</p>'
    });
    const [testSending, setTestSending] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // 當切換郵件服務商時，若內容尚未被修改，則自動切換測試郵件範本
    useEffect(() => {
        if (isEmail) {
            const resendTpl = '<p>這是一封從您的 Resend 整合發出的測試郵件。如果您收到這封信，代表您的 API Key 與寄件者設定已正確生效！</p>';
            const brevoTpl = '<p>這是一封從您的 Brevo 整合發出的測試郵件。如果您收到這封信，代表您的 SMTP 帳號與密碼設定已正確生效！</p>';

            if (selectedEmailProvider === 'RESEND' && testEmailData.html === brevoTpl) {
                setTestEmailData(prev => ({ ...prev, html: resendTpl }));
            } else if (selectedEmailProvider === 'BREVO' && (testEmailData.html === resendTpl || testEmailData.html === '')) {
                setTestEmailData(prev => ({ ...prev, html: brevoTpl }));
            } else if (selectedEmailProvider === 'RESEND' && (testEmailData.html === '')) {
                setTestEmailData(prev => ({ ...prev, html: resendTpl }));
            }
        }
    }, [selectedEmailProvider, isEmail]);

    const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setEmailData({ ...emailData, [e.target.name]: e.target.value });
    };

    // For Database
    const [selectedDatabaseType, setSelectedDatabaseType] = useState(
        ['DYNAMODB', 'LANCEDB', 'KNOWLEDGE_BASE'].includes(providerFromUrl) ? providerFromUrl : ''
    );
    const [databaseData, setDatabaseData] = useState({
        name: '',
        tableName: '',
        partitionKey: '',
        sortKey: '',
        region: 'us-east-1',
        description: ''
    });

    const handleDatabaseChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setDatabaseData({ ...databaseData, [e.target.name]: e.target.value });
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

    const handleSendTestEmail = async () => {
        if (!emailData.smtpPass || !emailData.fromAddress || !testEmailData.to) {
            alert('請填寫必填欄位 (密碼/API Key, 寄件者信箱, 收件者)');
            return;
        }

        if (selectedEmailProvider === 'BREVO' && !emailData.smtpUser) {
            alert('請填寫 SMTP 使用者名稱');
            return;
        }

        setTestSending(true);
        setTestResult(null);

        let testConfig: any = {};
        if (selectedEmailProvider === 'RESEND') {
            testConfig = {
                smtpHost: 'smtp.resend.com',
                smtpPort: '465',
                smtpUser: 'resend',
                smtpPass: emailData.smtpPass,
                fromAddress: emailData.fromAddress,
            };
        } else if (selectedEmailProvider === 'BREVO') {
            testConfig = {
                smtpHost: 'smtp-relay.brevo.com',
                smtpPort: '587',
                smtpUser: emailData.smtpUser,
                smtpPass: emailData.smtpPass,
                fromAddress: emailData.fromAddress,
            };
        }

        try {
            const res = await fetch('/api/app-integrations/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: selectedEmailProvider,
                    config: testConfig,
                    emailTest: testEmailData
                }),
            });

            const data = await res.json();
            if (data.ok && data.result.success) {
                setTestResult({ success: true, message: data.result.message });
            } else {
                setTestResult({ success: false, message: data.result?.message || data.error || '發送失敗' });
            }
        } catch (error: any) {
            setTestResult({ success: false, message: `發送失敗: ${error.message}` });
        } finally {
            setTestSending(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            let userId = 'anonymous';
            if (typeof window !== 'undefined') {
                try {
                    const raw = localStorage.getItem('tutor_mock_user');
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
                } else if (selectedPaymentProvider === 'LINEPAY') {
                    config = {
                        linePayChannelId: paymentData.linePayChannelId,
                        linePayChannelSecret: paymentData.linePayChannelSecret
                    };
                } else if (selectedPaymentProvider === 'JKOPAY') {
                    config = {
                        jkopayMerchantId: paymentData.jkopayMerchantId,
                        jkopaySecretKey: paymentData.jkopaySecretKey
                    };
                }

                payload = {
                    userId,
                    type: selectedPaymentProvider,
                    name: paymentData.name || `${selectedPaymentProvider} 收款帳號`,
                    config
                };
            } else if (isAskPlanAgent) {
                if (!agentData.askLinkedServiceId || !agentData.planLinkedServiceId || !agentData.agentLinkedServiceId) {
                    alert('請在「階段設定」中為 Ask、Plan、Execute 三個階段各選擇 AI 服務');
                    setLoading(false);
                    return;
                }
                payload = {
                    userId,
                    type: 'ASK_PLAN_AGENT',
                    name: agentData.name || 'Ask Plan Agent',
                    config: {
                        executionEnvironment: agentData.executionEnvironment,
                        askLinkedServiceId: agentData.askLinkedServiceId,
                        planLinkedServiceId: agentData.planLinkedServiceId,
                        agentLinkedServiceId: agentData.agentLinkedServiceId,
                        askSystemPrompt: agentData.askSystemPrompt,
                        planSystemPrompt: agentData.planSystemPrompt,
                        agentSystemPrompt: agentData.executeSystemPrompt,
                        maxLoops: agentData.maxLoops,
                        outputFormat: agentData.outputFormat,
                        verbosity: agentData.verbosity,
                        responseLanguage: agentData.responseLanguage,
                        tools: {
                            databaseQuery: agentData.allowDatabaseQuery,
                            knowledgeBase: agentData.allowKnowledgeBase,
                            webSearch: agentData.allowWebSearch,
                            codeExecution: agentData.allowCodeExecution,
                            mathCalculation: agentData.allowMathCalculation,
                        },
                        agentPersonality: agentData.agentPersonality,
                        agentDomain: agentData.agentDomain,
                    }
                };
            } else if (isAI) {
                let config: any = {};
                if (selectedAIProvider === 'OPENAI') {
                    config = { apiKey: aiData.openaiApiKey, models: aiData.models, systemInstruction: (aiData as any).systemInstruction };
                } else if (selectedAIProvider === 'ANTHROPIC') {
                    config = { apiKey: aiData.anthropicApiKey, models: aiData.models, systemInstruction: (aiData as any).systemInstruction };
                } else if (selectedAIProvider === 'GEMINI') {
                    config = { apiKey: aiData.geminiApiKey, models: aiData.models, systemInstruction: (aiData as any).systemInstruction };
                } else if (selectedAIProvider === 'AI_CHATROOM') {
                    config = {
                        linkedServiceId: (aiData as any).linkedServiceId,
                        linkedSkillId: (aiData as any).linkedSkillId,
                        systemInstruction: (aiData as any).systemInstruction
                    };
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
                } else if (selectedEmailProvider === 'RESEND') {
                    config = {
                        smtpHost: 'smtp.resend.com',
                        smtpPort: '465',
                        smtpUser: 'resend',
                        smtpPass: emailData.smtpPass, // User enters API Key here
                        fromAddress: emailData.fromAddress,
                    };
                } else if (selectedEmailProvider === 'BREVO') {
                    config = {
                        smtpHost: 'smtp-relay.brevo.com',
                        smtpPort: '587',
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
            } else if (isDatabase) {
                let config: any = {};
                if (selectedDatabaseType === 'DYNAMODB') {
                    config = {
                        tableName: databaseData.tableName,
                        partitionKey: databaseData.partitionKey,
                        sortKey: databaseData.sortKey,
                        region: databaseData.region,
                    };
                } else if (selectedDatabaseType === 'LANCEDB') {
                    config = {
                        tableName: databaseData.tableName || 'memories',
                        databasePath: './data/lancedb',
                    };
                } else if (selectedDatabaseType === 'KNOWLEDGE_BASE') {
                    config = {
                        description: databaseData.description,
                    };
                }

                payload = {
                    userId,
                    type: selectedDatabaseType,
                    name: databaseData.name || `${selectedDatabaseType} 資料庫`,
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

            alert(isPayment ? '金流設定新增成功！' : isAskPlanAgent ? '策略思維規劃代理 (Ask-Plan-Agent) 新增成功！' : isAI ? 'AI 服務新增成功！' : isEmail ? '郵件服務新增成功！' : isDatabase ? '資料庫設定新增成功！' : '應用程式新增成功！');
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
                <div className={`${isPayment ? 'bg-green-600' : isAskPlanAgent ? 'bg-purple-700' : isAI ? 'bg-indigo-600' : isEmail ? 'bg-yellow-600' : isDatabase ? 'bg-orange-600' : 'bg-blue-600'} p-6 text-white relative`}>
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
                        <h1 className="text-2xl font-bold">
                            {isPayment ? '新增金流服務' : isAskPlanAgent ? '🧠 新增 策略思維規劃代理 (Ask-Plan-Agent)' : (isAI && selectedAIProvider === 'AI_CHATROOM' ? '新增 AI 聊天室' : isAI ? '新增 AI 服務' : isEmail ? '新增郵件服務' : isDatabase ? '新增資料庫' : '新增應用程式')}
                        </h1>
                        <p className={`mt-2 ${isPayment ? 'text-green-100' : isAskPlanAgent ? 'text-purple-100' : isAI ? 'text-indigo-100' : isEmail ? 'text-yellow-100' : isDatabase ? 'text-orange-100' : 'text-blue-100'}`}>
                            {isPayment ? '設定您的 ECPay、Stripe 或 PayPal 金流服務設定' : isAskPlanAgent ? '設定多階段推理代理 — 諮詢 → 規劃 → 執行，讓 AI 更聰明地完成複雜任務' : (isAI && selectedAIProvider === 'AI_CHATROOM' ? '配置您的專屬 AI 聊天室入口' : isAI ? '設定您要串接的 AI 模型 API 金鑰' : isEmail ? '設定您的 SMTP 伺服器資訊以發送郵件' : isDatabase ? '設定 DynamoDB 或知識庫作為 AI 聊天室的資料來源' : '設定通訊渠道串接參數 (LINE、Telegram、WhatsApp 等)')}
                        </p>
                    </div>
                </div>

                <div className="p-8">
                    {/* 參數說明區塊 */}
                    <div className={`${isPayment ? 'bg-green-50 border-green-200' : isAskPlanAgent ? 'bg-purple-50 border-purple-200' : isAI ? 'bg-indigo-50 border-indigo-200' : isEmail ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200'} border rounded-lg p-6 mb-8`}>
                        <h3 className={`${isPayment ? 'text-green-800' : isAskPlanAgent ? 'text-purple-800' : isAI ? 'text-indigo-800' : isEmail ? 'text-yellow-800' : 'text-blue-800'} font-bold mb-4 flex items-center`}>
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {isPayment ? '安全提示' : isAskPlanAgent ? '🧠 策略思維規劃代理 (Ask-Plan-Agent) 說明' : isAI ? '安全提示' : isEmail ? '參數說明' : '參數說明'}
                        </h3>
                        <div className="space-y-3">
                            {isPayment ? (
                                <p className="text-sm text-green-800">
                                    此處填寫的金鑰將被安全加密儲存，專門用於您的課程結帳，確保學生的付款能直接匯入您的金流帳戶中。請勿將您的 HashKey 或 Secret Key 洩漏給他人。
                                </p>
                            ) : isAskPlanAgent ? (
                                <div className="text-sm text-purple-800 space-y-2">
                                    <p>策略思維規劃代理採用三階段推理架構，靈感來自 Cursor、Claude Projects 等主流 IDE 的 Agent 模式：</p>
                                    <div className="grid grid-cols-3 gap-2 mt-2">
                                        {[
                                            { icon: '🕵️‍♂️', stage: '諮詢', desc: '探索用戶意圖，釐清問題核心' },
                                            { icon: '📋', stage: '規劃', desc: '拆解任務，制定執行計劃' },
                                            { icon: '⚡', stage: '執行', desc: '逐步執行，輸出高品質結果' },
                                        ].map(s => (
                                            <div key={s.stage} className="bg-white/60 rounded-lg p-2 text-center border border-purple-100">
                                                <div className="text-lg">{s.icon}</div>
                                                <div className="font-bold text-xs mt-0.5">{s.stage}階段</div>
                                                <div className="text-[10px] text-purple-600 mt-0.5 leading-tight">{s.desc}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-purple-600 mt-2">💡 每個階段可使用不同的 AI 模型（例如 Ask 用輕量模型，Execute 用強力模型），優化性能與成本</p>
                                </div>
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
                                            <option value="LINEPAY">Line Pay</option>
                                            <option value="JKOPAY">街口支付 (JkoPay)</option>
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

                                {selectedPaymentProvider === 'LINEPAY' && (
                                    <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Line Pay Channel ID <span className="text-red-500">*</span>
                                            </label>
                                            <input type="text" name="linePayChannelId" value={paymentData.linePayChannelId} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Line Pay Channel Secret <span className="text-red-500">*</span>
                                            </label>
                                            <input type="password" name="linePayChannelSecret" value={paymentData.linePayChannelSecret} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                    </div>
                                )}

                                {selectedPaymentProvider === 'JKOPAY' && (
                                    <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                街口特店編號 (Merchant ID) <span className="text-red-500">*</span>
                                            </label>
                                            <input type="text" name="jkopayMerchantId" value={paymentData.jkopayMerchantId} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                街口 Secret Key <span className="text-red-500">*</span>
                                            </label>
                                            <input type="password" name="jkopaySecretKey" value={paymentData.jkopaySecretKey} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : isAskPlanAgent ? (
                            <>
                                {/* ─── IDE-style Agent Builder Tabs ─── */}
                                <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl mb-2">
                                    {([
                                        { id: 'basic', icon: '🎯', label: '基本設定' },
                                        { id: 'stages', icon: '🔄', label: '階段設定' },
                                        { id: 'behavior', icon: '⚙️', label: '行為設定' },
                                        { id: 'tools', icon: '🔧', label: '工具授權' },
                                    ] as const).map(tab => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setAgentActiveTab(tab.id)}
                                            className={`flex-1 py-2 px-1 text-xs font-semibold rounded-lg transition-all flex flex-col items-center gap-0.5 ${agentActiveTab === tab.id
                                                ? 'bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 shadow-sm'
                                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                        >
                                            <span className="text-base">{tab.icon}</span>
                                            <span className="hidden sm:inline">{tab.label}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* Progress indicator */}
                                <div className="flex items-center gap-1.5 mb-4 px-1">
                                    {(['basic', 'stages', 'behavior', 'tools'] as const).map((tab, i) => (
                                        <div key={tab} className={`h-1 flex-1 rounded-full transition-all ${agentActiveTab === tab ? 'bg-purple-600' : i < (['basic', 'stages', 'behavior', 'tools'] as const).indexOf(agentActiveTab) ? 'bg-purple-300' : 'bg-gray-200 dark:bg-gray-600'}`} />
                                    ))}
                                </div>

                                {/* ── Tab: Basic ── */}
                                {agentActiveTab === 'basic' && (
                                    <div className="space-y-5">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                                🏷️ Agent 名稱 <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={agentData.name}
                                                onChange={(e) => setAgentData({ ...agentData, name: e.target.value })}
                                                placeholder="例如：課程輔導智慧助手"
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                                required
                                            />
                                        </div>

                                        {/* Preset Templates — like Cursor's mode selector */}
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                                                <span>⚡</span> 快速套用模板
                                                <span className="text-xs font-normal text-gray-400">( 類似 Cursor Modes )</span>
                                            </label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {AGENT_PRESET_TEMPLATES.map(tpl => (
                                                    <button
                                                        key={tpl.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setAgentData({
                                                                ...agentData,
                                                                name: agentData.name || tpl.label,
                                                                askSystemPrompt: tpl.ask,
                                                                planSystemPrompt: tpl.plan,
                                                                executeSystemPrompt: tpl.execute,
                                                            });
                                                            setAgentActiveTab('stages');
                                                        }}
                                                        className="flex items-center gap-2 p-3 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 rounded-xl text-left transition-all group"
                                                    >
                                                        <span className="text-xl shrink-0">{tpl.icon}</span>
                                                        <div>
                                                            <p className="text-xs font-bold text-gray-800 dark:text-white group-hover:text-purple-700 dark:group-hover:text-purple-300">{tpl.label}</p>
                                                            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{tpl.desc}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-[11px] text-gray-400 mt-2">💡 套用後可在「階段設定」分頁進行細部調整</p>
                                        </div>

                                        {/* Persona — like GitHub Copilot Custom Instructions */}
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                                                <span>🎭</span> Agent 個性描述
                                                <span className="text-xs font-normal text-gray-400">( 類似 Copilot Custom Instructions )</span>
                                            </label>
                                            <textarea
                                                value={agentData.agentPersonality}
                                                onChange={(e) => setAgentData({ ...agentData, agentPersonality: e.target.value })}
                                                placeholder="描述 Agent 的溝通風格與個性特質，例如：專業且耐心，善用具體例子，鼓勵主動思考。這些設定將套用於所有階段..."
                                                rows={3}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm resize-none"
                                            />
                                        </div>

                                        {/* Domain expertise */}
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                                🎓 專業領域 <span className="text-xs font-normal text-gray-400">( 選填 )</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={agentData.agentDomain}
                                                onChange={(e) => setAgentData({ ...agentData, agentDomain: e.target.value })}
                                                placeholder="例如：語言學習、程式教學、數學輔導、商業英語..."
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            />
                                        </div>

                                        {/* Execution Environment */}
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2.5">
                                                ⚙️ 執行環境 <span className="text-red-500">*</span>
                                            </label>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                {(Object.keys(EXECUTION_ENVIRONMENT_META) as ExecutionEnvironment[]).map((env) => {
                                                    const meta = EXECUTION_ENVIRONMENT_META[env];
                                                    return (
                                                        <button
                                                            key={env}
                                                            type="button"
                                                            onClick={() => setAgentData({ ...agentData, executionEnvironment: env })}
                                                            className={`relative p-4 rounded-lg border-2 transition-all overflow-hidden group ${agentData.executionEnvironment === env
                                                                ? `border-purple-600 ${env === 'local'
                                                                    ? 'bg-blue-50 dark:bg-blue-900/20'
                                                                    : env === 'background'
                                                                        ? 'bg-amber-50 dark:bg-amber-900/20'
                                                                        : 'bg-purple-50 dark:bg-purple-900/20'
                                                                }`
                                                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                                                                }`}
                                                        >
                                                            {/* Checkmark indicator */}
                                                            {agentData.executionEnvironment === env && (
                                                                <div className="absolute top-2 right-2 w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center">
                                                                    <span className="text-white text-xs font-bold">✓</span>
                                                                </div>
                                                            )}

                                                            {/* Content */}
                                                            <div className="text-left">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <span className="text-2xl">{meta.icon}</span>
                                                                    <h3 className="font-bold text-gray-800 dark:text-white group-hover:text-purple-700 dark:group-hover:text-purple-300">
                                                                        {meta.label}
                                                                    </h3>
                                                                </div>
                                                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                                                    {meta.desc}
                                                                </p>

                                                                {/* Pros & Cons */}
                                                                <div className="space-y-2">
                                                                    <div className="space-y-1">
                                                                        <p className="text-[11px] font-semibold text-green-700 dark:text-green-400">優勢：</p>
                                                                        {meta.pros.map((pro, i) => (
                                                                            <p key={i} className="text-[11px] text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                                                                <span>✔</span> {pro}
                                                                            </p>
                                                                        ))}
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">考量：</p>
                                                                        {meta.cons.map((con, i) => (
                                                                            <p key={i} className="text-[11px] text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                                                                <span>⚠</span> {con}
                                                                            </p>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-[11px] text-gray-400 mt-2">
                                                💡 選擇最適合您 Agent 的執行環境。可稍後在調試時調整。
                                            </p>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setAgentActiveTab('stages')}
                                            className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                                        >
                                            下一步：設定階段 →
                                        </button>
                                    </div>
                                )}

                                {/* ── Tab: Stages (3-stage pipeline) ── */}
                                {agentActiveTab === 'stages' && (
                                    <div className="space-y-4">
                                        {/* Pipeline visualization */}
                                        <div className="flex items-center justify-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-200 dark:border-purple-800">
                                            <span className="px-2.5 py-1 bg-purple-600 text-white rounded-full text-xs font-bold">🕵️‍♂️ 諮詢</span>
                                            <span className="text-purple-400 font-bold">──▶</span>
                                            <span className="px-2.5 py-1 bg-indigo-600 text-white rounded-full text-xs font-bold">📋 規劃</span>
                                            <span className="text-indigo-400 font-bold">──▶</span>
                                            <span className="px-2.5 py-1 bg-blue-600 text-white rounded-full text-xs font-bold">⚡ 執行</span>
                                        </div>

                                        {/* Stage Cards */}
                                        {[
                                            {
                                                serviceKey: 'askLinkedServiceId' as const,
                                                promptKey: 'askSystemPrompt' as const,
                                                icon: '🕵️‍♂️', label: '階段一：諮詢釐清 (Ask Phase)', subtitle: '探索與釐清用戶意圖',
                                                border: 'border-purple-200 dark:border-purple-800', bg: 'bg-purple-50/50 dark:bg-purple-900/10',
                                                labelCls: 'text-purple-900 dark:text-purple-100', ring: 'focus:ring-purple-500',
                                                hint: '負責理解用戶真實需求、識別問題核心 (Ask Phase)',
                                                placeholder: '你是一個需求分析專家。仔細閱讀用戶的輸入，識別核心問題與隱含需求。在需要時主動詢問用戶以釐清模糊地帶...',
                                            },
                                            {
                                                serviceKey: 'planLinkedServiceId' as const,
                                                promptKey: 'planSystemPrompt' as const,
                                                icon: '📋', label: '階段二：策略規劃 (Plan Phase)', subtitle: '規劃與拆解目標',
                                                border: 'border-indigo-200 dark:border-indigo-800', bg: 'bg-indigo-50/50 dark:bg-indigo-900/10',
                                                labelCls: 'text-indigo-900 dark:text-indigo-100', ring: 'focus:ring-indigo-500',
                                                hint: '將複雜任務分解為可執行步驟，制定執行策略 (Plan Phase)',
                                                placeholder: '你是一個任務規劃師。根據諮詢階段的分析結果，制定結構化的執行計劃，並確保邏輯嚴密且具備可行性...',
                                            },
                                            {
                                                serviceKey: 'agentLinkedServiceId' as const,
                                                promptKey: 'executeSystemPrompt' as const,
                                                icon: '⚡', label: '階段三：任務執行 (Execute Phase)', subtitle: '執行任務並輸出結果',
                                                border: 'border-blue-200 dark:border-blue-800', bg: 'bg-blue-50/50 dark:bg-blue-900/10',
                                                labelCls: 'text-blue-900 dark:text-blue-100', ring: 'focus:ring-blue-500',
                                                hint: '依照計劃逐步執行，生成高品質的最終輸出 (Execute Phase)',
                                                placeholder: '你是一個執行專家。依照策略規劃中的步驟，逐項執行並生成完整答案。確保內容準確且格式符合要求...',
                                            },
                                        ].map((stage) => {
                                            const prompt: string = agentData[stage.promptKey];
                                            const tokenEstimate = Math.max(1, Math.ceil(prompt.length / 4));
                                            return (
                                                <div key={stage.serviceKey} className={`p-4 border-2 ${stage.border} ${stage.bg} rounded-xl space-y-3`}>
                                                    <div className="flex items-start justify-between">
                                                        <div>
                                                            <h4 className={`text-sm font-bold ${stage.labelCls} flex items-center gap-2`}>
                                                                <span className="text-base">{stage.icon}</span>
                                                                {stage.label}
                                                            </h4>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{stage.subtitle}</p>
                                                        </div>
                                                        <span className="text-[10px] px-2 py-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-full text-gray-500 dark:text-gray-400 shrink-0">
                                                            ~{tokenEstimate} tokens
                                                        </span>
                                                    </div>
                                                    <div className="text-[11px] text-gray-500 dark:text-gray-400 bg-white/60 dark:bg-gray-800/40 rounded-lg px-3 py-2 border border-dashed border-gray-200 dark:border-gray-600">
                                                        💡 {stage.hint}
                                                    </div>
                                                    <div>
                                                        <label className={`block text-xs font-semibold ${stage.labelCls} mb-1`}>
                                                            AI 服務 <span className="text-red-500">*</span>
                                                        </label>
                                                        <select
                                                            value={agentData[stage.serviceKey]}
                                                            onChange={(e) => setAgentData({ ...agentData, [stage.serviceKey]: e.target.value })}
                                                            className={`w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none ${stage.ring} focus:ring-2`}
                                                            required
                                                        >
                                                            <option value="">-- 請選擇 AI 服務 --</option>
                                                            {activeAIApps.map(app => (
                                                                <option key={app.integrationId} value={app.integrationId}>
                                                                    {app.name} ({app.type})
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {activeAIApps.length === 0 && (
                                                            <p className="text-[11px] text-orange-600 dark:text-orange-400 mt-1">
                                                                ⚠️ 尚無已連線的 AI 服務，請先
                                                                <Link href="/add-app?type=ai&provider=OPENAI" className="underline font-bold mx-1">新增 AI 服務</Link>
                                                                後再回來設定
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className={`block text-xs font-semibold ${stage.labelCls} mb-1 flex items-center justify-between`}>
                                                            <span>系統提示詞 System Prompt</span>
                                                            <span className="font-normal text-gray-400 tabular-nums">{prompt.length} 字 / ~{tokenEstimate} tokens</span>
                                                        </label>
                                                        <textarea
                                                            value={prompt}
                                                            onChange={(e) => setAgentData({ ...agentData, [stage.promptKey]: e.target.value })}
                                                            placeholder={stage.placeholder}
                                                            rows={4}
                                                            className={`w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none ${stage.ring} focus:ring-2 resize-y font-mono leading-relaxed`}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => setAgentActiveTab('basic')} className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">← 返回基本設定</button>
                                            <button type="button" onClick={() => setAgentActiveTab('behavior')} className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg transition-colors">下一步：行為設定 →</button>
                                        </div>
                                    </div>
                                )}

                                {/* ── Tab: Behavior ── */}
                                {agentActiveTab === 'behavior' && (
                                    <div className="space-y-5">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                                    🔁 最大推理輪次
                                                </label>
                                                <select
                                                    value={agentData.maxLoops}
                                                    onChange={(e) => setAgentData({ ...agentData, maxLoops: Number(e.target.value) })}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500"
                                                >
                                                    <option value={3}>3 輪（快速）</option>
                                                    <option value={5}>5 輪（標準）</option>
                                                    <option value={10}>10 輪（深度）</option>
                                                    <option value={0}>不限制</option>
                                                </select>
                                                <p className="text-[10px] text-gray-400 mt-1">類似 Cursor Max Iterations</p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                                    📄 輸出格式
                                                </label>
                                                <select
                                                    value={agentData.outputFormat}
                                                    onChange={(e) => setAgentData({ ...agentData, outputFormat: e.target.value })}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500"
                                                >
                                                    <option value="markdown">Markdown（推薦）</option>
                                                    <option value="plain">純文字</option>
                                                    <option value="json">JSON 結構化</option>
                                                    <option value="html">HTML</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                                    📊 回應詳細度
                                                </label>
                                                <select
                                                    value={agentData.verbosity}
                                                    onChange={(e) => setAgentData({ ...agentData, verbosity: e.target.value })}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500"
                                                >
                                                    <option value="concise">簡潔（重點摘要）</option>
                                                    <option value="standard">標準（平衡詳細）</option>
                                                    <option value="detailed">詳細（完整解說）</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                                    🌐 回應語言
                                                </label>
                                                <select
                                                    value={agentData.responseLanguage}
                                                    onChange={(e) => setAgentData({ ...agentData, responseLanguage: e.target.value })}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500"
                                                >
                                                    <option value="zh-TW">繁體中文</option>
                                                    <option value="zh-CN">簡體中文</option>
                                                    <option value="en">English</option>
                                                    <option value="auto">自動偵測</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Summary card like IDE settings preview */}
                                        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                                            <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">⚙️ 當前行為設定摘要</h4>
                                            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
                                                <p>• 推理最多執行 <strong className="text-gray-800 dark:text-gray-200">{agentData.maxLoops === 0 ? '不限' : `${agentData.maxLoops} 輪`}</strong>，每輪依次呼叫 諮詢 → 規劃 → 執行</p>
                                                <p>• 輸出格式：<strong className="text-gray-800 dark:text-gray-200">{{ markdown: 'Markdown', plain: '純文字', json: 'JSON', html: 'HTML' }[agentData.outputFormat] || agentData.outputFormat}</strong></p>
                                                <p>• 詳細度：<strong className="text-gray-800 dark:text-gray-200">{{ concise: '簡潔', standard: '標準', detailed: '詳細' }[agentData.verbosity] || agentData.verbosity}</strong></p>
                                                <p>• 語言：<strong className="text-gray-800 dark:text-gray-200">{{ 'zh-TW': '繁體中文', 'zh-CN': '簡體中文', en: '英文', auto: '自動偵測' }[agentData.responseLanguage] || agentData.responseLanguage}</strong></p>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => setAgentActiveTab('stages')} className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">← 階段設定</button>
                                            <button type="button" onClick={() => setAgentActiveTab('tools')} className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg transition-colors">下一步：工具授權 →</button>
                                        </div>
                                    </div>
                                )}

                                {/* ── Tab: Tools ── */}
                                {agentActiveTab === 'tools' && (
                                    <div className="space-y-4">
                                        <p className="text-xs text-gray-500 dark:text-gray-400 bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-lg px-4 py-3">
                                            🔧 控制 Agent 可使用的工具與能力，類似 Claude Projects 工具設定與 Cursor 的 MCP 工具啟用
                                        </p>
                                        <div className="space-y-2">
                                            {[
                                                { key: 'allowDatabaseQuery' as const, icon: '🗄️', label: '資料庫查詢', desc: '允許 Agent 從連結的 DynamoDB 資料庫讀取資料，適合回答結構化資訊問題' },
                                                { key: 'allowKnowledgeBase' as const, icon: '📚', label: '知識庫讀取', desc: '允許 Agent 參照已建立的知識庫作為回答依據，提升 RAG 準確度' },
                                                { key: 'allowWebSearch' as const, icon: '🌐', label: '網路搜尋', desc: '允許 Agent 搜尋最新網路資訊（需設定 Serper / Tavily API 金鑰）' },
                                                { key: 'allowCodeExecution' as const, icon: '💻', label: '程式碼執行', desc: '允許 Agent 在沙盒中執行程式碼以進行計算或驗證輸出結果' },
                                                { key: 'allowMathCalculation' as const, icon: '🔢', label: '數學計算', desc: '啟用精確數學表達式計算，避免 LLM 的計算不準確問題' },
                                            ].map(tool => (
                                                <label
                                                    key={tool.key}
                                                    className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${agentData[tool.key]
                                                        ? 'border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-900/10'
                                                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-500'}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={agentData[tool.key]}
                                                        onChange={(e) => setAgentData({ ...agentData, [tool.key]: e.target.checked })}
                                                        className="mt-0.5 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-base">{tool.icon}</span>
                                                            <span className="text-sm font-semibold text-gray-800 dark:text-white">{tool.label}</span>
                                                            {agentData[tool.key] && (
                                                                <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full font-bold">啟用</span>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{tool.desc}</p>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                        <button type="button" onClick={() => setAgentActiveTab('behavior')} className="w-full py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">← 返回行為設定</button>
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
                                {selectedAIProvider !== 'AI_CHATROOM' && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            選擇 AI 服務供應商 <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <select
                                                value={selectedAIProvider}
                                                onChange={(e) => setSelectedAIProvider(e.target.value)}
                                                className="w-full pl-4 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                                required
                                            >
                                                <option value="">請選擇</option>
                                                {providerFromUrl === 'AI_CHATROOM' ? (
                                                    <option value="AI_CHATROOM">工程專屬 AI 聊天室</option>
                                                ) : (
                                                    <>
                                                        <option value="OPENAI">OpenAI (ChatGPT)</option>
                                                        <option value="ANTHROPIC">Anthropic (Claude)</option>
                                                        <option value="GEMINI">Google Gemini</option>
                                                    </>
                                                )}
                                            </select>
                                        </div>
                                    </div>
                                )}

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

                                {selectedAIProvider === 'AI_CHATROOM' && (() => {
                                    const selectedSkill = (aiData as any).linkedSkillId ? getSkillById((aiData as any).linkedSkillId) : null;
                                    const defaultSystemPrompt = `你是一個智慧、友善且樂於助人的 AI 助理。請以清楚、簡潔且準確的方式回答使用者的問題。`;
                                    const skillPrompt = selectedSkill ? `[你的當前技能：${selectedSkill.label}]\n${selectedSkill.prompt}\n\n` : '';
                                    const finalSystemPrompt = `${skillPrompt}${(aiData as any).systemInstruction ? `${(aiData as any).systemInstruction}\n\n` : ''}${defaultSystemPrompt}`;

                                    return (
                                        <div className="space-y-4 p-4 border border-indigo-200 dark:border-indigo-800 rounded-lg bg-indigo-50/50 dark:bg-indigo-900/10">
                                            {/* 已連線的 AI 服務 */}
                                            <div>
                                                <label className="block text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
                                                    <span className="text-lg">🔗</span> 選擇已連線的 AI 服務供應商 <span className="text-red-500">*</span>
                                                </label>
                                                <select
                                                    name="linkedServiceId"
                                                    value={(aiData as any).linkedServiceId || ''}
                                                    onChange={handleAiChange}
                                                    className="w-full pl-4 pr-10 py-2 text-base border-2 border-indigo-300 dark:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm rounded-md dark:bg-gray-700 dark:text-white bg-white transition-all"
                                                    required
                                                >
                                                    <option value="">請選擇</option>
                                                    {activeAIApps.map(app => (
                                                        <option key={app.integrationId} value={app.integrationId}>
                                                            {app.name} ({app.type})
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="mt-1.5 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                                                    ✓ 選擇後 AI 將使用該服務的 API 與模型進行回應
                                                </p>
                                            </div>

                                            {/* 技能選擇與預覽 */}
                                            <div className="border-t border-indigo-200 dark:border-indigo-800 pt-4">
                                                <label className="block text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
                                                    <span className="text-lg">✨</span> 串接 AI 技能 (選填)
                                                </label>
                                                <select
                                                    name="linkedSkillId"
                                                    value={(aiData as any).linkedSkillId || ''}
                                                    onChange={handleAiChange}
                                                    className="w-full pl-4 pr-10 py-2 text-base border-2 border-indigo-200 dark:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm rounded-md dark:bg-gray-700 dark:text-white bg-white transition-all"
                                                >
                                                    <option value="">-- 不使用特定技能 (通用客服) --</option>
                                                    {AI_SKILLS.map(skill => (
                                                        <option key={skill.id} value={skill.id}>
                                                            {skill.icon} {skill.label} - {skill.desc}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="mt-1.5 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                                                    💡 技能會為 AI 注入專屬角色與指令。不選時 AI 將提供通用客服。
                                                </p>

                                                {/* 技能預覽框 */}
                                                {selectedSkill && (
                                                    <div className="mt-3 p-3 bg-white dark:bg-gray-800 border border-indigo-100 dark:border-indigo-700 rounded-lg">
                                                        <div className="flex items-start gap-3">
                                                            <span className="text-2xl leading-none mt-0.5">{selectedSkill.icon}</span>
                                                            <div className="flex-1">
                                                                <p className="font-semibold text-gray-900 dark:text-white text-sm">{selectedSkill.label}</p>
                                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{selectedSkill.desc}</p>
                                                                <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-2 line-clamp-2 font-medium">專屬指令已準備就緒 →</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}


                                {(() => {
                                    const selectedSkill = (aiData as any).linkedSkillId ? getSkillById((aiData as any).linkedSkillId) : null;
                                    const defaultSystemPrompt = `你是一個智慧、友善且樂於助人的 AI 助理。請以清楚、簡潔且準確的方式回答使用者的問題。`;
                                    const skillPrompt = selectedSkill ? `[你的當前技能：${selectedSkill.label}]\n${selectedSkill.prompt}\n\n` : '';
                                    const finalSystemPrompt = `${skillPrompt}${(aiData as any).systemInstruction ? `${(aiData as any).systemInstruction}\n\n` : ''}${defaultSystemPrompt}`;

                                    return (
                                        <>
                                            {/* 固定提示詞輸入 */}
                                            <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 mt-4">
                                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                                                    <span className="text-lg">📝</span> 固定提示詞 (選填)
                                                </label>
                                                <textarea
                                                    name="systemInstruction"
                                                    value={(aiData as any).systemInstruction || ''}
                                                    onChange={(e) => setAiData({ ...aiData, [e.target.name]: e.target.value } as any)}
                                                    placeholder="在此輸入 AI 的角色設定或指令 (例如：請用法文回覆我)...\n\n若選擇了技能，此欄可留空。"
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-h-[100px] resize-y"
                                                />
                                                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                                    ℹ️ <strong>可選項目</strong> - 若選擇了技能，系統將優先使用該技能的指令。若輸入此欄，則會結合技能指令一起使用。
                                                </p>
                                            </div>

                                            {/* 最終提示詞預覽 */}
                                            {(selectedSkill || (aiData as any).systemInstruction) && (
                                                <div className="mt-4 p-4 border-2 border-indigo-300 dark:border-indigo-600 rounded-lg bg-indigo-50 dark:bg-indigo-950/30">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="text-lg">👀</span>
                                                        <h4 className="font-semibold text-indigo-900 dark:text-indigo-100">最終系統提示詞預覽</h4>
                                                    </div>
                                                    <div className="bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 rounded p-3 font-mono text-xs leading-relaxed text-gray-700 dark:text-gray-300 max-h-[200px] overflow-y-auto">
                                                        {finalSystemPrompt.split('\n').map((line, idx) => (
                                                            <div key={idx} className="whitespace-pre-wrap break-words">
                                                                {line || ' '}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-2 font-medium">
                                                        💡 此為 AI 將收到的完整系統指令。技能指令 → 您的自訂指令 → 預設指令
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </>
                        ) : isDatabase ? (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        設定名稱 (僅供您辨識)
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={databaseData.name}
                                        onChange={handleDatabaseChange}
                                        placeholder="例如：課程知識庫"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        選擇資料庫類型 <span className="text-red-500">*</span>
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {['DYNAMODB', 'KNOWLEDGE_BASE'].map((dbType) => (
                                            <button
                                                key={dbType}
                                                type="button"
                                                onClick={() => setSelectedDatabaseType(dbType)}
                                                className={`px-4 py-3 rounded-lg border-2 font-medium text-sm transition-all flex flex-col items-center gap-1 ${selectedDatabaseType === dbType
                                                    ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-400'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:border-orange-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'}`}
                                            >
                                                <span className="text-2xl">{dbType === 'DYNAMODB' ? '🗄️' : '📚'}</span>
                                                <span>{dbType === 'DYNAMODB' ? 'DynamoDB 資料庫' : '知識庫'}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {selectedDatabaseType === 'DYNAMODB' && (
                                    <div className="space-y-4 p-4 border border-orange-200 dark:border-orange-800 rounded-lg bg-orange-50/50 dark:bg-orange-900/10">
                                        <p className="text-xs text-orange-700 dark:text-orange-300 font-medium">
                                            🗄️ 設定要讓 AI 查詢的 AWS DynamoDB 資料表
                                        </p>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                資料表名稱 (Table Name) <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="tableName"
                                                value={databaseData.tableName}
                                                onChange={handleDatabaseChange}
                                                placeholder="例如：jvtutorcorner-courses"
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                主鍵 (Partition Key) <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="partitionKey"
                                                value={databaseData.partitionKey}
                                                onChange={handleDatabaseChange}
                                                placeholder="例如：courseId"
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                排序鍵 (Sort Key) <span className="text-gray-400">選填</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="sortKey"
                                                value={databaseData.sortKey}
                                                onChange={handleDatabaseChange}
                                                placeholder="例如：createdAt"
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                AWS 區域 (Region) <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                name="region"
                                                value={databaseData.region}
                                                onChange={handleDatabaseChange}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            >
                                                <option value="us-east-1">us-east-1 (美東)</option>
                                                <option value="us-west-2">us-west-2 (美西)</option>
                                                <option value="ap-northeast-1">ap-northeast-1 (東京)</option>
                                                <option value="ap-southeast-1">ap-southeast-1 (新加坡)</option>
                                                <option value="eu-west-1">eu-west-1 (愛爾蘭)</option>
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {selectedDatabaseType === 'KNOWLEDGE_BASE' && (
                                    <div className="space-y-4 p-4 border border-purple-200 dark:border-purple-800 rounded-lg bg-purple-50/50 dark:bg-purple-900/10">
                                        <p className="text-xs text-purple-700 dark:text-purple-300 font-medium">
                                            📚 建立自訂知識庫，讓 AI 在回答問題時能參考您提供的資料
                                        </p>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                知識庫描述 <span className="text-gray-400">選填</span>
                                            </label>
                                            <textarea
                                                name="description"
                                                value={databaseData.description}
                                                onChange={handleDatabaseChange}
                                                placeholder="描述此知識庫的用途，例如：平台課程 FAQ 與教師資訊"
                                                rows={3}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
                                            />
                                        </div>
                                        <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg text-xs text-purple-700 dark:text-purple-300">
                                            💡 建立此知識庫後，您可以在 <strong>/apps</strong> 的 AI 聊天室設定中將其連結，AI 將在回答時優先參考這些內容。
                                        </div>
                                    </div>
                                )}
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
                                            <option value="RESEND">Resend 郵件服務 (推薦)</option>
                                            <option value="BREVO">Brevo 郵件服務</option>
                                        </select>
                                    </div>
                                </div>


                                {selectedEmailProvider === 'RESEND' && (
                                    <div className="space-y-4">
                                        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-indigo-50 dark:bg-indigo-900/10">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="text-3xl">🚀</div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-gray-800 dark:text-white">Resend API 設定</h4>
                                                    <p className="text-xs text-gray-500">專為開發者設計的現代郵件發送服務</p>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        API Key <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="password"
                                                        name="smtpPass"
                                                        value={emailData.smtpPass}
                                                        onChange={handleEmailChange}
                                                        placeholder="re_..."
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono"
                                                        required
                                                    />
                                                    <p className="mt-1 text-[10px] text-gray-400">
                                                        取得 API Key：前往 <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-indigo-500 underline">Resend Dashboard</a>
                                                    </p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        寄件者信箱 (From Address) <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        name="fromAddress"
                                                        value={emailData.fromAddress}
                                                        onChange={handleEmailChange}
                                                        placeholder="onboarding@resend.dev (或您的網域)"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-yellow-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                                        required
                                                    />
                                                    <p className="mt-1 text-[10px] text-gray-400">
                                                        * 測試階段可使用 <code>onboarding@resend.dev</code>，發送正式郵件需驗證您的網域。
                                                    </p>
                                                </div>

                                                {/* 測試寄送郵件區塊 */}
                                                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowTestEmail(!showTestEmail)}
                                                        className="flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
                                                    >
                                                        <span>{showTestEmail ? '▼' : '▶'}</span>
                                                        測試寄送實際郵件 (可選)
                                                    </button>

                                                    {showTestEmail && (
                                                        <div className="mt-4 space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-top-2">
                                                            <div>
                                                                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">收件者 (To)</label>
                                                                <input
                                                                    type="email"
                                                                    value={testEmailData.to}
                                                                    onChange={(e) => setTestEmailData({ ...testEmailData, to: e.target.value })}
                                                                    placeholder="您的測試信箱"
                                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">主旨 (Subject)</label>
                                                                <input
                                                                    type="text"
                                                                    value={testEmailData.subject}
                                                                    onChange={(e) => setTestEmailData({ ...testEmailData, subject: e.target.value })}
                                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">內容 (HTML / Text)</label>
                                                                <textarea
                                                                    rows={3}
                                                                    value={testEmailData.html}
                                                                    onChange={(e) => setTestEmailData({ ...testEmailData, html: e.target.value })}
                                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
                                                                />
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={handleSendTestEmail}
                                                                disabled={testSending || !testEmailData.to}
                                                                className={`w-full py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 ${testSending ? 'bg-indigo-200 text-indigo-400 cursor-wait' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}
                                                            >
                                                                {testSending ? (
                                                                    <>
                                                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                                        正在發送測試郵件...
                                                                    </>
                                                                ) : '🚀 發送測試郵件'}
                                                            </button>

                                                            {testResult && (
                                                                <div className={`p-3 rounded text-xs font-medium animate-in zoom-in-95 ${testResult.success ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                                                                    {testResult.success ? '✅ ' : '❌ '}{testResult.message}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg text-xs text-gray-600 dark:text-gray-400">
                                            💡 <strong>小提示：</strong> 雖然這是 Resend 介面，但後端仍使用 SMTP 協定發送，因此如果您日後更換主機，也可以無痛遷移。
                                        </div>
                                    </div>
                                )}

                                {selectedEmailProvider === 'BREVO' && (
                                    <div className="space-y-4">
                                        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-blue-50 dark:bg-blue-900/10">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="text-3xl">📧</div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-gray-800 dark:text-white">Brevo SMTP 設定</h4>
                                                    <p className="text-xs text-gray-500">提供每日 300 封免費額度，開通即可發信</p>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        SMTP 使用者名稱 (Login) <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        name="smtpUser"
                                                        value={emailData.smtpUser}
                                                        onChange={handleEmailChange}
                                                        placeholder="您的 Brevo 登入信箱"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono"
                                                        required
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        SMTP 密碼 (Password) <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="password"
                                                        name="smtpPass"
                                                        value={emailData.smtpPass}
                                                        onChange={handleEmailChange}
                                                        placeholder="SMTP Key..."
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono"
                                                        required
                                                    />
                                                    <p className="mt-1 text-[10px] text-gray-400">
                                                        取得 SMTP Key：前往 <a href="https://app.brevo.com/settings/keys/smtp" target="_blank" rel="noreferrer" className="text-blue-500 underline">Brevo SMTP & API</a>
                                                    </p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        寄件者信箱 (From Address) <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        name="fromAddress"
                                                        value={emailData.fromAddress}
                                                        onChange={handleEmailChange}
                                                        placeholder="例如: no-reply@yourdomain.com"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                                        required
                                                    />
                                                </div>

                                                {/* 測試寄送郵件區塊 */}
                                                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowTestEmail(!showTestEmail)}
                                                        className="flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
                                                    >
                                                        <span>{showTestEmail ? '▼' : '▶'}</span>
                                                        測試寄送實際郵件 (可選)
                                                    </button>

                                                    {showTestEmail && (
                                                        <div className="mt-4 space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-top-2">
                                                            <div>
                                                                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">收件者 (To)</label>
                                                                <input
                                                                    type="email"
                                                                    value={testEmailData.to}
                                                                    onChange={(e) => setTestEmailData({ ...testEmailData, to: e.target.value })}
                                                                    placeholder="您的測試信箱"
                                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">主旨 (Subject)</label>
                                                                <input
                                                                    type="text"
                                                                    value={testEmailData.subject}
                                                                    onChange={(e) => setTestEmailData({ ...testEmailData, subject: e.target.value })}
                                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">內容 (HTML / Text)</label>
                                                                <textarea
                                                                    rows={3}
                                                                    value={testEmailData.html}
                                                                    onChange={(e) => setTestEmailData({ ...testEmailData, html: e.target.value })}
                                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
                                                                />
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={handleSendTestEmail}
                                                                disabled={testSending || !testEmailData.to}
                                                                className={`w-full py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 ${testSending ? 'bg-blue-200 text-blue-400 cursor-wait' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                                                            >
                                                                {testSending ? (
                                                                    <>
                                                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                                        正在發送測試郵件...
                                                                    </>
                                                                ) : '🚀 發送測試郵件'}
                                                            </button>

                                                            {testResult && (
                                                                <div className={`p-3 rounded text-xs font-medium animate-in zoom-in-95 ${testResult.success ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                                                                    {testResult.success ? '✅ ' : '❌ '}{testResult.message}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg text-xs text-gray-600 dark:text-gray-400">
                                            💡 <strong>小提示：</strong> 申請 Brevo 帳戶即可獲得每日 300 封免費發信額度。無須繁雜的網域認證也能使用。
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
                                className={`w-2/3 ${isPayment ? 'bg-green-600 hover:bg-green-700' : isAskPlanAgent ? 'bg-purple-700 hover:bg-purple-800' : isAI ? 'bg-indigo-600 hover:bg-indigo-700' : isEmail ? 'bg-yellow-600 hover:bg-yellow-700' : isDatabase ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'} text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {loading ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        儲存中...
                                    </>
                                ) : isAskPlanAgent ? (
                                    '🧠 建立 策略思維規劃代理'
                                ) : (
                                    '確認新增'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div >
    );
}
