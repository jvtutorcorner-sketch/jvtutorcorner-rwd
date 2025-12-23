// components/CourseCard.tsx
"use client";
import { Course } from '@/data/courses';
import { TEACHERS } from '@/data/teachers';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from './IntlProvider';

interface CourseCardProps {
  course: Course;
}

export const CourseCard: React.FC<CourseCardProps> = ({ course }) => {
  const router = useRouter();
  const t = useT();
  // try to find a teacher id from the bundled TEACHERS data by name
  const teacherMatch = TEACHERS.find((t) => String(t.name || '').trim().toLowerCase() === String(course.teacherName || '').trim().toLowerCase());
  const teacherHref = teacherMatch
    ? `/teachers/${encodeURIComponent(String(teacherMatch.id))}`
    : `/teachers?teacher=${encodeURIComponent(String(course.teacherName || ''))}`;

  return (
    <Link href={`/courses/${course.id}`} className="card">
      <h3 className="card-title">{course.title}</h3>
      <p className="card-subtitle">
        {course.subject}｜{course.level}
      </p>
      <p className="card-intro">
        {t('teacher_label')}
        <span
          role="link"
          tabIndex={0}
          className="inline-link teacher-name"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            router.push(teacherHref);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              router.push(teacherHref);
            }
          }}
        >
          {course.teacherName}
        </span>
        <br />
        {t('course_language_label')}{course.language}
      </p>
      <div className="card-meta">
        <span>
          {t('currency')} {course.pricePerSession}/{t('per_session')} · {course.durationMinutes} {t('minutes')}
        </span>
        <span>{course.mode === 'online' ? t('online_course') : t('offline_course')}</span>
      </div>
      <div className="card-tags">
        {course.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
};

