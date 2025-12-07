"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getStoredUser, clearStoredUser, type StoredUser } from '@/lib/mockAuth';
import { useRouter, usePathname } from 'next/navigation';
import { LanguageSwitcher } from './LanguageSwitcher';
import NavLink from './NavLink';

export default function Header() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Fallback: mark anchors in .main-nav as active based on pathname
  useEffect(() => {
    if (typeof window === 'undefined' || !pathname) return;
    const timer = setTimeout(() => {
      const nav = document.querySelector('.main-nav');
      if (!nav) return;
      const anchors = nav.querySelectorAll('a');
      anchors.forEach((a) => {
        const href = a.getAttribute('href') || '';
        const isActive = pathname === href || (href !== '/' && pathname.startsWith(href + '/'));
        a.classList.toggle('active', isActive);
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [pathname]);

  function isActive(path: string) {
    if (!pathname) return false;
    // consider subpaths as active (e.g. /courses/123)
    return pathname === path || pathname.startsWith(path + '/') || pathname.startsWith(path + '?') || pathname.startsWith(path + '#');
  }

  useEffect(() => {
    // mark hydrated then read stored user to avoid SSR -> CSR flash
    setHydrated(true);
    setUser(getStoredUser());
  }, []);

  // Listen for auth changes triggered elsewhere in the app (same-tab dispatch)
  useEffect(() => {
    function onAuthChange() {
      setUser(getStoredUser());
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('tutor:auth-changed', onAuthChange);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('tutor:auth-changed', onAuthChange);
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

  function handleLogin() {
    router.push('/login');
  }

  return (
    <header className="site-header">
      <div className="logo">Tutor Corner</div>

      <nav id="menu" className="menu main-nav" style={{ boxShadow: 'none' }} aria-label="主選單">
          <ul className="main-nav-left">
          <li><NavLink href="/" title="首頁 - 回到網站首頁">首頁</NavLink></li>
          <li><NavLink href="/teachers" title="專業師資 - 嚴選全球優質師資">專業師資</NavLink></li>
          <li><NavLink href="/pricing" title="方案與價格 - 定價與方案說明">方案與價格</NavLink></li>
          <li><NavLink href="/courses" title="課程總覽 - 多國語種課程總覽">課程總覽</NavLink></li>
          <li><NavLink href="/testimony" title="學員見證 - 使用者真實學習心得">學員見證</NavLink></li>
          <li><NavLink href="/about" title="關於我們 - 認識 Tutor Corner 的教育使命">關於我們</NavLink></li>
        </ul>

        {hydrated && user ? (
          <ul className="account-nav-left">
            <li><NavLink href="/orders" title="訂單紀錄 - 檢視你的購買紀錄">我的訂單</NavLink></li>
            <li><NavLink href="/enrollments" title="報名紀錄 - 檢視你的課程報名">我的報名</NavLink></li>
          </ul>
        ) : null}

        <div className="main-nav-right">
          <ul>
            <li className="main-nav-right-item">
              {hydrated ? (
                user ? (
                  <>
                    <span className="menu-user">{user.email}</span>
                    <button type="button" onClick={handleLogout} className="menu-login-btn">登出</button>
                  </>
                ) : (
                  <button type="button" onClick={handleLogin} className="menu-login-btn">登入</button>
                )
              ) : null}
              {hydrated ? (
                <span
                  className={`menu-status ${user ? 'menu-status--online' : 'menu-status--offline'}`}
                  aria-live="polite"
                >
                  {user ? '已登入' : '尚未登入'}
                </span>
              ) : null}
            </li>
          </ul>
        </div>
      </nav>

      <div style={{ marginLeft: 12 }}>
        <LanguageSwitcher />
      </div>

    </header>
  );
}
