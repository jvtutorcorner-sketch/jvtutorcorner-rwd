"use client";

import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import PageBreadcrumb from '@/components/PageBreadcrumb';

type Message = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
};

export default function EngineeringChatPage() {
    const [messages, setMessages] = useState<Message[]>([
        { id: '1', role: 'assistant', content: '您好！我是您的專屬工程 AI 助理。我可以為您評估系統架構、版本更新風險、套件依賴或進行技術調研。有什麼我可以幫忙的嗎？' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: Message = { id: uuidv4(), role: 'user', content: input.trim() };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/engineering-chat', {
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
            console.error('Chat error:', error);
            setMessages((prev) => [
                ...prev,
                { id: uuidv4(), role: 'assistant', content: '抱歉，系統目前有些忙碌，或尚未設定 Gemini API Key，請稍後再試。' }
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] max-h-screen relative p-4 lg:p-8 bg-gray-50">
            <PageBreadcrumb />

            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 mt-4 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white p-4 flex justify-between items-center shadow-md shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/10 backdrop-blur-sm rounded-lg flex items-center justify-center border border-white/20 text-white font-bold shadow-inner">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                        </div>
                        <div>
                            <h3 className="font-semibold leading-tight text-white tracking-wide">工程專屬 AI 助理</h3>
                            <p className="text-xs text-gray-300 mt-0.5">系統架構評估 · 版本分析 · 技術調研</p>
                        </div>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 p-4 lg:p-6 overflow-y-auto bg-gray-50 flex flex-col gap-6 scroll-smooth">
                    {messages.map((m) => (
                        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                            <div className={`max-w-[85%] lg:max-w-[70%] p-4 rounded-2xl shadow-sm text-[15px] leading-relaxed ${m.role === 'user'
                                ? 'bg-gray-800 text-white rounded-tr-sm'
                                : 'bg-white text-gray-800 border border-gray-200 rounded-tl-sm ring-1 ring-black/5'
                                } whitespace-pre-wrap`}>
                                {m.content}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start animate-in fade-in">
                            <div className="bg-white border border-gray-200 p-4 rounded-2xl rounded-tl-sm shadow-sm ring-1 ring-black/5 flex gap-1.5 items-center h-12">
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} className="h-1 shrink-0" />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white border-t border-gray-200 shrink-0">
                    <div className="flex gap-3 relative group max-w-4xl mx-auto">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage();
                                }
                            }}
                            placeholder="輸入架構或套件問題... (Shift + Enter 換行)"
                            className="flex-1 px-5 py-3.5 bg-gray-50 border border-gray-300 hover:border-gray-400 focus:bg-white rounded-xl focus:outline-none focus:border-gray-800 focus:ring-2 focus:ring-gray-200 text-[15px] transition-all resize-none overflow-hidden"
                            rows={1}
                            style={{ minHeight: '56px' }}
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                            }}
                        />
                        <button
                            onClick={sendMessage}
                            disabled={!input.trim() || isLoading}
                            className="w-14 h-14 shrink-0 flex items-center justify-center bg-gray-800 text-white rounded-xl disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-gray-900 hover:shadow-md transition-all active:scale-95"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-0.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        </button>
                    </div>
                    <div className="text-center mt-3">
                        <span className="text-[11px] text-gray-400 font-medium tracking-wide">⚙️ Powered by Gemini AI Agent for Engineering</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
