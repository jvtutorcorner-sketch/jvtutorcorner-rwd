'use client';
import React, { useState } from 'react';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

export default function PayPalCheckoutPage() {
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Initial Options for PayPal SDK
    const initialOptions = {
        clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "test", // Fallback for dev
        currency: "USD",
        intent: "capture",
    };

    const createOrder = async () => {
        try {
            const res = await fetch('/api/paypal/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cart: [
                        { sku: "COURSE-001", quantity: 1 }
                    ]
                })
            });

            const data = await res.json();

            if (data.orderID) {
                return data.orderID;
            } else {
                throw new Error(data.error || 'Failed to create order');
            }
        } catch (err: any) {
            setError(err.message);
            throw err;
        }
    };

    const onApprove = async (data: any) => {
        try {
            const res = await fetch('/api/paypal/capture-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderID: data.orderID
                })
            });

            const details = await res.json();

            if (details.success) {
                setSuccess(true);
            } else {
                throw new Error(details.error || 'Transaction failed');
            }
        } catch (err: any) {
            setError(err.message);
        }
    };

    if (success) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
                <div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-xl p-8 text-center">
                    <div className="mb-6 flex justify-center">
                        <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center">
                            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        課程購買成功
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        感謝您的購買！您的課程權限已開通。
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
            <div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-xl p-8">
                <h2 className="text-xl font-bold text-center mb-6 text-gray-900 dark:text-white">
                    PayPal 結帳
                </h2>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                        {error}
                    </div>
                )}

                {process.env.NEXT_PUBLIC_PAYMENT_MOCK_MODE === 'true' ? (
                    <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg text-sm text-blue-800 mb-4">
                            <strong>模擬模式已開啟</strong><br />
                            由於 PayPal SDK 會驗證 Order ID，在模擬模式下我們改用測試按鈕。
                        </div>
                        <button
                            onClick={() => setSuccess(true)}
                            className="w-full bg-[#ffc439] hover:bg-[#f2ba36] text-black font-bold py-3 px-4 rounded-full flex items-center justify-center transition-colors shadow-sm"
                        >
                            <span className="mr-2 italic text-blue-800 text-lg">PayPal</span> 模擬結帳 (MOCK)
                        </button>
                    </div>
                ) : (
                    <PayPalScriptProvider options={initialOptions}>
                        <PayPalButtons
                            style={{ layout: "vertical" }}
                            createOrder={createOrder}
                            onApprove={onApprove}
                        />
                    </PayPalScriptProvider>
                )}
            </div>
        </div>
    );
}
