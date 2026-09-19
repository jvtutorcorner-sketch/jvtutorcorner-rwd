// app/teachers/_data.ts
/**
 * /teachers/[id] 與 app/sitemap.ts 共用的老師讀取（DynamoDB + data/teachers 後備）。
 * 以 React cache() 包裝，讓同一次請求內 generateMetadata 與 page 只查一次 DB。
 */
import { cache } from 'react';
import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { TEACHERS } from '@/data/teachers';

/** DynamoDB item 與 bundled 資料欄位不固定，頁面端以動態欄位存取。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TeacherRecord = Record<string, any>;

function teachersTable() {
  return process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';
}

/** 老師詳情：先查 DynamoDB，找不到再查 bundled TEACHERS；都沒有回 null。 */
export const getTeacherById = cache(async (id: string): Promise<TeacherRecord | null> => {
  let teacher: TeacherRecord | null = null;
  try {
    const result = await ddbDocClient.send(new GetCommand({ TableName: teachersTable(), Key: { id } }));
    teacher = result.Item || null;
  } catch (e) {
    console.error('[TeacherDetailPage] DynamoDB get error:', e);
  }

  // Fallback to static data
  if (!teacher) {
    teacher = TEACHERS.find((t) => t.id === id) || null;
  }
  return teacher;
});

/**
 * 供 sitemap 使用的公開老師清單：與 /teachers 相同的資料來源與過濾規則
 * （依 id 去重；DynamoDB 無資料時退回 TEACHERS；排除 resigned）。
 * DB 失敗時拋出，由呼叫端決定後備。
 */
export async function listPublicTeacherIds(): Promise<Array<{ id: string; updatedAt?: string }>> {
  const result = await ddbDocClient.send(new ScanCommand({ TableName: teachersTable() }));
  const uniqueMap = new Map<string, TeacherRecord>();
  for (const t of result.Items || []) {
    const id = t.id || t.roid_id;
    if (id) uniqueMap.set(String(id), t);
  }
  const source: TeacherRecord[] = uniqueMap.size > 0 ? Array.from(uniqueMap.values()) : TEACHERS;
  return source
    // 詳情頁以 id 為 key 讀取，只收有 id 的老師（TeacherCard 也只對有 id 的老師產生連結）
    .filter((t) => t.id && t.status !== 'resigned')
    .map((t) => ({ id: String(t.id), updatedAt: t.updatedAt }));
}
