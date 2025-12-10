"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getStoredUser, setStoredUser, PLAN_LABELS, PLAN_PRICES } from '@/lib/mockAuth';
import type { PlanId } from '@/lib/mockAuth';

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [hydrated, setHydrated] = useState(false);
  const searchParams = useSearchParams();
  const tab = (searchParams?.get('tab') || '').toLowerCase();
  const [loading, setLoading] = useState(false);
  // payment fields moved to Pricing (upgrade) page
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [bio, setBio] = useState('');
  const [roleId, setRoleId] = useState<string | null>(null);
  const [backupEmail, setBackupEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  // plan is handled on the pricing (upgrade) page now
  // Plan / payment state (moved here so hooks call order is stable)
  const [plan, setPlan] = useState<PlanId | ''>('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardCountry, setCardCountry] = useState('TW');
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planMessage, setPlanMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHydrated(true);
      setUser(getStoredUser());
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch(`/api/profile?email=${encodeURIComponent(user.email)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.ok && data.profile) {
          setBio(data.profile.bio || '');
          setRoleId(data.profile.roid_id || data.profile.role || null);
          setBackupEmail(data.profile.backupEmail || '');
        }
      } catch (e) {
        // ignore
      }
    })();
  }, [user]);

  // when user is loaded, initialize plan state
  useEffect(() => {
    if (user && (user.plan || user.plan === '')) {
      setPlan(user.plan as PlanId);
    }
  }, [user]);

  // avoid SSR/CSR mismatch: render a neutral loading state until hydrated
  if (!hydrated) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>個人化設定</h1>
          <p>在此可以更新個人資訊、備用電子郵件與示範用的付款資料（請勿輸入真實卡號）。</p>
        </header>
        <section className="section">
          <div className="card">載入中…</div>
        </section>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>個人化設定</h1>
        </header>
        <section className="section">
          <p>請先登入以編輯個人設定。</p>
          <p><Link href="/login">前往登入</Link></p>
        </section>
      </div>
    );
  }

  

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const payload: any = { email: user.email };
      // plan is updated on the Pricing (upgrade) page
      if (firstName) payload.firstName = firstName;
      if (lastName) payload.lastName = lastName;
      if (bio) payload.bio = bio;
      if (backupEmail !== undefined) payload.backupEmail = backupEmail;
      // payment handled on Pricing page; no card data here

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || '更新失敗');
      setMessage('已更新個人設定（示範）');
      // update stored user display name
      const stored = getStoredUser();
      if (stored) {
        const updated = { ...stored, firstName: firstName || stored.firstName, lastName: lastName || stored.lastName };
        setStoredUser(updated);
        setUser(updated);
      }
    } catch (err: any) {
      setMessage(err?.message || '更新失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>個人化設定</h1>
        <p>在此可以更新個人資訊、備用電子郵件與示範用的付款資料（請勿輸入真實卡號）。</p>
      </header>

      <section className="section">
        <div className="card">
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="field">
              <label>電子郵件（不可變更）</label>
              <input value={user.email} readOnly disabled />
            </div>

            <div className="field">
              <label>Role / Identifier</label>
              <input value={roleId || ''} readOnly disabled />
            </div>

            <div className="field">
              <label>備用電子郵件（備援）</label>
              <input value={backupEmail} onChange={(e) => setBackupEmail(e.target.value)} placeholder="備用 email（選填）" />
              <small className="muted">可提供一個備用聯絡 email（示範用途）。</small>
            </div>

            {/* If URL has ?tab=plan show plan selection + card form here */}
            {tab === 'plan' ? (
              <div className="field" style={{ marginTop: 12 }}>
                <label>方案選擇</label>
                <select value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
                  <option value="">-- 選擇方案 --</option>
                  {(Object.keys(PLAN_LABELS) as PlanId[]).map((k) => (
                    <option key={k} value={k}>{PLAN_LABELS[k]} — {PLAN_PRICES[k]}</option>
                  ))}
                </select>

                <div style={{ marginTop: 8 }}>
                  <label>信用卡（示範）</label>
                  <input placeholder="卡號（僅數字）" value={cardNumber} onChange={(e) => setCardNumber(e.target.value.replace(/[^0-9 ]/g, ''))} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input placeholder="到期（MM/YY）" value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} style={{ flex: 1 }} />
                    <input placeholder="CVC" value={cardCvc} onChange={(e) => setCardCvc(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 120 }} />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label>發卡國家/地區</label>
                    <select value={cardCountry} onChange={(e) => setCardCountry(e.target.value)}>
                      <option value="TW">台灣 TW</option>
                      <option value="US">美國 US</option>
                      <option value="JP">日本 JP</option>
                    </select>
                  </div>
                  <small className="muted">示範用途：請勿輸入真實卡號或敏感資料。</small>

                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="modal-button primary"
                      onClick={async () => {
                        setPlanMessage(null);
                        if (!plan) { setPlanMessage('請選擇方案'); return; }
                        setLoadingPlan(true);
                        try {
                          const payload: any = { plan };
                          payload.card = { number: cardNumber.replace(/\s+/g, ''), expiry: cardExpiry, cvc: cardCvc, country: cardCountry };
                          const res = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, email: user.email }) });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data?.message || '更新失敗');
                          setPlanMessage('方案已更新（示範）');
                          const stored = getStoredUser();
                          if (stored) {
                            const updated = { ...stored, plan } as any;
                            setStoredUser(updated);
                            setUser(updated);
                          }
                        } catch (e: any) {
                          setPlanMessage(e?.message || '更新失敗');
                        } finally { setLoadingPlan(false); }
                      }}
                      disabled={loadingPlan}
                    >{loadingPlan ? '處理中…' : '儲存並升級'}</button>
                    <button type="button" onClick={() => { setPlan(user?.plan || ''); setCardNumber(''); setCardExpiry(''); setCardCvc(''); setCardCountry('TW'); }} style={{ marginLeft: 12 }}>還原</button>
                  </div>
                  {planMessage ? <div style={{ marginTop: 8 }}>{planMessage}</div> : null}
                </div>
              </div>
            ) : null}

            <div className="field-row">
              <div className="field">
                <label>First Name</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="field">
                <label>Last Name</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            {/* Payment moved to Pricing page */}

            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button type="submit" className="modal-button primary" disabled={loading}>{loading ? '儲存中…' : '儲存設定'}</button>
              <Link href="/">返回首頁</Link>
            </div>
            {message && <p className="form-success" style={{ marginTop: 8 }}>{message}</p>}
          </form>
        </div>
      </section>
    </div>
  );
}
