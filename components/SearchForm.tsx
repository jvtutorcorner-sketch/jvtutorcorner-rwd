"use client";

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT } from './IntlProvider';

type Props = {
  initial?: {
    subject?: string;
    language?: string;
    region?: string;
    mode?: string;
    teacher?: string;
  };
  targetPath?: string; // e.g. '/teachers' or '/courses'
  subjectOptions?: string[];
  languageOptions?: string[];
  regionOptions?: string[];
  modeOptions?: string[];
  // add teacher initial for courses page
  teacherOptions?: string[];
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
  const t = useT();
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [language, setLanguage] = useState(initial?.language ?? '');
  const [teacher, setTeacher] = useState(initial?.teacher ?? '');
  const [region, setRegion] = useState(initial?.region ?? '');
  const [mode, setMode] = useState<'online' | 'onsite' | ''>(
    (initial?.mode as 'online' | 'onsite' | '') ?? ''
  );

  const isTeacherPage = (targetPath || '').startsWith('/teachers');
  const isCoursePage = (targetPath || '').startsWith('/courses');
  // hide region and mode on teacher and course pages per UX request
  const hideRegionAndMode = isTeacherPage || isCoursePage;


  const handleSearch = (e?: FormEvent) => {
    if (e) e.preventDefault();

    const params = new URLSearchParams();
    // For teacher and course pages, use trimmed fuzzy inputs for teacher+language
    if (isTeacherPage || isCoursePage) {
      const l = language.trim();
      const t = teacher.trim();
      if (l) params.set('language', l);
      if (t) params.set('teacher', t);
    } else {
      // other pages keep subject/language selects
      if (subject) params.set('subject', subject);
      if (language) params.set('language', language);
    }

    if (!hideRegionAndMode) {
      if (region) params.set('region', region);
      if (mode) params.set('mode', mode);
    }

    const base = targetPath || window.location.pathname;
    const url = params.toString() ? `${base}?${params.toString()}` : base;

    router.push(url);
  };

  return (
    <div className="search-block">
      <form className="search-form" onSubmit={handleSearch}>
            <div className="search-row">
                <div className="field">
                  {/* If on teachers or courses, show teacher text input instead of subject */}
                  {(isTeacherPage || isCoursePage) ? (
                    <div className="field">
                      <label>{t('teacher')}</label>
                      <input
                        value={teacher}
                        onChange={(e) => setTeacher(e.target.value)}
                        placeholder={t('search_teacher_placeholder')}
                      />
                    </div>
                  ) : (
                    <div className="field">
                      <label>{t('subject')}</label>
                      <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                        <option value="">{t('unlimited')}</option>
                        {(subjectOptions ?? ['英文', '數學', '日文']).map((s: string) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="field">
                  <label>{t('teaching_language')}</label>
                  {isTeacherPage || isCoursePage ? (
                    <input
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      placeholder={t('search_language_placeholder')}
                    />
                  ) : (
                    <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                      <option value="">{t('unlimited')}</option>
                      {(languageOptions ?? ['中文', '英文', '日文']).map((l: string) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  )}
                {/* teacher input shown above for teacher/course pages */}
                </div>
                
            </div>

        {!hideRegionAndMode && (
          <div className="search-row">
            <div className="field">
              <label>{t('region')}</label>
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">{t('online_unlimited')}</option>
                {(regionOptions ?? ['線上', '台北', '新北', '東京', '其他']).map((r: string) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('teaching_mode')}</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'online' | 'onsite' | '')}
              >
                <option value="">{t('unlimited')}</option>
                {(modeOptions ?? ['online', 'onsite']).map((m: string) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="search-actions">
          <button type="submit" className="search-button">
            {t('search')}
          </button>
        </div>
      </form>
    </div>
  );
}
