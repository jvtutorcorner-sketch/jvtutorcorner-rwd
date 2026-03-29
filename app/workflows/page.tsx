'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const TEMPLATE_CATEGORIES = [
    { id: 'all', name: '全部', icon: '📁' },
    { id: 'ai', name: 'AI 代理', icon: '🤖' },
    { id: 'messaging', name: '訊息傳遞', icon: '💬' },
    { id: 'business', name: '商業流程', icon: '💼' },
    { id: 'utility', name: '效能工具', icon: '🔧' },
];

const TEMPLATES = [
    {
        id: 'blank',
        name: '空白畫布',
        description: '從頭開始構建您的自定義自動化流程。',
        category: 'utility',
        icon: '✨',
        nodes: [],
        edges: []
    },
    {
        id: 'ai-chat-routing',
        name: 'AI 對話路由',
        description: '智慧訊息路由，支援代理派遣與對話介面備援。',
        category: 'ai',
        icon: '🤖',
        nodes: [
            { id: 'node_1', type: 'trigger', position: { x: 250, y: 50 }, data: { label: '用戶對話訊息', triggerType: 'trigger_chat_message' } },
            { id: 'node_2', type: 'ai', position: { x: 250, y: 150 }, data: { label: '代理派遣器', actionType: 'action_ai_dispatch', config: { queryField: '{{message.content}}', outputField: 'dispatchResult' } } },
            { id: 'node_3', type: 'logic', position: { x: 250, y: 250 }, data: { label: '是否需要派遣？', actionType: 'logic_condition', config: { variable: '{{dispatchResult.ok}}', operator: 'equals', value: 'true' } } },
            { id: 'node_4', type: 'ai', position: { x: 50, y: 350 }, data: { label: '執行平台代理', actionType: 'action_agent_execute', config: { agentIdField: '{{dispatchResult.primary.id}}', inputField: '{{message.content}}', useSmartRouter: true, usePromptCache: true } } },
            { id: 'node_5', type: 'ai', position: { x: 450, y: 350 }, data: { label: '通用 AI 助手', actionType: 'action_ai_summarize', config: { userPrompt: '{{message.content}}' } } },
            { id: 'node_6', type: 'output', position: { x: 250, y: 450 }, data: { label: '回傳輸出', actionType: 'output_workflow' } }
        ],
        edges: [
            { id: 'e1-2', source: 'node_1', target: 'node_2', type: 'smoothstep', animated: true },
            { id: 'e2-3', source: 'node_2', target: 'node_3', type: 'smoothstep', animated: true },
            { id: 'e3-4', source: 'node_3', target: 'node_4', sourceHandle: 'true', type: 'smoothstep', animated: true },
            { id: 'e3-5', source: 'node_3', target: 'node_5', sourceHandle: 'false', type: 'smoothstep', animated: true },
            { id: 'e4-6', source: 'node_4', target: 'node_6', type: 'smoothstep', animated: true },
            { id: 'e5-6', source: 'node_5', target: 'node_6', type: 'smoothstep', animated: true }
        ]
    },
    {
        id: 'line-bot',
        name: 'LINE 自動回覆',
        description: '自動化 LINE 訊息流程，具備影像識別與智慧自動回覆功能。',
        category: 'messaging',
        icon: '💬',
        nodes: [
            { id: 'node_1', type: 'webhook', position: { x: 250, y: 50 }, data: { label: 'LINE Webhook', triggerType: 'trigger_line_webhook' } },
            { id: 'node_2', type: 'logic', position: { x: 250, y: 150 }, data: { label: '是否為影像訊息？', actionType: 'logic_condition', config: { variable: '{{message.type}}', operator: 'equals', value: 'image' } } },
            { id: 'node_3', type: 'action', position: { x: 50, y: 250 }, data: { label: '影像分析 (藥物辨識)', actionType: 'action_image_analysis', config: { apiEndpoint: '/api/image-analysis', inputField: '{{message.content}}', outputField: 'analysisResult' } } },
            { id: 'node_4', type: 'ai', position: { x: 450, y: 250 }, data: { label: 'AI 對話回覆', actionType: 'action_ai_summarize', config: { userPrompt: '{{message.text}}' } } },
            { id: 'node_5', type: 'notification', position: { x: 50, y: 350 }, data: { label: 'LINE 推播 (影像結果)', actionType: 'action_notification_line', config: { channel: 'line', message: '辨識結果: {{analysisResult.shape}} - {{analysisResult.color}}', userEmail: '{{user.email}}' } } },
            { id: 'node_6', type: 'notification', position: { x: 450, y: 350 }, data: { label: 'LINE 推播 (文字結果)', actionType: 'action_notification_line', config: { channel: 'line', message: '{{ai_output}}', userEmail: '{{user.email}}' } } }
        ],
        edges: [
            { id: 'e1-2', source: 'node_1', target: 'node_2', type: 'smoothstep', animated: true },
            { id: 'e2-3', source: 'node_2', target: 'node_3', sourceHandle: 'true', type: 'smoothstep', animated: true },
            { id: 'e2-4', source: 'node_2', target: 'node_4', sourceHandle: 'false', type: 'smoothstep', animated: true },
            { id: 'e3-5', source: 'node_3', target: 'node_5', type: 'smoothstep', animated: true },
            { id: 'e4-6', source: 'node_4', target: 'node_6', type: 'smoothstep', animated: true }
        ]
    },
    {
        id: 'student-enrollment',
        name: '學生報名流程',
        description: '完整的點數購買、課程註冊及教室登入生命週期管理。',
        category: 'business',
        icon: '🎓',
        nodes: [
            { id: 'node_1', type: 'trigger', position: { x: 250, y: 50 }, data: { label: '報名請求', triggerType: 'trigger_api_call' } },
            { id: 'node_2', type: 'logic', position: { x: 250, y: 150 }, data: { label: '檢查點數餘額', actionType: 'logic_condition', config: { variable: '{{user.credits}}', operator: 'greater_than', value: '{{course.price}}' } } },
            { id: 'node_3', type: 'action', position: { x: 50, y: 250 }, data: { label: '重新導向至結帳頁面', actionType: 'action_redirect', config: { url: '/pricing' } } },
            { id: 'node_4', type: 'action', position: { x: 450, y: 250 }, data: { label: '註冊報名資訊', actionType: 'action_db_create', config: { collection: 'enrollments', data: { studentId: '{{user.id}}', courseId: '{{course.id}}' } } } },
            { id: 'node_5', type: 'notification', position: { x: 450, y: 350 }, data: { label: '歡迎電子郵件', actionType: 'action_notification_email', config: { template: 'course_welcome', to: '{{user.email}}' } } }
        ],
        edges: [
            { id: 'e1-2', source: 'node_1', target: 'node_2', type: 'smoothstep', animated: true },
            { id: 'e2-3', source: 'node_2', target: 'node_3', sourceHandle: 'false', type: 'smoothstep', animated: true },
            { id: 'e2-4', source: 'node_2', target: 'node_4', sourceHandle: 'true', type: 'smoothstep', animated: true },
            { id: 'e4-5', source: 'node_4', target: 'node_5', type: 'smoothstep', animated: true }
        ]
    }
];

