'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AddAppPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        channelAccessToken: '',
        channelSecret: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            // 模擬儲存 API 請求 (參考金流的設計方式)
            await new Promise(resolve => setTimeout(resolve, 1000));
            alert('應用程式新增成功！');
            router.push('/pricing');
        } catch (error) {
            console.error('Save failed:', error);
            alert('新增失敗');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
            <div className="max-w-xl w-full bg-white dark:bg-gray-800 shadow-lg rounded-xl overflow-hidden">
                <div className="bg-blue-600 p-6 text-white text-center">
                    <h1 className="text-2xl font-bold">新增應用程式</h1>
                    <p className="mt-2 text-blue-100">設定通訊渠道串接參數 (如 LINE Developer)</p>
                </div>

                <div className="p-8">
                    {/* 參數說明區塊 */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
                        <h3 className="text-blue-800 font-bold mb-4 flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            參數說明
                        </h3>
                        <div className="space-y-3">
                            <ul className="list-disc list-inside text-sm text-blue-800 space-y-2">
                                <li><strong>Channel Access Token</strong>: 用於呼叫 API 發送訊息 (發信)。</li>
                                <li><strong>Channel Secret</strong>: 用於驗證 Webhook 來源請求是否合法 (驗證)。</li>
                            </ul>
                        </div>
                    </div>

                    {/* 表單區塊 */}
                    <form onSubmit={handleSave} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                應用程式名稱
                            </label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="例如：官方客服小幫手"
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Channel Access Token <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                name="channelAccessToken"
                                value={formData.channelAccessToken}
                                onChange={handleChange}
                                placeholder="請輸入 Channel Access Token (用於發信)"
                                rows={3}
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Channel Secret <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="channelSecret"
                                value={formData.channelSecret}
                                onChange={handleChange}
                                placeholder="請輸入 Channel Secret (用於驗證)"
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm"
                                required
                            />
                        </div>

                        <div className="pt-4 flex gap-4">
                            <button
                                type="button"
                                onClick={() => router.back()}
                                className="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                            >
                                取消
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-2/3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        儲存中...
                                    </>
                                ) : (
                                    '確認新增'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
