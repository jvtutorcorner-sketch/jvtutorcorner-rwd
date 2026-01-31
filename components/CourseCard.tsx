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
  const tt = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };
  // try to find a teacher id from the bundled TEACHERS data by name
  const teacherMatch = TEACHERS.find((t) => String(t.name || '').trim().toLowerCase() === String(course.teacherName || '').trim().toLowerCase());
  const teacherHref = teacherMatch
    ? `/teachers/${encodeURIComponent(String(teacherMatch.id))}`
    : `/teachers?teacher=${encodeURIComponent(String(course.teacherName || ''))}`;

  return (
    <Link href={`/courses/${course.id}`} className="card">
      <h3 className="card-title">{tt(`courses.${course.id}.title`, course.title)}</h3>
      <p className="card-subtitle">
        {tt(`courses.${course.id}.subject`, course.subject)}｜{tt(`courses.${course.id}.level`, course.level)}
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
        {t('course_language_label')}{tt(`courses.${course.id}.language`, course.language)}
      </p>
      <div className="card-tags">
        {course.tags.map((tag, i) => (
          <span key={tag} className="tag">
            {tt(`courses.${course.id}.tags.${i}`, tag)}
          </span>
        ))}
      </div>
    </Link>
  );
};

