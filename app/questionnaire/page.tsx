"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LineLoginButton from '@/components/LineLoginButton';

interface SessionProfile {
  id: string;
  nickname: string;
  displayName: string;
  pictureUrl: string | null;
  role: string;
}

export default function QuestionnaireLandingPage() {
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/line-login/session')
      .then(r => r.json())
      .then(data => {
        if (data.authenticated && data.profile) setProfile(data.profile);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="text-5xl">📋</div>
          <h1 className="text-2xl font-bold text-gray-800">學習需求評估問卷</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            填寫約 3 分鐘，幫助我們了解您的學習需求，精準媒合最適合的家教老師。
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">問卷內容涵蓋</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {[
              ['📚', '科目需求與難易度評估'],
              ['🎯', '學習目標與考試方向'],
              ['🕐', '可上課時間與頻率'],
              ['💰', '預算與老師偏好'],
            ].map(([emoji, text]) => (
              <li key={text as string} className="flex items-center gap-2">
                <span>{emoji}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {!loading && (
          <div className="space-y-4">
            {profile ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
                  {profile.pictureUrl && (
                    <img src={profile.pictureUrl} alt={profile.displayName} className="w-8 h-8 rounded-full" />
                  )}
                  <span>已登入：{profile.displayName || profile.nickname}</span>
                </div>
                <Link
                  href="/questionnaire/learning"
                  className="block text-center bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-base"
                >
                  開始填寫問卷 →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 text-center">
                  請先使用 LINE 登入，以便接收媒合通知及儲存問卷結果。
                </p>
                <LineLoginButton returnTo="/questionnaire" className="w-full justify-center text-base py-3" />
                <p className="text-xs text-gray-400 text-center">
                  或{' '}
                  <Link href="/questionnaire/learning" className="underline text-gray-500">
                    不登入直接填寫
                  </Link>
                  （結果不會儲存）
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
