// app/courses/page.tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { COURSES } from '@/data/courses';
import { CourseCard } from '@/components/CourseCard';

export default function CoursesPage() {
  const searchParams = useSearchParams();

  const subject = searchParams.get('subject') || '';
  const language = searchParams.get('language') || '';
  const mode = searchParams.get('mode') || '';
  // region 目前課程資料沒有地區欄位，先忽略
  // const region = searchParams.get('region') || '';

  const filtered = COURSES.filter((c) => {
    if (subject && c.subject !== subject) {
      return false;
    }

    if (language && !c.language.includes(language)) {
      return false;
    }

    if (mode && c.mode !== mode) {
      return false;
    }

    return true;
  });

  const hasFilter = subject || language || mode;

  return (
    <div className="page">
      <header className="page-header">
        <h1>所有課程</h1>
        {hasFilter ? (
          <p>目前顯示符合條件的課程，共 {filtered.length} 堂。</p>
        ) : (
          <p>主題式課程，從國中、高中到成人進修都能找到。</p>
        )}
      </header>

      <section className="section">
        {filtered.length === 0 ? (
          <p>目前沒有符合篩選條件的課程，請調整搜尋條件再試試。</p>
        ) : (
          <div className="card-grid">
            {filtered.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
