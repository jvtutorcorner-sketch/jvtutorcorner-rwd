"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PLAN_LABELS,
  PLAN_DESCRIPTIONS,
  PlanId,
} from "@/lib/mockAuth";
import { PLAN_PRICES, PLAN_FEATURES } from "@/lib/mockAuth";
import { useT } from "@/components/IntlProvider";

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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [roles, setRoles] = useState<Array<{ id: string, name: string }>>([]);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; domain?: string; availableSeats: number }>>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvSuccess, setCsvSuccess] = useState<{ count: number; results: Array<{ email: string; ok: boolean; error?: string }> } | null>(null);
  const [csvProgress, setCsvProgress] = useState<{ done: number; total: number } | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);
  const [captchaValue, setCaptchaValue] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    if (!selectedOrgId) {
      errors.push(t('register_enterprise_org_label'));
      fieldRefs['org'] = orgRef;
    }

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
        const message = data?.message || t('register_error_register_failed');
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
      setFormError(err?.message || t('save_failed'));
    }
  };

  // Function to download sample CSV
  const downloadSampleCSV = () => {
    const headers = ['email', 'password', 'firstName', 'lastName', 'role', 'birthdate', 'gender', 'country'];
    const sampleData = [
      ['student@example.com', 'password123', 'John', 'Doe', 'student', '2000-01-01', 'male', 'TW'],
      ['teacher@example.com', 'password456', 'Jane', 'Smith', 'teacher', '1985-05-15', 'female', 'US'],
    ];

    const csvContent = [
      headers.join(','),
      ...sampleData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', 'sample_registration.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setCsvError(t('register_enterprise_csv_error_invalid_file'));
      setCsvFile(null);
      return;
    }

    setCsvFile(file);
    setCsvError(null);
  };

  // Parse and validate CSV
  const handleCsvImport = async () => {
    if (!csvFile) {
      setCsvError(t('register_enterprise_csv_error_no_file'));
      return;
    }

    if (!selectedOrgId) {
      setCsvError(t('register_enterprise_csv_error_no_org'));
      return;
    }

    try {
      const text = await csvFile.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        setCsvError(t('register_enterprise_csv_error_format'));
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());
      const requiredHeaders = ['email', 'password', 'firstName', 'lastName', 'role', 'birthdate', 'gender', 'country'];

      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        setCsvError(t('register_enterprise_csv_error_missing_headers').replace('{headers}', missingHeaders.join(', ')));
        return;
      }

      const records = [];
      const errors = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const record: any = {};

        headers.forEach((header, index) => {
          record[header] = values[index] || '';
        });

        // Validate required fields
        const rowErrors = [];
        if (!record.email) rowErrors.push('email');
        if (!record.password) rowErrors.push('password');
        if (!record.firstName) rowErrors.push('firstName');
        if (!record.lastName) rowErrors.push('lastName');
        if (!record.role) rowErrors.push('role');
        if (!record.birthdate) rowErrors.push('birthdate');
        if (!record.gender) rowErrors.push('gender');
        if (!record.country) rowErrors.push('country');

        if (rowErrors.length > 0) {
          errors.push(t('register_enterprise_csv_row_missing_fields').replace('{row}', String(i + 1)).replace('{fields}', rowErrors.join(', ')));
        } else {
          records.push(record);
        }
      }

      if (errors.length > 0) {
        setCsvError(`${t('register_enterprise_csv_validation_failed')}\n${errors.join('\n')}`);
        return;
      }

      // CSV 內部重複 email 偵測 — 提早擋下，避免必定發生的 409 才在中途失敗
      const emailCounts = new Map<string, number>();
      records.forEach((r) => {
        const key = r.email.toLowerCase();
        emailCounts.set(key, (emailCounts.get(key) || 0) + 1);
      });
      const duplicateEmails = Array.from(emailCounts.entries()).filter(([, count]) => count > 1).map(([e]) => e);
      if (duplicateEmails.length > 0) {
        setCsvError(`${t('register_enterprise_csv_duplicate_emails')}\n${duplicateEmails.join('\n')}`);
        return;
      }

      // 整批前置校驗 — 用「當下」剩餘席次（重新抓取，不用掛載時的舊快照）比對整批筆數，
      // 超過就整批拒絕，避免前面幾筆先建立、後面幾筆才失敗的半吊子狀態
      const freshOrgs = await loadOrgs();
      const freshOrg = freshOrgs.find((o) => o.id === selectedOrgId);
      if (!freshOrg) {
        setCsvError(t('register_enterprise_csv_org_gone'));
        return;
      }
      if (records.length > freshOrg.availableSeats) {
        setCsvError(
          t('register_enterprise_csv_seats_exceeded')
            .replace('{count}', String(records.length))
            .replace('{orgName}', freshOrg.name)
            .replace('{seats}', String(freshOrg.availableSeats))
        );
        return;
      }

      // Import records sequentially — the transactional seat-consuming assignment on the
      // server needs to serialize anyway, and this lets us collect a per-row result.
      const results: Array<{ email: string; ok: boolean; error?: string }> = [];
      setCsvProgress({ done: 0, total: records.length });

      for (const record of records) {
        const timezoneName = countryTimezones[record.country] || 'UTC';
        const times = formatLocalIso(timezoneName);

        const payload = {
          roid_id: `csv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          email: record.email.toLowerCase(),
          password: record.password,
          firstName: record.firstName,
          lastName: record.lastName,
          role: record.role,
          birthdate: record.birthdate,
          gender: record.gender,
          country: record.country,
          timezone: times.timezone,
          termsAccepted: true,
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
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          results.push({ email: record.email, ok: res.ok, error: res.ok ? undefined : (data?.message || t('register_enterprise_csv_row_import_failed')) });
        } catch (rowErr: any) {
          results.push({ email: record.email, ok: false, error: rowErr?.message || t('register_enterprise_csv_network_error') });
        }

        setCsvProgress((prev) => (prev ? { done: prev.done + 1, total: prev.total } : prev));
      }

      const successCount = results.filter((r) => r.ok).length;
      setCsvProgress(null);
      setCsvSuccess({ count: successCount, results });
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadOrgs();

      // Redirect after 5 seconds only if everything succeeded
      if (successCount === results.length) {
        setTimeout(() => {
          router.push('/login');
        }, 5000);
      }

    } catch (err: any) {
      setCsvProgress(null);
      setCsvError(`${t('register_enterprise_csv_parse_failed')}${err.message}`);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>{t('register_enterprise_title')}</h1>
        <p>{t('register_subtitle_before')}<strong>{t('register_subtitle_bold')}</strong>{t('register_subtitle_after')}<span style={{ color: 'red' }}>*</span>{t('register_subtitle_after_asterisk')}</p>

        {/* CSV Import Section */}
        <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            {t('register_enterprise_select_file')}
          </button>
          <button
            type="button"
            onClick={handleCsvImport}
            disabled={!csvFile}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: csvFile ? '#10b981' : '#9ca3af',
              color: '#fff',
              border: 'none',
              cursor: csvFile ? 'pointer' : 'not-allowed',
              fontWeight: 600
            }}
          >
            {t('register_enterprise_import_csv')}
          </button>
          <button
            type="button"
            onClick={downloadSampleCSV}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: '#f59e0b',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            {t('register_enterprise_download_sample_csv')}
          </button>
          {csvFile && <span style={{ color: '#059669', fontWeight: 600 }}>✓ {csvFile.name}</span>}
        </div>
      </header>

      {/* CSV Error Dialog */}
      {csvError && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#fff',
            padding: 24,
            borderRadius: 12,
            maxWidth: 500,
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }}>
            <h2 style={{ color: '#dc2626', marginBottom: 16 }}>{t('register_enterprise_import_error_title')}</h2>
            <p style={{ whiteSpace: 'pre-line', marginBottom: 20 }}>{csvError}</p>
            <button
              onClick={() => setCsvError(null)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {t('register_enterprise_ok_button')}
            </button>
          </div>
        </div>
      )}

      {/* CSV Import Progress */}
      {csvProgress && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#fff',
            padding: 24,
            borderRadius: 12,
            maxWidth: 400,
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}>
            <p style={{ fontSize: 16, fontWeight: 600 }}>{t('register_enterprise_importing_progress').replace('{done}', String(csvProgress.done)).replace('{total}', String(csvProgress.total))}</p>
          </div>
        </div>
      )}

      {/* CSV Success Dialog */}
      {csvSuccess && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#fff',
            padding: 24,
            borderRadius: 12,
            maxWidth: 560,
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            textAlign: 'left'
          }}>
            <h2 style={{ color: csvSuccess.count === csvSuccess.results.length ? '#10b981' : '#f59e0b', marginBottom: 16, textAlign: 'center' }}>
              {csvSuccess.count === csvSuccess.results.length ? t('register_enterprise_import_complete_title') : t('register_enterprise_import_partial_fail_title')}
            </h2>
            <p style={{ fontSize: 18, marginBottom: 12, textAlign: 'center' }}>
              {t('register_enterprise_import_result_summary')
                .replace('{success}', String(csvSuccess.count))
                .replace('{fail}', String(csvSuccess.results.length - csvSuccess.count))}
            </p>
            {csvSuccess.results.some((r) => !r.ok) && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <p style={{ fontWeight: 600, marginBottom: 6 }}>{t('register_enterprise_fail_list_title')}</p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {csvSuccess.results.filter((r) => !r.ok).map((r, idx) => (
                    <li key={idx}>{r.email}：{r.error}</li>
                  ))}
                </ul>
              </div>
            )}
            <p style={{ color: '#6b7280', textAlign: 'center' }}>
              {csvSuccess.count === csvSuccess.results.length
                ? t('register_enterprise_redirect_notice')
                : t('register_enterprise_fix_and_retry_notice')}
            </p>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button
                onClick={() => setCsvSuccess(null)}
                style={{ padding: '8px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                {t('dismiss')}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="section">
        <div className="card">
          <h2>{t('register_basic_info_title')}</h2>
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="field">
              <label>{t('register_enterprise_org_label')} <span style={{ color: 'red' }}>*</span></label>
              <select
                ref={orgRef}
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                style={{ cursor: 'pointer' }}
              >
                <option value="">{orgsLoading ? t('loading') : t('register_enterprise_select_org_placeholder')}</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id} disabled={o.availableSeats <= 0}>
                    {o.name}{o.availableSeats <= 0 ? t('register_enterprise_seats_full') : ` ${t('register_enterprise_seats_remaining').replace('{seats}', String(o.availableSeats))}`}
                  </option>
                ))}
              </select>
              {!orgsLoading && orgs.length === 0 && (
                <p style={{ color: '#c33', fontSize: 13, marginTop: 4 }}>
                  {t('register_enterprise_no_orgs_available')}
                </p>
              )}
            </div>

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
              <label>{t('email')} <span style={{ color: 'red' }}>*</span></label>
              <input ref={emailRef} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@domain.com" />
              {emailDomainMismatch && (
                <div style={{ color: '#c33', fontSize: 13, marginTop: 4, fontWeight: 'bold' }}>
                  ⚠️ {t('register_enterprise_email_domain_mismatch')
                    .replace('{orgName}', selectedOrg?.name || '')
                    .replace('{domain}', selectedOrg?.domain?.replace(/^@/, '') || '')}
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

            {saved && <p className="form-success">{t('register_enterprise_saved_notice')}</p>}
          </form>
        </div>
      </section>
    </div>
  );
}
