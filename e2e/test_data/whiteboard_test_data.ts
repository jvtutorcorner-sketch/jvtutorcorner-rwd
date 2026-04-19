/**
 * Shared test data and configuration for whiteboard sync tests.
 *
 * Usage:
 *   import { getTestConfig, getStressGroupConfigs, ADMIN_EMAIL } from './test_data/whiteboard_test_data';
 */

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface TestConfig {
  baseUrl: string;
  bypassSecret: string;
  teacherEmail: string;
  teacherPassword: string;
  studentEmail: string;
  studentPassword: string;
}

export interface StressGroupConfig {
  groupId: string;
  courseId: string;
  teacherEmail: string;
  teacherPassword: string;
  studentEmail: string;
  studentPassword: string;
}

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

export const ADMIN_EMAIL = 'admin@jvtutorcorner.com';
export const ADMIN_PASSWORD = '123456';
export const DEFAULT_STRESS_GROUP_COUNT = 3;

/** Course-ID prefixes per scenario — used by cleanup scripts too */
export const COURSE_ID_PREFIXES = {
  smoke: 'smoke-',
  standard: 'sync-',
  stress: 'stress-group-',
  debug: 'debug-',
  network: 'net-',
} as const;

// ─────────────────────────────────────────────────────────────────────
// Config helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Reads runtime config from environment variables.
 * Call this inside a test or beforeAll — never at module level.
 */
export function getTestConfig(): TestConfig {
  return {
    baseUrl:
      process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    bypassSecret:
      process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET ||
      process.env.LOGIN_BYPASS_SECRET ||
      'jv_secure_bypass_2024',
    teacherEmail: (
      process.env.QA_TEACHER_EMAIL ||
      process.env.TEST_TEACHER_EMAIL ||
      'teacher@test.com'
    ).toLowerCase(),
    teacherPassword: process.env.TEST_TEACHER_PASSWORD || '123456',
    studentEmail: (
      process.env.QA_STUDENT_EMAIL ||
      process.env.TEST_STUDENT_EMAIL ||
      'student@test.com'
    ).toLowerCase(),
    studentPassword: process.env.TEST_STUDENT_PASSWORD || '123456',
  };
}

/**
 * Generates per-group configs for the stress scenario.
 * Each group gets its own teacher and student accounts + unique courseId.
 *
 * @param groupCount  Number of concurrent groups (default: DEFAULT_STRESS_GROUP_COUNT)
 * @param timestamp   Unique run timestamp to avoid courseId collisions across runs
 */
export function getStressGroupConfigs(
  groupCount: number = DEFAULT_STRESS_GROUP_COUNT,
  timestamp: number = Date.now()
): StressGroupConfig[] {
  return Array.from({ length: groupCount }).map((_, i) => ({
    groupId: `group-${i}`,
    courseId: `${COURSE_ID_PREFIXES.stress}${i}-${timestamp}`,
    teacherEmail: `group-${i}-teacher@test.com`,
    teacherPassword: '123456',
    studentEmail: `group-${i}-student@test.com`,
    studentPassword: '123456',
  }));
}
