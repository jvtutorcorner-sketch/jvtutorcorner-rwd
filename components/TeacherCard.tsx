"use client";
// components/TeacherCard.tsx
import { Teacher } from '@/data/teachers';
import Link from 'next/link';
import { useT } from './IntlProvider';

interface TeacherCardProps {
  teacher: Teacher;
}

export const TeacherCard: React.FC<TeacherCardProps> = ({ teacher }) => {
  const href = teacher.id
    ? `/teachers/${encodeURIComponent(String(teacher.id))}`
    : `/teachers?teacher=${encodeURIComponent(String(teacher.name))}`;
  const t = useT();
  const tt = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  return (
    <Link href={href} className="card card-link">
      <div className="card-header">
        <img
          src={teacher.avatarUrl}
          alt={teacher.name}
          className="card-avatar"
        />
        <div>
          <h3 className="card-title">{tt(`teachers.${teacher.id}.name`, teacher.name)}</h3>
          <p className="card-subtitle">
            {tt(`teachers.${teacher.id}.subjects`, teacher.subjects.join(' · '))}
          </p>
        </div>
      </div>
      <p className="card-intro">{tt(`teachers.${teacher.id}.intro`, teacher.intro)}</p>
      <div className="card-tags">
        {teacher.languages.map((lang) => (
          <span key={lang} className="tag">
            {lang}
          </span>
        ))}
      </div>
    </Link>
  );
};

