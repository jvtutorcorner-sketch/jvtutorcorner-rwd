"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStoredUser, setStoredUser, PLAN_LABELS, PLAN_PRICES } from '@/lib/mockAuth';
import type { PlanId } from '@/lib/mockAuth';
import { useT } from '@/components/IntlProvider';

export default function SettingsPage() {
  const t = useT();
  const [user, setUser] = useState<any>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  // payment fields moved to Pricing (upgrade) page
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [birthdate, setBirthdate] = useState('');
  const [gender, setGender] = useState('');
  const [country, setCountry] = useState('');
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
      const stored = getStoredUser();
      setUser(stored);
      setFirstName(stored?.firstName || '');
      setLastName(stored?.lastName || '');
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
          setBirthdate(data.profile.birthdate || '');
          setGender(data.profile.gender || '');
          setCountry(data.profile.country || '');
          setFirstName(data.profile.firstName || '');
          setLastName(data.profile.lastName || '');
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
          <h1>{t('personal_settings_title')}</h1>
          <p>{t('personal_settings_description')}</p>
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
          <h1>{t('personal_settings_title')}</h1>
        </header>
        <section className="section">
          <p>{t('please_login_to_edit_settings')}</p>
          <p><Link href="/login">{t('go_to_login')}</Link></p>
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
      if (firstName !== undefined) payload.firstName = firstName;
      if (lastName !== undefined) payload.lastName = lastName;
      if (birthdate !== undefined) payload.birthdate = birthdate;
      if (gender !== undefined) payload.gender = gender;
      if (country !== undefined) payload.country = country;
      // payment handled on Pricing page; no card data here

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || '更新失敗');
      setMessage('更新個人設定成功');
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
        <h1>{t('personal_settings_title')}</h1>
        <p>{t('personal_settings_description')}</p>
      </header>

      <section className="section">
        <div className="card">
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="field">
              <label>{t('email_label')}</label>
              <input value={user.email} readOnly disabled />
            </div>

            <div className="field-row">
              <div className="field">
                <label>{t('first_name_label')}</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="field">
                <label>{t('last_name_label')}</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>{t('birthdate_label')}</label>
              <input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
            </div>

            <div className="field">
              <label>{t('gender_label')}</label>
              <select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">{t('select_placeholder')}</option>
                <option value="male">{t('gender_male')}</option>
                <option value="female">{t('gender_female')}</option>
              </select>
            </div>

            <div className="field">
              <label>{t('country_label')}</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">{t('select_placeholder')}</option>
                <option value="TW">台灣</option>
                <option value="JP">日本</option>
                <option value="US">美國</option>
                <option value="GB">英國</option>
                <option value="HK">香港</option>
                <option value="MO">澳門</option>
                <option value="CN">中國</option>
                <option value="KR">南韓</option>
                <option value="SG">新加坡</option>
                <option value="MY">馬來西亞</option>
                <option value="AU">澳洲</option>
                <option value="NZ">紐西蘭</option>
                <option value="CA">加拿大</option>
                <option value="DE">德國</option>
                <option value="FR">法國</option>
                <option value="ES">西班牙</option>
                <option value="IT">義大利</option>
                <option value="IN">印度</option>
                <option value="BR">巴西</option>
                <option value="MX">墨西哥</option>
                <option value="ZA">南非</option>
              </select>
            </div>

            {/* Payment moved to Pricing page */}

            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button type="submit" className="modal-button primary" disabled={loading}>{loading ? t('saving') : t('save_settings')}</button>
              <Link href="/">{t('return_home')}</Link>
            </div>
            {message && <p className="form-success" style={{ marginTop: 8, color: '#10b981' }}>{message}</p>}
          </form>
        </div>
      </section>
    </div>
  );
}
