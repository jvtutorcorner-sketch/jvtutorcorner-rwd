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
  const [password, setPassword] = useState('');
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
        const trimmedEmail = email.trim().toLowerCase();

        // 1. Check for mock users first to avoid 401 errors in console for test accounts
        const userConfig = MOCK_USERS[trimmedEmail];
        if (userConfig) {
          if (password !== TEST_PASSWORD) {
            setError(t('login_password_wrong'));
            await loadCaptcha();
            return;
          }

          // Mock login success
          const user: StoredUser = {
            email: trimmedEmail,
            plan: userConfig.plan,
            firstName: userConfig.firstName,
            lastName: userConfig.lastName,
          };
          if ((userConfig as any).teacherId) {
            (user as any).teacherId = (userConfig as any).teacherId;
            (user as any).role = 'teacher';
          }
          setStoredUser(user);
          setCurrentUser(user);
          try {
            const nowRef = String(Date.now());
            window.localStorage.setItem('tutor_session_expiry', String(Date.now() + 30 * 60 * 1000));
            window.sessionStorage.setItem('tutor_last_login_time', nowRef);
            window.localStorage.setItem('tutor_last_login_time', nowRef);
            window.sessionStorage.setItem('tutor_login_complete', 'true');
          } catch { }

          window.dispatchEvent(new Event('tutor:auth-changed'));
          await new Promise(r => setTimeout(r, 100));

          // Check for redirect parameter
          try {
            const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
            const redirect = params?.get('redirect');
            if (redirect) {
              router.push(decodeURIComponent(redirect));
              return;
            }
          } catch (e) { /* ignore */ }

          alert(`${t('login_success')}\n${t('current_plan')}: ${PLAN_LABELS[user.plan]}(${t('test_account')})\n${t('redirecting_home')}`);
          router.push('/');
          return;
        }

        // 2. Try server-side profiles for other accounts
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmedEmail, password, captchaToken, captchaValue }),
        });
        const data = await res.json();

        // If API succeeded
        if (res.ok && data?.ok) {
          const role = data.profile?.role as string | undefined;
          const plan = (data.profile?.plan as any) || 'basic';
          const user: StoredUser = {
            email: trimmedEmail,
            plan,
            role,
            firstName: data.profile?.firstName,
            lastName: data.profile?.lastName,
          };
          if (role === 'teacher' && data.profile?.id) {
            (user as any).teacherId = String(data.profile.id);
          }
          setStoredUser(user);
          setCurrentUser(user);
          try {
            window.localStorage.setItem('tutor_session_expiry', String(Date.now() + 30 * 60 * 1000));
            window.sessionStorage.setItem('tutor_last_login_time', String(Date.now()));
            window.sessionStorage.setItem('tutor_login_complete', 'true');
          } catch { }
          window.dispatchEvent(new Event('tutor:auth-changed'));
          await new Promise(r => setTimeout(r, 100));

          // Redirection logic
          try {
            const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
            const redirect = params?.get('redirect');
            if (redirect) {
              router.push(decodeURIComponent(redirect));
              return;
            }
          } catch (e) { /* ignore */ }

          if (role === 'admin') {
            alert(t('login_admin_success'));
            router.push('/');
            return;
          }
          alert(`${t('login_success')}\n${t('current_plan')}: ${PLAN_LABELS[user.plan]}\n${t('redirecting_home')}`);
          router.push('/');
          return;
        }

        // 3. If API failed
        if (!res.ok || !data?.ok) {
          const msg = data?.message ? t(data.message) : t('login_error');
          setError(msg);
          await loadCaptcha();
          return;
        }

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

    // Check for Google Auth redirect success
    const handleGoogleRedirect = async () => {
      if (typeof window === 'undefined') return;

      const searchParams = new URLSearchParams(window.location.search);
      const isGoogleSuccess = searchParams.get('google_auth_success');

      if (isGoogleSuccess === 'true') {
        const mockEmail = 'google.user@gmail.com'; // Default mock Google email for prototype
        const userConfig = MOCK_USERS[mockEmail] || { plan: 'viewer', firstName: 'Google', lastName: 'User' };

        const user: StoredUser = {
          email: mockEmail,
          plan: userConfig.plan as any,
          firstName: userConfig.firstName,
          lastName: userConfig.lastName,
          role: 'user',
        };

        setStoredUser(user);
        setCurrentUser(user);

        try {
          const nowRef = String(Date.now());
          window.localStorage.setItem('tutor_session_expiry', String(Date.now() + 30 * 60 * 1000));
          window.sessionStorage.setItem('tutor_last_login_time', nowRef);
          window.localStorage.setItem('tutor_last_login_time', nowRef);
          window.sessionStorage.setItem('tutor_login_complete', 'true');
        } catch { }

        window.dispatchEvent(new Event('tutor:auth-changed'));

        // Clean up URL
        router.replace('/login');

        alert(`${t('login_success')}\nGoogle Account Verified.\n${t('redirecting_home')}`);

        // redirect based on previous requested redirect url or home
        const redirect = searchParams.get('redirect');
        if (redirect) {
          router.push(decodeURIComponent(redirect));
        } else {
          router.push('/');
        }
      } else if (searchParams.get('error') === 'google_auth_failed') {
        setError('Google 帳號驗證登入失敗。');
      }
    };

    handleGoogleRedirect();
  }, [router, t]);


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

    </div>
  );
}
