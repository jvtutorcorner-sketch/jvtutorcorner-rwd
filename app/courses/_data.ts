// app/courses/_data.ts
/**
 * /courses、/courses/[id]、app/sitemap.ts 共用的課程讀取（DynamoDB + data/courses 後備）。
 * 以 React cache() 包裝，讓同一次請求內 generateMetadata 與 page 只查一次 DB。
 */
import { cache } from 'react';
import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { COURSES } from '@/data/courses';

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
