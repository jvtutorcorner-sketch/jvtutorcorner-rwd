// lib/auth/classroomAccess.ts
// 「這個登入者是不是這堂課的參與者，以及他是老師還是學生」的統一判斷。
//
// 教室相關端點（Agora RTC/RTM token、Netless 白板房間、signaling token、上課紀錄…）
// 先前全部沒有驗證：任何人都能匿名索取可加入任意頻道的憑證，而白板端甚至是用
// 「userId 字串裡有沒有 admin」來判斷是不是老師。這裡把判斷集中起來，
// 讓那些端點改成先問「你是誰、你屬不屬於這堂課」。

import { verifyCourseAccess } from '@/lib/accessControl';
import { canManageCourse } from './courseOwnership';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { AuthedRequest } from './apiGuard';

const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

export type ClassroomAccess = {
  granted: boolean;
  /** 是否具備主持權（課程的老師，或管理員）。決定白板房間要發 admin 還是 writer token。 */
  isHost: boolean;
  reason?: string;
};

const DENIED = (reason: string): ClassroomAccess => ({ granted: false, isHost: false, reason });

/**
 * 判斷 session 是否可以進入某堂課的教室。
 *
 * - admin / system：一律允許，並具主持權
 * - 該課程的老師：允許，具主持權
 * - 有有效報名或 B2B 授權的學生：允許，無主持權
 */
export async function verifyClassroomAccess(
  session: AuthedRequest['session'],
  courseId: string | null | undefined
): Promise<ClassroomAccess> {
  if (!session?.userId) return DENIED('Missing session');
  if (session.role === 'admin' || session.role === 'system') {
    return { granted: true, isHost: true };
  }
  if (!courseId) return DENIED('Missing courseId');

  let course: { teacherId?: string | null } | null = null;
  try {
    const res = await ddbDocClient.send(
      new GetCommand({ TableName: COURSES_TABLE, Key: { id: courseId } })
    );
    course = (res.Item as any) || null;
  } catch (err) {
    console.error('[classroomAccess] course lookup failed:', err);
    return DENIED('Course lookup failed');
  }

  if (!course) return DENIED('Course not found');

  if (await canManageCourse(session, course)) {
    return { granted: true, isHost: true };
  }

  const access = await verifyCourseAccess(session.userId, courseId);
  if (access.granted) {
    return { granted: true, isHost: false };
  }

  return DENIED(access.reason || 'No access to this course');
}

/** 白板房間權限：主持人可拿 admin token，其他參與者只拿 writer。 */
export function whiteboardRoleFor(access: ClassroomAccess): 'admin' | 'writer' {
  return access.isHost ? 'admin' : 'writer';
}
