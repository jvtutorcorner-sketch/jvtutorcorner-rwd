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
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">自動化分析與排程</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                        管理您的自動化工作流程、智慧報表與數據分析引擎
                    </p>
                </div>

                <DailyReportApp />
            </div>
        </div>
    );
}
