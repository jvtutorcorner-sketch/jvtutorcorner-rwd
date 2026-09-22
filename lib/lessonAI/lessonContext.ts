// lib/lessonAI/lessonContext.ts
//
// Shared server helper for the /api/lessons/* routes: resolve a lesson by its
// already-claimed CourseSession row (created by POST .../start) and authorise the
// caller against the owning course. Every lesson route except /start goes through
// this, so authorisation is derived from stored state (course id from the row),
// never from a client-supplied course id.

import { getCourseSession } from '@/lib/courseSessionService';
import { verifyClassroomAccess, type ClassroomAccess } from '@/lib/auth/classroomAccess';
import type { Session } from '@/lib/auth/sessionManager';
import type { CourseSession } from '@/lib/types/courseSession';

export type LessonContext =
  | { ok: true; courseSession: CourseSession; access: ClassroomAccess }
  | { ok: false; status: number; error: string };

export async function resolveLessonContext(
  session: Session,
  sessionId: string | undefined | null
): Promise<LessonContext> {
  if (!sessionId) return { ok: false, status: 400, error: 'Missing sessionId' };
  const courseSession = await getCourseSession(sessionId);
  if (!courseSession) {
    return { ok: false, status: 404, error: 'Lesson session not found. Enter the classroom first.' };
  }
  const access = await verifyClassroomAccess(session, courseSession.courseId);
  if (!access.granted) {
    return { ok: false, status: 403, error: access.reason || 'No access to this lesson' };
  }
  return { ok: true, courseSession, access };
}
