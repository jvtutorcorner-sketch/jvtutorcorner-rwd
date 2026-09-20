"use client";
// components/TeacherCard.tsx
import Link from 'next/link';
import { useT } from './IntlProvider';
import { subjectKey } from '@/lib/subjectI18n';

/** DynamoDB 老師列欄位不固定（name/displayName、id/roid_id 等），以寬鬆型別容納。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TeacherLike = Record<string, any>;

interface TeacherCardProps {
  teacher: TeacherLike;
}

const DEFAULT_AVATAR = '/images/default-avatar.svg';

export const TeacherCard: React.FC<TeacherCardProps> = ({ teacher }) => {
  const id = teacher.id || teacher.roid_id;
  const href = id
    ? `/teachers/${encodeURIComponent(String(id))}`
    : `/teachers?teacher=${encodeURIComponent(String(teacher.name || teacher.displayName || ''))}`;
  const t = useT();
  const tt = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  const name = teacher.name || teacher.displayName || '';
  const subjects = Array.isArray(teacher.subjects) ? teacher.subjects : [];
  const languages = Array.isArray(teacher.languages) ? teacher.languages : [];
  const subjectsLabel = subjects.map((s) => tt(subjectKey(s), s)).join(' · ');

  return (
    <Link href={href} className="card card-link teacher-card">
      <div className="card-header">
        <img
          src={teacher.avatarUrl || DEFAULT_AVATAR}
          alt={name}
          className="card-avatar"
          width={64}
          height={64}
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src.indexOf(DEFAULT_AVATAR) === -1) img.src = DEFAULT_AVATAR;
          }}
        />
        <div>
          <h3 className="card-title">{tt(`teachers.${id}.name`, name)}</h3>
          {subjectsLabel && (
            <p className="card-subtitle">{tt(`teachers.${id}.subjects`, subjectsLabel)}</p>
          )}
        </div>
      </div>
      {teacher.intro && (
        <p className="card-intro">{tt(`teachers.${id}.intro`, teacher.intro)}</p>
      )}
      <div className="teacher-card-footer">
        <div className="card-tags">
          {languages.map((lang) => (
            <span key={lang} className="tag">
              {lang}
            </span>
          ))}
        </div>
        <span className="teacher-card-cta">{t('view_teacher_cta')}</span>
      </div>
    </Link>
  );
};
