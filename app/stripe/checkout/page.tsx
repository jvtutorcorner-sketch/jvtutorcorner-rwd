'use client';

import React, { useState } from 'react';

export default function StripeCheckoutPage() {
    const [loading, setLoading] = useState(false);

    const handleCheckout = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/stripe/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    priceId: 'price_1Qx8vO2f6A2JvTu...', // 請替換為您的 Stripe Price ID
                    userId: 'test_user_001',
                    successUrl: window.location.origin + '/settings/billing?success=true',
                    cancelUrl: window.location.origin + '/settings/billing?canceled=true',
                }),
            });

            const data = await response.json();

            if (data.url) {
                // 直接跳轉到 Stripe 託管的結帳頁面
                window.location.href = data.url;
            } else {
                throw new Error(data.error || 'Failed to get checkout URL');
            }
        } catch (error) {
            console.error('Stripe Checkout failed:', error);
            alert('Stripe 結帳請求失敗');
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
            <div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-xl p-8">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                        <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M13.911 8.03c0-1.168-1.554-1.636-2.5-1.636-1.527 0-3.322.61-3.322 2.3 0 2.27 3.1 1.9 3.1 2.872 0 .42-.366.57-.9.57-1-.03-2.312-.47-2.312-1.3l-2.433.1c.1 2.1 2.405 2.8 4.7 2.8 1.487 0 3.395-.515 3.395-2.227 0-2.365-3.136-2.013-3.136-3.007 0-.295.27-.515.86-.515 1 0 1.95.3 1.95 1.05zM22.016 12c0 5.514-4.486 10-10 10s-10-4.486-10-10 4.486-10 10-10 10 4.486 10 10zm-2 0c0-4.411-3.589-8-8-8s-8 3.589-8 8 3.589 8 8 8 8-3.589 8-8z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Stripe 訂閱測試</h1>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">點擊按鈕跳轉至 Stripe 官方支付頁面</p>
                </div>

                <div className="space-y-6">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-4">
                        <h3 className="text-blue-800 dark:text-blue-300 font-bold mb-2">運作機制：</h3>
                        <ol className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-decimal list-inside">
                            <li>前端呼叫 <code>/api/stripe/checkout</code></li>
                            <li>後端向 Stripe API 建立 Checkout Session</li>
                            <li>Stripe 回傳一個唯一的 <code>url</code></li>
                            <li>前端執行 <code>window.location.href = url</code></li>
                        </ol>
                    </div>

                    <button
                        onClick={handleCheckout}
                        disabled={loading}
                        className="w-full bg-[#635bff] hover:bg-[#534acc] text-white font-bold py-4 px-6 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
                    >
                        {loading ? '處理中...' : '前往 Stripe 進行訂閱'}
                    </button>

                    <p className="text-center text-xs text-gray-400">
                        這是一個示範頁面，實際應用時請確保已設定正確的 Price ID。
                    </p>
                </div>
            </div>
        </div>
    );
}
