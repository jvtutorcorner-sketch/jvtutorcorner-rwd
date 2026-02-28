import { ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { COURSES } from '@/data/courses';
import { CourseCard } from '@/components/CourseCard';
import SearchForm from '@/components/SearchForm';
import Pagination from '@/components/Pagination';

type CoursesPageProps = {
  searchParams?: {
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

  const subject = String(getParam('subject') ?? '');
  const language = String(getParam('language') ?? '');
  const teacher = String(getParam('teacher') ?? '');
  const mode = String(getParam('mode') ?? '');

  const limit = parseInt(String(getParam('limit') || '20'), 10);
  const page = parseInt(String(getParam('page') || '1'), 10);

  const subjectTrim = subject.trim().toLowerCase();
  const languageTrim = language.trim().toLowerCase();
  const teacherTrim = teacher.trim().toLowerCase();

  // Fetch courses from DynamoDB
  let persisted: any[] = [];
  let dbError: string | null = null;
  
  try {
    const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
    const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

    console.log('[CoursesPage] Loading courses from table:', COURSES_TABLE);
    
    const scanCmd = new ScanCommand({ TableName: COURSES_TABLE });
    const result = await ddbDocClient.send(scanCmd);
    persisted = result.Items || [];

    console.log(`[CoursesPage] Loaded ${persisted.length} courses from DynamoDB`);
    console.log('[CoursesPage] Courses:', persisted.map(c => ({ id: c.id, title: c.title })));

    // Join teacher names
    const uniqueTids = Array.from(new Set(persisted.map((i: any) => i.teacherId).filter(Boolean)));
    if (uniqueTids.length > 0) {
      const teacherMap: Record<string, string> = {};
      await Promise.all(uniqueTids.map(async (tid: any) => {
        try {
          const tRes = await ddbDocClient.send(new GetCommand({ TableName: TEACHERS_TABLE, Key: { id: tid } }));
          if (tRes.Item && (tRes.Item.name || tRes.Item.displayName)) {
            teacherMap[tid] = tRes.Item.name || tRes.Item.displayName;
          }
        } catch (e) { }
      }));
      persisted.forEach((item: any) => {
        if (item.teacherId && teacherMap[item.teacherId]) {
          item.teacherName = teacherMap[item.teacherId];
        }
      });
    }
  } catch (e) {
    console.error('[CoursesPage] DynamoDB error:', e);
    dbError = String(e);
    persisted = [];
  }

  // Strategy: Use ONLY DynamoDB data if available; fallback to local data only if DynamoDB is empty
  let merged: any[] = [];
  
  if (persisted.length > 0) {
    // ✅ DynamoDB has data: use it exclusively
    console.log(`[CoursesPage] Using ${persisted.length} courses from DynamoDB (ignoring local data)`);
    merged = persisted;
  } else {
    // ⚠️ DynamoDB is empty: fallback to local courses.ts
    console.warn('[CoursesPage] DynamoDB returned no courses, falling back to local COURSES data');
    merged = COURSES;
  }

  // DEBUG: expose counts to help diagnose
  const dbCount = persisted.length;
  const localCount = COURSES.length;
  const displayedCount = merged.length;
  const usingDatabase = persisted.length > 0;

  const filtered = merged.filter((c) => {
    if (subjectTrim && !(c.subject || '').toLowerCase().includes(subjectTrim)) return false;
    if (languageTrim && !(c.language || '').toLowerCase().includes(languageTrim)) return false;
    if (teacherTrim && !(c.teacherName || '').toLowerCase().includes(teacherTrim)) return false;
    if (mode && c.mode !== mode) return false;
    return true;
  });

  const hasFilter = Boolean(subjectTrim || languageTrim || teacherTrim || mode);

  // Pagination logic
  const totalItems = filtered.length;
  const startIndex = (page - 1) * limit;
  const paginatedCourses = filtered.slice(startIndex, startIndex + limit);

  return (
    <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '24px' }}>所有課程</h1>

      {/* 搜尋表單（移到課程總覽頁面） */}
      <section style={{ marginBottom: '32px' }}>
        <SearchForm
          initial={{ subject, language, mode, teacher }}
          targetPath="/courses"
        />
      </section>

      <section>
        {paginatedCourses.length === 0 ? (
          <p>目前沒有符合篩選條件的課程，請調整搜尋條件再試試。</p>
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
