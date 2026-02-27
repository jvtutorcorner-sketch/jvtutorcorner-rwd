"use client";

import React from 'react';
import Link from 'next/link';
import AppAccessSettings from '../components/AppAccessSettings';

export default function AppsPagePermissionsPage() {
    return (
        <div className="page p-6 max-w-6xl mx-auto">
            <header className="flex justify-between items-center mb-8 border-b border-gray-200 dark:border-gray-700 pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">應用程式存取權限</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">獨立管理各角色對應用程式與金流服務的存取權限</p>
                </div>
                <Link href="/apps" className="text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold py-2 px-4 rounded-lg transition-colors flex items-center shadow-sm">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    返回前頁
                </Link>
            </header>

            <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
                <AppAccessSettings />
            </section>
        </div>
    );
}
