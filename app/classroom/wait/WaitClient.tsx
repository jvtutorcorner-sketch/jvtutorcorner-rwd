"use client";

import React from 'react';
import { useT } from '@/components/IntlProvider';
import { useSearchParams, useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/mockAuth';

export default function WaitClient() {
  const params = useSearchParams();
  const router = useRouter();
  const courseId = params?.get('courseId') || '';
  const t = useT();

  const handleEnter = () => {
    const user = getStoredUser();
    const roleParam = user?.role ? `&role=${encodeURIComponent(user.role)}` : '';
    router.push(`/classroom?courseId=${encodeURIComponent(courseId)}${roleParam}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-xl w-full bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-semibold mb-2">{t('wait.title')}</h1>
        <p className="text-sm text-gray-600 mb-4">{t('wait.prep_text')} {courseId || t('unknown')}</p>

        <div className="space-y-3">
          <button
            className="w-full inline-flex items-center justify-center px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium"
            onClick={handleEnter}
          >
            {t('wait.enter_now')}
          </button>

          <button
            className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            onClick={() => router.back()}
          >
            {t('back')}
          </button>
        </div>
      </div>
    </div>
  );
}
