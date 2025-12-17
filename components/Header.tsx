"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getStoredUser, clearStoredUser, type StoredUser } from '@/lib/mockAuth';
import { useRouter, usePathname } from 'next/navigation';
import { LanguageSwitcher } from './LanguageSwitcher';
import NavLink from './NavLink';

export default function Header() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [adminSettings, setAdminSettings] = useState<any | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const MENU_ITEMS = [
    { href: '/teachers', title: '專業師資 - 嚴選全球優質師資', defaultLabel: '專業師資' },
    { href: '/pricing', title: '方案與價格 - 定價與方案說明', defaultLabel: '方案與價格' },
    { href: '/courses', title: '課程總覽 - 多國語種課程總覽', defaultLabel: '課程總覽' },
    { href: '/testimony', title: '學員見證 - 使用者真實學習心得', defaultLabel: '學員見證' },
    { href: '/about', title: '關於我們 - 認識 Tutor Corner 的教育使命', defaultLabel: '關於我們' },
  ];

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
    (async () => {
      try {
        const res = await fetch('/api/admin/settings');
        const data = await res.json();
        if (res.ok && data?.ok) setAdminSettings(data.settings || null);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  // detect mobile viewport for toggling compact menu
  useEffect(() => {
    function update() {
      if (typeof window === 'undefined') return;
      setIsMobile(window.innerWidth <= 768);
      if (window.innerWidth > 768) setMobileMenuOpen(false);
    }
    update();
    if (typeof window !== 'undefined') window.addEventListener('resize', update);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('resize', update); };
  }, []);

  useEffect(() => {
    // listen for external changes to admin settings (e.g. saved from admin UI)
    async function onSettingsChanged() {
      try {
        const res = await fetch('/api/admin/settings');
        const data = await res.json();
        if (res.ok && data?.ok) setAdminSettings(data.settings || null);
      } catch (e) {
        // ignore
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('tutor:admin-settings-changed', onSettingsChanged);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('tutor:admin-settings-changed', onSettingsChanged);
      }
    };
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

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    if (typeof window !== 'undefined') document.addEventListener('mousedown', onDocClick);
    return () => { if (typeof window !== 'undefined') document.removeEventListener('mousedown', onDocClick); };
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

  function handleLogin() {
    router.push('/login');
  }

  return (
    <header className="site-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isMobile ? (
          <>
            <button
              aria-label="開啟選單"
              onClick={() => setMobileMenuOpen((s) => !s)}
              className="menu-icon-btn"
              style={{ background: 'transparent', border: 0, padding: 8, cursor: 'pointer' }}
            >
              <span style={{ display: 'block', width: 20, height: 2, background: '#111', marginBottom: 4 }} />
              <span style={{ display: 'block', width: 16, height: 2, background: '#111', marginBottom: 4 }} />
              <span style={{ display: 'block', width: 12, height: 2, background: '#111' }} />
            </button>
            <Link href="/" className="logo">Tutor Corner</Link>
          </>
        ) : (
          <Link href="/" className="logo">Tutor Corner</Link>
        )}
      </div>

        {!isMobile ? (
          <nav id="menu" className="menu main-nav" style={{ boxShadow: 'none' }} aria-label="主選單">
          <ul className="main-nav-left">
          {
            // build menu items and apply adminSettings.pageVisibility.menu rules when available
            MENU_ITEMS.map((item) => {
              const visEntry = adminSettings?.pageVisibility?.[item.href];
              // determine visibility based on menu flags: if any flags exist, prefer explicit flag for role; undefined means visible
                let visible = true;
                if (visEntry?.menu && (visEntry.menu.admin !== undefined || visEntry.menu.teacher !== undefined || visEntry.menu.user !== undefined)) {
                  const roleKey = user?.role === 'admin' ? 'admin' : user?.role === 'teacher' ? 'teacher' : 'user';
                  const roleFlag = visEntry.menu?.[roleKey];
                  visible = roleFlag === undefined ? true : !!roleFlag;
              }
              if (!visible) return null;
              const label = visEntry?.label || item.defaultLabel;
              return (
                <li key={item.href}><NavLink href={item.href} title={item.title}>{label}</NavLink></li>
              );
            })
          }
        </ul>

        {hydrated && user ? (
          <ul className="account-nav-left">
            <li><NavLink href="/orders" title="訂單紀錄 - 檢視你的購買紀錄">我的訂單</NavLink></li>
          </ul>
        ) : null}

        <div className="main-nav-right">
          <ul>
              <li className="main-nav-right-item">
                {hydrated ? (
                  user ? (
                    <>
                      <div className="menu-user" style={{ display: 'inline-block', marginRight: 8 }}>
                        {user.lastName ? <div className="menu-user-last">{user.lastName}</div> : null}
                        <div className="menu-user-email">{user.email}</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                          {(() => {
                            const r = user.role;
                            if (r === 'admin') return '管理者';
                            if (r === 'teacher') return '教師';
                            return '使用者';
                          })()}
                        </div>
                      </div>
                      <div ref={menuRef} style={{ display: 'inline-block', position: 'relative' }}>
                        <button
                          aria-haspopup="true"
                          aria-expanded={menuOpen}
                          onClick={() => setMenuOpen((s) => !s)}
                          className="menu-avatar-button"
                          style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #ddd', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                          <span style={{ fontWeight: 600 }}>
                            {(() => {
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
                          <div className="avatar-dropdown" style={{ position: 'absolute', right: 0, marginTop: 8, minWidth: 180, background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 6px 18px rgba(0,0,0,0.08)', borderRadius: 8, zIndex: 50 }}>
                            <ul style={{ listStyle: 'none', margin: 0, padding: 8 }}>
                              {
                                // build dropdown items and apply adminSettings.pageVisibility.dropdown rules
                                [
                                  { href: '/admin/orders', roleRequired: 'admin', label: '後台：訂單管理' },
                                  { href: '/admin/settings', roleRequired: 'admin', label: '網站設定' },
                                  { href: '/my-courses', roleRequired: 'teacher', label: '我的課程' },
                                  { href: '/settings', roleRequired: 'user', label: '設定' },
                                ].map((item) => {
                                  // role gating
                                  if (item.roleRequired === 'admin' && user?.role !== 'admin') return null;
                                  if (item.roleRequired === 'teacher' && user?.role !== 'teacher') return null;
                                  // determine dropdown visibility from admin settings
                                  const visEntry = adminSettings?.pageVisibility?.[item.href];
                                  let visible = true;
                                    if (visEntry?.dropdown && (visEntry.dropdown.admin !== undefined || visEntry.dropdown.teacher !== undefined || visEntry.dropdown.user !== undefined)) {
                                      const roleKey = user?.role === 'admin' ? 'admin' : user?.role === 'teacher' ? 'teacher' : 'user';
                                      const roleFlag = visEntry.dropdown?.[roleKey];
                                      visible = roleFlag === undefined ? true : !!roleFlag;
                                  }
                                  if (!visible) return null;
                                  const label = visEntry?.label || item.label;
                                  return (
                                    <li key={item.href}>
                                      <span role="menuitem" tabIndex={0} className="menu-link" onClick={() => { setMenuOpen(false); router.push(item.href); }}>{label}</span>
                                    </li>
                                  );
                                })
                              }
                              <li style={{ borderTop: '1px solid #f3f4f6', marginTop: 8, paddingTop: 8 }}>
                                <button onClick={() => { setMenuOpen(false); handleLogout(); }} className="menu-logout" style={{ width: '100%' }}>登出</button>
                              </li>
                            </ul>
                          </div>
                        )}
                      </div>
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
            ) : null}

        {isMobile && mobileMenuOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            className="mobile-menu-overlay"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}
          >
            <div style={{ width: 280, background: '#fff', padding: 16, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>選單</div>
                <button aria-label="關閉選單" onClick={() => setMobileMenuOpen(false)} style={{ border: 0, background: 'transparent', cursor: 'pointer' }}>✕</button>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {MENU_ITEMS.map((item) => {
                  const visEntry = adminSettings?.pageVisibility?.[item.href];
                  let visible = true;
                  if (visEntry?.menu && (visEntry.menu.admin !== undefined || visEntry.menu.teacher !== undefined || visEntry.menu.user !== undefined)) {
                    const roleKey = user?.role === 'admin' ? 'admin' : user?.role === 'teacher' ? 'teacher' : 'user';
                    const roleFlag = visEntry.menu?.[roleKey];
                    visible = roleFlag === undefined ? true : !!roleFlag;
                  }
                  if (!visible) return null;
                  const label = visEntry?.label || item.defaultLabel;
                  return (
                    <li key={item.href} style={{ marginBottom: 8 }}>
                      <a className="mobile-menu-link" href={item.href} onClick={() => setMobileMenuOpen(false)} style={{ color: '#111827', textDecoration: 'none' }}>{label}</a>
                    </li>
                  );
                })}
              </ul>

              <div style={{ borderTop: '1px solid #eee', marginTop: 12, paddingTop: 12 }}>
                {hydrated && user ? (
                  <div>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>{user.email}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setMobileMenuOpen(false); router.push('/orders'); }} style={{ padding: '8px 12px' }}>我的訂單</button>
                      <button onClick={() => { setMobileMenuOpen(false); handleLogout(); }} style={{ padding: '8px 12px' }}>登出</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button onClick={() => { setMobileMenuOpen(false); handleLogin(); }} style={{ padding: '8px 12px' }}>登入</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

      <div style={{ marginLeft: 12 }}>
        <LanguageSwitcher />
      </div>

    </header>
  );
}
