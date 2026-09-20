import { listPublicCourses } from '@/app/courses/_data';
import { CourseCard } from '@/components/CourseCard';
import SearchForm from '@/components/SearchForm';
import Pagination from '@/components/Pagination';
import { T } from '@/components/IntlProvider';
import type { Metadata } from 'next';
import { pageOpenGraph } from '@/lib/seo';

const COURSES_META_TITLE = '線上課程總覽';
const COURSES_META_DESCRIPTION = '瀏覽 JV Tutor Corner 的線上一對一與小班課程，依科目、語言、老師與上課方式篩選，找到適合你的課程。';

export const metadata: Metadata = {
  title: COURSES_META_TITLE,
  description: COURSES_META_DESCRIPTION,
  // 篩選/分頁 query string 一律 canonical 回列表本身，避免重複內容
  alternates: { canonical: '/courses' },
  openGraph: pageOpenGraph({ title: COURSES_META_TITLE, description: COURSES_META_DESCRIPTION, url: '/courses' }),
};

type CoursesPageProps = {
  searchParams?: {
    q?: string;
    subject?: string;
    language?: string;
    region?: string;
    mode?: string;
    teacher?: string;
    limit?: string;
    page?: string;
  };
};

export default async function CoursesPage(props?: CoursesPageProps) {
  const raw = await (props?.searchParams ?? {});
  function getParam(key: string) {
    if (!raw) return '';
    // Next.js 15 searchParams can be a Promise or an object
    // If it's the raw object from props after 'await', just access it
    return (raw as any)[key] ?? '';
  }

  const q = String(getParam('q') ?? '');
  const subject = String(getParam('subject') ?? '');
  const language = String(getParam('language') ?? '');
  const teacher = String(getParam('teacher') ?? '');
  const mode = String(getParam('mode') ?? '');

  const limit = parseInt(String(getParam('limit') || '20'), 10);
  const page = parseInt(String(getParam('page') || '1'), 10);

  const qTrim = q.trim().toLowerCase();
  const subjectTrim = subject.trim().toLowerCase();
  const languageTrim = language.trim().toLowerCase();
  const teacherTrim = teacher.trim().toLowerCase();

  // 共用讀取（Scan + 老師名稱 join + bundled 後備 + 報名人數）
  const merged = await listPublicCourses();

  const filtered = merged.filter((c) => {
    // 僅顯示「上架」課程
    if (c.status && c.status !== '上架') return false;
    if (subjectTrim && !(c.subject || '').toLowerCase().includes(subjectTrim)) return false;
    if (languageTrim && !(c.language || '').toLowerCase().includes(languageTrim)) return false;
    if (teacherTrim && !(c.teacherName || '').toLowerCase().includes(teacherTrim)) return false;
    if (mode && c.mode !== mode) return false;
    if (qTrim) {
      const haystack = [
        c.title,
        c.description,
        c.teacherName,
        c.subject,
        ...(Array.isArray(c.tags) ? c.tags : []),
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      if (!haystack.includes(qTrim)) return false;
    }
    return true;
  });

  // Pagination logic
  const totalItems = filtered.length;
  const startIndex = (page - 1) * limit;
  const paginatedCourses = filtered.slice(startIndex, startIndex + limit);

  return (
    <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '24px' }}><T k="courses_all_title" /></h1>

      {/* 搜尋表單（移到課程總覽頁面） */}
      <section style={{ marginBottom: '32px' }}>
        <SearchForm
          initial={{ subject, language, mode, teacher }}
          targetPath="/courses"
        />
      </section>

      <section>
        {paginatedCourses.length === 0 ? (
          <p><T k="courses_empty_filtered" /></p>
        ) : (
          <>
            <div className="card-grid">
              {paginatedCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
            <Pagination
              totalItems={totalItems}
              pageSize={limit}
              currentPage={page}
            />
          </>
        )}
      </section>
    </main>
  );
}
