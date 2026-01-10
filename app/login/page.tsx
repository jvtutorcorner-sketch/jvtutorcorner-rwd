// app/login/page.tsx
'use client';

import { FormEvent, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MOCK_USERS,
  TEST_PASSWORD,
  PLAN_LABELS,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  StoredUser,
} from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(TEST_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);
  const [captchaValue, setCaptchaValue] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(
    typeof window !== 'undefined' ? getStoredUser() : null,
  );

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    (async () => {
      try {
        // Try server-side profiles first
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password, captchaToken, captchaValue }),
        });
        const data = await res.json();
        
        // If API succeeded, handle redirect
        if (res.ok && data?.ok) {
          const role = data.profile?.role as string | undefined;
          const plan = (data.profile?.plan as any) || 'basic';
          const user: StoredUser = {
            email: email.trim().toLowerCase(),
            plan,
            role: role === 'admin' ? 'admin' : (role === 'teacher' ? 'teacher' : 'user'),
            firstName: data.profile?.firstName,
            lastName: data.profile?.lastName,
          };
          // attach teacherId for teacher profiles so client can use it for permission checks
          if (role === 'teacher' && data.profile?.id) {
            (user as any).teacherId = String(data.profile.id);
          }
          setStoredUser(user);
          setCurrentUser(user);
          // set 30-minute session expiry (client-side)
          try {
            window.localStorage.setItem('tutor_session_expiry', String(Date.now() + 30 * 60 * 1000));
          } catch {}
          window.dispatchEvent(new Event('tutor:auth-changed'));
          if (role === 'admin') {
            alert(t('login_admin_success'));
            router.push('/');
            return;
          }
          alert(`${t('login_success')}\n${t('current_plan')}: ${PLAN_LABELS[user.plan]}\n${t('redirecting_home')}`);
          router.push('/');
          return;
        }

        // If API failed...
        if (!res.ok) {
          // If 401 (Unauthorized), it means captcha was good but user not in DB, so we continue to mock fallback
          if (res.status === 401) {
            // continue to mock users
            console.log('User not in profiles DB, trying mock users...');
          } else {
            // Other errors (like 400 Captcha error) should stop here and refresh captcha
            const msg = data?.message ? t(data.message) : t('login_error');
            setError(msg);
            await loadCaptcha();
            return;
          }
        }

        // Fallback to mock users
        const trimmedEmail = email.trim().toLowerCase();
        const userConfig = MOCK_USERS[trimmedEmail];
        if (!userConfig) {
          setError(t('login_account_not_found'));
          await loadCaptcha();
          return;
        }
        if (password !== TEST_PASSWORD) {
          setError(t('login_password_wrong'));
          await loadCaptcha();
          return;
        }
        const user: StoredUser = {
          email: trimmedEmail,
          plan: userConfig.plan,
          firstName: userConfig.firstName,
          lastName: userConfig.lastName,
        };
        // If the mock user entry includes a teacherId, attach it and mark role
        if ((userConfig as any).teacherId) {
          (user as any).teacherId = (userConfig as any).teacherId;
          (user as any).role = 'teacher';
        }
        setStoredUser(user);
        setCurrentUser(user);
        try {
          window.localStorage.setItem('tutor_session_expiry', String(Date.now() + 30 * 60 * 1000));
        } catch {}
        window.dispatchEvent(new Event('tutor:auth-changed'));
        alert(`${t('login_success')}\n${t('current_plan')}: ${PLAN_LABELS[user.plan]}(${t('test_account')})\n${t('redirecting_home')}`);
        router.push('/');
      } catch (err) {
        console.error(err);
        setError(t('login_error'));
      }
    })();
  };

  async function loadCaptcha() {
    try {
      setCaptchaLoading(true);
      const res = await fetch('/api/captcha');
      const data = await res.json();
      if (res.ok && data?.token && data?.image) {
        setCaptchaToken(data.token);
        setCaptchaImage(data.image);
        setCaptchaValue('');
      }
    } catch (e) {
      console.warn('captcha load failed', e);
    } finally {
      setCaptchaLoading(false);
    }
  }

  useEffect(() => {
    loadCaptcha();
  }, []);

  const handleLogout = () => {
    clearStoredUser();
    setCurrentUser(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('tutor:auth-changed'));
    }
    router.refresh();
    alert(t('logout_test_account'));
  };

  return (
    <div className="page">
      <header className="page-header">
      </header>

      {currentUser && (
        <section className="section">
          <div className="card">
            <h2>{t('login_status')}</h2>
            <p>
              {t('account')}: <strong>{currentUser.email}</strong>
              <br />
              {t('plan')}: <strong>{PLAN_LABELS[currentUser.plan]}</strong>
              {('role' in currentUser && (currentUser as any).role === 'admin') && (
                <>
                  <br />
                  <strong style={{ color: 'crimson' }}>Admin</strong>
                </>
              )}
            </p>
            <div className="card-actions">
              <button className="card-button" onClick={handleLogout}>
                {t('logout')}
              </button>
              <Link href="/pricing" className="card-button secondary">
                {t('go_pricing')}
              </Link>
              {('role' in currentUser && (currentUser as any).role === 'admin') && (
                <Link href="/admin/orders" className="card-button secondary">
                  {t('admin_orders')}
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="card">
          <h2>{t('login_heading')}</h2>
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                placeholder={t('email_placeholder')}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label htmlFor="password">{t('password')}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              {/* moved to the test accounts card */}
            </div>

            <div className="field">
              <label htmlFor="captcha">{t('captcha_label') || '驗證碼'}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {captchaImage ? (
                  <img src={captchaImage} alt="captcha" style={{ height: 48, border: '1px solid #ddd' }} />
                ) : (
                  <div style={{ width: 140, height: 48, background: '#f3f4f6' }} />
                )}
                <button type="button" className="card-button secondary" onClick={async () => await loadCaptcha()} disabled={captchaLoading}>
                  {t('captcha_refresh') || '重新取得'}
                </button>
              </div>
              <input
                id="captcha"
                type="text"
                value={captchaValue}
                placeholder={t('captcha_placeholder') || ''}
                onChange={(e) => setCaptchaValue(e.target.value)}
                autoComplete="off"
              />
            </div>

            {error && <p className="form-error">{error}</p>}

            <div className="modal-actions">
              <button type="submit" className="modal-button primary" disabled={captchaLoading || !captchaToken}>
                {t('login')}
              </button>
              <Link href="/login/register" className="modal-button secondary">
                {t('create_account')}
              </Link>
            </div>
          </form>
        </div>
      </section>

      <section className="section">
        <div className="card">
          <h2>{t('test_accounts')}</h2>
          <p>{t('use_test_accounts')}</p>
          <ul>
            {/* Core test accounts */}
            <li>
              <strong>Basic：</strong> basic@test.com （Basic {t('basic_plan')}）<span style={{ color: '#2563eb', fontWeight: 'bold' }}>({MOCK_USERS['basic@test.com'].lastName}{MOCK_USERS['basic@test.com'].firstName})</span>
            </li>
            <li>
              <strong>Pro：</strong> pro@test.com （Pro {t('pro_plan')}）<span style={{ color: '#2563eb', fontWeight: 'bold' }}>({MOCK_USERS['pro@test.com'].lastName}{MOCK_USERS['pro@test.com'].firstName})</span>
            </li>
            <li>
              <strong>Elite：</strong> elite@test.com （Elite {t('elite_plan')}）<span style={{ color: '#2563eb', fontWeight: 'bold' }}>({MOCK_USERS['elite@test.com'].lastName}{MOCK_USERS['elite@test.com'].firstName})</span>
            </li>
            {/* legacy demo teacher removed */}

            {/* Additional teacher demo accounts generated from MOCK_USERS */}
            {Object.entries(MOCK_USERS)
              .filter(([email, cfg]) => (cfg as any).teacherId)
              .map(([email, cfg]) => (
                <li key={email}>
                  <strong>{(cfg.displayName || t('teacher'))}：</strong> {email} （{cfg.displayName}）
                  <span style={{ color: '#2563eb', fontWeight: 'bold' }}>({cfg.lastName}{cfg.firstName})</span>
                </li>
              ))}
          </ul>
          <div style={{ marginTop: 12 }}>
            <small>{t('test_password_label')}: 123456</small>
          </div>
        </div>
      </section>
    </div>
  );
}
