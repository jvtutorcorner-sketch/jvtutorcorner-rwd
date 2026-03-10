'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

export type Message = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
};

type ReportStatus = {
    loading: boolean;
    generating: boolean;
    lastReport?: { reportDate: string; success: boolean; emailSent: boolean; generatedAt?: string };
    error?: string;
};

export function AIAssistantWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'chat' | 'report'>('chat');
    const [messages, setMessages] = useState<Message[]>([
        { id: '1', role: 'assistant', content: '您好！我是 JV Tutor AI 助理，有什麼可以協助您的嗎？（例如：我想了解課程推薦、我要聯絡客服、每日報告）' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [reportStatus, setReportStatus] = useState<ReportStatus>({ loading: false, generating: false });
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Fetch report status when report tab opens
    const fetchReportStatus = useCallback(async () => {
        setReportStatus(prev => ({ ...prev, loading: true, error: undefined }));
        try {
            const res = await fetch('/api/cron/daily-report/status');
            const data = await res.json();
            if (data.ok && data.hasReport) {
                setReportStatus(prev => ({
                    ...prev,
                    loading: false,
                    lastReport: data.report,
                }));
            } else {
                setReportStatus(prev => ({
                    ...prev,
                    loading: false,
                    lastReport: undefined,
                }));
            }
        } catch {
            setReportStatus(prev => ({ ...prev, loading: false, error: '無法取得報告狀態' }));
        }
    }, []);

    const triggerDailyReport = async () => {
        setReportStatus(prev => ({ ...prev, generating: true, error: undefined }));
        try {
            const res = await fetch('/api/cron/daily-report/status', { method: 'POST' });
            const data = await res.json();
            if (data.ok) {
                setReportStatus(prev => ({
                    ...prev,
                    generating: false,
                    lastReport: data.result,
                }));
                // Also add a message to chat
                setMessages(prev => [
                    ...prev,
                    {
                        id: uuidv4(),
                        role: 'assistant',
                        content: `📋 每日報告已${data.result.success ? '成功生成' : '生成失敗'}！\n${data.result.emailSent ? `✅ 報告已發送至 email` : '⚠️ Email 未發送（請檢查 SMTP 設定）'}\n報告日期：${data.result.reportDate}`,
                    },
                ]);
            } else {
                setReportStatus(prev => ({
                    ...prev,
                    generating: false,
                    error: data.error || '報告生成失敗',
                }));
            }
        } catch (err: any) {
            setReportStatus(prev => ({
                ...prev,
                generating: false,
                error: '報告生成請求失敗',
            }));
        }
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen, isLoading]);

    useEffect(() => {
        if (isOpen && activeTab === 'report') {
            fetchReportStatus();
        }
    }, [isOpen, activeTab, fetchReportStatus]);

    const toggleChat = () => setIsOpen(!isOpen);

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: Message = { id: uuidv4(), role: 'user', content: input.trim() };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
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
            setMessages((prev) => [...prev, assistantMsg]);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                { id: uuidv4(), role: 'assistant', content: '抱歉，系統目前有些忙碌，或尚未設定 AI 服務串接，請稍後再試。' }
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
            {isOpen && (
                <div className="mb-4 w-80 sm:w-96 h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-100 transition-all duration-300 transform scale-100 origin-bottom-right drop-shadow-2xl">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex justify-between items-center shadow-md">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30 text-white font-bold shadow-inner">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg>
                            </div>
                            <div>
                                <h3 className="font-semibold leading-tight text-white">JV Tutor 助理</h3>
                                <p className="text-xs text-blue-100 mt-0.5">24/7 在線為您服務</p>
                            </div>
                        </div>
                        <button onClick={toggleChat} className="text-white/80 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>

                    {/* Tab Switcher */}
                    <div className="flex border-b border-gray-200 bg-gray-50">
                        <button
                            onClick={() => setActiveTab('chat')}
                            className={`flex-1 py-2 text-sm font-medium transition-colors ${activeTab === 'chat' ? 'text-blue-600 border-b-2 border-blue-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            💬 對話
                        </button>
                        <button
                            onClick={() => setActiveTab('report')}
                            className={`flex-1 py-2 text-sm font-medium transition-colors ${activeTab === 'report' ? 'text-blue-600 border-b-2 border-blue-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            📋 每日報告
                        </button>
                    </div>

                    {/* Report Panel - Simplified */}
                    {activeTab === 'report' && (
                        <div className="flex-1 p-5 overflow-y-auto bg-gray-50 flex flex-col items-center justify-center text-center gap-4">
                            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-4xl shadow-inner">
                                📊
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 mb-1 text-lg">AI 每日報告服務</h4>
                                <p className="text-sm text-gray-500 leading-relaxed px-4">
                                    此功能已移至獨立的專屬應用程式。您可以在那裡查看詳細狀態、手動生成報告。
                                </p>
                            </div>

                            <a
                                href="/apps/daily-report"
                                className="mt-2 py-3 px-6 bg-blue-600 text-white rounded-2xl text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2"
                            >
                                立即前往查看報告 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" /></svg>
                            </a>

                            <div className="mt-4 pt-4 border-t border-gray-200 w-full">
                                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">目前狀態</p>
                                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-white border border-gray-100 rounded-full shadow-sm">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </span>
                                    <span className="text-[11px] font-medium text-gray-600">自動化服務運作中</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Messages (Chat Tab) */}
                    {activeTab === 'chat' && (<>
                        <div className="flex-1 p-4 overflow-y-auto bg-gray-50 flex flex-col gap-4 scroll-smooth">
                            {messages.map((m) => (
                                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                                    <div className={`max-w-[85%] p-3.5 rounded-2xl shadow-sm text-[15px] leading-relaxed ${m.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-tr-sm'
                                        : 'bg-white text-gray-800 border border-gray-100 rounded-tl-sm ring-1 ring-black/5'
                                        } whitespace-pre-wrap`}>
                                        {m.content}
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start animate-in fade-in">
                                    <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-sm shadow-sm ring-1 ring-black/5 flex gap-1.5 items-center h-12">
                                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} className="h-1" />
                        </div>

                        {/* Input */}
                        <div className="p-3 bg-white border-t border-gray-100 shadow-[0_-4px_10px_-5px_rgba(0,0,0,0.05)]">
                            <div className="flex gap-2 relative group">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                    placeholder="輸入您的問題..."
                                    className="flex-1 pl-4 pr-12 py-3 bg-gray-50 border border-transparent hover:border-gray-200 focus:bg-white rounded-full focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-[15px] transition-all"
                                />
                                <button
                                    onClick={sendMessage}
                                    disabled={!input.trim() || isLoading}
                                    className="absolute right-1.5 top-1.5 bottom-1.5 w-9 flex items-center justify-center bg-blue-600 text-white rounded-full disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-blue-700 hover:shadow-md transition-all active:scale-95"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-0.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                                </button>
                            </div>
                            <div className="text-center mt-2">
                                <span className="text-[10px] text-gray-400">Powered by AI Agent</span>
                            </div>
                        </div>
                    </>)}
                </div>
            )}

            {/* Floating Button */}
            {!isOpen && (
                <button
                    onClick={toggleChat}
                    className="w-14 h-14 bg-blue-600 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center justify-center text-white hover:bg-blue-700 hover:scale-110 hover:shadow-[0_8px_30px_rgb(37,99,235,0.4)] transition-all duration-300 group relative"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg>
                    <span className="absolute -top-12 right-0 bg-gray-900/90 backdrop-blur-sm text-white text-sm font-medium px-4 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg after:content-[''] after:absolute after:top-full after:right-6 after:-mt-1 after:border-4 after:border-transparent after:border-t-gray-900/90">
                        需要協助嗎？
                    </span>
                    <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></div>
                </button>
            )}
        </div>
    );
}
