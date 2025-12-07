// app/courses/page.tsx
import { COURSES } from '@/data/courses';
import { CourseCard } from '@/components/CourseCard';
import SearchForm from '@/components/SearchForm';

type CoursesPageProps = {
  searchParams?: {
    subject?: string;
    language?: string;
    region?: string;
    mode?: string;
    teacher?: string;
  };
};

export default function CoursesPage({ searchParams }: CoursesPageProps) {
  const subject = searchParams?.subject ?? '';
  const language = searchParams?.language ?? '';
  const teacher = searchParams?.teacher ?? '';
  const mode = searchParams?.mode ?? '';
  // region 目前課程資料沒有地區欄位，先忽略
  // const region = searchParams?.region ?? '';

  const subjectTrim = subject.trim().toLowerCase();
  const languageTrim = language.trim().toLowerCase();
  const teacherTrim = teacher.trim().toLowerCase();

  const filtered = COURSES.filter((c) => {
    if (subjectTrim && !c.subject.toLowerCase().includes(subjectTrim)) return false;
    if (languageTrim && !c.language.toLowerCase().includes(languageTrim)) return false;
    if (teacherTrim && !c.teacherName.toLowerCase().includes(teacherTrim)) return false;
    if (mode && c.mode !== mode) return false;
    return true;
  });

  const hasFilter = Boolean(subjectTrim || languageTrim || teacherTrim || mode);

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

      {/* 搜尋表單（移到課程總覽頁面） */}
      <section className="section">
        <SearchForm
          initial={{ subject, language, mode, teacher }}
          targetPath="/courses"
        />
      </section>

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
