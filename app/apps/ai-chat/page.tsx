'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';

type Message = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
};

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

export default function AppsChatPage() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: '👋 您好！我是平台的 AI 助理。\n\n請在下方輸入您的問題，我會盡力為您解答。如果您尚未設定 AI 服務，請先前往「系統設定 → AI 聊天室」完成串接。',
        },
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [generatingWorkflow, setGeneratingWorkflow] = useState<string | null>(null);
    const [showFreeTierInfo, setShowFreeTierInfo] = useState(true);
    const [aiStatus, setAiStatus] = useState<{ configured: boolean; provider?: string; model?: string } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    // Check if AI is configured on mount
    useEffect(() => {
        const checkAiStatus = async () => {
            try {
                const res = await fetch('/api/ai-chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: [{ role: 'user', content: '__ping__' }] })
                });
                const data = await res.json();
                if (data.reply && !data.reply.includes('尚未設定')) {
                    setAiStatus({ configured: true });
                } else {
                    setAiStatus({ configured: false });
                }
            } catch {
                setAiStatus({ configured: false });
            }
        };
        checkAiStatus();
    }, []);

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: Message = { id: uuidv4(), role: 'user', content: input.trim() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = '56px';
        }

        try {
            const response = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMsg].map(({ role, content }) => ({ role, content }))
                })
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const data = await response.json();
            const assistantMsg: Message = {
                id: uuidv4(),
                role: 'assistant',
                content: data.reply
            };
            setMessages(prev => [...prev, assistantMsg]);

            // Mark as configured if we got a real reply
            if (data.reply && !data.reply.includes('尚未設定')) {
                setAiStatus({ configured: true });
            }
        } catch (err) {
            console.error('Chat error:', err);
            setMessages(prev => [
                ...prev,
                { id: uuidv4(), role: 'assistant', content: '❌ 系統發生錯誤，請稍後再試。若持續出現此問題，請確認 AI 服務設定是否正確。' }
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const clearConversation = () => {
        setMessages([{
            id: uuidv4(),
            role: 'assistant',
            content: '👋 對話已清除！請繼續提問。',
        }]);
    };

    const handleGenerateWorkflow = async (content: string, messageId: string) => {
        setGeneratingWorkflow(messageId);
        try {
            const res = await fetch('/api/ai-chat/generate-workflow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    filename: 'ai-generated-workflow'
                })
            });
            const data = await res.json();
            if (data.ok) {
                alert(`✅ Workflow 已產生並儲存！\n檔案名稱：${data.filename}`);
            } else {
                alert(`❌ 產生失敗：${data.error}`);
            }
        } catch (err: any) {
            alert(`❌ 發生錯誤：${err.message}`);
        } finally {
            setGeneratingWorkflow(null);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
            {/* Page Header */}
            <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/apps"
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            title="返回系統設定"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">AI 聊天室</h1>
                                <p className="text-xs text-gray-500 dark:text-gray-400">智慧問答 · 即時回覆</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* AI Status Badge */}
                        {aiStatus !== null && (
                            <span className={`hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${aiStatus.configured
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${aiStatus.configured ? 'bg-green-500 animate-pulse' : 'bg-orange-500'}`} />
                                {aiStatus.configured ? 'AI 已連接' : '尚未設定 AI'}
                            </span>
                        )}
                        <button
                            onClick={() => setShowFreeTierInfo(v => !v)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-full"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {showFreeTierInfo ? '收起' : '免費額度說明'}
                        </button>
                        <button
                            onClick={clearConversation}
                            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors bg-gray-100 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-full"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            清除對話
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
                {/* ─── Free Tier Info Banner ─── */}
                {showFreeTierInfo && (
                    <div className="rounded-2xl overflow-hidden shadow-sm border border-indigo-100 dark:border-indigo-900/50">
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 px-5 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-white">
                                <span className="text-lg">🎁</span>
                                <span className="font-bold text-sm">各大 AI 模型免費額度說明</span>
                                <span className="text-xs text-indigo-200 ml-1">— 設定好 API Key 即可開始使用</span>
                            </div>
                            <button
                                onClick={() => setShowFreeTierInfo(false)}
                                className="text-indigo-200 hover:text-white transition-colors text-lg leading-none"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="bg-white dark:bg-gray-900 p-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {FREE_TIER_MODELS.map(provider => (
                                    <div
                                        key={provider.provider}
                                        className={`rounded-xl p-4 border ${provider.bgColor} ${provider.borderColor}`}
                                    >
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-xl">{provider.icon}</span>
                                            <div>
                                                <h3 className={`font-bold text-sm ${provider.textColor}`}>
                                                    {provider.provider}
                                                </h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{provider.note}</p>
                                            </div>
                                        </div>
                                        <ul className="space-y-1.5 mb-3">
                                            {provider.models.map(m => (
                                                <li key={m.name} className="flex flex-col">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${provider.bgColor} ${provider.textColor} border ${provider.borderColor}`}>
                                                            {m.tag}
                                                        </span>
                                                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{m.name}</span>
                                                    </div>
                                                    <span className="text-[11px] text-gray-500 dark:text-gray-400 ml-0 mt-0.5">→ {m.free}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <a
                                            href={provider.link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`block text-center text-[11px] font-semibold ${provider.textColor} hover:underline`}
                                        >
                                            🔑 {provider.linkText} ↗
                                        </a>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 flex items-start gap-2">
                                <span className="text-amber-500 text-base mt-0.5">⚙️</span>
                                <div>
                                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">如何開始使用？</p>
                                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                                        1. 取得任一 AI 模型的 API Key
                                        &nbsp;→&nbsp;
                                        2. 前往 <Link href="/apps" className="underline font-semibold">系統設定 /apps</Link> 完成「AI 工具串接」並設定 API Key
                                        &nbsp;→&nbsp;
                                        3. 在「AI 聊天室」設定中選擇串接的 AI 服務
                                        &nbsp;→&nbsp;
                                        4. 回到此頁開始對話 🎉
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── Chat Interface ─── */}
                <div className="flex-1 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden min-h-[500px]">
                    {/* Chat Header */}
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-700 px-5 py-3.5 flex items-center gap-3 shrink-0">
                        <div className="relative">
                            <div className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white text-base">
                                🤖
                            </div>
                            {aiStatus?.configured && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-indigo-700" />
                            )}
                        </div>
                        <div>
                            <p className="text-white font-semibold text-sm leading-tight">AI 助理</p>
                            <p className="text-indigo-200 text-xs">
                                {aiStatus?.configured ? '✅ 已連接，隨時為您服務' : '⚠️ 尚未設定 AI 服務'}
                            </p>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 p-5 overflow-y-auto bg-gray-50 dark:bg-gray-950 flex flex-col gap-5 scroll-smooth">
                        {/* Not Configured Warning */}
                        {aiStatus !== null && !aiStatus.configured && (
                            <div className="mx-auto max-w-sm bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-5 text-center">
                                <div className="text-3xl mb-2">🔧</div>
                                <h3 className="font-bold text-orange-700 dark:text-orange-400 mb-1">尚未設定 AI 服務</h3>
                                <p className="text-xs text-orange-600 dark:text-orange-500 mb-4">
                                    請先在系統設定中完成 AI API Key 串接，才能在此進行對話。
                                </p>
                                <Link
                                    href="/apps"
                                    className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors"
                                >
                                    前往系統設定
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                </Link>
                            </div>
                        )}

                        {messages.map((m) => (
                            <div
                                key={m.id}
                                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                            >
                                {m.role === 'assistant' && (
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm shrink-0 mr-2.5 mt-1 shadow-sm">
                                        🤖
                                    </div>
                                )}
                                <div className="flex flex-col gap-2 max-w-[80%] lg:max-w-[75%] items-start">
                                    <div
                                        className={`px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed ${m.role === 'user'
                                            ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-tr-sm'
                                            : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-tl-sm ring-1 ring-black/5 dark:ring-white/5'
                                            } whitespace-pre-wrap w-full`}
                                    >
                                        {m.content}
                                    </div>
                                    {m.role === 'assistant' && !m.content.includes('尚未設定') && (
                                        <button
                                            onClick={() => handleGenerateWorkflow(m.content, m.id)}
                                            disabled={generatingWorkflow !== null}
                                            className="ml-1 flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 bg-white/50 dark:bg-gray-800/50 px-2.5 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-900/30 transition-all hover:shadow-sm"
                                        >
                                            {generatingWorkflow === m.id ? (
                                                <>
                                                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                    處理中...
                                                </>
                                            ) : (
                                                <>⚡ 產生 Workflow</>
                                            )}
                                        </button>
                                    )}
                                </div>
                                {m.role === 'user' && (
                                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm shrink-0 ml-2.5 mt-1">
                                        👤
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Loading Indicator */}
                        {isLoading && (
                            <div className="flex justify-start animate-in fade-in">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm shrink-0 mr-2.5 mt-1 shadow-sm">
                                    🤖
                                </div>
                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm ring-1 ring-black/5 flex gap-1.5 items-center h-12">
                                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" />
                                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} className="h-1 shrink-0" />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shrink-0">
                        <div className="flex gap-3 max-w-4xl mx-auto">
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage();
                                    }
                                }}
                                onInput={(e) => {
                                    const target = e.target as HTMLTextAreaElement;
                                    target.style.height = 'auto';
                                    target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                                }}
                                placeholder="輸入您的問題… (Enter 送出，Shift + Enter 換行)"
                                className="flex-1 px-4 py-3.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:border-gray-400 focus:bg-white dark:focus:bg-gray-750 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 text-sm transition-all resize-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
                                rows={1}
                                style={{ minHeight: '56px' }}
                                disabled={isLoading}
                            />
                            <button
                                onClick={sendMessage}
                                disabled={!input.trim() || isLoading}
                                className="w-14 h-14 shrink-0 flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:from-indigo-700 hover:to-purple-700 hover:shadow-lg transition-all active:scale-95 shadow-md"
                            >
                                {isLoading ? (
                                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-0.5">
                                        <line x1="22" y1="2" x2="11" y2="13"></line>
                                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                    </svg>
                                )}
                            </button>
                        </div>
                        <p className="text-center text-[11px] text-gray-400 dark:text-gray-600 mt-2.5 font-medium tracking-wide">
                            💬 Powered by AI · 回應內容僅供參考，請自行判斷
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
