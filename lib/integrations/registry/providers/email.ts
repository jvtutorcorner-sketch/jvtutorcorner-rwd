// lib/integrations/registry/providers/email.ts
// 郵件服務定義。GMAIL 為現行主要供應商；SMTP/RESEND 標記 deprecated（不進目錄，但既有紀錄可編輯）。
import type { ProviderDefinition } from '../types';

const smtpFields = (opts: { hostDefault?: string; portDefault?: string; passLabel?: string }): ProviderDefinition['fields'] => [
    { key: 'smtpHost', label: 'SMTP 主機位置 (Host)', type: 'text', required: true, default: opts.hostDefault },
    { key: 'smtpPort', label: '通訊埠 (Port)', type: 'text', required: true, default: opts.portDefault },
    { key: 'smtpUser', label: '使用者帳號 (User)', type: 'text', required: true },
    { key: 'smtpPass', label: opts.passLabel || 'API Key / 密碼', type: 'password', required: true, secret: true },
    { key: 'fromAddress', label: '寄件者信箱 (From Address)', type: 'text', required: true, placeholder: 'noreply@example.com' },
];

export const EMAIL_PROVIDERS: ProviderDefinition[] = [
    {
        type: 'GMAIL',
        category: 'email',
        defaults: { label: 'Gmail SMTP', desc: '串接您個人的 Gmail 帳號發送自動化郵件 (需應用程式密碼)', icon: '📧', badge: 'bg-red-100 text-red-800', sortOrder: 10, visible: true },
        capabilities: { testConnection: true, multiInstance: true, toolPanels: ['test-email'] },
        hint: '需先於 Google 帳號開啟兩步驟驗證並產生「應用程式密碼」。',
        fields: smtpFields({ hostDefault: 'smtp.gmail.com', portDefault: '587', passLabel: '應用程式密碼' }),
    },
    {
        type: 'SMTP',
        category: 'email',
        deprecated: true,
        defaults: { label: '自訂 SMTP', desc: '自行填入任意 SMTP 伺服器設定', icon: '✉️', badge: 'bg-gray-100 text-gray-800', sortOrder: 90, visible: false },
        capabilities: { testConnection: true, multiInstance: true, toolPanels: ['test-email'] },
        fields: smtpFields({}),
    },
    {
        type: 'RESEND',
        category: 'email',
        deprecated: true,
        defaults: { label: 'Resend 郵件服務', desc: '（已淘汰）保留供歷史紀錄顯示', icon: '🚀', badge: 'bg-indigo-100 text-indigo-800', sortOrder: 91, visible: false },
        capabilities: { testConnection: true, multiInstance: true, toolPanels: ['test-email'] },
        fields: smtpFields({ hostDefault: 'smtp.resend.com', portDefault: '465', passLabel: 'API Key' }),
    },
];
