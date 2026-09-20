// lib/integrations/registry/providers/ai.ts
// 大語言模型服務商（OpenAI / Anthropic / Gemini）與 Context7 MCP。
import type { ProviderDefinition } from '../types';

const llmFields = (): ProviderDefinition['fields'] => [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, secret: true },
    { key: 'models', label: '啟用模型', type: 'model-picker', required: false, help: '建議每個服務選擇一個主力模型' },
    { key: 'systemInstruction', label: '系統指令 (System Instruction)', type: 'textarea', rows: 4, help: '選填：套用於此服務所有請求的預設系統提示' },
];

export const AI_PROVIDERS: ProviderDefinition[] = [
    {
        type: 'OPENAI',
        category: 'ai',
        defaults: { label: 'OpenAI ChatGPT', desc: '強大的通用大語言模型', icon: '🧠', badge: 'bg-gray-100 text-gray-800', sortOrder: 10, visible: true },
        capabilities: { testConnection: true, multiInstance: true, toolPanels: ['ai-prompt', 'image-test'] },
        legacyKeyAliases: { openaiApiKey: 'apiKey' },
        fields: llmFields(),
    },
    {
        type: 'ANTHROPIC',
        category: 'ai',
        defaults: { label: 'Anthropic (Claude)', desc: '專注於安全性與長文本理解的 AI 模型', icon: '🎭', badge: 'bg-orange-100 text-orange-800', sortOrder: 20, visible: true },
        capabilities: { testConnection: true, multiInstance: true, toolPanels: ['ai-prompt'] },
        legacyKeyAliases: { anthropicApiKey: 'apiKey' },
        fields: llmFields(),
    },
    {
        type: 'GEMINI',
        category: 'ai',
        defaults: { label: 'Google Gemini', desc: 'Google 的強大原生多模態大模型', icon: '✨', badge: 'bg-blue-100 text-blue-800', sortOrder: 30, visible: true },
        capabilities: { testConnection: true, multiInstance: true, toolPanels: ['ai-prompt', 'image-test'] },
        legacyKeyAliases: { geminiApiKey: 'apiKey' },
        fields: llmFields(),
    },
    {
        type: 'CONTEXT7',
        category: 'ai',
        defaults: { label: 'Context7 MCP', desc: '連結 Figma 與外部知識庫，為 AI 提供即時設計上下文與技術文檔', icon: '🎨', badge: 'bg-teal-100 text-teal-800', sortOrder: 90, visible: true },
        capabilities: { testConnection: true, multiInstance: false },
        fields: [
            { key: 'context7ApiKey', label: 'Context7 API Key', type: 'password', required: true, secret: true },
        ],
    },
];
