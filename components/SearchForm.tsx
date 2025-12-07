"use client";

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Props = {
  initial?: {
    subject?: string;
    language?: string;
    region?: string;
    mode?: string;
  };
  targetPath?: string; // e.g. '/teachers' or '/courses'
  subjectOptions?: string[];
  languageOptions?: string[];
  regionOptions?: string[];
  modeOptions?: string[];
};

export default function SearchForm({
  initial,
  targetPath = '',
  subjectOptions,
  languageOptions,
  regionOptions,
  modeOptions,
}: Props) {
  const router = useRouter();
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [language, setLanguage] = useState(initial?.language ?? '');
  const [region, setRegion] = useState(initial?.region ?? '');
  const [mode, setMode] = useState<'online' | 'onsite' | ''>(
    (initial?.mode as 'online' | 'onsite' | '') ?? ''
  );


  const handleSearch = (e?: FormEvent) => {
    if (e) e.preventDefault();

    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (language) params.set('language', language);
    if (region) params.set('region', region);
    if (mode) params.set('mode', mode);

    const base = targetPath || window.location.pathname;
    const url = params.toString() ? `${base}?${params.toString()}` : base;

    router.push(url);
  };

  return (
    <div className="search-block">
      <form className="search-form" onSubmit={handleSearch}>
            <div className="search-row">
              <div className="field">
                <label>科目</label>
                <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                  <option value="">不限</option>
                  {(subjectOptions ?? ['英文', '數學', '日文']).map((s: string) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>授課語言</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="">不限</option>
                  {(languageOptions ?? ['中文', '英文', '日文']).map((l: string) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

        <div className="search-row">
          <div className="field">
            <label>地區</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">線上 / 不限</option>
              {(regionOptions ?? ['線上', '台北', '新北', '東京', '其他']).map((r: string) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>授課方式</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'online' | 'onsite' | '')}
            >
              <option value="">不限</option>
              {(modeOptions ?? ['online', 'onsite']).map((m: string) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="search-actions">
          <button type="submit" className="search-button">
            搜尋
          </button>
        </div>
      </form>
    </div>
  );
}
