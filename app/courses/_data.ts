// app/courses/_data.ts
/**
 * /courses、/courses/[id]、app/sitemap.ts 共用的課程讀取（DynamoDB + data/courses 後備）。
 * 以 React cache() 包裝，讓同一次請求內 generateMetadata 與 page 只查一次 DB。
 */
import { cache } from 'react';
import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { COURSES } from '@/data/courses';
import { decorateCoursesWithSeats } from '@/lib/seatAccounting';
import { isTestTeacherEmail, isTestTeacherName } from '@/lib/teacherVisibility';

/**
 * 這筆課程是否為測試/壓測殘留，不該出現在公開清單。
 * 涵蓋：
 *  - id 前綴 test-course- / stress-（e2e 與壓力測試 fixture）
 *  - 標題含「測試」「e2e」「stress test」
 *  - 授課者是測試帳號（teacherName 有時直接存 email，如 group-0-teacher@test.com）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTestCourse(c: Record<string, any>): boolean {
  const id = String(c.id || '');
  const title = String(c.title || '');
  const teacher = String(c.teacherName || '');
  if (/^(test-course-|stress-)/i.test(id)) return true;
  if (/測試|e2e|stress\s*test/i.test(title)) return true;
  if (isTestTeacherEmail(teacher) || isTestTeacherName(teacher)) return true;
  return false;
}

/** DynamoDB item 與 bundled 資料欄位不固定，頁面端以動態欄位存取。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CourseRecord = Record<string, any>;

function coursesTable() {
  return process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
}

function teachersTable() {
  return process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';
}

/** 課程詳情：先查 DynamoDB（並補老師名稱），找不到再查 bundled COURSES；都沒有回 null。 */
export const getCourseById = cache(async (id: string): Promise<CourseRecord | null> => {
  let course: CourseRecord | null = null;
  try {
    const result = await ddbDocClient.send(new GetCommand({ TableName: coursesTable(), Key: { id } }));
    course = result.Item || null;

    if (course && course.teacherId) {
      try {
        const tRes = await ddbDocClient.send(new GetCommand({ TableName: teachersTable(), Key: { id: course.teacherId } }));
        if (tRes.Item && (tRes.Item.name || tRes.Item.displayName)) {
          course.teacherName = tRes.Item.name || tRes.Item.displayName;
        }
      } catch { }
    }
  } catch (e) {
    console.error('[CourseDetailPage] DynamoDB get error:', e);
  }

  // If not in DynamoDB, check bundled COURSES
  if (!course) {
    course = COURSES.find((c) => c.id === id) || null;
  }
  return course;
});

/**
 * 供 sitemap 使用的公開課程清單：與 /courses 相同的資料來源與過濾規則
 * （排除 test-course-*；DynamoDB 無資料時退回 COURSES；僅「上架」或未設定 status）。
 * DB 失敗時拋出，由呼叫端決定後備。
 */
export async function listPublicCourseIds(): Promise<Array<{ id: string; updatedAt?: string }>> {
  const result = await ddbDocClient.send(new ScanCommand({ TableName: coursesTable() }));
  const persisted = (result.Items || []).filter((c) => !String(c.id || '').startsWith('test-course-'));
  const source: CourseRecord[] = persisted.length > 0 ? persisted : COURSES;
  return source
    .filter((c) => c.id && (!c.status || c.status === '上架'))
    .map((c) => ({ id: String(c.id), updatedAt: c.updatedAt }));
}

/**
 * /courses 與首頁共用的公開課程清單（DynamoDB Scan + 老師名稱 join + bundled 後備）。
 *
 * 只做「取回可公開顯示的課程」，不做搜尋/分頁——那些由呼叫端在記憶體中處理，
 * 與改版前 app/courses/page.tsx 的行為一致。以 React cache() 包裝，同一次請求
 * （例如首頁同時算熱門課程與分類）只查一次 DB。
 *
 * - 排除 test-course-* 與標題含「測試/e2e」的資料
 * - DynamoDB 無資料時退回 bundled COURSES
 * - 依 teacherId 補上最新的 teacherName
 * - 依報名人數（decorateCoursesWithSeats 的 seatsOccupied）標記真實熱門度
 *
 * 注意：這裡「不」過濾 status，讓 /courses 維持既有的顯示邏輯（它自己過濾「上架」）。
 * 首頁請改用 listPublishedCourses()。DB 失敗時回傳 bundled COURSES，不拋出。
 */
export const listPublicCourses = cache(async (): Promise<CourseRecord[]> => {
  let persisted: CourseRecord[] = [];
  try {
    const result = await ddbDocClient.send(new ScanCommand({ TableName: coursesTable() }));
    const dbItems = result.Items || [];
    persisted = dbItems.filter((c) => !isTestCourse(c));

    // 依 teacherId 補上最新老師名稱
    const uniqueTids = Array.from(new Set(persisted.map((i) => i.teacherId).filter(Boolean)));
    if (uniqueTids.length > 0) {
      const teacherMap: Record<string, string> = {};
      await Promise.all(
        uniqueTids.map(async (tid) => {
          try {
            const tRes = await ddbDocClient.send(new GetCommand({ TableName: teachersTable(), Key: { id: tid } }));
            if (tRes.Item && (tRes.Item.name || tRes.Item.displayName)) {
              teacherMap[String(tid)] = tRes.Item.name || tRes.Item.displayName;
            }
          } catch { }
        })
      );
      persisted.forEach((item) => {
        if (item.teacherId && teacherMap[String(item.teacherId)]) {
          item.teacherName = teacherMap[String(item.teacherId)];
        }
      });
    }
  } catch (e) {
    console.error('[listPublicCourses] DynamoDB scan error:', e);
    persisted = [];
  }

  const source: CourseRecord[] = persisted.length > 0 ? persisted : (COURSES as CourseRecord[]);

  // 以真實報名人數覆蓋 seatsLeft，並附上 seatsOccupied（供首頁排序與「已有 N 人報名」）
  try {
    return await decorateCoursesWithSeats(source as Array<CourseRecord & { id: string }>);
  } catch (e) {
    console.warn('[listPublicCourses] seat decoration failed, returning raw courses:', e);
    return source;
  }
});

/**
 * 首頁專用：只回「上架」（或未設定 status）的公開課程，其餘規則同 listPublicCourses。
 *
 * 若資料庫目前沒有任何已上架的真實課程（例如全是待審核/下架，或只有測試資料被過濾掉），
 * 退回 bundled 範例課程（僅取上架），讓首頁維持有內容而非空白區塊。
 * 這是既有 /courses 的既定行為（DB 空時退回 COURSES），此處僅將條件放寬到「無已上架課程」。
 * 不捏造任何報名數/評價等統計數字。
 */
export async function listPublishedCourses(): Promise<CourseRecord[]> {
  const courses = await listPublicCourses();
  const published = courses
    .filter((c) => !c.status || c.status === '上架')
    // A record with no title cannot render a meaningful card, and leftovers from
    // classroom/PDF test runs reach here untitled because isTestCourse() only
    // recognises the test-course-/stress- id prefixes and title keywords.
    .filter((c) => String(c.title || '').trim().length > 0);
  if (published.length > 0) return published;
  return (COURSES as CourseRecord[]).filter((c) => !c.status || c.status === '上架');
}
