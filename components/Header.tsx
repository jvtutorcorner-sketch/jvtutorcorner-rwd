"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getStoredUser, clearStoredUser, type StoredUser } from '@/lib/mockAuth';
import { useRouter, usePathname } from 'next/navigation';
import { LanguageSwitcher } from './LanguageSwitcher';
import NavLink from './NavLink';
import { useT } from './IntlProvider';

export default function Header() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [adminSettings, setAdminSettings] = useState<any | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const hideHeader = typeof pathname === 'string' && pathname.startsWith('/classroom');

  const MENU_ITEMS = [
    { href: '/teachers', titleKey: 'menu_teachers_title', labelKey: 'menu_teachers', defaultLabel: '專業師資' },
    { href: '/pricing', titleKey: 'menu_pricing_title', labelKey: 'menu_pricing', defaultLabel: '方案與價格' },
    { href: '/courses', titleKey: 'menu_courses_title', labelKey: 'menu_courses', defaultLabel: '課程總覽' },
    { href: '/testimony', titleKey: 'menu_testimony_title', labelKey: 'menu_testimony', defaultLabel: '學員見證' },
    { href: '/about', titleKey: 'menu_about_title', labelKey: 'menu_about', defaultLabel: '關於我們' },
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

  const t = useT();

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

  // Note: viewport show/hide handled in CSS to avoid hydration flashes

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
    alert(t('alert_logged_out'));
  }

  function handleLogin() {
    router.push('/login');
  }

  return (
    <header className="site-header" style={hideHeader ? { display: 'none' } : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
      </div>

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
              const label = visEntry?.label || t((item as any).labelKey) || item.defaultLabel;
              return (
                <li key={item.href}><NavLink href={item.href} title={t((item as any).titleKey)}>{label}</NavLink></li>
              );
            })
          }
        </ul>

        {hydrated && user ? (
          <ul className="account-nav-left">
            <li><NavLink href="/orders" title={t('menu_teachers_title') /* keep title generic */}>{t('orders_my_orders')}</NavLink></li>
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
                                  { href: '/admin/orders', roleRequired: 'admin', labelKey: 'admin_orders' },
                                  { href: '/admin/carousel', roleRequired: 'admin', labelKey: 'admin_carousel' },
                                  { href: '/admin/settings', roleRequired: 'admin', labelKey: 'site_settings' },
                                  { href: '/my-courses', roleRequired: 'teacher', labelKey: 'my_courses' },
                                  { href: '/calendar', roleRequired: 'user', labelKey: 'calendar_label' },
                                  { href: '/settings', roleRequired: 'user', labelKey: 'settings_label' },
                                ].map((item) => {
                                  // role gating
                                  if (item.roleRequired === 'admin' && user?.role !== 'admin') return null;
                                  if (item.roleRequired === 'teacher' && user?.role !== 'teacher') return null;
                                  // determine dropdown visibility from admin settings
                                  const pageConfig = adminSettings?.pageConfigs?.find((pc: any) => pc.path === item.href);
                                  const permission = pageConfig?.permissions?.find((p: any) => p.roleId === user?.role);
                                  const visible = permission?.dropdownVisible !== false; // default to true if not set
                                  if (!visible) return null;
                                  const label = pageConfig?.label || t((item as any).labelKey);
                                  return (
                                    <li key={item.href}>
                                      <span role="menuitem" tabIndex={0} className="menu-link" onClick={() => { setMenuOpen(false); router.push(item.href); }}>{label}</span>
                                    </li>
                                  );
                                })
                              }
                              <li style={{ borderTop: '1px solid #f3f4f6', marginTop: 8, paddingTop: 8 }}>
                                <button onClick={() => { setMenuOpen(false); handleLogout(); }} className="menu-logout" style={{ width: '100%' }}>{t('logout')}</button>
                              </li>
                            </ul>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <button type="button" onClick={handleLogin} className="menu-login-btn">{t('login')}</button>
                  )
                ) : null}
                {hydrated ? (
                  <span
                    className={`menu-status ${user ? 'menu-status--online' : 'menu-status--offline'}`}
                    aria-live="polite"
                  >
                    {user ? t('status_logged_in') : t('status_logged_out')}
                  </span>
                ) : null}
              </li>
            </ul>
            </div>
            </nav>

              {mobileMenuOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            className="mobile-menu-overlay"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}
          >
            <div style={{ width: 280, background: '#fff', padding: 16, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>{t('menu_label')}</div>
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
                  const label = visEntry?.label || t((item as any).labelKey) || item.defaultLabel;
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
                      <button onClick={() => { setMobileMenuOpen(false); router.push('/orders'); }} style={{ padding: '8px 12px' }}>{t('orders_my_orders')}</button>
                      <button onClick={() => { setMobileMenuOpen(false); handleLogout(); }} style={{ padding: '8px 12px' }}>{t('logout')}</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button onClick={() => { setMobileMenuOpen(false); handleLogin(); }} style={{ padding: '8px 12px' }}>{t('login')}</button>
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
