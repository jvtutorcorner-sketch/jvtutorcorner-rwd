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
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvSuccess, setCsvSuccess] = useState<{ count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // plan selection moved to user settings; registration defaults to 'viewer'

  const countries = useMemo(
    () => [
      { code: "TW", label: "台灣" },
      { code: "JP", label: "日本" },
      { code: "US", label: "美國" },
      { code: "GB", label: "英國" },
      { code: "HK", label: "香港" },
      { code: "MO", label: "澳門" },
      { code: "CN", label: "中國" },
      { code: "KR", label: "南韓" },
      { code: "SG", label: "新加坡" },
      { code: "MY", label: "馬來西亞" },
      { code: "AU", label: "澳洲" },
      { code: "NZ", label: "紐西蘭" },
      { code: "CA", label: "加拿大" },
      { code: "DE", label: "德國" },
      { code: "FR", label: "法國" },
      { code: "ES", label: "西班牙" },
      { code: "IT", label: "義大利" },
      { code: "IN", label: "印度" },
      { code: "BR", label: "巴西" },
      { code: "MX", label: "墨西哥" },
      { code: "ZA", label: "南非" },
    ],
    [],
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
      setFormError('請先勾選同意服務條款與隱私權政策');
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
      errors.push('身份（學生或教師）');
      fieldRefs['role'] = roleRef;
    }

    if (!firstName.trim()) {
      errors.push('First Name');
      fieldRefs['firstName'] = firstNameRef;
    }

    if (!lastName.trim()) {
      errors.push('Last Name');
      fieldRefs['lastName'] = lastNameRef;
    }

    if (!email.trim()) {
      errors.push('Email');
      fieldRefs['email'] = emailRef;
    }

    if (!password) {
      errors.push('密碼');
      fieldRefs['password'] = passwordRef;
    }

    if (!confirmPassword) {
      errors.push('確認密碼');
      fieldRefs['confirmPassword'] = confirmPasswordRef;
    } else if (password !== confirmPassword) {
      errors.push('密碼確認（密碼不相符）');
      fieldRefs['confirmPassword'] = confirmPasswordRef;
    }

    if (!birthdate) {
      errors.push('出生日期');
      fieldRefs['birthdate'] = birthdateRef;
    }

    if (!gender) {
      errors.push('性別');
      fieldRefs['gender'] = genderRef;
    }

    if (!country) {
      errors.push('國家');
      fieldRefs['country'] = countryRef;
    }

    if (errors.length > 0) {
      const errorMessage = `請填寫以下必填欄位：\n• ${errors.join('\n• ')}`;
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
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        // show server message inline instead of throwing an exception
        const message = data?.message || '註冊失敗';
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
      setFormError(err?.message || '儲存失敗');
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
      setCsvError('請選擇 CSV 檔案');
      setCsvFile(null);
      return;
    }

    setCsvFile(file);
    setCsvError(null);
  };

  // Parse and validate CSV
  const handleCsvImport = async () => {
    if (!csvFile) {
      setCsvError('請先選擇檔案');
      return;
    }

    try {
      const text = await csvFile.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        setCsvError('CSV 檔案格式錯誤：至少需要標題列和一筆資料');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());
      const requiredHeaders = ['email', 'password', 'firstName', 'lastName', 'role', 'birthdate', 'gender', 'country'];

      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        setCsvError(`CSV 檔案缺少必要欄位：${missingHeaders.join(', ')}`);
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
          errors.push(`第 ${i + 1} 列缺少欄位：${rowErrors.join(', ')}`);
        } else {
          records.push(record);
        }
      }

      if (errors.length > 0) {
        setCsvError(`資料驗證失敗：\n${errors.join('\n')}`);
        return;
      }

      // Import records
      let successCount = 0;
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
          plan: record.role === 'teacher' ? null : 'viewer',
          birthdate: record.birthdate,
          gender: record.gender,
          country: record.country,
          timezone: times.timezone,
          termsAccepted: true,
          createdAtUtc: times.utc,
          createdAtLocal: times.local,
          updatedAtUtc: times.utc,
          updatedAtLocal: times.local,
        };

        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          successCount++;
        }
      }

      setCsvSuccess({ count: successCount });
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Redirect after 5 seconds
      setTimeout(() => {
        router.push('/login');
      }, 5000);

    } catch (err: any) {
      setCsvError(`CSV 解析失敗：${err.message}`);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>企業建立帳戶</h1>
        <p>請選擇身份並填寫下列<strong>所有必填</strong>資料（標記 <span style={{ color: 'red' }}>*</span> 的欄位為必填）。</p>

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
            📁 選擇檔案
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
            📥 匯入CSV
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
            📄 下載範例CSV
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
            <h2 style={{ color: '#dc2626', marginBottom: 16 }}>❌ 匯入錯誤</h2>
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
              確定
            </button>
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
            maxWidth: 500,
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}>
            <h2 style={{ color: '#10b981', marginBottom: 16 }}>✅ 匯入完成</h2>
            <p style={{ fontSize: 18, marginBottom: 12 }}>成功匯入 <strong>{csvSuccess.count}</strong> 筆資料</p>
            <p style={{ color: '#6b7280' }}>5秒後將自動返回登入頁面，請確認登入帳號</p>
          </div>
        </div>
      )}

      <section className="section">
        <div className="card">
          <h2>基本資料</h2>
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="field">
              <label>身份 <span style={{ color: 'red' }}>*</span></label>
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
                <option value="">請選擇身份</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-row">
              <div className="field">
                <label>First Name <span style={{ color: 'red' }}>*</span></label>
                <input ref={firstNameRef} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="field">
                <label>Last Name <span style={{ color: 'red' }}>*</span></label>
                <input ref={lastNameRef} value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Email <span style={{ color: 'red' }}>*</span></label>
              <input ref={emailRef} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@domain.com" />
            </div>

            <div className="field">
              <label>密碼 <span style={{ color: 'red' }}>*</span></label>
              <input
                ref={passwordRef}
                type={showPasswords ? 'text' : 'password'}
                value={password}
                style={{ textAlign: 'left' }}
                onChange={(e) => {
                  setPassword(e.target.value);
                  // 當密碼改變時，重新驗證確認密碼
                  if (confirmPassword && e.target.value !== confirmPassword) {
                    setConfirmPasswordError('密碼確認不相符');
                  } else if (confirmPassword && e.target.value === confirmPassword) {
                    setConfirmPasswordError(null);
                  }
                }}
              />
            </div>

            <div className="field">
              <label>再次輸入密碼 <span style={{ color: 'red' }}>*</span></label>
              <input
                ref={confirmPasswordRef}
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                style={{ textAlign: 'left' }}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  // 即時驗證密碼匹配
                  if (e.target.value && password && e.target.value !== password) {
                    setConfirmPasswordError('密碼確認不相符');
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
              />
              <label htmlFor="showPasswords">顯示密碼</label>
            </div>

            <div className="field" style={{ display: 'none' }}>
              <label>自動生成 ID</label>
              <input
                value={uuid}
                readOnly
                disabled
                aria-label="自動生成 ID（已鎖定）"
                style={{ background: '#f3f4f6', cursor: 'not-allowed' }}
              />
            </div>

            <div className="field">
              <label>出生日期 <span style={{ color: 'red' }}>*</span></label>
              <input ref={birthdateRef} type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
            </div>

            <div className="field">
              <label>性別 <span style={{ color: 'red' }}>*</span></label>
              <select ref={genderRef} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">請選擇</option>
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
            </div>

            <div className="field">
              <label>國家 <span style={{ color: 'red' }}>*</span></label>
              <select ref={countryRef} value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">請選擇</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>{`${c.label} ${c.code}`}</option>
                ))}
              </select>
            </div>



            {/* Plan selection moved to user settings — registration defaults to viewer */}

            {/* Payment details moved to user settings after login; registration does not collect card info. */}

            <div className="field">
              <label>服務條款與隱私權政策 <span style={{ color: 'red' }}>*</span></label>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p>請先閱讀我們的 <Link href="/terms" target="_blank" style={{ color: '#0066cc', textDecoration: 'underline' }}>服務條款與隱私權政策</Link></p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    name="terms"
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    style={{ marginRight: 8 }}
                  />
                  我已閱讀並同意服務條款與隱私權政策
                </label>
              </div>
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
            <div className="modal-actions" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button type="submit" className="modal-button primary">
                建立帳戶
              </button>
              <button
                type="button"
                onClick={downloadSampleCSV}
                className="modal-button"
                style={{
                  background: 'linear-gradient(90deg, #10b981, #059669)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                📥 匯入CSV（下載範例）
              </button>
              <Link href="/login" className="modal-button secondary">返回登入</Link>
            </div>

            {saved && <p className="form-success">已儲存（模擬） — 將在幾秒後導回首頁。</p>}
          </form>
        </div>
      </section>
    </div>
  );
}
