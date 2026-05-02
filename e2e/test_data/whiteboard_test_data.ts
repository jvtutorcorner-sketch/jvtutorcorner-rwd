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

function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  throw new Error(`Missing required environment variable(s): ${keys.join(', ')}`);
}

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || 'admin@example.com';
export const ADMIN_PASSWORD = requireEnv('ADMIN_PASSWORD', 'QA_ADMIN_PASSWORD');
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
  const bypassSecret = requireEnv('LOGIN_BYPASS_SECRET', 'NEXT_PUBLIC_LOGIN_BYPASS_SECRET', 'QA_CAPTCHA_BYPASS');

  const teacherPassword = requireEnv('TEST_TEACHER_PASSWORD', 'QA_TEACHER_PASSWORD');

  const studentPassword = requireEnv('TEST_STUDENT_PASSWORD', 'QA_STUDENT_PASSWORD');

  return {
    baseUrl:
      process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    bypassSecret,
    teacherEmail: (
      process.env.QA_TEACHER_EMAIL ||
      process.env.TEST_TEACHER_EMAIL ||
      'teacher@example.com'
    ).toLowerCase(),
    teacherPassword,
    studentEmail: (
      process.env.QA_STUDENT_EMAIL ||
      process.env.TEST_STUDENT_EMAIL ||
      'student@example.com'
    ).toLowerCase(),
    studentPassword,
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
  const stressTeacherPassword = requireEnv(
    'TEST_STRESS_TEACHER_PASSWORD',
    'TEST_TEACHER_PASSWORD',
    'QA_TEACHER_PASSWORD'
  );
  const stressStudentPassword = requireEnv(
    'TEST_STRESS_STUDENT_PASSWORD',
    'TEST_STUDENT_PASSWORD',
    'QA_STUDENT_PASSWORD'
  );

  return Array.from({ length: groupCount }).map((_, i) => ({
    groupId: `group-${i}`,
    courseId: `${COURSE_ID_PREFIXES.stress}${i}-${timestamp}`,
    teacherEmail: `group-${i}-teacher@test.com`,
    teacherPassword: stressTeacherPassword,
    studentEmail: `group-${i}-student@test.com`,
    studentPassword: stressStudentPassword,
  }));
}
