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
  smoke:    'smoke-',
  quick:    'quick-',
  standard: 'sync-',
  stress:   'stress-group-',
  debug:    'debug-',
  network:  'net-',
} as const;

export type CourseScenario = keyof typeof COURSE_ID_PREFIXES;

/**
 * Returns a **stable, unique** course ID for a given test scenario.
 *
 * Priority (highest → lowest):
 *  1. `process.env.TEST_COURSE_ID`   — manual override for any scenario
 *  2. `process.env.E2E_COURSE_ID`    — legacy override (quick-sync-test compatibility)
 *  3. `<prefix><timestamp>`           — auto-generated, guaranteed unique per run
 *
 * @param scenario  One of the COURSE_ID_PREFIXES keys (default: 'standard')
 * @param timestamp Provide `Date.now()` once at test start so all calls in the
 *                  same run share the same suffix (avoids mid-test divergence).
 *
 * @example
 *   // In smoke test:
 *   const courseId = getCourseId('smoke', Date.now());
 *   // → 'smoke-1777714801139'  (or TEST_COURSE_ID if set)
 *
 *   // In quick-sync-test:
 *   const courseId = getCourseId('quick');
 *   // → 'quick-1777714801139'  (or E2E_COURSE_ID / TEST_COURSE_ID if set)
 */
export function getCourseId(
  scenario: CourseScenario = 'standard',
  timestamp: number = Date.now()
): string {
  // Env-var overrides come first so individual runs can be targeted
  const override = process.env.TEST_COURSE_ID || process.env.E2E_COURSE_ID;
  if (override && override.trim()) return override.trim();

  return `${COURSE_ID_PREFIXES[scenario]}${timestamp}`;
}

/**
 * Convenience alias for the `quick` scenario — drop-in replacement for the
 * old `process.env.E2E_COURSE_ID || 'c1'` pattern in quick-sync-test.spec.ts.
 */
export function getQuickCourseId(timestamp: number = Date.now()): string {
  return getCourseId('quick', timestamp);
}

/**
 * Convenience alias for the `smoke` scenario.
 */
export function getSmokeCourseId(timestamp: number = Date.now()): string {
  return getCourseId('smoke', timestamp);
}

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
