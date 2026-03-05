'use client';

import React from 'react';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { DailyReportApp } from '@/components/DailyReportApp';

export default function DailyReportPage() {
    return (
        <div className="flex flex-col min-h-screen relative p-4 lg:p-8 bg-gray-50 dark:bg-gray-950">
            <PageBreadcrumb />

            <div className="mt-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">AI 每日報告</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                        自動分析 EdTech 趨勢及平台風險的智慧助理
                    </p>
                </div>

                <DailyReportApp />
            </div>
        </div>
    );
}
