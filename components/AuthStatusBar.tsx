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
    alert('已登出測試帳號。');
  };

  if (!user) {
    // 尚未登入 → 顯示登入按鈕
    return (
      <div className="tag" style={{ marginBottom: '1rem' }}>
        尚未登入。
        <Link href="/login" className="card-button secondary" style={{ marginLeft: 8 }}>
          前往登入
        </Link>
      </div>
    );
  }

  // 已登入 → 顯示帳號資訊 + 登出按鈕
  return (
    <div className="tag" style={{ marginBottom: '1rem' }}>
      目前以 <strong>{user.email}</strong> 登入，
      方案：<strong>{PLAN_LABELS[user.plan]}</strong>
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
        查看方案 /pricing
      </Link>
    </div>
  );
}
