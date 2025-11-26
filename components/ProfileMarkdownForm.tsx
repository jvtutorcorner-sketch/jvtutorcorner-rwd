// components/ProfileMarkdownForm.tsx
'use client';

import { useEffect, useState, FormEvent } from 'react';

type Role = 'teacher' | 'student';

type Props = {
  role: Role;
};

type Gender = 'male' | 'female' | 'other' | '';

export function ProfileMarkdownForm({ role }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<Gender>('');
  const [nickname, setNickname] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [country, setCountry] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [languages, setLanguages] = useState('');
  const [timezone, setTimezone] = useState('');
  const [subjects, setSubjects] = useState(''); // 老師：授課科目／領域；學生：主要學習科目
  const [gradeLevel, setGradeLevel] = useState(''); // 學生年級 or 族群
  const [headline, setHeadline] = useState(''); // 個人標語
  const [bio, setBio] = useState(''); // Markdown 自我介紹
  const [notes, setNotes] = useState(''); // 內部備註

  const [accountId, setAccountId] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [copied, setCopied] = useState(false);

  // 初始化產一個帳號 ID
  useEffect(() => {
    generateAccountId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateAccountId = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    const prefix = role === 'teacher' ? 'T' : 'S';
    setAccountId(`${prefix}-${yyyy}${mm}${dd}-${rand}`);
  };

  const handleGenerate = (e?: FormEvent) => {
    if (e) e.preventDefault();
    const fullName = `${lastName} ${firstName}`.trim();
    const displayName = nickname
      ? `${fullName}（${nickname}）`
      : fullName || nickname || '(未填姓名)';

    const genderText =
      gender === 'male' ? '男' : gender === 'female' ? '女' : gender === 'other' ? '其他' : '';

    const lines: string[] = [];

    lines.push(`# ${role === 'teacher' ? 'Teacher Profile' : 'Student Profile'}`);
    lines.push('');
    lines.push(`- **Account ID**: \`${accountId || '(未產生)'}\``);
    lines.push(`- **Role**: ${role === 'teacher' ? 'Teacher / 老師' : 'Student / 學生'}`);
    lines.push(`- **Name**: ${displayName}`);
    if (genderText) lines.push(`- **Gender**: ${genderText}`);
    if (birthDate) lines.push(`- **Date of Birth**: ${birthDate}`);
    if (country) lines.push(`- **Country/Region**: ${country}`);
    if (email) lines.push(`- **Email**: ${email}`);
    if (phone) lines.push(`- **Phone**: ${phone}`);
    if (languages) lines.push(`- **Languages**: ${languages}`);
    if (timezone) lines.push(`- **Preferred Timezone**: ${timezone}`);

    if (role === 'teacher') {
      if (subjects) lines.push(`- **Teaching Subjects / Fields**: ${subjects}`);
    } else {
      if (gradeLevel) lines.push(`- **Grade / Level**: ${gradeLevel}`);
      if (subjects) lines.push(`- **Main Subjects / Focus**: ${subjects}`);
    }

    if (headline) {
      lines.push('');
      lines.push('## Headline / 標語');
      lines.push('');
      lines.push(headline);
    }

    if (bio) {
      lines.push('');
      lines.push('## Bio / 自我介紹');
      lines.push('');
      lines.push(bio);
    }

    if (notes) {
      lines.push('');
      lines.push('## Internal Notes / 內部備註');
      lines.push('');
      lines.push(notes);
    }

    const generated = lines.join('\n');
    setMarkdown(generated);
    setCopied(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      alert('複製失敗，可能瀏覽器不支援自動複製。');
    }
  };

  const title = role === 'teacher' ? '老師 Markdown 資料輸入' : '學生 Markdown 資料輸入';

  return (
    <div className="page">
      <header className="page-header">
        <h1>{title}</h1>
        <p>
          填寫基本資料後，系統會自動產生一份{' '}
          <strong>Markdown 格式</strong> 的簡歷，可以複製到 Notion / Git
          / 內部 Wiki 使用，未來也方便做資料分析。
        </p>
      </header>

      <section className="section">
        <div className="card">
          <h2>基本資料 Basic Info</h2>

          <form className="modal-form" onSubmit={handleGenerate}>
            {/* 帳號 ID */}
            <div className="field">
              <label>帳號 ID（自動產生，可重產）</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder="例如：T-20251126-ABC123"
                />
                <button
                  type="button"
                  className="modal-button secondary"
                  onClick={generateAccountId}
                >
                  重新產生
                </button>
              </div>
            </div>

            {/* 姓名 */}
            <div className="field-row">
              <div className="field">
                <label>Last Name（姓）</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="例如：陳"
                />
              </div>
              <div className="field">
                <label>First Name（名）</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="例如：小明"
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Nickname（暱稱）</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="例如：Ming、Kevin 老師"
                />
              </div>
              <div className="field">
                <label>Gender（性別）</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as Gender)}
                >
                  <option value="">未指定</option>
                  <option value="male">男</option>
                  <option value="female">女</option>
                  <option value="other">其他 / 不方便透露</option>
                </select>
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>出生年月日</label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>國家 / 地區</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="例如：Taiwan、Japan"
                />
              </div>
            </div>

            {/* 聯絡與偏好 */}
            <h3 style={{ marginTop: '1.5rem' }}>聯絡方式 & 偏好 Contact & Preferences</h3>

            <div className="field-row">
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div className="field">
                <label>Phone / 行動電話</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="選填，例如：+886-9xx-xxx-xxx"
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>語言（Languages）</label>
                <input
                  type="text"
                  value={languages}
                  onChange={(e) => setLanguages(e.target.value)}
                  placeholder="例如：中文（母語）、英文（中高級）"
                />
              </div>
              <div className="field">
                <label>時區（Timezone）</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="例如：Asia/Taipei、UTC+8"
                />
              </div>
            </div>

            {/* 角色相關欄位 */}
            {role === 'teacher' ? (
              <>
                <h3 style={{ marginTop: '1.5rem' }}>老師資訊 Teacher Info</h3>
                <div className="field">
                  <label>授課科目 / 領域（Subjects / Fields）</label>
                  <input
                    type="text"
                    value={subjects}
                    onChange={(e) => setSubjects(e.target.value)}
                    placeholder="例如：國中英文、高中英文寫作、多益口說"
                  />
                </div>
              </>
            ) : (
              <>
                <h3 style={{ marginTop: '1.5rem' }}>學生資訊 Student Info</h3>
                <div className="field-row">
                  <div className="field">
                    <label>年級 / 身份（Grade / Level）</label>
                    <input
                      type="text"
                      value={gradeLevel}
                      onChange={(e) => setGradeLevel(e.target.value)}
                      placeholder="例如：國二、高一、成人職場英文"
                    />
                  </div>
                  <div className="field">
                    <label>主要學習科目（Main Subjects）</label>
                    <input
                      type="text"
                      value={subjects}
                      onChange={(e) => setSubjects(e.target.value)}
                      placeholder="例如：英文會話、學測英文、數學"
                    />
                  </div>
                </div>
              </>
            )}

            {/* 自我介紹 & 備註 */}
            <h3 style={{ marginTop: '1.5rem' }}>自我介紹（Markdown 可編輯）</h3>
            <div className="field">
              <label>個人標語 / 標題（Headline）</label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="例如：專攻國中會考英文｜三年帶出 50+ A++ 學生"
              />
            </div>

            <div className="field">
              <label>自我介紹（支援 Markdown）</label>
              <textarea
                rows={6}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="可以用 Markdown 撰寫，例如：\n\n- 教學年資 5 年\n- 擅長把複雜文法變成生活化例句\n- 課堂氛圍輕鬆但要求明確"
              />
            </div>

            <div className="field">
              <label>內部備註（僅團隊可見，可記錄來源、簽約狀態等）</label>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="例如：\n- 2025-11 初次面談，擅長青少年族群\n- 來源：FB 廣告\n- 預計 12 月上線試跑 3 名學生"
              />
            </div>

            <div className="modal-actions">
              <button type="submit" className="modal-button primary">
                產生 Markdown
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Markdown 預覽 / 複製 */}
      <section className="section">
        <div className="card">
          <h2>產生結果（Markdown）</h2>
          <p>
            按下「產生 Markdown」之後，下方會更新。可直接複製貼到 Notion、
            Confluence、Git 專案文件中。
          </p>
          <div className="field">
            <label>Markdown 內容</label>
            <textarea
              rows={16}
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
            />
          </div>
          <div className="card-actions">
            <button
              type="button"
              className="card-button primary"
              onClick={handleCopy}
              disabled={!markdown}
            >
              {copied ? '已複製！' : '複製 Markdown'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
