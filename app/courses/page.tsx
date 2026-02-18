import { ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
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

export default async function CoursesPage(props?: CoursesPageProps) {
  const raw = await (props?.searchParams ?? {});
  function getParam(key: string) {
    if (!raw) return '';
    if (typeof (raw as any).get === 'function') {
      try {
        return (raw as any).get(key) ?? '';
      } catch {
        return '';
      }
    }
    if (typeof raw === 'object') return (raw as any)[key] ?? '';
    return '';
  }

  const subject = String(getParam('subject') ?? '');
  const language = String(getParam('language') ?? '');
  const teacher = String(getParam('teacher') ?? '');
  const mode = String(getParam('mode') ?? '');

  const subjectTrim = subject.trim().toLowerCase();
  const languageTrim = language.trim().toLowerCase();
  const teacherTrim = teacher.trim().toLowerCase();

  // Fetch courses from DynamoDB
  let persisted: any[] = [];
  try {
    const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
    const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

    const scanCmd = new ScanCommand({ TableName: COURSES_TABLE });
    const result = await ddbDocClient.send(scanCmd);
    persisted = result.Items || [];

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
    persisted = [];
  }

  // merge persisted in front so recent creations appear first; avoid duplicate ids
  const known = new Map<string, any>();
  const merged = [] as any[];
  for (const p of persisted) {
    if (p && p.id) {
      known.set(String(p.id), p);
      merged.push(p);
    }
  }
  for (const c of COURSES) {
    if (!c || !c.id) continue;
    if (!known.has(String(c.id))) merged.push(c);
  }

  // DEBUG: expose persisted/merged counts and first few ids to help diagnose missing entries
  const persistedCount = persisted.length;
  const builtinCount = COURSES.length;
  const mergedCount = merged.length;
  const persistedSample = persisted.slice(0, 10).map((p) => p.id).join(', ');

  const filtered = merged.filter((c) => {
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
