"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getStoredUser, clearStoredUser, type StoredUser } from '@/lib/mockAuth';
import { useRouter } from 'next/navigation';
import { useT } from './IntlProvider';
import Button from './UI/Button';

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
    alert(t('alert_logged_out'));
  }

  const t = useT();

  return (
    <nav className="homepage-menu" aria-label={t('menu_label')}>
        <ul className="menu-left">
        <li><Link href="/teachers">{t('menu_teachers')}</Link></li>
        {user?.role === 'admin' && (
          <li><Link href="/admin/orders">{t('admin_orders')}</Link></li>
        )}
        <li><Link href="/courses">{t('menu_courses')}</Link></li>
        <li><Link href="/about">{t('menu_about')}</Link></li>
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
                  <Button
                    aria-haspopup="true"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((s) => !s)}
                    variant="ghost"
                    className="menu-avatar-button w-10 h-10 rounded-full inline-flex items-center justify-center border border-gray-200"
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
                  </Button>
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
                            <Link href="/admin/orders" onClick={() => setMenuOpen(false)} className="menu-link">{t('admin_orders')}</Link>
                          </li>
                        )}
                        {user?.role === 'admin' && (
                          <li>
                            <Link href="/admin/settings" onClick={() => setMenuOpen(false)} className="menu-link">{t('site_settings')}</Link>
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
                              {t('my_courses')}
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
                              {t('settings_label')}
                            </span>
                          </li>
                        )}
                        <li>
                            {/* Personalize now accessed via /settings */}
                        </li>
                        <li>
                          <Link href="/settings" onClick={() => setMenuOpen(false)} className="menu-link">{t('settings_label')}</Link>
                        </li>
                        <li style={{ borderTop: '1px solid #f3f4f6', marginTop: 8, paddingTop: 8 }}>
                          <Button variant="outline" className="w-full text-left" onClick={() => { setMenuOpen(false); handleLogout(); }}>{t('logout')}</Button>
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
            <Button variant="outline" onClick={handleLogout}>{t('logout')}</Button>
          ) : (
            <Link href="/login" className="menu-login">{t('login')}</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
