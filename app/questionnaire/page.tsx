"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LineLoginButton from '@/components/LineLoginButton';
import { useT } from '@/components/IntlProvider';

interface SessionProfile {
  id: string;
  nickname: string;
  displayName: string;
  pictureUrl: string | null;
  role: string;
}

export default function QuestionnaireLandingPage() {
  const t = useT();
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
          <h1 className="text-2xl font-bold text-gray-800">{t('questionnaire_landing_title')}</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            {t('questionnaire_landing_desc')}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">{t('questionnaire_covers_title')}</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {[
              ['📚', 'questionnaire_covers_subject'],
              ['🎯', 'questionnaire_covers_goal'],
              ['🕐', 'questionnaire_covers_time'],
              ['💰', 'questionnaire_covers_budget'],
            ].map(([emoji, key]) => (
              <li key={key} className="flex items-center gap-2">
                <span>{emoji}</span>
                <span>{t(key)}</span>
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
                  <span>{t('questionnaire_signed_in_as', { name: profile.displayName || profile.nickname })}</span>
                </div>
                <Link
                  href="/questionnaire/learning"
                  className="block text-center bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-base"
                >
                  {t('questionnaire_start')}
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 text-center">
                  {t('questionnaire_login_hint')}
                </p>
                <LineLoginButton returnTo="/questionnaire" className="w-full justify-center text-base py-3" />
                <p className="text-xs text-gray-400 text-center">
                  {t('questionnaire_or')}{' '}
                  <Link href="/questionnaire/learning" className="underline text-gray-500">
                    {t('questionnaire_skip_login')}
                  </Link>
                  {' '}{t('questionnaire_not_saved')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
