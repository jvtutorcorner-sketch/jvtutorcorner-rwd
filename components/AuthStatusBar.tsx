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
import Button from './UI/Button';

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
        <Link href="/login" style={{ marginLeft: 8 }}>
          <Button variant="primary">{t('auth_go_to_login')}</Button>
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
      <Button variant="outline" className="ml-2" onClick={handleLogout}>登出</Button>
      <Link href="/pricing" style={{ marginLeft: 8 }}>
        <Button variant="secondary">{t('view_pricing')}</Button>
      </Link>
    </div>
  );
}
