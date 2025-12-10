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
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [uuid, setUuid] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<string>("");
  const [country, setCountry] = useState<string>("");
  const [bio, setBio] = useState("");
  const [plan, setPlan] = useState<PlanId | null>("viewer");
  // credit card fields moved to post-login settings; do not collect on registration
  const [saved, setSaved] = useState(false);
  const [termsHtml, setTermsHtml] = useState<string | null>(null);
  const [termsScrolledToBottom, setTermsScrolledToBottom] = useState(false);
  const termsRef = useRef<HTMLDivElement | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    // generate UUID once on mount
    if (!uuid) {
      const id = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : `id-${Math.random().toString(36).slice(2, 10)}`;
      setUuid(id);
    }
  }, [uuid]);

  useEffect(() => {
    // load the terms HTML (same-origin) into the page for scroll detection
    let mounted = true;
    fetch('/terms.html')
      .then((r) => r.text())
      .then((t) => {
        if (mounted) setTermsHtml(t);
      })
      .catch(() => setTermsHtml(null));
    return () => { mounted = false; };
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

    // map country code -> IANA time zone name (used for local formatting)
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
    if (!email || !password) {
      setFormError('請填寫 Email 與密碼');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('密碼與確認密碼不相符');
      return;
    }

    // Payment/card capture is done after login in user settings; registration does not store card data.

    const combinedName = `${firstName || ''} ${lastName || ''}`.trim();

    if (!termsAccepted) {
      setFormError('請先閱讀並同意服務條款與隱私權政策。');
      return;
    }

    // validate bio length
    if (bio && bio.length > 500) {
      setFormError('自我介紹請勿超過 500 字');
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
      bio: bio || undefined,
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

  // Preview the exact DynamoDB-like item that will be written (for developer visibility)
  const getDynamoPreview = () => {
    const tz = countryTimezones[country || 'TW'] || 'UTC';
    const t = formatLocalIso(tz);
    const combinedName = `${firstName || ''} ${lastName || ''}`.trim();
    return {
      roid_id: uuid,
      email: email.trim().toLowerCase(),
      password: password || undefined,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      nickname: combinedName || undefined,
      role,
      plan: plan ?? null,
      country: country || undefined,
      timezone: t.timezone,
      termsAccepted: !!termsAccepted,
      createdAtUtc: t.utc,
      updatedAtUtc: t.utc,
      bio: bio || undefined,
    } as const;
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>建立帳戶</h1>
        <p>請選擇身份並填寫下列完整資料。</p>
      </header>

      <section className="section">
        <div className="card">
          <h2>基本資料</h2>
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="field">
              <label>身份</label>
              <div style={{ display: "flex", gap: 8 }}>
                <label>
                  <input
                    type="radio"
                    name="role"
                    checked={role === "student"}
                    onChange={() => {
                      setRole("student");
                      if (plan === null) setPlan('viewer');
                    }}
                  /> Student
                </label>
                <label>
                  <input
                    type="radio"
                    name="role"
                    checked={role === "teacher"}
                    onChange={() => {
                        setRole("teacher");
                        setPlan(null);
                      }}
                  /> Teacher
                </label>
              </div>
            </div>

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

            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@domain.com" />
            </div>

            <div className="field">
              <label>密碼</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                value={password}
                style={{ textAlign: 'left' }}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="field">
              <label>再次輸入密碼</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                style={{ textAlign: 'left' }}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
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

            <div className="field">
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
              <label>出生日期</label>
              <input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
            </div>

            <div className="field">
              <label>性別</label>
              <select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">請選擇</option>
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
            </div>

            <div className="field">
              <label>國家</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">請選擇</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>{`${c.label} ${c.code}`}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>自我介紹（Markdown 支援）</label>
              <textarea
                rows={6}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={
                  `例如：我愛教育（限制500字）\n` +
                  `e.g.: I love education (max 500 characters)`
                }
              />
              <small>預覽：</small>
              <div className="card" style={{ padding: 12 }} dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(bio) }} />
            </div>

            {/* Plan selection moved to user settings — registration defaults to viewer */}

            <div className="field">
              <label>將寫入的 DynamoDB schema（預覽）</label>
              <pre style={{ background: '#111827', color: '#f8fafc', padding: 12, borderRadius: 8, maxHeight: 240, overflow: 'auto' }}>{JSON.stringify(getDynamoPreview(), null, 2)}</pre>
            </div>

            {/* Payment details moved to user settings after login; registration does not collect card info. */}

            <div className="field">
              <label>服務條款（請閱讀下方內容至最底後方可勾選同意）</label>
              <div style={{ border: '1px solid #ddd', height: 240, overflow: 'auto' }}
                ref={(el) => {
                  termsRef.current = el;
                  if (el) {
                    const onScroll = () => {
                      if (!el) return;
                      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
                      setTermsScrolledToBottom(nearBottom);
                    };
                    el.addEventListener('scroll', onScroll);
                    // check initial
                    onScroll();
                  }
                }}
                dangerouslySetInnerHTML={{ __html: termsHtml || '<p>載入條款中... 或放置一份 PDF 到 public/terms.pdf 並提供下載。</p>' }}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    disabled={!termsScrolledToBottom}
                    style={{ marginRight: 8 }}
                  />
                  我已閱讀並同意服務條款與隱私權政策
                </label>
                {!termsScrolledToBottom && <small className="muted">請捲動到最底部以啟用勾選</small>}
              </div>
            </div>
            {formError && <p className="form-error">{formError}</p>}
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button type="submit" className="modal-button primary" disabled={!termsAccepted}>
                建立帳戶
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
