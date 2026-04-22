export interface AppIntegration {
    integrationId: string;
    userId: string;
    type: string;
    name: string;
    config?: Record<string, any>;
    status: string;
    createdAt: string;
    testParams?: any;
}

export interface TestResult {
    success: boolean;
    message: string;
    details?: any;
}

export const PAYMENT_TYPES = ['ECPAY', 'PAYPAL', 'STRIPE', 'LINEPAY', 'JKOPAY'];
export const CHANNEL_TYPES = ['LINE', 'TELEGRAM', 'WHATSAPP', 'MESSENGER', 'SLACK', 'TEAMS', 'DISCORD', 'WECHAT'];
export const EMAIL_TYPES = ['RESEND', 'GMAIL'];
export const DATABASE_TYPES = ['DYNAMODB', 'MONGODB', 'POSTGRESQL', 'MYSQL', 'REDIS', 'QDRANT'];
export const AI_CONTAINER_TYPES = ['AI_CHATROOM', 'ASK_PLAN_AGENT', 'SMART_ROUTER'];

export type MetaEntry = { badge: string; label: string; icon: string; desc: string };

export const CHANNEL_META: Record<string, MetaEntry> = {
    LINE: { badge: 'bg-green-100 text-green-800', label: 'LINE', icon: '💬', desc: '台灣、日本最常用的即時通訊軟體' },
    TELEGRAM: { badge: 'bg-sky-100 text-sky-800', label: 'Telegram', icon: '✈️', desc: '加密即時通訊，支援 Bot API' },
    WHATSAPP: { badge: 'bg-emerald-100 text-emerald-800', label: 'WhatsApp', icon: '📱', desc: '全球超過 20 億用戶的即時通訊' },
    MESSENGER: { badge: 'bg-blue-100 text-blue-800', label: 'Messenger', icon: '💙', desc: 'Facebook / Meta 即時通訊平台' },
    SLACK: { badge: 'bg-purple-100 text-purple-800', label: 'Slack', icon: '🔗', desc: '企業團隊協作與訊息通知' },
    TEAMS: { badge: 'bg-violet-100 text-violet-800', label: 'Teams', icon: '👥', desc: 'Microsoft 企業通訊與會議' },
    DISCORD: { badge: 'bg-indigo-100 text-indigo-800', label: 'Discord', icon: '🎮', desc: '社群伺服器，適合線上課程群組' },
    WECHAT: { badge: 'bg-lime-100 text-lime-800', label: 'WeChat', icon: '🟢', desc: '中國大陸最普及的通訊平台' },
};

export const PAYMENT_META: Record<string, MetaEntry> = {
    ECPAY: { badge: 'bg-emerald-100 text-emerald-800', label: '綠界科技 ECPay', icon: '🏦', desc: '台灣本地金流，支援超商/ATM/信用卡' },
    PAYPAL: { badge: 'bg-blue-100 text-blue-800', label: 'PayPal', icon: '🅿️', desc: '全球最大線上支付平台' },
    STRIPE: { badge: 'bg-indigo-100 text-indigo-800', label: 'Stripe', icon: '💳', desc: '全球開發者首選線上刷卡服務' },
    LINEPAY: { badge: 'bg-green-100 text-green-800', label: 'Line Pay', icon: '🟢', desc: 'LINE Pay 行動支付服務' },
    JKOPAY: { badge: 'bg-red-100 text-red-800', label: '街口支付 (JkoPay)', icon: '💴', desc: '台灣在地行動支付領導品牌' },
};

export const EMAIL_META: Record<string, MetaEntry> = {
    RESEND: { badge: 'bg-indigo-100 text-indigo-800', label: 'Resend 郵件服務', icon: '🚀', desc: '專為開發者設計的現代郵件發送服務 (只需 API Key)' },
    GMAIL: { badge: 'bg-red-100 text-red-800', label: 'Gmail SMTP', icon: '📧', desc: '串接您個人的 Gmail 帳號發送自動化郵件 (需應用程式密碼)' },
};

