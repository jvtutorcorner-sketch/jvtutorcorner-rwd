'use client';
import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function EcpaySuccessPage() {
    const router = useRouter();

    useEffect(() => {
        // Auto-redirect to pricing page after 2s to show updated points balance
        const timer = setTimeout(() => {
            router.push('/pricing?payment=success');
        }, 2000);
        return () => clearTimeout(timer);
    }, [router]);

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
                    購買成功！
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                    感謝您的購買！點數已更新至您的帳戶。
                </p>
                <p className="text-sm text-gray-400 mb-8">正在自動跳轉到方案頁面...</p>

                <Link
                    href="/pricing?payment=success"
                    className="inline-block w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                >
                    立即前往查看點數
                </Link>
            </div>
        </div>
    );
}
