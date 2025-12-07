"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TEACHERS } from "@/data/teachers";
import { STUDENTS } from "@/data/students";
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
  const [uuid, setUuid] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<string>("");
  const [country, setCountry] = useState<string>("");
  const [bio, setBio] = useState("");
  const [plan, setPlan] = useState<PlanId>("basic");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // generate UUID once on mount
    if (!uuid) {
      const id = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : `id-${Math.random().toString(36).slice(2, 10)}`;
      setUuid(id);
    }
  }, [uuid]);

  const teacherCount = TEACHERS.length;
  const studentCount = STUDENTS.length;

  const countries = useMemo(() => ["台灣", "日本", "美國", "英國", "其他"], []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const profile = {
      id: uuid,
      role,
      nickname,
      birthdate,
      gender,
      country,
      bio,
      plan,
      createdAt: new Date().toISOString(),
    } as const;

    // Save to localStorage as a mock persistence layer
    try {
      const key = "jvtutor_profiles";
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      arr.push(profile);
      localStorage.setItem(key, JSON.stringify(arr));
      setSaved(true);
      setTimeout(() => router.push("/"), 800);
    } catch (err) {
      console.error(err);
      alert("儲存失敗，請在瀏覽器允許 localStorage 後重試。");
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>建立帳戶</h1>
        <p>
          目前在系統中：<strong>{studentCount}</strong> 位學生，<strong>{teacherCount}</strong> 位老師。
          請選擇身份並填寫下列完整資料。
        </p>
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
                <option value="other">其他/不願透露</option>
              </select>
            </div>

            <div className="field">
              <label>國家</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">請選擇</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
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

            <div className="modal-actions">
              <button type="submit" className="modal-button primary">建立帳戶</button>
              <Link href="/login" className="modal-button secondary">返回登入</Link>
            </div>

            {saved && <p className="form-success">已儲存（模擬） — 將在幾秒後導回首頁。</p>}
          </form>
        </div>
      </section>
    </div>
  );
}
