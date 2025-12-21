"use client";

import React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';

export default function WaitClient() {
  const params = useSearchParams();
  const router = useRouter();
  const courseId = params?.get('courseId') || '';

  const handleEnter = () => {
    const user = getStoredUser();
    const roleParam = user?.role ? `&role=${encodeURIComponent(user.role)}` : '';
    router.push(`/classroom?courseId=${encodeURIComponent(courseId)}${roleParam}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-xl w-full bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-semibold mb-2">教室等待頁</h1>
        <p className="text-sm text-gray-600 mb-4">正在為課程準備教室，請稍候。課程：{courseId || '未知'}</p>

        <div className="space-y-3">
          <button
            className="w-full inline-flex items-center justify-center px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium"
            onClick={handleEnter}
          >
            直接進入教室（若已準備）
          </button>

          <button
            className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            onClick={() => router.back()}
          >
            返回
          </button>
        </div>
      </div>
    </div>
  );
}
