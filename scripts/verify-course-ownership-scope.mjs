// scripts/verify-course-ownership-scope.mjs
/**
 * Regression script for course ownership scope — lib/auth/courseOwnership.ts.
 *
 * app/api/courses/route.ts (POST/DELETE) and app/api/courses/[id]/route.ts (PATCH/DELETE)
 * used to have zero auth: any anonymous request could create, overwrite (including
 * reassigning teacherId to someone else), or delete any course. The fix wraps those
 * handlers with withAuth + canManageCourse(session, course) — this script exercises
 * canManageCourse directly against a real course row so it matches exactly what the
 * HTTP routes check, without needing full session-cookie infrastructure (same approach
 * already used for dept_admin scope in verify-b2b-dept-admin-scope.mjs).
 *
 * Usage:
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-course-ownership-scope.mjs
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const { randomUUID } = await import('crypto');
const { PutCommand, DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
const { ddbDocClient } = await import('../lib/dynamo.ts');
const { PROFILES_TABLE, putProfile } = await import('../lib/profilesService.ts');
const { canManageCourse, resolveOwnTeacherIds } = await import('../lib/auth/courseOwnership.ts');

const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const RUN_TAG = `course-owner-${Date.now()}`;

let passCount = 0;
let failCount = 0;

function assert(condition, label) {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${label}`);
  } else {
    failCount++;
    console.error(`  ❌ ${label}`);
  }
}

function fakeSession(userId, role) {
  return {
    sessionId: `test-${userId}`,
    userId,
    email: `${userId}@${RUN_TAG}.test`,
    role,
    plan: 'system',
    createdAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
}

const createdProfileIds = [];
let courseId;

try {
  console.log(`\n=== Course ownership scope regression (${RUN_TAG}) ===\n`);

  const teacherA = {
    id: randomUUID(),
    email: `teacher-a-${RUN_TAG}@${RUN_TAG}.test`,
    firstName: 'Owner',
    lastName: 'TeacherA',
    role: 'teacher',
    teacherId: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const teacherB = {
    id: randomUUID(),
    email: `teacher-b-${RUN_TAG}@${RUN_TAG}.test`,
    firstName: 'Other',
    lastName: 'TeacherB',
    role: 'teacher',
    teacherId: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const student = {
    id: randomUUID(),
    email: `student-${RUN_TAG}@${RUN_TAG}.test`,
    firstName: 'Some',
    lastName: 'Student',
    role: 'student',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await putProfile(teacherA);
  await putProfile(teacherB);
  await putProfile(student);
  createdProfileIds.push(teacherA.id, teacherB.id, student.id);

  courseId = randomUUID();
  const course = {
    id: courseId,
    title: `Ownership Test Course ${RUN_TAG}`,
    teacherId: teacherA.teacherId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await ddbDocClient.send(new PutCommand({ TableName: COURSES_TABLE, Item: course }));

  // Own-id resolution must include the profile's teacherId, not just session.userId.
  const ownIds = await resolveOwnTeacherIds(fakeSession(teacherA.id, 'teacher'));
  assert(ownIds.has(teacherA.teacherId), 'resolveOwnTeacherIds includes profile.teacherId for the owning teacher');

  assert(
    (await canManageCourse(fakeSession(teacherA.id, 'teacher'), course)) === true,
    'teacher A can manage their own course'
  );
  assert(
    (await canManageCourse(fakeSession(teacherB.id, 'teacher'), course)) === false,
    'teacher B cannot manage teacher A\'s course (ownership bypass blocked)'
  );
  assert(
    (await canManageCourse(fakeSession(student.id, 'student'), course)) === false,
    'a student session cannot manage any course'
  );
  assert(
    (await canManageCourse(fakeSession('sys-admin-test', 'admin'), course)) === true,
    'admin can manage any course'
  );
  assert(
    (await canManageCourse(fakeSession('sys-test', 'system'), course)) === true,
    'system role can manage any course (internal/service calls)'
  );

  const courseWithNoTeacher = { ...course, teacherId: undefined };
  assert(
    (await canManageCourse(fakeSession(teacherA.id, 'teacher'), courseWithNoTeacher)) === false,
    'a course with no teacherId cannot be claimed by any teacher session'
  );
  assert(
    (await canManageCourse(fakeSession(teacherA.id, 'teacher'), null)) === false,
    'a missing course (404 case) is never manageable'
  );
} finally {
  if (courseId) {
    await ddbDocClient.send(new DeleteCommand({ TableName: COURSES_TABLE, Key: { id: courseId } })).catch(() => {});
  }
  for (const id of createdProfileIds) {
    await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id } })).catch(() => {});
  }
}

console.log(`\n=== Result: ${passCount} passed, ${failCount} failed ===\n`);
if (failCount > 0) process.exit(1);
