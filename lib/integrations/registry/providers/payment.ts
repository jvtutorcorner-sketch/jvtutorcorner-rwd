// lib/integrations/registry/providers/payment.ts
// 金流服務商定義。欄位 key 對齊 DB 實際持久化的名稱（見 add-app handleSubmit 與 test route）。
import type { ProviderDefinition } from '../types';

export const PAYMENT_PROVIDERS: ProviderDefinition[] = [
    {
        type: 'ECPAY',
        category: 'payment',
        defaults: { label: '綠界科技 ECPay', desc: '台灣本地金流，支援超商/ATM/信用卡', icon: '🏦', badge: 'bg-emerald-100 text-emerald-800', sortOrder: 10, visible: true },
        capabilities: { testConnection: true, multiInstance: true, toolPanels: [] },
        hint: '前往綠界科技廠商後台取得特店編號、HashKey 與 HashIV。',
        legacyKeyAliases: { ecpayMerchantId: 'merchantId', ecpayHashKey: 'hashKey', ecpayHashIV: 'hashIV' },
        fields: [
            { key: 'merchantId', label: '特店編號 (MerchantID)', type: 'text', required: true, placeholder: '2000132' },
            { key: 'hashKey', label: 'HashKey', type: 'password', required: true, secret: true },
            { key: 'hashIV', label: 'HashIV', type: 'password', required: true, secret: true },
        ],
    },
    {
        type: 'STRIPE',
        category: 'payment',
        defaults: { label: 'Stripe', desc: '全球開發者首選線上刷卡服務', icon: '💳', badge: 'bg-indigo-100 text-indigo-800', sortOrder: 20, visible: true },
        capabilities: { testConnection: true, multiInstance: true, toolPanels: [] },
        hint: '於 Stripe Dashboard → Developers → API keys 取得金鑰；Connect 帳號另填 Account ID。',
        legacyKeyAliases: { stripeAccountId: 'accountId', stripePublicKey: 'publicKey', stripeSecretKey: 'secretKey' },
        fields: [
            { key: 'accountId', label: 'Connect Account ID', type: 'text', placeholder: 'acct_xxx（可留空）' },
            { key: 'publicKey', label: 'Publishable Key', type: 'text', required: true, placeholder: 'pk_live_...' },
            { key: 'secretKey', label: 'Secret Key', type: 'password', required: true, secret: true, placeholder: 'sk_live_...' },
        ],
    },
    {
        type: 'PAYPAL',
        category: 'payment',
        defaults: { label: 'PayPal', desc: '全球最大線上支付平台', icon: '🅿️', badge: 'bg-blue-100 text-blue-800', sortOrder: 30, visible: true },
        capabilities: { testConnection: true, multiInstance: true, toolPanels: [] },
        hint: '於 PayPal Developer Dashboard 建立 App，取得 Client ID 與 Secret。',
        legacyKeyAliases: { paypalClientId: 'clientId', paypalSecretKey: 'secretKey' },
        fields: [
            { key: 'clientId', label: 'Client ID', type: 'text', required: true },
            { key: 'secretKey', label: 'Secret Key', type: 'password', required: true, secret: true },
        ],
    },
    {
        type: 'LINEPAY',
        category: 'payment',
        defaults: { label: 'LINE Pay', desc: 'LINE Pay 行動支付服務', icon: '🟢', badge: 'bg-green-100 text-green-800', sortOrder: 40, visible: true },
        capabilities: { testConnection: true, multiInstance: true, toolPanels: ['test-payment'] },
        hint: '於 LINE Pay 商家後台取得 Channel ID 與 Channel Secret。',
        fields: [
            { key: 'linePayChannelId', label: 'LINE Pay Channel ID', type: 'text', required: true },
            { key: 'linePayChannelSecret', label: 'LINE Pay Channel Secret', type: 'password', required: true, secret: true },
        ],
    },
    {
        type: 'JKOPAY',
        category: 'payment',
        defaults: { label: '街口支付 (JkoPay)', desc: '台灣在地行動支付領導品牌', icon: '💴', badge: 'bg-red-100 text-red-800', sortOrder: 50, visible: true },
        capabilities: { testConnection: true, multiInstance: true, toolPanels: ['test-payment'] },
        hint: '於街口特約商店後台取得特店編號與 Secret Key。',
        fields: [
            { key: 'jkopayMerchantId', label: '街口特店編號 (Merchant ID)', type: 'text', required: true },
            { key: 'jkopaySecretKey', label: '街口 Secret Key', type: 'password', required: true, secret: true },
        ],
    },
];
