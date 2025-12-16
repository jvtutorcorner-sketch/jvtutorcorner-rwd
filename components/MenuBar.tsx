"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    if (typeof window !== 'undefined') {
      document.addEventListener('mousedown', onDocClick);
    }
    return () => {
      if (typeof window !== 'undefined') {
        document.removeEventListener('mousedown', onDocClick);
      }
    };
  }, []);

  function handleLogout() {
    clearStoredUser();
    setUser(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('tutor:auth-changed'));
    }
    // navigate to homepage after logout
    router.push('/');
    alert('已登出測試帳號。');
  }

  return (
    <nav className="homepage-menu" aria-label="主選單">
        <ul className="menu-left">
        <li><Link href="/teachers">師資</Link></li>
        {user?.role === 'admin' && (
          <li><Link href="/admin/orders">訂單管理</Link></li>
        )}
        <li><Link href="/courses">課程總覽</Link></li>
        <li><Link href="/about">關於我們</Link></li>
      </ul>

      <div className="menu-right">
        <ul>
          {user ? (
            <>
              <li className="menu-user">
                {user.lastName ? <div className="menu-user-last">{user.lastName}</div> : null}
                <div className="menu-user-email">{user.email}</div>
              </li>
              <li>
                <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    aria-haspopup="true"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((s) => !s)}
                    className="menu-avatar-button"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      border: '1px solid #ddd',
                      background: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {(() => {
                        if (!user) return 'U';
                        const a = (user.firstName || '').trim();
                        const b = (user.lastName || '').trim();
                        if (a && b) return `${a[0].toUpperCase()}${b[0].toUpperCase()}`;
                        if (a) return a[0].toUpperCase();
                        if (b) return b[0].toUpperCase();
                        return user.email ? user.email[0].toUpperCase() : 'U';
                      })()}
                    </span>
                  </button>
                  {menuOpen && (
                    <div
                      role="menu"
                      aria-label="帳戶選單"
                      className="avatar-dropdown"
                      style={{
                        position: 'absolute',
                        right: 0,
                        marginTop: 8,
                        minWidth: 180,
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
                        borderRadius: 8,
                        zIndex: 50,
                        overflow: 'hidden',
                      }}
                    >
                      <ul style={{ listStyle: 'none', margin: 0, padding: 8 }}>
                        {user?.role === 'admin' && (
                          <li>
                            <Link href="/admin/orders" onClick={() => setMenuOpen(false)} className="menu-link">訂單管理</Link>
                          </li>
                        )}
                        {user?.role === 'admin' && (
                          <li>
                            <Link href="/admin/settings" onClick={() => setMenuOpen(false)} className="menu-link">網站設定</Link>
                          </li>
                        )}
                        {user?.role === 'teacher' ? (
                          <li>
                            <span
                              role="menuitem"
                              tabIndex={0}
                              className="menu-link"
                              onClick={() => { setMenuOpen(false); router.push('/my-courses'); }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setMenuOpen(false); router.push('/my-courses'); } }}
                            >
                              我的課程
                            </span>
                          </li>
                        ) : (
                          <li>
                            <span
                              role="menuitem"
                              tabIndex={0}
                              className="menu-link"
                              onClick={() => { setMenuOpen(false); router.push('/settings'); }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setMenuOpen(false); router.push('/settings'); } }}
                            >
                              設定
                            </span>
                          </li>
                        )}
                        <li>
                            {/* Personalize now accessed via /settings */}
                        </li>
                        <li>
                          <Link href="/settings" onClick={() => setMenuOpen(false)} className="menu-link">設定</Link>
                        </li>
                        <li style={{ borderTop: '1px solid #f3f4f6', marginTop: 8, paddingTop: 8 }}>
                          <button onClick={() => { setMenuOpen(false); handleLogout(); }} className="menu-logout" style={{ width: '100%' }}>登出</button>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              </li>
            </>
          ) : null}
        </ul>
        <div style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          {user ? (
            <button onClick={handleLogout} className="menu-logout">登出</button>
          ) : (
            <Link href="/login" className="menu-login">登入</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
