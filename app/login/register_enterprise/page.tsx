"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/components/IntlProvider";
import { COUNTRY_CODES, countryKey } from "@/lib/countryI18n";
import { formatLocalIso, timezoneForCountry } from "@/lib/countryTimezone";
import {
  PLAN_LABELS,
  PLAN_DESCRIPTIONS,
  PlanId,
} from "@/lib/mockAuth";
import { PLAN_PRICES, PLAN_FEATURES } from "@/lib/mockAuth";

function simpleMarkdownToHtml(md: string) {
  if (!md) return "";
  // very small converter: headings, bold, italics, line breaks
  let s = md
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/gim, "<em>$1</em>")
    .replace(/\n/g, "<br />");
  return s;
}

export default function RegisterPage() {
  const t = useT();
  const router = useRouter();
  const [role, setRole] = useState<"student" | "teacher" | null>("student");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [uuid, setUuid] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<string>("");
  const [country, setCountry] = useState<string>("");
  const [plan, setPlan] = useState<PlanId | null>("viewer");
  // credit card fields moved to post-login settings; do not collect on registration
  const [saved, setSaved] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [roles, setRoles] = useState<Array<{ id: string, name: string }>>([]);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; domain?: string; availableSeats: number }>>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);
  const [captchaValue, setCaptchaValue] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);

  // Refs for form fields
  const orgRef = useRef<HTMLSelectElement>(null);
  const roleRef = useRef<HTMLSelectElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const birthdateRef = useRef<HTMLInputElement>(null);
  const genderRef = useRef<HTMLSelectElement>(null);
  const countryRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    // generate UUID once on mount
    if (!uuid) {
      const id = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : `id-${Math.random().toString(36).slice(2, 10)}`;
      setUuid(id);
    }
    // Load captcha on mount
    loadCaptcha();
  }, [uuid]);

  // Fetch roles from API
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/roles');
        const data = await res.json();
        if (res.ok && data?.roles) {
          // Filter out admin role and only show active roles
          const filteredRoles = data.roles.filter((r: any) => r.id !== 'admin' && r.isActive);
          setRoles(filteredRoles);
        }
      } catch (e) {
        console.error('Failed to fetch roles:', e);
      }
    })();
  }, []);

  // Fetch the public (unauthenticated) organization list for the org picker
  async function loadOrgs() {
    setOrgsLoading(true);
    try {
      const res = await fetch('/api/organizations/public');
      const data = await res.json();
      if (res.ok && data?.ok) {
        setOrgs(data.organizations || []);
      }
      return (data?.organizations || []) as Array<{ id: string; name: string; domain?: string; availableSeats: number }>;
    } catch (e) {
      console.error('Failed to fetch organizations:', e);
      return [];
    } finally {
      setOrgsLoading(false);
    }
  }

  useEffect(() => {
    loadOrgs();
  }, []);

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId) || null;
  const emailDomainMismatch = !!(
    selectedOrg?.domain &&
    email.trim() &&
    !email.trim().toLowerCase().endsWith(`@${selectedOrg.domain.replace(/^@/, '').toLowerCase()}`)
  );

  // plan selection moved to user settings; registration defaults to 'viewer'

  // 標籤走翻譯 key，code 才是存進資料庫的值。
  const countries = useMemo(
    () => COUNTRY_CODES.map((code) => ({ code, label: t(countryKey(code)) })),
    [t],
  );

  async function loadCaptcha() {
    try {
      setCaptchaLoading(true);
      const res = await fetch("/api/captcha");
      const data = await res.json();
      if (res.ok && data?.token && data?.image) {
        setCaptchaToken(data.token);
        setCaptchaImage(data.image);
        setCaptchaValue("");
      }
    } catch (e) {
      console.warn("captcha load failed", e);
    } finally {
      setCaptchaLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setFormError(null);

    // 如果確認密碼有錯誤，不允許提交
    if (confirmPasswordError) {
      setTimeout(() => {
        confirmPasswordRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        confirmPasswordRef.current?.focus();
      }, 100);
      return;
    }



    // 優先檢查服務條款同意
    if (!termsAccepted) {
      setFormError(t('register_terms_required'));
      setTimeout(() => {
        // 滾動到服務條款區域
        const termsSection = document.querySelector('input[name="terms"]') as HTMLInputElement | null;
        if (termsSection) {
          termsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
          termsSection.focus();
        }
      }, 100);
      return;
    }

    // 收集其他驗證錯誤
    const errors: string[] = [];
    const fieldRefs: { [key: string]: React.RefObject<any> } = {};

    if (!selectedOrgId) {
      errors.push(t('register_field_org'));
      fieldRefs['org'] = orgRef;
    }

    if (!role) {
      errors.push(t('register_field_identity'));
      fieldRefs['role'] = roleRef;
    }

    if (!firstName.trim()) {
      errors.push(t('first_name_label'));
      fieldRefs['firstName'] = firstNameRef;
    }

    if (!lastName.trim()) {
      errors.push(t('last_name_label'));
      fieldRefs['lastName'] = lastNameRef;
    }

    if (!email.trim()) {
      errors.push('Email');
      fieldRefs['email'] = emailRef;
    }

    if (!password) {
      errors.push(t('register_field_password'));
      fieldRefs['password'] = passwordRef;
    }

    if (!confirmPassword) {
      errors.push(t('register_field_confirm_password'));
      fieldRefs['confirmPassword'] = confirmPasswordRef;
    } else if (password !== confirmPassword) {
      errors.push(t('register_field_password_mismatch'));
      fieldRefs['confirmPassword'] = confirmPasswordRef;
    }

    if (!birthdate) {
      errors.push(t('register_field_birthdate'));
      fieldRefs['birthdate'] = birthdateRef;
    }

    if (!gender) {
      errors.push(t('register_field_gender'));
      fieldRefs['gender'] = genderRef;
    }

    if (!country) {
      errors.push(t('register_field_country'));
      fieldRefs['country'] = countryRef;
    }

    if (errors.length > 0) {
      const errorMessage = `${t('register_required_fields')}\n• ${errors.join('\n• ')}`;
      setFormError(errorMessage);

      // Scroll to first error field or error message
      setTimeout(() => {
        const firstErrorField = Object.keys(fieldRefs)[0];
        if (firstErrorField && fieldRefs[firstErrorField]?.current) {
          fieldRefs[firstErrorField].current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          fieldRefs[firstErrorField].current.focus();
        } else {
          // Fallback to error message
          const errorElement = document.querySelector('.form-error');
          if (errorElement) errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return;
    }

    const times = formatLocalIso(timezoneForCountry(country || 'TW'));

    const payload = {
      roid_id: uuid,
      email: email.trim().toLowerCase(),
      password: password || undefined,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      role,
      plan: plan ?? null,
      birthdate: birthdate || undefined,
      gender: gender || undefined,
      country: country || undefined,
      timezone: times.timezone,
      termsAccepted: !!termsAccepted,
      createdAtUtc: times.utc,
      createdAtLocal: times.local,
      updatedAtUtc: times.utc,
      updatedAtLocal: times.local,
      orgId: selectedOrgId,
    };

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, captchaToken, captchaValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        // show server message inline instead of throwing an exception
        const message = data?.message || t('register_failed');
        setFormError(message);
        // focus email for duplicate-email errors
        try {
          const el = document.querySelector('input[type="email"]') as HTMLInputElement | null;
          if (el) el.focus();
        } catch (e) {
          // ignore focus errors in SSR
        }
        return;
      }
      setSaved(true);
      setTimeout(() => router.push('/login'), 900);
    } catch (err: any) {
      console.error(err);
      setFormError(err?.message || t('register_save_failed'));
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>{t('register_enterprise_title')}</h1>
        <p>{t('register_subtitle')}</p>

        {/* 批次匯入成員已移到企業管理後台（登入後 › 企業管理 › 成員分頁，
            components/org/OrgCsvImportPanel.tsx）。這個公開頁只保留單筆自助註冊：
            匿名者原本可用同一個 IP 每小時灌入 5 批 × 200 個帳號。 */}
        <p style={{ marginTop: 12, fontSize: 13, color: '#6b7280' }}>{t('register_csv_moved_hint')}</p>
      </header>

      <section className="section">
        <div className="card">
          <h2>{t('register_basic_info')}</h2>
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="field">
              <label>{t('register_org_label')} <span style={{ color: 'red' }}>*</span></label>
              <select
                ref={orgRef}
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                style={{ cursor: 'pointer' }}
              >
                <option value="">{orgsLoading ? t('loading') : t('register_org_select')}</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id} disabled={o.availableSeats <= 0}>
                    {o.name}{o.availableSeats <= 0 ? t('register_org_seats_full') : t('register_org_seats_left', { count: o.availableSeats })}
                  </option>
                ))}
              </select>
              {!orgsLoading && orgs.length === 0 && (
                <p style={{ color: '#c33', fontSize: 13, marginTop: 4 }}>
                  {t('register_org_none')}
                </p>
              )}
            </div>

            <div className="field">
              <label>{t('register_identity')} <span style={{ color: 'red' }}>*</span></label>
              <select
                ref={roleRef}
                value={role || ""}
                onChange={(e) => {
                  const selectedRole = e.target.value as "student" | "teacher" | null;
                  setRole(selectedRole || null);
                  // Adjust plan based on role
                  if (selectedRole === "teacher") {
                    setPlan(null);
                  } else if (selectedRole === "student" && plan === null) {
                    setPlan('viewer');
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <option value="">{t('register_select_identity')}</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-row">
              <div className="field">
                <label>{t('first_name_label')} <span style={{ color: 'red' }}>*</span></label>
                <input ref={firstNameRef} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="field">
                <label>{t('last_name_label')} <span style={{ color: 'red' }}>*</span></label>
                <input ref={lastNameRef} value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Email <span style={{ color: 'red' }}>*</span></label>
              <input ref={emailRef} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@domain.com" />
              {emailDomainMismatch && (
                <div style={{ color: '#c33', fontSize: 13, marginTop: 4, fontWeight: 'bold' }}>
                  {t('register_email_domain_mismatch', { org: selectedOrg?.name ?? '', domain: selectedOrg?.domain?.replace(/^@/, '') ?? '' })}
                </div>
              )}
            </div>

            <div className="field">
              <label>{t('password')} <span style={{ color: 'red' }}>*</span></label>
              <input
                ref={passwordRef}
                type={showPasswords ? 'text' : 'password'}
                value={password}
                style={{ textAlign: 'left' }}
                onChange={(e) => {
                  setPassword(e.target.value);
                  // 當密碼改變時，重新驗證確認密碼
                  if (confirmPassword && e.target.value !== confirmPassword) {
                    setConfirmPasswordError(t('register_password_mismatch'));
                  } else if (confirmPassword && e.target.value === confirmPassword) {
                    setConfirmPasswordError(null);
                  }
                }}
              />
            </div>

            <div className="field">
              <label>{t('register_confirm_password')} <span style={{ color: 'red' }}>*</span></label>
              <input
                ref={confirmPasswordRef}
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                style={{ textAlign: 'left' }}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  // 即時驗證密碼匹配
                  if (e.target.value && password && e.target.value !== password) {
                    setConfirmPasswordError(t('register_password_mismatch'));
                  } else {
                    setConfirmPasswordError(null);
                  }
                }}
              />
              {confirmPasswordError && (
                <div style={{
                  color: '#c33',
                  fontSize: '14px',
                  marginTop: '4px',
                  fontWeight: 'bold'
                }}>
                  ⚠️ {confirmPasswordError}
                </div>
              )}
            </div>

            <div className="field" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8 }}>
              <input
                id="showPasswords"
                type="checkbox"
                checked={showPasswords}
                onChange={(e) => setShowPasswords(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer',
                  margin: 0,
                  WebkitAppearance: 'checkbox',
                  appearance: 'checkbox'
                }}
              />
              <label htmlFor="showPasswords" style={{ cursor: 'pointer', userSelect: 'none' }}>{t('register_show_passwords')}</label>
            </div>

            <div className="field" style={{ display: 'none' }}>
              <label>{t('register_auto_id')}</label>
              <input
                value={uuid}
                readOnly
                disabled
                aria-label={t('register_auto_id_locked')}
                style={{ background: '#f3f4f6', cursor: 'not-allowed' }}
              />
            </div>

            <div className="field">
              <label>{t('birthdate_label')} <span style={{ color: 'red' }}>*</span></label>
              <input ref={birthdateRef} type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
            </div>

            <div className="field">
              <label>{t('gender_label')} <span style={{ color: 'red' }}>*</span></label>
              <select ref={genderRef} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">{t('select_placeholder')}</option>
                <option value="male">{t('gender_male')}</option>
                <option value="female">{t('gender_female')}</option>
              </select>
            </div>

            <div className="field">
              <label>{t('country_label')} <span style={{ color: 'red' }}>*</span></label>
              <select ref={countryRef} value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">{t('select_placeholder')}</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>{`${c.label} ${c.code}`}</option>
                ))}
              </select>
            </div>



            {/* Plan selection moved to user settings — registration defaults to viewer */}

            {/* Payment details moved to user settings after login; registration does not collect card info. */}

            <div className="field">
              <label>{t('register_terms_label')} <span style={{ color: 'red' }}>*</span></label>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p>{t('register_terms_read_prefix')} <Link href="/terms" target="_blank" style={{ color: '#0066cc', textDecoration: 'underline' }}>{t('register_terms_label')}</Link></p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    name="terms"
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    style={{
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer',
                      margin: 0,
                      flexShrink: 0,
                      WebkitAppearance: 'checkbox',
                      appearance: 'checkbox'
                    }}
                  />
                  {t('register_terms_agree')}
                </label>
              </div>
            </div>

            {/* Captcha Section */}
            <div className="field">
              <label>{t('register_captcha_label')} <span style={{ color: "red" }}>*</span></label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                {captchaImage ? (
                  <img src={captchaImage} alt="captcha" style={{ height: 48, border: "1px solid #ddd", borderRadius: 4 }} />
                ) : (
                  <div style={{ width: 140, height: 48, background: "#f3f4f6", borderRadius: 4 }} />
                )}
                <button type="button" className="card-button secondary" onClick={loadCaptcha} disabled={captchaLoading} style={{ padding: '8px 12px' }}>
                  {t('register_captcha_refresh')}
                </button>
              </div>
              <input
                type="text"
                value={captchaValue}
                placeholder={t('register_captcha_placeholder')}
                onChange={(e) => setCaptchaValue(e.target.value)}
                autoComplete="off"
              />
            </div>

            {formError && (
              <div className="form-error" style={{
                backgroundColor: '#fee',
                border: '1px solid #fcc',
                color: '#c33',
                padding: '12px',
                borderRadius: '4px',
                marginTop: '12px',
                fontWeight: 'bold',
                fontSize: '16px',
                whiteSpace: 'pre-line'
              }}>
                ⚠️ {formError}
              </div>
            )}
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button type="submit" className="modal-button primary">
                {t('create_account')}
              </button>

              <Link href="/login" className="modal-button secondary">{t('register_back_to_login')}</Link>
            </div>

            {saved && <p className="form-success">{t('register_saved_simulated')}</p>}
          </form>
        </div>
      </section>
    </div>
  );
}
