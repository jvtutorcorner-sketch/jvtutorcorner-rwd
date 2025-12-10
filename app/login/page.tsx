// app/login/page.tsx
'use client';

import { FormEvent, useState } from 'react';
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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(TEST_PASSWORD);
  const [error, setError] = useState<string | null>(null);
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
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        });
        const data = await res.json();
        if (res.ok && data?.ok) {
          const role = data.profile?.role as string | undefined;
          const plan = (data.profile?.plan as any) || 'basic';
          const user: StoredUser = {
            email: email.trim().toLowerCase(),
            plan,
            role: role === 'admin' ? 'admin' : 'user',
            firstName: data.profile?.firstName,
            lastName: data.profile?.lastName,
          };
          setStoredUser(user);
          setCurrentUser(user);
          window.dispatchEvent(new Event('tutor:auth-changed'));
          if (role === 'admin') {
            alert('Admin 登入成功，將導向管理後台。');
            router.push('/admin/orders');
            return;
          }
          alert(`登入成功！\n目前使用方案：${PLAN_LABELS[user.plan]}\n接下來會導向到價目頁 /pricing。`);
          router.push('/pricing');
          return;
        }

        // Fallback to mock users
        const trimmedEmail = email.trim().toLowerCase();
        const userConfig = MOCK_USERS[trimmedEmail];
        if (!userConfig) {
          setError('帳號不存在，請先建立帳戶或使用測試帳號。');
          return;
        }
        if (password !== TEST_PASSWORD) {
          setError('密碼錯誤，統一測試密碼為：123456');
          return;
        }
        const user: StoredUser = { email: trimmedEmail, plan: userConfig.plan };
        setStoredUser(user);
        setCurrentUser(user);
        window.dispatchEvent(new Event('tutor:auth-changed'));
        alert(`登入成功！\n目前使用方案：${PLAN_LABELS[user.plan]}（測試帳號）\n接下來會導向到價目頁 /pricing。`);
        router.push('/pricing');
      } catch (err) {
        console.error(err);
        setError('登入時發生錯誤，請稍後再試。');
      }
    })();
  };

  const handleLogout = () => {
    clearStoredUser();
    setCurrentUser(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('tutor:auth-changed'));
    }
    router.refresh();
    alert('已登出測試帳號。');
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>登入（測試用）</h1>
        <p>
          這裡是家教平台的「示範登入頁」，使用下方提供的三組測試帳號，
          統一密碼為 <strong>123456</strong>。
        </p>
      </header>

      {currentUser && (
        <section className="section">
          <div className="card">
            <h2>目前登入狀態</h2>
            <p>
              帳號：<strong>{currentUser.email}</strong>
              <br />
              方案：<strong>{PLAN_LABELS[currentUser.plan]}</strong>
              {('role' in currentUser && (currentUser as any).role === 'admin') && (
                <>
                  <br />
                  <strong style={{ color: 'crimson' }}>Admin</strong>
                </>
              )}
            </p>
            <div className="card-actions">
              <button className="card-button" onClick={handleLogout}>
                登出
              </button>
              <Link href="/pricing" className="card-button secondary">
                前往價目頁 /pricing
              </Link>
              {('role' in currentUser && (currentUser as any).role === 'admin') && (
                <Link href="/admin/orders" className="card-button secondary">
                  管理後台：訂單
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="card">
          <h2>測試帳號一覽</h2>
          <p>可使用以下任一帳號 + 密碼 123456 登入：</p>
          <ul>
            <li>
              <strong>Basic：</strong> basic@test.com （Basic 普通會員）
            </li>
            <li>
              <strong>Pro：</strong> pro@test.com （Pro 中級會員）
            </li>
            <li>
              <strong>Elite：</strong> elite@test.com （Elite 高級會員）
            </li>
            <li>
              <strong>Teacher：</strong> teacher@test.com （示範老師帳號）
            </li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="card">
          <h2>登入表單（Mock 驗證）</h2>
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="field">
              <label htmlFor="email">Email（請輸入上述其中一個）</label>
              <input
                id="email"
                type="email"
                value={email}
                placeholder="例如：pro@test.com"
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label htmlFor="password">密碼</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <small>統一測試密碼：123456</small>
            </div>

            {error && <p className="form-error">{error}</p>}

            <div className="modal-actions">
              <button type="submit" className="modal-button primary">
                登入測試
              </button>
              <Link href="/pricing" className="modal-button secondary">
                先看價目表
              </Link>
              <Link href="/login/register" className="modal-button secondary">
                建立帳戶
              </Link>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
