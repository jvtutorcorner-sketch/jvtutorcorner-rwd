import { test } from '@playwright/test';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';

const APP_ENV = process.env.APP_ENV || 'local';
dotenv.config({ path: path.resolve(__dirname, '..', `.env.${APP_ENV}`) });

interface TestConfig {
  baseUrl: string;
  adminEmail: string;
  adminPassword: string;
  teacherEmail: string;
  teacherPassword: string;
  studentEmail: string;
  studentPassword: string;
  bypassSecret: string;
}

interface CleanupStats {
  courseIds: string[];
  deletedCourses: number;
  deletedOrders: number;
  deletedEnrollments: number;
  expiredCoursesDeleted: number;
  timeOverlapCoursesDeleted: number;
  testPatternCoursesDeleted: number;
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

function getTestConfig(): TestConfig {
  return {
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    adminEmail: process.env.QA_ADMIN_EMAIL || 'admin@jvtutorcorner.com',
    adminPassword: requireEnv('QA_ADMIN_PASSWORD', 'ADMIN_PASSWORD'),
    teacherEmail: process.env.QA_TEACHER_EMAIL || 'lin@test.com',
    teacherPassword: requireEnv('TEST_TEACHER_PASSWORD', 'QA_TEACHER_PASSWORD'),
    studentEmail: process.env.QA_STUDENT_EMAIL || 'basic@test.com',
    studentPassword: requireEnv('TEST_STUDENT_PASSWORD', 'QA_STUDENT_PASSWORD'),
    bypassSecret: requireEnv('LOGIN_BYPASS_SECRET', 'NEXT_PUBLIC_LOGIN_BYPASS_SECRET', 'QA_CAPTCHA_BYPASS')
  };
}

async function autoLogin(page: any, email: string, password: string, bypassSecret: string): Promise<void> {
  const config = getTestConfig();
  const baseUrl = config.baseUrl;

  console.log(`   🔐 Auto-logging in ${email}...`);
  
  // Try to load from localStorage first
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const isLoggedIn = await page.evaluate(() => {
    const data = localStorage.getItem('auth-state');
    return data ? JSON.parse(data).state?.isLoggedIn : false;
  });

  if (isLoggedIn) {
    console.log(`   ✅ Already logged in via localStorage`);
    return;
  }

  // If not, perform login
  console.log(`   📝 Filling login form...`);
  
  // Get captcha token
  const captchaToken = await page.evaluate(() => {
    return (window as any).captchaToken || '';
  });

  if (!captchaToken) {
    console.warn(`   ⚠️ Captcha token not available, using bypass secret`);
  }

  // Fill login form
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  if (await emailInput.count() > 0) {
    await emailInput.fill(email);
  }

  if (await passwordInput.count() > 0) {
    await passwordInput.fill(password);
  }

  // Handle captcha
  const captchaInputs = page.locator('input[placeholder*="驗"], input[placeholder*="code"]');
  if (await captchaInputs.first().count() > 0) {
    await captchaInputs.first().fill(bypassSecret);
  }

  // Submit
  const submitBtn = page.locator('button[type="submit"]').first();
  if (await submitBtn.count() > 0) {
    await submitBtn.click();
    await page.waitForURL(/\/(teacher|student|admin)/, { timeout: 15000 }).catch(() => {});
  }

  await page.waitForTimeout(2000);
  console.log(`   ✅ Login completed`);
}

test('Clean up test data: Delete stress test courses, orders, and teacher accounts', async ({ browser }) => {
  const config = getTestConfig();
  const baseUrl = config.baseUrl;
  const stats: CleanupStats = {
    courseIds: [],
    deletedCourses: 0,
    deletedOrders: 0,
    deletedEnrollments: 0,
    expiredCoursesDeleted: 0,
    timeOverlapCoursesDeleted: 0,
    testPatternCoursesDeleted: 0
  };

  console.log(`\n🧹 DEEP CLEANUP: Deleting test courses, orders, enrollments, and accounts`);
  console.log(`   Base URL: ${baseUrl}`);

  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();

  try {
    // Admin login
    await autoLogin(adminPage, config.adminEmail, config.adminPassword, config.bypassSecret);

    // Step 1: Delete test courses - including time-overlap and expired courses
    console.log(`\n   📍 Step 1: Deep scan and delete test courses (pattern + time overlap + expired)...`);
    
    const testPatterns = [
      'stress-group-',
      'sync-',
      'smoke-',
      'debug-',
      'net-',
      'E2E 自動驗證課程-',
      'test-course-'
    ];

    const now = new Date();
    console.log(`   🕒 Current time: ${now.toISOString()}`);

    try {
      // Try to fetch all courses and check them
      const response = await adminPage.request.get(`${baseUrl}/api/courses?limit=1000`);
      
      if (response.ok()) {
        const data = await response.json().catch(() => ({}));
        const courses = Array.isArray(data) ? data : data.courses || [];
        
        console.log(`   📋 Total courses found: ${courses.length}`);

        for (const course of courses) {
          const courseId = course.id || course.courseId;
          const courseTitle = course.title || course.name || '';
          const startDate = course.startDate ? new Date(course.startDate) : null;
          const endDate = course.endDate ? new Date(course.endDate) : null;
          
          let shouldDelete = false;
          let deleteReason = '';

          // Check 1: Test pattern match
          if (testPatterns.some(pattern => 
            courseId?.toLowerCase().includes(pattern.toLowerCase()) || 
            courseTitle?.toLowerCase().includes(pattern.toLowerCase())
          )) {
            shouldDelete = true;
            deleteReason = 'test pattern match';
            stats.testPatternCoursesDeleted++;
          }

          // Check 2: Expired course (endDate is in the past)
          if (!shouldDelete && endDate && endDate < now) {
            shouldDelete = true;
            deleteReason = 'expired (end date passed)';
            stats.expiredCoursesDeleted++;
          }

          // Check 3: Time overlap with current time (course is mid-session)
          if (!shouldDelete && startDate && endDate) {
            if (startDate < now && endDate > now) {
              // Only delete if it's a test course
              if (courseTitle?.includes('自動驗證') || courseId?.includes('stress') || courseId?.includes('sync')) {
                shouldDelete = true;
                deleteReason = 'time overlap with current session';
                stats.timeOverlapCoursesDeleted++;
              }
            }
          }

          if (shouldDelete) {
            try {
              const delResponse = await adminPage.request.delete(`${baseUrl}/api/courses?id=${courseId}`);
              if (delResponse.ok() || delResponse.status() === 404) {
                console.log(`   ✅ Deleted: "${courseTitle}" (${courseId}) - reason: ${deleteReason}`);
                stats.courseIds.push(courseId);
                stats.deletedCourses++;
              } else {
                console.warn(`   ⚠️ Failed to delete ${courseId} (status: ${delResponse.status()})`);
              }
            } catch (err) {
              console.warn(`   ⚠️ Error deleting course ${courseId}: ${(err as Error).message}`);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`   ⚠️ Error fetching courses: ${(err as Error).message}`);
    }

    // Step 2: Delete all orders for test courses
    console.log(`\n   📍 Step 2: Deleting test orders...`);

    const orderPatternsToDelete = [
      'stress-group-0-',
      'stress-group-1-',
      'stress-group-2-',
      'sync-',
      'smoke-',
      'debug-'
    ];

    for (const courseIdPattern of orderPatternsToDelete) {
      try {
        const response = await adminPage.request.delete(`${baseUrl}/api/orders?courseId=${courseIdPattern}`);
        if (response.ok() || response.status() === 404) {
          console.log(`   ✅ Cleaned up orders for courses matching: ${courseIdPattern}`);
          stats.deletedOrders++;
        }
      } catch (err) {
        console.warn(`   ⚠️ Error deleting orders for ${courseIdPattern}: ${(err as Error).message}`);
      }
    }

    // Step 3: Delete test enrollments
    console.log(`\n   📍 Step 3: Deleting test enrollments...`);

    const enrollmentPatterns = [
      'group-0-student@test.com',
      'group-1-student@test.com',
      'group-2-student@test.com',
      'pro@test.com',
      'basic@test.com'
    ];

    for (const studentEmail of enrollmentPatterns) {
      try {
        const response = await adminPage.request.delete(`${baseUrl}/api/enrollments?email=${studentEmail}`);
        if (response.ok() || response.status() === 404) {
          console.log(`   ✅ Deleted enrollments for: ${studentEmail}`);
          stats.deletedEnrollments++;
        }
      } catch (err) {
        // Silently continue if endpoint doesn't exist
      }
    }

    // Step 4: Delete test teacher profiles
    console.log(`\n   📍 Step 4: Deleting test teacher accounts...`);

    const testTeachers = [
      'group-0-teacher@test.com',
      'group-1-teacher@test.com',
      'group-2-teacher@test.com'
    ];

    for (const teacherEmail of testTeachers) {
      try {
        const response = await adminPage.request.delete(`${baseUrl}/api/profiles?email=${teacherEmail}`);
        if (response.ok()) {
          console.log(`   ✅ Deleted profile: ${teacherEmail}`);
        } else if (response.status() === 404) {
          console.log(`   ℹ️ Profile not found: ${teacherEmail} (already deleted)`);
        }
      } catch (err) {
        // Silently continue
      }
    }

    // Step 5: Run DynamoDB direct cleanup script if available
    console.log(`\n   📍 Step 5: Deep database cleanup via DynamoDB script...`);
    
    try {
      const cleanupScript = path.resolve(__dirname, '..', 'cleanup-database-direct.mjs');
      if (require('fs').existsSync(cleanupScript)) {
        console.log(`   🔧 Running cleanup-database-direct.mjs...`);
        const output = execSync(`node ${cleanupScript}`, { 
          cwd: path.resolve(__dirname, '..'),
          encoding: 'utf-8'
        });
        console.log(output.split('\n').filter(line => line.trim()).slice(0, 10).join('\n'));
        console.log(`   ✅ DynamoDB cleanup completed`);
      }
    } catch (err) {
      console.log(`   ℹ️ DynamoDB direct cleanup skipped: ${(err as Error).message.split('\n')[0]}`);
    }

    // Step 6: Verification
    console.log(`\n   📍 Step 6: Cleanup verification...`);
    
    try {
      await adminPage.goto(`${baseUrl}/admin/course-reviews`, { waitUntil: 'domcontentloaded' });
      await adminPage.waitForTimeout(2000);
      
      const courseItems = await adminPage.locator('[data-testid*="course"], tr').count();
      console.log(`   📊 Courses remaining in review queue: ${courseItems}`);
    } catch (err) {
      console.log(`   ℹ️ Could not verify cleanup in admin panel`);
    }

    // Print cleanup summary
    console.log(`\n✅ CLEANUP SUMMARY:`);
    console.log(`   📊 Total courses deleted: ${stats.deletedCourses}`);
    console.log(`      - Test pattern matches: ${stats.testPatternCoursesDeleted}`);
    console.log(`      - Expired courses: ${stats.expiredCoursesDeleted}`);
    console.log(`      - Time overlap courses: ${stats.timeOverlapCoursesDeleted}`);
    console.log(`   📊 Orders cleaned: ${stats.deletedOrders}`);
    console.log(`   📊 Enrollments cleaned: ${stats.deletedEnrollments}`);
    
    if (stats.courseIds.length > 0) {
      console.log(`\n   🎯 Deleted Course IDs:`);
      stats.courseIds.forEach(id => console.log(`      - ${id}`));
    }

    console.log(`\n   💡 Next step: Stress test ready to run without time conflicts!`);

  } catch (err) {
    console.error(`\n❌ Cleanup failed: ${(err as Error).message}`);
    throw err;
  } finally {
    await adminCtx.close();
  }
});
