"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PLAN_LABELS,
  PLAN_DESCRIPTIONS,
  PlanId,
  setStoredUser,
  type StoredUser,
} from "@/lib/mockAuth";
import { PLAN_PRICES, PLAN_FEATURES } from "@/lib/mockAuth";
import OnboardingQuestionnaire from "@/components/OnboardingQuestionnaire";
import { useT } from "@/components/IntlProvider";

const ONBOARDING_ENABLED = process.env.NEXT_PUBLIC_ENABLE_ONBOARDING_QUESTIONNAIRE === 'true';

const COUNTRY_CODES = [
  "TW", "JP", "US", "GB", "HK", "MO", "CN", "KR", "SG", "MY",
  "AU", "NZ", "CA", "DE", "FR", "ES", "IT", "IN", "BR", "MX", "ZA",
] as const;

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
  const [registeredUserId, setRegisteredUserId] = useState<string | null>(null);
  const [emailSendFailed, setEmailSendFailed] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);
  const [captchaValue, setCaptchaValue] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);


  // Refs for form fields
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
  }, [uuid]);

  // plan selection moved to user settings; registration defaults to 'viewer'

  const countries = useMemo(
    () => COUNTRY_CODES.map((code) => ({ code, label: t(`country_${code}`) })),
    [t],
  );

  // 國家時區映射
  const countryTimezones: Record<string, string> = {
    TW: 'Asia/Taipei',
    JP: 'Asia/Tokyo',
    US: 'America/New_York',
    GB: 'Europe/London',
    HK: 'Asia/Hong_Kong',
    MO: 'Asia/Macau',
    CN: 'Asia/Shanghai',
    KR: 'Asia/Seoul',
    SG: 'Asia/Singapore',
    MY: 'Asia/Kuala_Lumpur',
    AU: 'Australia/Sydney',
    NZ: 'Pacific/Auckland',
    CA: 'America/Toronto',
    DE: 'Europe/Berlin',
    FR: 'Europe/Paris',
    ES: 'Europe/Madrid',
    IT: 'Europe/Rome',
    IN: 'Asia/Kolkata',
    BR: 'America/Sao_Paulo',
    MX: 'America/Mexico_City',
    ZA: 'Africa/Johannesburg',
  };

  // 格式化本地時間為 ISO 格式
  function formatLocalIso(timezone?: string) {
    const now = new Date();
    const utcIso = now.toISOString();
    if (!timezone) return { utc: utcIso, local: utcIso, timezone: 'UTC' };
    try {
      const fmt = new Intl.DateTimeFormat('sv-SE', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      // 'sv-SE' style yields YYYY-MM-DD HH:MM:SS which we convert to ISO-like
      const parts = fmt.formatToParts(now).reduce((acc: any, part) => {
        acc[part.type] = (acc[part.type] || '') + part.value;
        return acc;
      }, {});
      const localIsoLike = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
      return { utc: utcIso, local: localIsoLike, timezone };
    } catch (e) {
      return { utc: utcIso, local: utcIso, timezone: 'UTC' };
    }
  }

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

  useEffect(() => {
    loadCaptcha();
  }, []);

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
      setFormError(t('register_error_terms_required'));
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

    if (!role) {
      errors.push(t('register_error_field_role'));
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
      errors.push(t('email'));
      fieldRefs['email'] = emailRef;
    }

    if (!password) {
      errors.push(t('password'));
      fieldRefs['password'] = passwordRef;
    }

    if (!confirmPassword) {
      errors.push(t('register_confirm_password_label'));
      fieldRefs['confirmPassword'] = confirmPasswordRef;
    } else if (password !== confirmPassword) {
      errors.push(t('register_error_password_mismatch_field'));
      fieldRefs['confirmPassword'] = confirmPasswordRef;
    }

    if (!birthdate) {
      errors.push(t('birthdate_label'));
      fieldRefs['birthdate'] = birthdateRef;
    }

    if (!gender) {
      errors.push(t('gender_label'));
      fieldRefs['gender'] = genderRef;
    }

    if (!country) {
      errors.push(t('country_label'));
      fieldRefs['country'] = countryRef;
    }

    if (errors.length > 0) {
      const errorMessage = `${t('register_error_required_fields_prefix')}\n• ${errors.join('\n• ')}`;
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

    const timezoneName = countryTimezones[country || 'TW'] || 'UTC';
    const times = formatLocalIso(timezoneName);

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
        const message = data?.message === 'captcha_incorrect'
          ? t('register_error_captcha_incorrect')
          : (data?.message || t('register_error_register_failed'));
        setFormError(message);
        if (data?.message === 'captcha_incorrect') {
          // 驗證碼失效後畫面上的舊圖片/token 已無法通過驗證，必須重新取得
          loadCaptcha();
        }
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
      const newUserId = data?.profile?.roid_id || data?.profile?.id || payload.roid_id;
      setRegisteredUserId(newUserId);
      setEmailSendFailed(data?.emailSent === false);

      // We no longer auto-login immediately for security/verification reasons
      // instead we show a success message asking them to check their email.
      
      setFormError(null);
      // Wait a bit to let the user see the success message
      setTimeout(() => {
        // We can either stay on the page with a big success card
        // or redirect to a dedicated "check your mail" page.
        // For now, let's just update the status so the UI shows a success state.
      }, 1000);

    } catch (err: any) {
      console.error(err);
      setFormError(err?.message || t('save_failed'));
      loadCaptcha();
    }

  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>{t('create_account')}</h1>
        <p>{t('register_subtitle_before')}<strong>{t('register_subtitle_bold')}</strong>{t('register_subtitle_after')}<span style={{ color: 'red' }}>*</span>{t('register_subtitle_after_asterisk')}</p>
      </header>

      <section className="section">
        <div className="card">
          <h2>{t('register_basic_info_title')}</h2>
            {saved ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: '64px', marginBottom: '20px' }}>{emailSendFailed ? '⚠️' : '📧'}</div>
                <h2 style={{ color: emailSendFailed ? '#b45309' : '#059669', marginBottom: '16px' }}>
                  {emailSendFailed ? t('register_success_title_email_failed') : t('register_success_title_email_sent')}
                </h2>
                {emailSendFailed ? (
                  <>
                    <p style={{ fontSize: '18px', color: '#4b5563', lineHeight: '1.6', marginBottom: '24px' }}>
                      {t('register_email_failed_message_prefix')} <strong>{email}</strong>{t('register_email_failed_message_suffix')}<br />
                      {t('register_email_failed_message_line2')}
                    </p>
                    <div style={{ padding: '16px', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a', color: '#92400e', fontSize: '14px', marginBottom: '24px' }}>
                      {t('register_whitelist_hint')}
                    </div>
                    <button
                      type="button"
                      disabled={resendLoading}
                      onClick={async () => {
                        setResendLoading(true);
                        setResendMsg(null);
                        setResendError(null);
                        try {
                          const res = await fetch('/api/auth/resend-verification', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email }),
                          });
                          const data = await res.json();
                          if (res.ok && data.success) {
                            setResendMsg(data.message || t('register_resend_success_default'));
                          } else if (res.status === 429 && data.retryAfter) {
                            setResendError(t('register_resend_wait_seconds').replace('{seconds}', String(data.retryAfter)));
                          } else {
                            setResendError(data?.message || t('register_resend_failed_default'));
                          }
                        } catch (e: any) {
                          setResendError(e?.message || t('register_resend_failed_default'));
                        } finally {
                          setResendLoading(false);
                        }
                      }}
                      className="modal-button primary"
                      style={{ display: 'inline-block', width: 'auto', padding: '12px 32px', marginBottom: '16px', cursor: resendLoading ? 'not-allowed' : 'pointer' }}
                    >
                      {resendLoading ? t('register_resend_sending') : t('register_resend_button')}
                    </button>
                    {resendMsg && <p style={{ color: '#059669', marginBottom: '16px' }}>{resendMsg}</p>}
                    {resendError && <p style={{ color: '#dc2626', marginBottom: '16px' }}>{resendError}</p>}
                    <div>
                      <Link href="/login" className="modal-button" style={{ display: 'inline-block', width: 'auto', padding: '12px 32px' }}>
                        {t('register_back_to_login')}
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: '18px', color: '#4b5563', lineHeight: '1.6', marginBottom: '24px' }}>
                      {t('register_email_sent_message_prefix')} <strong>{email}</strong>{t('register_email_sent_message_suffix')}
                    </p>
                    <div style={{ padding: '16px', backgroundColor: '#ecfdf5', borderRadius: '8px', border: '1px solid #d1fae5', color: '#065f46', fontSize: '14px', marginBottom: '32px' }}>
                      {t('register_whitelist_hint')}
                    </div>
                    <Link href="/login" className="modal-button primary" style={{ display: 'inline-block', width: 'auto', padding: '12px 32px' }}>
                      {t('register_back_to_login')}
                    </Link>
                  </>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="modal-form">
            <div className="field">
              <label>{t('register_role_label')} <span style={{ color: 'red' }}>*</span></label>
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
                <option value="">{t('register_select_role_placeholder')}</option>
                <option value="student">{t('role_student')}</option>
                <option value="teacher">{t('role_teacher')}</option>
              </select>
            </div>

            <div className="field-row">
              <div className="field">
                <label>{t('first_name_label')} <span style={{ color: 'red' }}>*</span></label>
                <input ref={firstNameRef} name="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="field">
                <label>{t('last_name_label')} <span style={{ color: 'red' }}>*</span></label>
                <input ref={lastNameRef} name="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>{t('email')} <span style={{ color: 'red' }}>*</span></label>
              <input ref={emailRef} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@domain.com" />
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
              <label>{t('register_confirm_password_label')} <span style={{ color: 'red' }}>*</span></label>
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
              <label>{t('register_auto_id_label')}</label>
              <input
                value={uuid}
                readOnly
                disabled
                aria-label={t('register_auto_id_aria')}
                style={{ background: '#f3f4f6', cursor: 'not-allowed' }}
              />
            </div>

            <div className="field">
              <label>{t('birthdate_label')} <span style={{ color: 'red' }}>*</span></label>
              <input ref={birthdateRef} name="birthdate" type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
            </div>

            <div className="field">
              <label>{t('gender_label')} <span style={{ color: 'red' }}>*</span></label>
              <select ref={genderRef} name="gender" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">{t('select_placeholder')}</option>
                <option value="male">{t('gender_male')}</option>
                <option value="female">{t('gender_female')}</option>
              </select>
            </div>

            <div className="field">
              <label>{t('country_label')} <span style={{ color: 'red' }}>*</span></label>
              <select ref={countryRef} name="country" value={country} onChange={(e) => setCountry(e.target.value)}>
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
                  {t('register_terms_agree_label')}
                </label>
              </div>
            </div>
            {/* Captcha Section */}
            <div className="field">
              <label>{t('captcha_label')} <span style={{ color: "red" }}>*</span></label>
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
                placeholder={t('register_captcha_input_placeholder')}
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

            <p style={{ marginTop: 16, textAlign: 'center', fontSize: 14 }}>
              {t('register_enterprise_prompt')}<Link href="/login/register_enterprise" style={{ color: '#0066cc', textDecoration: 'underline' }}>{t('register_enterprise_link')}</Link>
            </p>

            </form>
          )}
        </div>
      </section>

      {/* Onboarding questionnaire – shown inline after registration */}
      {ONBOARDING_ENABLED && showQuestionnaire && (
        <section className="section" style={{ marginTop: 0 }}>
          <OnboardingQuestionnaire
            mode="full"
            userId={registeredUserId ?? undefined}
            onComplete={() => {
              setShowQuestionnaire(false);
              setTimeout(() => router.push('/login'), 800);
            }}
            onSkip={() => {
              setShowQuestionnaire(false);
              setTimeout(() => router.push('/login'), 300);
            }}
          />
        </section>
      )}
    </div>
  );
}
