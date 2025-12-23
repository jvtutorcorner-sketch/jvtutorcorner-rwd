// components/AuthStatusBar.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getStoredUser,
  clearStoredUser,
  PLAN_LABELS,
  type StoredUser,
} from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';

export function AuthStatusBar() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const router = useRouter();

  useEffect(() => {
    // 一進頁面就從 localStorage 抓目前登入狀態
    const u = getStoredUser();
    setUser(u);
  }, []);

  const handleLogout = () => {
    clearStoredUser();
    setUser(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('tutor:auth-changed'));
    }
    router.refresh();
    alert(t('alert_logged_out'));
  };

  const t = useT();

  if (!user) {
    // 尚未登入 → 顯示登入按鈕
    return (
      <div className="tag" style={{ marginBottom: '1rem' }}>
        {t('auth_not_logged_in')}
        <Link href="/login" className="card-button secondary" style={{ marginLeft: 8 }}>
          {t('auth_go_to_login')}
        </Link>
      </div>
    );
  }

  // 已登入 → 顯示帳號資訊 + 登出按鈕
  return (
    <div className="tag" style={{ marginBottom: '1rem' }}>
      {user.lastName ? <div style={{ fontWeight: 700 }}>{user.lastName}</div> : null}
      {t('auth_status_prefix')} <strong>{user.email}</strong> {t('auth_status_suffix')}
      {t('plan_label')}<strong>{PLAN_LABELS[user.plan]}</strong>
      <button
        className="card-button secondary"
        style={{ marginLeft: 8 }}
        onClick={handleLogout}
      >
        登出
      </button>
      <Link
        href="/pricing"
        className="card-button secondary"
        style={{ marginLeft: 8 }}
      >
        {t('view_pricing')}
      </Link>
    </div>
  );
}
