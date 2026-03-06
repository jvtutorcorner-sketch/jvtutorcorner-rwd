'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';
import type { PlatformAgent } from '@/lib/platform-agents';
import { EXECUTION_ENVIRONMENT_META, ExecutionEnvironment } from '@/lib/platform-agents';

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    agentId?: string;
    agentName?: string;
    agentIcon?: string;
    executionEnvironment?: 'local' | 'background' | 'cloud';
    isDispatchResult?: boolean;
    dispatchAgents?: PlatformAgent[];
};

type DispatchResult = {
    ok: boolean;
    mode: string;
    primary: PlatformAgent | null;
    agents: PlatformAgent[];
    confidence: number;
    reason: string;
    summary: string;
};

// ─── Agent Color Map ──────────────────────────────────────────────────────────
const COLOR_CLASSES: Record<string, { bg: string; border: string; text: string; pill: string }> = {
    blue:    { bg: 'bg-blue-50 dark:bg-blue-900/20',    border: 'border-blue-200 dark:border-blue-800',    text: 'text-blue-700 dark:text-blue-300',   pill: 'bg-blue-600' },
    green:   { bg: 'bg-green-50 dark:bg-green-900/20',  border: 'border-green-200 dark:border-green-800',  text: 'text-green-700 dark:text-green-300', pill: 'bg-green-600' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300', pill: 'bg-emerald-600' },
    violet:  { bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-200 dark:border-violet-800', text: 'text-violet-700 dark:text-violet-300', pill: 'bg-violet-600' },
    amber:   { bg: 'bg-amber-50 dark:bg-amber-900/20',  border: 'border-amber-200 dark:border-amber-800',  text: 'text-amber-700 dark:text-amber-300', pill: 'bg-amber-500' },
    slate:   { bg: 'bg-slate-50 dark:bg-slate-800/50',  border: 'border-slate-200 dark:border-slate-700',  text: 'text-slate-700 dark:text-slate-300', pill: 'bg-slate-600' },
    rose:    { bg: 'bg-rose-50 dark:bg-rose-900/20',    border: 'border-rose-200 dark:border-rose-800',    text: 'text-rose-700 dark:text-rose-300',   pill: 'bg-rose-600' },
    indigo:  { bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-200 dark:border-indigo-800', text: 'text-indigo-700 dark:text-indigo-300', pill: 'bg-indigo-600' },
};
const getColors = (color: string) => COLOR_CLASSES[color] ?? COLOR_CLASSES.indigo;

// ─── FREE_TIER_MODELS (keep for reference / settings link) ────────────────────
const FREE_TIER_MODELS = [
    {
        provider: 'Google Gemini',
        icon: '✨',
        color: 'from-blue-500 to-cyan-500',
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        borderColor: 'border-blue-200 dark:border-blue-800',
        textColor: 'text-blue-700 dark:text-blue-300',
        models: [
            { name: 'Gemini 2.0 Flash', tag: '最新', free: '每分鐘 15 次，每日 1,500 次' },
            { name: 'Gemini 1.5 Flash', tag: '快速', free: '每分鐘 15 次，每日 1,500 次' },
            { name: 'Gemini 1.5 Pro', tag: '強大', free: '每分鐘 2 次，每日 50 次' },
        ],
        link: 'https://aistudio.google.com/apikey',
        linkText: '前往 Google AI Studio 取得 API Key',
        note: '💡 完全免費，無需信用卡',
    },
    {
        provider: 'OpenAI',
        icon: '🧠',
        color: 'from-gray-700 to-gray-900',
        bgColor: 'bg-gray-50 dark:bg-gray-800/50',
        borderColor: 'border-gray-200 dark:border-gray-700',
        textColor: 'text-gray-700 dark:text-gray-300',
        models: [
            { name: 'GPT-4o mini', tag: '平價', free: '新帳號 $5 試用額度' },
            { name: 'GPT-4o', tag: '旗艦', free: '新帳號 $5 試用額度' },
            { name: 'o1-mini', tag: '推理', free: '新帳號 $5 試用額度' },
        ],
        link: 'https://platform.openai.com/api-keys',
        linkText: '前往 OpenAI Platform 取得 API Key',
        note: '⚠️ 需信用卡驗證，新帳號贈 $5 額度',
    },
    {
        provider: 'Anthropic Claude',
        icon: '🎭',
        color: 'from-orange-500 to-amber-500',
        bgColor: 'bg-orange-50 dark:bg-orange-900/20',
        borderColor: 'border-orange-200 dark:border-orange-800',
        textColor: 'text-orange-700 dark:text-orange-300',
        models: [
            { name: 'Claude 3.5 Haiku', tag: '快速', free: '新帳號試用額度' },
            { name: 'Claude 3.5 Sonnet', tag: '均衡', free: '新帳號試用額度' },
            { name: 'Claude 3 Opus', tag: '旗艦', free: '新帳號試用額度' },
        ],
        link: 'https://console.anthropic.com/',
        linkText: '前往 Anthropic Console 取得 API Key',
        note: '⚠️ 需電話驗證，提供初始試用額度',
    },
];

// ─── Agent Panel ──────────────────────────────────────────────────────────────
function AgentPanel({
    agents,
    activeAgent,
    onSelect,
    onClose,
}: {
    agents: PlatformAgent[];
    activeAgent: PlatformAgent | null;
    onSelect: (a: PlatformAgent | null) => void;
    onClose: () => void;
}) {
    const categories = [...new Set(agents.map(a => a.category))];

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900">
            {/* Panel Header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
                <div>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                        <span>🧭</span> Platform Agents
                    </h2>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">選擇 Agent 以獲得專業協助</p>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 lg:hidden"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>

            {/* General AI button */}
            <div className="px-3 py-2 shrink-0">
                <button
                    onClick={() => { onSelect(null); onClose(); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${!activeAgent
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                    <span className="text-base">🤖</span>
                    <span>通用 AI 助理</span>
                    {!activeAgent && <span className="ml-auto text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">使用中</span>}
                </button>
            </div>

            {/* Agent List by Category */}
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-4">
                {categories.map(cat => (
                    <div key={cat}>
                        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 mb-1.5">{cat}</p>
                        <div className="space-y-1">
                            {agents.filter(a => a.category === cat).map(agent => {
                                const c = getColors(agent.color);
                                const isActive = activeAgent?.id === agent.id;
                                return (
                                    <button
                                        key={agent.id}
                                        onClick={() => { onSelect(agent); onClose(); }}
                                        className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${isActive
                                            ? `${c.bg} ${c.border} border-2`
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 border-2 border-transparent'}`}
                                    >
                                        <span className="text-lg shrink-0 mt-0.5">{agent.icon}</span>
                                        <div className="min-w-0">
                                            <p className={`text-xs font-bold leading-tight ${isActive ? c.text : 'text-gray-800 dark:text-gray-200'}`}>
                                                {agent.name}
                                                {isActive && <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded-full opacity-70 bg-current/10">使用中</span>}
                                            </p>
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug line-clamp-2">{agent.desc}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Dispatch Result Card ─────────────────────────────────────────────────────
function DispatchCard({
    result,
    onSelectAgent,
}: {
    result: DispatchResult;
    onSelectAgent: (a: PlatformAgent) => void;
}) {
    return (
        <div className="bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800 rounded-2xl rounded-tl-sm overflow-hidden shadow-sm max-w-lg">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 flex items-center gap-2">
                <span className="text-white text-sm">🧭</span>
                <p className="text-white text-xs font-bold">Agent 調度建議</p>
                {result.confidence > 0 && (
                    <span className="ml-auto text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">
                        {Math.round(result.confidence * 100)}% 信心度
                    </span>
                )}
            </div>
            <div className="p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{result.summary}</p>
                <div className="space-y-2">
                    {result.agents.map((agent, idx) => {
                        const c = getColors(agent.color);
                        return (
                            <button
                                key={agent.id}
                                onClick={() => onSelectAgent(agent)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all hover:shadow-sm ${c.bg} ${c.border}`}
                            >
                                <span className="text-2xl shrink-0">{agent.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className={`text-sm font-bold ${c.text}`}>{agent.name}</p>
                                        {idx === 0 && <span className="text-[9px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded-full">推薦</span>}
                                    </div>
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{agent.desc}</p>
                                </div>
                                <svg className={`w-4 h-4 shrink-0 ${c.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                            </button>
                        );
                    })}
                </div>
                {result.reason && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3 flex items-start gap-1">
                        <span className="shrink-0">💡</span> {result.reason}
                    </p>
                )}
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AppsChatPage() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: '👋 您好！我是 jvtutorcorner 平台的 AI 助理。\n\n您可以直接向我提問，或點擊左上角 🧭 **Agents** 按鈕選擇專屬的 Platform Agent 以獲得更精準的協助。\n\n💡 試試輸入「哪個 Agent 可以幫我處理退款問題？」或直接描述您的需求。',
        },
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isDispatching, setIsDispatching] = useState(false);
    const [activeAgent, setActiveAgent] = useState<PlatformAgent | null>(null);
    const [allAgents, setAllAgents] = useState<PlatformAgent[]>([]);
    const [agentPanelOpen, setAgentPanelOpen] = useState(false);
    const [aiStatus, setAiStatus] = useState<{ configured: boolean } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ── Init ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        fetch('/api/ai-chat/dispatch')
            .then(r => r.json())
            .then(d => { if (d.ok) setAllAgents(d.agents); })
            .catch(() => { });

        fetch('/api/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: '__ping__' }] })
        })
            .then(r => r.json())
            .then(d => setAiStatus({ configured: d.reply && !d.reply.includes('尚未設定') }))
            .catch(() => setAiStatus({ configured: false }));
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // ── Agent switch ──────────────────────────────────────────────────────────
    const handleSelectAgent = useCallback((agent: PlatformAgent | null) => {
        setActiveAgent(agent);
        if (agent) {
            setMessages(prev => [...prev, {
                id: uuidv4(),
                role: 'assistant',
                content: `${agent.icon} **已切換到「${agent.name}」**\n\n${agent.longDesc}\n\n**我可以協助您：**\n${agent.capabilities.map((c: string) => `• ${c}`).join('\n')}\n\n💬 您可以直接提問，或嘗試：\n${agent.exampleQuestions.slice(0, 2).map((q: string) => `→ ${q}`).join('\n')}`,
                agentId: agent.id,
                agentName: agent.name,
                agentIcon: agent.icon,
            }]);
        } else {
            setMessages(prev => [...prev, {
                id: uuidv4(),
                role: 'assistant',
                content: '🤖 已切換回通用 AI 助理模式，有什麼需要我幫忙的嗎？',
            }]);
        }
    }, []);

    // ── Detect dispatch intent ────────────────────────────────────────────────
    const DISPATCH_TRIGGERS = ['哪個agent', '哪個 agent', '哪個助手', '誰可以幫', '幫我找', '調度', '推薦agent', '推薦 agent', 'which agent', 'dispatch'];
    const isDispatchQuery = (text: string) => DISPATCH_TRIGGERS.some(t => text.toLowerCase().includes(t));

    // ── Send message ──────────────────────────────────────────────────────────
    const sendMessage = async () => {
        if (!input.trim() || isLoading || isDispatching) return;
        const userContent = input.trim();
        const userMsg: Message = { id: uuidv4(), role: 'user', content: userContent };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = '56px';

        // ── Dispatch path ─────────────────────────────────────────────────────
        if (isDispatchQuery(userContent)) {
            setIsDispatching(true);
            try {
                const res = await fetch('/api/ai-chat/dispatch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: userContent }),
                });
                const data: DispatchResult = await res.json();
                setMessages(prev => [...prev, {
                    id: uuidv4(),
                    role: 'assistant',
                    content: JSON.stringify(data),
                    isDispatchResult: true,
                    dispatchAgents: data.agents,
                }]);
            } catch {
                setMessages(prev => [...prev, { id: uuidv4(), role: 'assistant', content: '⚠️ 調度服務暫時無法使用，請直接從左側選擇 Agent。' }]);
            } finally {
                setIsDispatching(false);
            }
            return;
        }

        // ── Normal chat path ──────────────────────────────────────────────────
        setIsLoading(true);
        try {
            const allMsgs = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
            const res = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: allMsgs, agentId: activeAgent?.id }),
            });
            if (!res.ok) throw new Error('Network error');
            const data = await res.json();
            setMessages(prev => [...prev, {
                id: uuidv4(),
                role: 'assistant',
                content: data.reply,
                agentId: activeAgent?.id,
                agentName: activeAgent?.name,
                agentIcon: activeAgent?.icon,
                executionEnvironment: data.executionEnvironment,
            }]);
            if (data.reply && !data.reply.includes('尚未設定')) setAiStatus({ configured: true });
        } catch {
            setMessages(prev => [...prev, { id: uuidv4(), role: 'assistant', content: '❌ 系統發生錯誤，請稍後再試。' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const clearConversation = () => {
        setMessages([{ id: uuidv4(), role: 'assistant', content: activeAgent
            ? `${activeAgent.icon} 對話已清除。我是「${activeAgent.name}」，繼續為您服務。`
            : '👋 對話已清除！請繼續提問。'
        }]);
    };

    const activeColors = activeAgent ? getColors(activeAgent.color) : null;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
            {/* ── Top Navigation Bar ─────────────────────────────────────────── */}
            <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 shrink-0">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Link href="/apps" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                        </Link>
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-sm text-base
                                ${activeAgent && activeColors ? `${activeColors.bg} border ${activeColors.border}` : 'bg-gradient-to-br from-indigo-500 to-purple-600'}`}>
                                {activeAgent ? activeAgent.icon : '🤖'}
                            </div>
                            <div>
                                <h1 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                                    {activeAgent ? activeAgent.name : 'AI 聊天室'}
                                </h1>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                    {activeAgent ? activeAgent.category : '智慧問答 · 即時回覆'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* AI status */}
                        {aiStatus !== null && (
                            <span className={`hidden sm:flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${aiStatus.configured
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${aiStatus.configured ? 'bg-green-500 animate-pulse' : 'bg-orange-400'}`} />
                                {aiStatus.configured ? 'AI 已連接' : '尚未設定 AI'}
                            </span>
                        )}

                        {/* Agent panel toggle */}
                        <button
                            onClick={() => setAgentPanelOpen(v => !v)}
                            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${agentPanelOpen
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-700 dark:hover:text-purple-300'}`}
                        >
                            <span>🧭</span>
                            <span className="hidden sm:inline">Agents</span>
                            {allAgents.length > 0 && (
                                <span className="bg-purple-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{allAgents.length}</span>
                            )}
                        </button>

                        {/* Active agent pill — click to deactivate */}
                        {activeAgent && activeColors && (
                            <button
                                onClick={() => handleSelectAgent(null)}
                                className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${activeColors.bg} ${activeColors.border} ${activeColors.text}`}
                                title="點擊以切換回通用模式"
                            >
                                <span>{activeAgent.icon}</span>
                                <span className="max-w-[80px] truncate hidden sm:inline">{activeAgent.name}</span>
                                <span className="text-gray-400 text-xs">✕</span>
                            </button>
                        )}

                        <button
                            onClick={clearConversation}
                            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-red-600 transition-colors bg-gray-100 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-full"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            <span className="hidden sm:inline">清除</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Main Layout ────────────────────────────────────────────────── */}
            <div className="flex-1 max-w-7xl mx-auto w-full flex overflow-hidden" style={{ height: 'calc(100vh - 57px)' }}>

                {/* ── Agent Panel Sidebar ───────────────────────────────────── */}
                <div className={`shrink-0 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 overflow-hidden
                    ${agentPanelOpen ? 'w-64 lg:w-72' : 'w-0'}`}>
                    {agentPanelOpen && (
                        <AgentPanel
                            agents={allAgents}
                            activeAgent={activeAgent}
                            onSelect={handleSelectAgent}
                            onClose={() => setAgentPanelOpen(false)}
                        />
                    )}
                </div>

                {/* ── Chat Area ─────────────────────────────────────────────── */}
                <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">

                    {/* Active Agent Banner */}
                    {activeAgent && activeColors && (
                        <div className={`px-4 py-2 ${activeColors.bg} border-b ${activeColors.border} flex items-center gap-2 shrink-0`}>
                            <span className="text-base">{activeAgent.icon}</span>
                            <p className={`text-xs font-semibold ${activeColors.text}`}>{activeAgent.name} 模式</p>
                            <span className={`text-[10px] ${activeColors.text} opacity-70 hidden sm:inline`}>— {activeAgent.desc}</span>
                            {/* Example question quick-fill buttons */}
                            <div className="ml-auto flex items-center gap-1.5 overflow-x-auto">
                                {activeAgent.exampleQuestions.slice(0, 2).map((q: string, i: number) => (
                                    <button
                                        key={i}
                                        onClick={() => { setInput(q); textareaRef.current?.focus(); }}
                                        className={`shrink-0 text-[10px] font-medium px-2 py-1 rounded-full border whitespace-nowrap ${activeColors.border} ${activeColors.text} bg-white dark:bg-gray-800 transition-colors`}
                                    >
                                        {q.length > 18 ? q.slice(0, 18) + '…' : q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4 bg-gray-50 dark:bg-gray-950">

                        {/* Not configured warning */}
                        {aiStatus !== null && !aiStatus.configured && (
                            <div className="mx-auto max-w-sm bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-5 text-center">
                                <div className="text-3xl mb-2">🔧</div>
                                <h3 className="font-bold text-orange-700 dark:text-orange-400 mb-1">尚未設定 AI 服務</h3>
                                <p className="text-xs text-orange-600 dark:text-orange-500 mb-4">請先在系統設定中完成 AI API Key 串接。</p>
                                <Link href="/apps" className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
                                    前往系統設定
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                </Link>
                            </div>
                        )}

                        {messages.map((m) => (
                            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-200`}>
                                {m.role === 'assistant' && (
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 mr-2.5 mt-1 shadow-sm
                                        ${m.agentId && m.agentIcon
                                            ? `${getColors(allAgents.find(a => a.id === m.agentId)?.color || 'indigo').bg} border ${getColors(allAgents.find(a => a.id === m.agentId)?.color || 'indigo').border}`
                                            : 'bg-gradient-to-br from-indigo-500 to-purple-600'}`}>
                                        {m.agentIcon || '🤖'}
                                    </div>
                                )}

                                <div className="flex flex-col gap-1 max-w-[80%] lg:max-w-[75%]">
                                    {/* Agent name label */}
                                    {m.role === 'assistant' && m.agentName && (
                                        <div className="flex items-center gap-1.5 ml-1">
                                            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{m.agentName}</p>
                                            {m.executionEnvironment && (() => {
                                                const envMeta = EXECUTION_ENVIRONMENT_META[m.executionEnvironment];
                                                return (
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${envMeta.badge}`}>
                                                        {envMeta.icon} {envMeta.label}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {/* Dispatch result card */}
                                    {m.isDispatchResult && (() => {
                                        try {
                                            const result: DispatchResult = JSON.parse(m.content);
                                            return <DispatchCard result={result} onSelectAgent={handleSelectAgent} />;
                                        } catch { return null; }
                                    })()}

                                    {/* Normal message bubble */}
                                    {!m.isDispatchResult && (
                                        <div className={`px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed whitespace-pre-wrap
                                            ${m.role === 'user'
                                                ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-tr-sm'
                                                : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-tl-sm ring-1 ring-black/5 dark:ring-white/5'}`}>
                                            {m.content}
                                        </div>
                                    )}
                                </div>

                                {m.role === 'user' && (
                                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm shrink-0 ml-2.5 mt-1">👤</div>
                                )}
                            </div>
                        ))}

                        {/* Loading indicator */}
                        {(isLoading || isDispatching) && (
                            <div className="flex justify-start animate-in fade-in">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 mr-2.5 mt-1 shadow-sm
                                    ${isDispatching ? 'bg-gradient-to-br from-purple-500 to-indigo-600' : 'bg-gradient-to-br from-indigo-500 to-purple-600'}`}>
                                    {isDispatching ? '🧭' : (activeAgent?.icon || '🤖')}
                                </div>
                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm ring-1 ring-black/5 flex gap-1.5 items-center h-12">
                                    {isDispatching
                                        ? <span className="text-xs text-purple-600 dark:text-purple-400 font-medium animate-pulse">分析並調度中...</span>
                                        : <>
                                            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" />
                                            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                                            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                                        </>
                                    }
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} className="h-1 shrink-0" />
                    </div>

                    {/* ── Input Area ────────────────────────────────────────── */}
                    <div className="p-3 sm:p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shrink-0">
                        {/* Quick agent shortcuts (shown when no agent active) */}
                        {!activeAgent && allAgents.length > 0 && (
                            <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1">
                                <span className="text-[10px] text-gray-400 shrink-0">快速：</span>
                                <button
                                    onClick={() => setInput('哪個 Agent 可以幫我？')}
                                    className="shrink-0 text-[10px] font-semibold px-2.5 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 rounded-full hover:bg-purple-100 transition-colors"
                                >
                                    🧭 調度 Agent
                                </button>
                                {allAgents.slice(0, 3).map(a => (
                                    <button
                                        key={a.id}
                                        onClick={() => handleSelectAgent(a)}
                                        className={`shrink-0 text-[10px] font-semibold px-2.5 py-1 ${getColors(a.color).bg} ${getColors(a.color).text} border ${getColors(a.color).border} rounded-full hover:opacity-80 transition-opacity`}
                                    >
                                        {a.icon} {a.name}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-2.5">
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                                }}
                                onInput={(e) => {
                                    const t = e.target as HTMLTextAreaElement;
                                    t.style.height = 'auto';
                                    t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
                                }}
                                placeholder={activeAgent
                                    ? `詢問「${activeAgent.name}」… (Enter 送出)`
                                    : '輸入問題，或輸入「哪個 Agent 可以幫我...」來智慧調度 (Enter 送出)'}
                                className="flex-1 px-4 py-3.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:border-gray-400 focus:bg-white dark:focus:bg-gray-750 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 text-sm transition-all resize-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
                                rows={1}
                                style={{ minHeight: '56px' }}
                                disabled={isLoading || isDispatching}
                            />
                            <button
                                onClick={sendMessage}
                                disabled={!input.trim() || isLoading || isDispatching}
                                className={`w-14 shrink-0 flex items-center justify-center text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all active:scale-95 shadow-md
                                    ${activeAgent && activeColors
                                        ? `${activeColors.pill} hover:opacity-90`
                                        : 'bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'}`}
                                style={{ minHeight: '56px' }}
                            >
                                {isLoading || isDispatching ? (
                                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-0.5">
                                        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        <p className="text-center text-[10px] text-gray-400 dark:text-gray-600 mt-2 font-medium">
                            💬 Powered by AI · 回應內容僅供參考 ·
                            <button onClick={() => setAgentPanelOpen(v => !v)} className="ml-1 underline hover:text-gray-600 transition-colors">
                                {agentPanelOpen ? '收起 Agent 面板' : '展開 Agent 面板'}
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
