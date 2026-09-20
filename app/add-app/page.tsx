'use client';

// app/add-app/page.tsx
// ⚠️ 相容 redirect。新增連線已改到 /apps/connections/new（schema 驅動的統一表單）。
// 舊連結（?type=payment / ?provider=STRIPE / ?channel=LINE）在此映射並轉址。

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const CATEGORY_WORDS = new Set(['payment', 'ai', 'email', 'database', 'channel']);

function Redirector() {
    const router = useRouter();
    const params = useSearchParams();

    useEffect(() => {
        const channel = params.get('channel');
        const provider = params.get('provider');
        const type = params.get('type');
        const skillId = params.get('skillId') || params.get('skill');

        // 具體服務類型 → 直接開新增頁
        const concrete = (channel || provider || (type && !CATEGORY_WORDS.has(type) ? type : ''))?.toUpperCase();
        if (concrete) {
            const qs = new URLSearchParams({ type: concrete });
            if (skillId) qs.set('skillId', skillId);
            router.replace(`/apps/connections/new?${qs}`);
            return;
        }

        // 只有分類 → 回服務目錄
        router.replace('/apps?tab=catalog');
    }, [params, router]);

    return <div className="min-h-screen flex items-center justify-center text-gray-500">正在前往新版設定頁…</div>;
}

export default function AddAppPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">載入中…</div>}>
            <Redirector />
        </Suspense>
    );
}
