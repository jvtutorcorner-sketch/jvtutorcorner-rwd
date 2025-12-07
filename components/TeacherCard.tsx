// components/TeacherCard.tsx
import { Teacher } from '@/data/teachers';
import Link from 'next/link';

interface TeacherCardProps {
  teacher: Teacher;
}

export const TeacherCard: React.FC<TeacherCardProps> = ({ teacher }) => {
  return (
    <Link href={`/teachers/${teacher.id}`} className="card card-link">
      <div className="card-header">
        <img
          src={teacher.avatarUrl}
          alt={teacher.name}
          className="card-avatar"
        />
        <div>
          <h3 className="card-title">{teacher.name}</h3>
          <p className="card-subtitle">
            {teacher.subjects.join(' · ')}｜{teacher.location}
          </p>
        </div>
      </div>
      <p className="card-intro">{teacher.intro}</p>
      <div className="card-meta">
        <span>⭐ {teacher.rating.toFixed(1)}</span>
        <span>NT$ {teacher.hourlyRate}/時</span>
      </div>
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

