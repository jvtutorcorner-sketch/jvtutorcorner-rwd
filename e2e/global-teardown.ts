import { execSync } from 'child_process';
import path from 'path';

export default async function globalTeardown() {
  if (process.env.SKIP_CLEANUP === 'true') {
    console.log('[globalTeardown] SKIP_CLEANUP=true — skipping automatic test data cleanup');
    return;
  }

  console.log('\n[globalTeardown] Running test data cleanup after test suite...');

  try {
    const projectRoot = path.resolve(__dirname, '..');
    const appEnv = process.env.APP_ENV || 'local';
    execSync(
      `npx playwright test e2e/cleanup-test-data.spec.ts --project=chromium`,
      {
        cwd: projectRoot,
        stdio: 'inherit',
        timeout: 180000,
        env: { ...process.env, APP_ENV: appEnv },
      }
    );
    console.log('[globalTeardown] Test data cleanup completed.');
  } catch (err: any) {
    // Cleanup errors should not fail the overall test run
    console.warn('[globalTeardown] Cleanup finished with warnings (non-fatal):', err?.message?.split('\n')[0] || err);
  }
}