export default function WorkflowsList() {
    const [workflows, setWorkflows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('all');
    const router = useRouter();

    useEffect(() => {
        fetchWorkflows();
    }, []);

    const fetchWorkflows = async () => {
        try {
            const res = await fetch('/api/workflows');
            const data = await res.json();
            if (data.ok) {
                setWorkflows(data.workflows);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateFromTemplate = async (template: any) => {
        try {
            const res = await fetch('/api/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: template.name === '空白畫布' ? '新工作流' : `${template.name} (範本)`, 
                    nodes: template.nodes, 
                    edges: template.edges,
                    description: template.description
                })
            });
            const data = await res.json();
            if (data.ok && data.workflow) {
                router.push(`/workflows/${data.workflow.id}`);
            }
        } catch (e) {
            console.error('Failed to create workflow', e);
        }
    };

    const toggleActive = async (id: string, currentStatus: boolean) => {
        try {
            await fetch(`/api/workflows/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !currentStatus })
            });
            fetchWorkflows();
        } catch (e) {
            console.error('Failed to update', e);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('您確定要刪除此工作流嗎？')) return;
        try {
            await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
            fetchWorkflows();
        } catch (e) {
            console.error('Failed to delete', e);
        }
    };

    const filteredTemplates = activeCategory === 'all' 
        ? TEMPLATES 
        : TEMPLATES.filter(t => t.category === activeCategory);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-12">
            {/* Header Section */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">工作流自動化</h1>
                    <p className="text-slate-500 mt-2 text-lg">構建、管理並擴展您的視覺化自動化管線。</p>
                </div>
                <div className="hidden md:block">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                        {workflows.length} 個啟用的工作流
                    </span>
                </div>
            </div>

            {/* Templates Section */}
            <section className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">✨</span>
                        從範本開始
                    </h2>
                    
                    <div className="flex flex-wrap gap-2">
                        {TEMPLATE_CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                                    activeCategory === cat.id 
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                                    : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                                }`}
                            >
                                <span className="mr-1.5">{cat.icon}</span>
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {filteredTemplates.map(template => (
                        <div 
                            key={template.id}
                            onClick={() => handleCreateFromTemplate(template)}
                            className="group cursor-pointer bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-50 transition-all duration-300 flex flex-col h-full"
                        >
                            <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-2xl mb-4 group-hover:bg-indigo-50 group-hover:scale-110 transition-transform">
                                {template.icon}
                            </div>
                            <h3 className="font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">{template.name}</h3>
                            <p className="text-sm text-slate-500 leading-relaxed flex-grow">
                                {template.description}
                            </p>
                            <div className="mt-4 pt-4 border-t border-slate-50 flex items-center text-indigo-600 font-semibold text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                建立工作流 <span className="ml-2">→</span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* My Workflows Section */}
            <section className="space-y-6">
                <div className="border-b border-slate-200 pb-4">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">⚙️</span>
                        現有的工作流
                    </h2>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-44 bg-slate-100 animate-pulse rounded-2xl"></div>
                        ))}
                    </div>
                ) : workflows.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        <div className="text-5xl mb-4">🚀</div>
                        <h3 className="text-xl font-bold text-slate-900">找不到任何工作流</h3>
                        <p className="text-slate-500 mb-6 max-w-sm mx-auto">點擊上方的範本來啟動您的第一個自動化流程。</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {workflows.map(wf => (
                            <div key={wf.id} className="relative bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all group">
                                <div className="p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="overflow-hidden">
                                            <h3 className="font-bold text-lg text-slate-900 truncate" title={wf.name}>{wf.name}</h3>
                                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                                {wf.nodes?.length || 0} 個節點
                                            </span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" className="sr-only peer" checked={wf.isActive} onChange={() => toggleActive(wf.id, wf.isActive)} />
                                            <div className="w-10 h-5.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                        </label>
                                    </div>
                                    
                                    <p className="text-sm text-slate-500 mb-6 line-clamp-2 h-10">
                                        {wf.description || '此工作流尚未提供描述。'}
                                    </p>

                                    <div className="flex gap-3 pt-4 border-t border-slate-50">
                                        <Link 
                                            href={`/workflows/${wf.id}`} 
                                            className="flex-grow text-center text-sm font-bold bg-indigo-50 text-indigo-700 py-2.5 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                        >
                                            開啟畫布
                                        </Link>
                                        <button 
                                            onClick={(e) => { e.preventDefault(); handleDelete(wf.id); }} 
                                            className="px-3 py-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                            title="刪除工作流"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                {wf.isActive && (
                                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