export const AI_META: Record<string, MetaEntry> = {
    OPENAI: { badge: 'bg-gray-100 text-gray-800', label: 'OpenAI ChatGPT', icon: '🧠', desc: '強大的通用大語言模型' },
    ANTHROPIC: { badge: 'bg-orange-100 text-orange-800', label: 'Anthropic (Claude)', icon: '🎭', desc: '專注於安全性與長文本理解的 AI 模型' },
    GEMINI: { badge: 'bg-blue-100 text-blue-800', label: 'Google Gemini', icon: '✨', desc: 'Google 的強大原生多模態大模型' },
    SMART_ROUTER: { badge: 'bg-cyan-100 text-cyan-800', label: '智能模型路由 (Smart Router)', icon: '🔀', desc: '根據對話複雜度，自動切換極速與高階模型，以節省 Token 成本並保持最佳效能' },
    AI_CHATROOM: { badge: 'bg-indigo-100 text-indigo-800', label: 'AI 聊天室', icon: '🤖', desc: '智慧問答聊天室，即時回覆學員問題，提升服務品質與效率' },
    ASK_PLAN_AGENT: { badge: 'bg-purple-100 text-purple-800', label: '策略思維規劃代理 (Ask-Plan-Agent)', icon: '🕵️‍♂️', desc: '三階段推理 AI：諮詢釐開、策略規劃、任務執行，能處理複雜的教學與維運任務' },
    CONTEXT7: { badge: 'bg-teal-100 text-teal-800', label: 'Context7 MCP', icon: '🎨', desc: '連結 Figma 與外部知識庫，為 AI 提供即時設計上下文與技術文檔' },
};


export const DATABASE_META: Record<string, MetaEntry> = {
    DYNAMODB: { badge: 'bg-orange-100 text-orange-800', label: 'DynamoDB', icon: '🗄️', desc: 'AWS 無伺服器資料庫，自動擴展無限可用性' },
    MONGODB: { badge: 'bg-green-100 text-green-800', label: 'MongoDB', icon: '🍃', desc: 'NoSQL 文件型資料庫，靈活的資料結構' },
    POSTGRESQL: { badge: 'bg-blue-100 text-blue-800', label: 'PostgreSQL', icon: '🐘', desc: '功能豐富的開源 SQL 資料庫' },
    MYSQL: { badge: 'bg-cyan-100 text-cyan-800', label: 'MySQL', icon: '🐬', desc: '輕量高效能的 SQL 資料庫' },
    REDIS: { badge: 'bg-red-100 text-red-800', label: 'Redis', icon: '⚡', desc: '超高速記憶體快取與資料存儲' },
    QDRANT: { badge: 'bg-purple-100 text-purple-800', label: 'Qdrant', icon: '🧠', desc: '開源向量資料庫，支援語義搜索' },
};

export const LABEL_MAP: Record<string, string> = {
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
    smtpPass: 'API Key / 密碼',
    fromAddress: '寄件者信箱 (From Address)',
    linkedServiceId: '串接的 AI 服務',
    askLinkedServiceId: '諮詢釐清階段 (Ask Phase) AI 服務',
    planLinkedServiceId: '策略規劃階段 (Plan Phase) AI 服務',
    agentLinkedServiceId: '任務執行階段 (Execute Phase) AI 服務',
    tableName: '資料表名稱',
    partitionKey: '分割鍵 (Partition Key)',
    sortKey: '排序鍵 (Sort Key)',
    region: 'AWS 區域 (Region)',
    databasePath: '資料庫路徑',
    linePayChannelId: 'Line Pay Channel ID',
    linePayChannelSecret: 'Line Pay Channel Secret',
    jkopayMerchantId: '街口特店編號 (Merchant ID)',
    jkopaySecretKey: '街口 Secret Key',
    context7ApiKey: 'Context7 API Key',
};

/** Helper: get badge/label/icon for any integration type */
export function getMetaForType(type: string, aiTypes: string[]): MetaEntry | undefined {
    if (PAYMENT_TYPES.includes(type)) return PAYMENT_META[type];
    if (EMAIL_TYPES.includes(type)) return EMAIL_META[type];
    if (DATABASE_TYPES.includes(type)) return DATABASE_META[type];
    if (aiTypes.includes(type)) return AI_META[type];
    return CHANNEL_META[type];
}
