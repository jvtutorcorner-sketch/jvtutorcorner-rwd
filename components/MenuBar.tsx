"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getStoredUser, clearStoredUser, type StoredUser } from '@/lib/mockAuth';
import { useRouter } from 'next/navigation';

export default function MenuBar() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const router = useRouter();

  useEffect(() => {
    const sync = () => setUser(getStoredUser());
    // initial
    sync();
    // listen for auth changes triggered elsewhere
    if (typeof window !== 'undefined') {
      window.addEventListener('tutor:auth-changed', sync);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('tutor:auth-changed', sync);
      }
    };
  }, []);

  function handleLogout() {
    clearStoredUser();
    setUser(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('tutor:auth-changed'));
    }
    router.refresh();
    alert('已登出測試帳號。');
  }

  return (
    <nav className="homepage-menu" aria-label="主選單">
      <ul className="menu-left">
        <li><Link href="/teachers">師資</Link></li>
        {user?.role === 'admin' && (
          <li><Link href="/admin/orders">管理後台</Link></li>
        )}
        <li><Link href="/courses">課程總覽</Link></li>
        <li><Link href="/about">關於我們</Link></li>
      </ul>

      <div className="menu-right">
        <ul>
          {user ? (
            <>
              <li className="menu-user">{user.email}</li>
              <li>
                <button onClick={handleLogout} className="menu-logout">登出</button>
              </li>
            </>
          ) : (
            <li>
              <Link href="/login" className="menu-login">登入</Link>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
