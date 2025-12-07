"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PLAN_LABELS,
  PLAN_DESCRIPTIONS,
  PlanId,
} from "@/lib/mockAuth";

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
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [uuid, setUuid] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<string>("");
  const [country, setCountry] = useState<string>("");
  const [bio, setBio] = useState("");
  const [plan, setPlan] = useState<PlanId>("basic");
  const [saved, setSaved] = useState(false);
  const [termsHtml, setTermsHtml] = useState<string | null>(null);
  const [termsScrolledToBottom, setTermsScrolledToBottom] = useState(false);
  const termsRef = useRef<HTMLDivElement | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      alert('請填寫 Email 與密碼');
      return;
    }

    const payload = {
      id: uuid,
      role,
      nickname,
      email: email.trim().toLowerCase(),
      password,
      birthdate,
      gender,
      country,
      bio,
      plan,
      createdAt: new Date().toISOString(),
    } as const;

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || '註冊失敗');
      setSaved(true);
      setTimeout(() => router.push('/login'), 900);
    } catch (err: any) {
      console.error(err);
      alert(err.message || '儲存失敗');
    }
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
                  <input type="radio" name="role" checked={role === "student"} onChange={() => setRole("student")} /> Student
                </label>
                <label>
                  <input type="radio" name="role" checked={role === "teacher"} onChange={() => setRole("teacher")} /> Teacher
                </label>
              </div>
            </div>

            <div className="field">
              <label>暱稱</label>
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </div>

            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@domain.com" />
            </div>

            <div className="field">
              <label>密碼</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <div className="field">
              <label>自動生成 ID</label>
              <input value={uuid} readOnly />
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
              <textarea rows={6} value={bio} onChange={(e) => setBio(e.target.value)} placeholder={`使用 Markdown 撰寫，例如：\n# 教學經驗\n**10 年**教學`} />
              <small>預覽：</small>
              <div className="card" style={{ padding: 12 }} dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(bio) }} />
            </div>

            <div className="field">
              <label>方案選擇與價格</label>
              <select value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
                {Object.keys(PLAN_LABELS).map((k) => (
                  <option key={k} value={k}>{PLAN_LABELS[k as PlanId]}</option>
                ))}
              </select>
              <p className="muted">{PLAN_DESCRIPTIONS[plan]}</p>
            </div>

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
                <a href="/terms.pdf" target="_blank" rel="noreferrer" className="card-button secondary">下載 PDF</a>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" required disabled={!termsScrolledToBottom} style={{ marginRight: 8 }} />
                  我已閱讀並同意服務條款與隱私權政策
                </label>
                {!termsScrolledToBottom && <small className="muted">請捲動到最底部以啟用勾選</small>}
              </div>
            </div>

            {saved && <p className="form-success">已儲存（模擬） — 將在幾秒後導回首頁。</p>}
          </form>
        </div>
      </section>
    </div>
  );
}
