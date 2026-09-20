// lib/integrations/registry/providers/channel.ts
// 通訊渠道定義。欄位取自 add-app 的 CHANNEL_CONFIG_MAP（原本就是宣告式，key 對齊 DB）。
import type { ProviderDefinition } from '../types';

const lineWebhookUrl = (id: string) => `/api/line/webhook/${id}`;

export const CHANNEL_PROVIDERS: ProviderDefinition[] = [
    {
        type: 'LINE',
        category: 'channel',
        defaults: { label: 'LINE', desc: '台灣、日本最常用的即時通訊軟體', icon: '💬', badge: 'bg-green-100 text-green-800', sortOrder: 10, visible: true },
        capabilities: { testConnection: true, multiInstance: true, customScript: true, toolPanels: ['line-simulate', 'line-push'], webhookUrl: lineWebhookUrl },
        hint: '前往 LINE Developers Console 取得 Channel Access Token 和 Channel Secret。',
        fields: [
            { key: 'channelAccessToken', label: 'Channel Access Token', type: 'textarea', required: true, secret: true, rows: 3, placeholder: '用於發信' },
            { key: 'channelSecret', label: 'Channel Secret', type: 'password', required: true, secret: true, placeholder: '用於驗證' },
        ],
    },
    {
        type: 'TELEGRAM',
        category: 'channel',
        defaults: { label: 'Telegram', desc: '加密即時通訊，支援 Bot API', icon: '✈️', badge: 'bg-sky-100 text-sky-800', sortOrder: 20, visible: true },
        capabilities: { testConnection: true, multiInstance: true },
        hint: '透過 BotFather (@BotFather) 建立 Bot 後取得 Bot Token。',
        fields: [
            { key: 'botToken', label: 'Bot Token', type: 'password', required: true, secret: true, placeholder: '123456:ABC-DEF...' },
        ],
    },
    {
        type: 'WHATSAPP',
        category: 'channel',
        defaults: { label: 'WhatsApp', desc: '全球超過 20 億用戶的即時通訊', icon: '📱', badge: 'bg-emerald-100 text-emerald-800', sortOrder: 30, visible: true },
        capabilities: { testConnection: true, multiInstance: true },
        hint: '前往 Meta for Developers → WhatsApp Business API 取得 Phone Number ID 和 Access Token。',
        fields: [
            { key: 'phoneNumberId', label: 'Phone Number ID', type: 'text', required: true },
            { key: 'whatsappAccessToken', label: 'Access Token', type: 'password', required: true, secret: true },
        ],
    },
    {
        type: 'MESSENGER',
        category: 'channel',
        defaults: { label: 'Messenger', desc: 'Facebook / Meta 即時通訊平台', icon: '💙', badge: 'bg-blue-100 text-blue-800', sortOrder: 40, visible: true },
        capabilities: { testConnection: true, multiInstance: true },
        hint: '前往 Meta for Developers → Messenger Platform 取得 Page Access Token 和 App Secret。',
        fields: [
            { key: 'pageAccessToken', label: 'Page Access Token', type: 'textarea', required: true, secret: true, rows: 3 },
            { key: 'appSecret', label: 'App Secret', type: 'password', required: true, secret: true, placeholder: '用於驗證' },
        ],
    },
    {
        type: 'SLACK',
        category: 'channel',
        defaults: { label: 'Slack', desc: '企業團隊協作與訊息通知', icon: '🔗', badge: 'bg-purple-100 text-purple-800', sortOrder: 50, visible: true },
        capabilities: { testConnection: true, multiInstance: true },
        hint: '前往 Slack API (api.slack.com) → Your Apps 建立 Bot，取得 OAuth Token 和 Signing Secret。',
        fields: [
            { key: 'botOAuthToken', label: 'Bot User OAuth Token', type: 'password', required: true, secret: true, placeholder: 'xoxb-XXXX-XXXX-XXXX' },
            { key: 'signingSecret', label: 'Signing Secret', type: 'password', required: true, secret: true },
        ],
    },
    {
        type: 'TEAMS',
        category: 'channel',
        defaults: { label: 'Teams', desc: 'Microsoft 企業通訊與會議', icon: '👥', badge: 'bg-violet-100 text-violet-800', sortOrder: 60, visible: true },
        capabilities: { testConnection: true, multiInstance: true },
        hint: '前往 Azure Bot Service / Teams Developer Portal 取得 App ID 和 App Password。',
        fields: [
            { key: 'appId', label: 'App ID (Microsoft)', type: 'text', required: true },
            { key: 'appPassword', label: 'App Password', type: 'password', required: true, secret: true },
        ],
    },
    {
        type: 'DISCORD',
        category: 'channel',
        defaults: { label: 'Discord', desc: '社群伺服器，適合線上課程群組', icon: '🎮', badge: 'bg-indigo-100 text-indigo-800', sortOrder: 70, visible: true },
        capabilities: { testConnection: true, multiInstance: true },
        hint: '前往 Discord Developer Portal 建立 Application 及 Bot，取得 Bot Token。',
        fields: [
            { key: 'discordBotToken', label: 'Bot Token', type: 'password', required: true, secret: true },
            { key: 'applicationId', label: 'Application ID', type: 'text', required: true },
        ],
    },
    {
        type: 'WECHAT',
        category: 'channel',
        defaults: { label: 'WeChat', desc: '中國大陸最普及的通訊平台', icon: '🟢', badge: 'bg-lime-100 text-lime-800', sortOrder: 80, visible: true },
        capabilities: { testConnection: true, multiInstance: true },
        hint: '前往微信公眾平台 (mp.weixin.qq.com) 取得 AppID 和 AppSecret。',
        fields: [
            { key: 'wechatAppId', label: 'AppID', type: 'text', required: true },
            { key: 'wechatAppSecret', label: 'AppSecret', type: 'password', required: true, secret: true },
        ],
    },
];
