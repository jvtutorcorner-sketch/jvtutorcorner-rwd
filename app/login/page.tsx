// app/login/page.tsx
'use client';

import { FormEvent, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MOCK_USERS,
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
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(
    typeof window !== 'undefined' ? getStoredUser() : null,
  );


  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    (async () => {
      try {
        const trimmedEmail = email.trim().toLowerCase();

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
        const authEmail = searchParams.get('email') || 'authorized-google-user';
        
        const user: StoredUser = {
          email: authEmail,
          plan: 'viewer',
          firstName: 'Google',
          lastName: 'User',
          role: 'user',
        };

        setStoredUser(user);
        setCurrentUser(user);

        try {
          const nowRef = String(Date.now());
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

  const handleForgotSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!forgotEmail.trim()) {
      setError('請輸入 Email');
      return;
    }
    try {
      setForgotLoading(true);
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        if (data.emailSent) {
          alert('新密碼已發送到您的信箱，請檢查收件匣或垃圾郵件匣。');
        } else {
          alert('密碼重置成功，但 Email 發送失敗。請聯繫管理員或確認 SMTP 設定。');
        }
        setIsForgotMode(false);
      } else {
        setError(data?.message ? t(data.message) : '發送失敗或查無此帳號');
      }
    } catch (err: any) {
      console.error(err);
      setError('發送失敗');
    } finally {
      setForgotLoading(false);
    }
  };

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
          <form onSubmit={isForgotMode ? handleForgotSubmit : handleSubmit} className="modal-form">
            {isForgotMode ? (
              <>
                <div className="field">
                  <label htmlFor="forgotEmail">Email</label>
                  <input
                    id="forgotEmail"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                  <p className="text-sm text-gray-500 mt-2">我們將會發送隨機新密碼至此 Email 信箱。</p>
                </div>

                {error && <p className="form-error">{error}</p>}

                <div className="modal-actions">
                  <button type="submit" className="modal-button primary" disabled={forgotLoading} onClick={(e) => { e.preventDefault(); handleForgotSubmit(e as any); }}>
                    {forgotLoading ? '發送中...' : '發送密碼'}
                  </button>
                  <button type="button" className="modal-button secondary" onClick={() => { setIsForgotMode(false); setError(null); }}>
                    返回登入
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    placeholder=""
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="field">
                  <label htmlFor="password">{t('password')}</label>
                  <input
                    id="password"
                    name="password"
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
                  {/* <button type="button" className="modal-button secondary border-none shadow-none text-blue-600 bg-transparent hover:bg-blue-50" onClick={() => { setIsForgotMode(true); setError(null); }}>
                    忘記密碼?
                  </button> */}
                </div>
              </>
            )}


          </form>
        </div>
      </section >

    </div >
  );
}
