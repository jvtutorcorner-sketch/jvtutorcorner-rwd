// components/CourseCard.tsx
"use client";
import { Course } from '@/data/courses';
import { TEACHERS } from '@/data/teachers';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface CourseCardProps {
  course: Course;
}

export const CourseCard: React.FC<CourseCardProps> = ({ course }) => {
  const router = useRouter();
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
        授課老師：
        <span
          role="link"
          tabIndex={0}
          className="inline-link"
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
        課程語言：{course.language}
      </p>
      <div className="card-meta">
        <span>
          NT$ {course.pricePerSession}/堂 · {course.durationMinutes} 分鐘
        </span>
        <span>{course.mode === 'online' ? '線上課程' : '實體課程'}</span>
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

