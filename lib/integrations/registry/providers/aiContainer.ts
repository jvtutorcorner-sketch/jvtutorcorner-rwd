// lib/integrations/registry/providers/aiContainer.ts
// AI「容器」型整合：本身不含金鑰，而是把既有 AI 服務 / skill 組合成一個對外功能。
import type { ProviderDefinition } from '../types';

export const AI_CONTAINER_PROVIDERS: ProviderDefinition[] = [
    {
        type: 'AI_CHATROOM',
        category: 'ai-container',
        defaults: { label: 'AI 聊天室', desc: '智慧問答聊天室，即時回覆學員問題', icon: '🤖', badge: 'bg-indigo-100 text-indigo-800', sortOrder: 10, visible: true },
        capabilities: { testConnection: true, multiInstance: true, toolPanels: ['ai-prompt'] },
        fields: [
            { key: 'linkedServiceId', label: '串接的 AI 服務', type: 'integration-ref', required: true, refCategory: 'ai' },
            { key: 'linkedSkillId', label: '套用的 AI 技能', type: 'skill-ref' },
            { key: 'systemInstruction', label: '系統指令', type: 'textarea', rows: 4 },
        ],
    },
    {
        type: 'ASK_PLAN_AGENT',
        category: 'ai-container',
        defaults: { label: '策略思維規劃代理 (Ask-Plan-Agent)', desc: '三階段推理 AI：諮詢釐清、策略規劃、任務執行', icon: '🕵️‍♂️', badge: 'bg-purple-100 text-purple-800', sortOrder: 20, visible: true },
        capabilities: { testConnection: true, multiInstance: true },
        fields: [
            { key: 'executionEnvironment', label: '執行環境', type: 'select', group: 'basic', options: [{ value: 'sandbox', label: 'Sandbox' }, { value: 'production', label: 'Production' }] },
            { key: 'askLinkedServiceId', label: '諮詢釐清階段 (Ask) AI 服務', type: 'integration-ref', required: true, refCategory: 'ai', group: 'stages' },
            { key: 'planLinkedServiceId', label: '策略規劃階段 (Plan) AI 服務', type: 'integration-ref', required: true, refCategory: 'ai', group: 'stages' },
            { key: 'agentLinkedServiceId', label: '任務執行階段 (Execute) AI 服務', type: 'integration-ref', required: true, refCategory: 'ai', group: 'stages' },
            { key: 'askSystemPrompt', label: 'Ask 階段系統提示', type: 'textarea', rows: 3, group: 'stages' },
            { key: 'planSystemPrompt', label: 'Plan 階段系統提示', type: 'textarea', rows: 3, group: 'stages' },
            { key: 'agentSystemPrompt', label: 'Execute 階段系統提示', type: 'textarea', rows: 3, group: 'stages' },
            { key: 'maxLoops', label: '最大迴圈次數', type: 'number', min: 1, max: 50, group: 'behavior' },
            { key: 'outputFormat', label: '輸出格式', type: 'text', group: 'behavior' },
            { key: 'verbosity', label: '詳盡度', type: 'text', group: 'behavior' },
            { key: 'responseLanguage', label: '回應語言', type: 'text', group: 'behavior' },
            { key: 'agentPersonality', label: '代理人格', type: 'text', group: 'behavior' },
            { key: 'agentDomain', label: '專業領域', type: 'text', group: 'behavior' },
            { key: 'databaseQuery', label: '允許資料庫查詢', type: 'toggle', path: 'tools.databaseQuery', group: 'tools' },
            { key: 'knowledgeBase', label: '允許知識庫檢索', type: 'toggle', path: 'tools.knowledgeBase', group: 'tools' },
            { key: 'webSearch', label: '允許網路搜尋', type: 'toggle', path: 'tools.webSearch', group: 'tools' },
            { key: 'codeExecution', label: '允許程式執行', type: 'toggle', path: 'tools.codeExecution', group: 'tools' },
            { key: 'mathCalculation', label: '允許數學計算', type: 'toggle', path: 'tools.mathCalculation', group: 'tools' },
        ],
    },
    {
        type: 'SMART_ROUTER',
        category: 'ai-container',
        defaults: { label: '智能模型路由 (Smart Router)', desc: '依對話複雜度自動切換極速與高階模型，節省成本', icon: '🔀', badge: 'bg-cyan-100 text-cyan-800', sortOrder: 30, visible: true },
        capabilities: { testConnection: false, multiInstance: false },
        fields: [
            { key: 'fastServiceId', label: '極速模型服務', type: 'integration-ref', refCategory: 'ai' },
            { key: 'smartServiceId', label: '高階模型服務', type: 'integration-ref', refCategory: 'ai' },
        ],
    },
];
