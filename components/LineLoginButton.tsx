"use client";

import { useEffect, useState } from 'react';

interface LineProfile {
  id: string;
  nickname: string;
  displayName: string;
  pictureUrl: string | null;
  lineUid: string | null;
  role: string;
  plan: string;
  email: string;
}

interface LineLoginButtonProps {
  returnTo?: string;
  className?: string;
  onLogin?: (profile: LineProfile) => void;
}

export default function LineLoginButton({ returnTo, className, onLogin }: LineLoginButtonProps) {
  const [profile, setProfile] = useState<LineProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/line-login/session')
      .then(r => r.json())
      .then(data => {
        if (data.authenticated && data.isLineUser && data.profile) {
          setProfile(data.profile);
          onLogin?.(data.profile);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  if (profile) {
    return (
      <div className={`flex items-center gap-2 ${className || ''}`}>
        {profile.pictureUrl && (
          <img src={profile.pictureUrl} alt={profile.displayName} className="w-8 h-8 rounded-full" />
        )}
        <span className="text-sm font-medium">{profile.displayName}</span>
        <button
          onClick={async () => {
            await fetch('/api/auth/line-login/session', { method: 'DELETE' });
            setProfile(null);
            window.location.reload();
          }}
          className="text-xs text-gray-500 underline ml-1"
        >
          登出
        </button>
      </div>
    );
  }

  const href = `/api/auth/line-login/start?returnTo=${encodeURIComponent(returnTo || (typeof window !== 'undefined' ? window.location.pathname : '/'))}`;

  return (
    <a
      href={href}
      className={`inline-flex items-center gap-2 bg-[#06C755] hover:bg-[#05b34d] text-white font-medium px-4 py-2 rounded-lg transition-colors ${className || ''}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 5.92 2 10.72c0 3.24 2.04 6.08 5.12 7.76-.16.56-.52 2-.6 2.32-.1.4.14.4.3.28.12-.08 1.96-1.32 2.76-1.84.76.12 1.56.18 2.42.18 5.52 0 10-3.92 10-8.72S17.52 2 12 2z"/>
      </svg>
      使用 LINE 登入
    </a>
  );
}
