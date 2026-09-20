// lib/integrations/registry/types.ts
//
// Provider Registry 的型別定義。純資料、無外部相依，client 與 server 皆可 import。
// 「有哪些服務、每個服務有哪些欄位、欄位是不是密鑰、能不能測試連線」都由此宣告，
// 取代散落在 _types.ts / add-app / test route 的三份互相矛盾的寫死清單。

export type FieldType =
    | 'text'
    | 'password'
    | 'textarea'
    | 'number'
    | 'select'
    | 'model-picker'      // 由 /api/admin/ai-models 提供選項
    | 'integration-ref'   // 參照另一個整合（如 AI_CHATROOM.linkedServiceId → 某個 AI 服務）
    | 'skill-ref'         // 參照一個 AI skill（linkedSkillId）
    | 'toggle'
    | 'json';

export interface FieldDef {
    key: string;                 // 對應 config 內的 key（即 DB 實際持久化的欄位名）
    label: string;
    type: FieldType;
    required?: boolean;
    secret?: boolean;            // true → GET 時遮罩、寫入時採 merge-on-blank
    placeholder?: string;
    help?: string;
    default?: unknown;
    group?: string;              // SchemaForm 分段 / stepper 用（如 ASK_PLAN_AGENT）
    options?: { value: string; label: string }[];  // select 用
    refCategory?: IntegrationCategory;              // integration-ref 用
    refTypes?: string[];                            // integration-ref 限定類型
    rows?: number;               // textarea
    min?: number;
    max?: number;
    showIf?: { key: string; equals: unknown };      // 少量條件顯示
    path?: string;               // 巢狀 config 路徑，如 'tools.webSearch'
}

export type IntegrationCategory =
    | 'payment'
    | 'channel'
    | 'email'
    | 'ai'
    | 'ai-container'
    | 'database';

export type ToolPanel =
    | 'line-simulate'
    | 'line-push'
    | 'test-email'
    | 'ai-prompt'
    | 'image-test'
    | 'test-payment';

export interface ProviderCapabilities {
    testConnection?: boolean;
    multiInstance?: boolean;     // 是否允許同 type 多組連線
    customScript?: boolean;      // 是否支援 webhook customScript（目前 LINE）
    toolPanels?: ToolPanel[];    // 詳情頁「測試工具」要顯示哪些面板
    webhookUrl?: (integrationId: string) => string;  // 有 inbound webhook 的類型
}

export interface ProviderDefaults {
    label: string;
    desc: string;
    icon: string;
    badge: string;               // Tailwind class，沿用舊 *_META
    sortOrder: number;
    visible: boolean;            // 目錄預設是否顯示（deprecated 者為 false）
}

export interface ProviderDefinition {
    type: string;                // DB 的 type，如 'STRIPE'
    category: IntegrationCategory;
    defaults: ProviderDefaults;
    fields: FieldDef[];
    hint?: string;
    capabilities: ProviderCapabilities;
    legacyKeyAliases?: Record<string, string>;  // 舊 key → 正規 key
    deprecated?: boolean;        // 不進目錄，但既有紀錄仍可檢視 / 編輯（如 RESEND、SMTP）
}
