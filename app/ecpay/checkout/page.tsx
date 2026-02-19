'use client';

import React, { useState } from 'react';

export default function EcpayCheckoutPage() {
    const [loading, setLoading] = useState(false);

    const handleCheckout = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/ecpay/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amount: 1000,
                    itemName: '測試課程 (Test Course)',
                    userId: 'test_user_001',
                }),
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const html = await response.text();

            // Render the returned HTML (which contains the auto-submitting form)
            // ensuring we write to the current document to navigate
            document.open();
            document.write(html);
            document.close();

        } catch (error) {
            console.error('Checkout failed:', error);
            alert('結帳請求失敗');
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
            <div className="max-w-xl w-full bg-white dark:bg-gray-800 shadow-lg rounded-xl overflow-hidden">
                <div className="bg-green-600 p-6 text-white text-center">
                    <h1 className="text-2xl font-bold">綠界金流測試 (ECPay Test)</h1>
                    <p className="mt-2 text-green-100">模擬購買課程結帳流程</p>
                </div>

                <div className="p-8">
                    {/* Test Credentials Box */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
                        <h3 className="text-yellow-800 font-bold mb-4 flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            測試信用卡資訊 (請複製使用)
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center bg-white p-3 rounded border border-yellow-100">
                                <span className="text-gray-500 text-sm">信用卡號 No.</span>
                                <code className="text-lg font-mono font-bold text-gray-800 selection:bg-yellow-200">
                                    4311-9522-2222-2222
                                </code>
                            </div>
                            <div className="flex justify-between items-center bg-white p-3 rounded border border-yellow-100">
                                <span className="text-gray-500 text-sm">有效期限 Validate</span>
                                <code className="text-lg font-mono font-bold text-gray-800 selection:bg-yellow-200">
                                    12/26 (或大於今日)
                                </code>
                            </div>
                            <div className="flex justify-between items-center bg-white p-3 rounded border border-yellow-100">
                                <span className="text-gray-500 text-sm">安全碼 CVC</span>
                                <code className="text-lg font-mono font-bold text-gray-800 selection:bg-yellow-200">
                                    222
                                </code>
                            </div>
                        </div>
                    </div>

                    {/* Order Summary */}
                    <div className="border-t border-gray-100 pt-6 mb-8">
                        <div className="flex justify-between mb-2">
                            <span className="text-gray-600 dark:text-gray-400">商品名稱</span>
                            <span className="font-medium dark:text-white">測試課程 (Test Course)</span>
                        </div>
                        <div className="flex justify-between text-xl font-bold text-gray-900 dark:text-white mt-4">
                            <span>總金額</span>
                            <span>NT$ 1,000</span>
                        </div>
                    </div>

                    <button
                        onClick={handleCheckout}
                        disabled={loading}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                轉導至綠界支付中...
                            </>
                        ) : (
                            '前往綠界付款'
                        )}
                    </button>

                    <p className="text-center text-xs text-gray-400 mt-4">
                        點擊後將跳轉至 ECPay 測試環境，請使用上方測試卡號付款。
                    </p>
                </div>
            </div>
        </div>
    );
}
