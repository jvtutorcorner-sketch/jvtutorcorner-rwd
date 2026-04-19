import { test } from '@playwright/test';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

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

function getTestConfig(): TestConfig {
  return {
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    adminEmail: process.env.QA_ADMIN_EMAIL || 'admin@jvtutorcorner.com',
    adminPassword: process.env.QA_ADMIN_PASSWORD || '123456',
    teacherEmail: process.env.QA_TEACHER_EMAIL || 'lin@test.com',
    teacherPassword: process.env.TEST_TEACHER_PASSWORD || '123456',
    studentEmail: process.env.QA_STUDENT_EMAIL || 'basic@test.com',
    studentPassword: process.env.TEST_STUDENT_PASSWORD || '123456',
    bypassSecret: process.env.LOGIN_BYPASS_SECRET || 'bypass-secret'
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

  console.log(`\n🧹 CLEANUP: Deleting test courses, orders, and accounts`);
  console.log(`   Base URL: ${baseUrl}`);

  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();

  try {
    // Admin login
    await autoLogin(adminPage, config.adminEmail, config.adminPassword, config.bypassSecret);

    // Step 1: Delete all stress-group-* courses from the database
    console.log(`\n   📍 Step 1: Deleting stress test courses...`);
    
    const coursePatterns = [
      'stress-group-',
      'E2E 自動驗證課程-',
      'test-course-'
    ];

    for (const pattern of coursePatterns) {
      console.log(`   🔍 Searching for courses matching pattern: "${pattern}"`);
      
      try {
        // Try direct API deletion
        const response = await adminPage.request.get(`${baseUrl}/api/courses?query=${pattern}`);
        
        if (response.ok()) {
          const courses = await response.json().catch(() => []);
          if (Array.isArray(courses)) {
            for (const course of courses) {
              const courseId = course.id || course.courseId;
              if (courseId) {
                const delResponse = await adminPage.request.delete(`${baseUrl}/api/courses?id=${courseId}`);
                if (delResponse.ok()) {
                  console.log(`   ✅ Deleted course: ${courseId}`);
                } else {
                  console.warn(`   ⚠️ Failed to delete course ${courseId} (status: ${delResponse.status()})`);
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn(`   ⚠️ Error querying courses with pattern "${pattern}": ${(err as Error).message}`);
      }
    }

    // Step 2: Delete all orders for test courses
    console.log(`\n   📍 Step 2: Deleting test orders...`);

    try {
      // Check if there's a bulk delete endpoint
      const ordersToDelete = [
        'stress-group-0-',
        'stress-group-1-',
        'stress-group-2-'
      ];

      for (const courseId of ordersToDelete) {
        const response = await adminPage.request.delete(`${baseUrl}/api/orders?courseId=${courseId}`);
        if (response.ok()) {
          console.log(`   ✅ Deleted orders for courses matching: ${courseId}`);
        }
      }
    } catch (err) {
      console.warn(`   ⚠️ Error deleting orders: ${(err as Error).message}`);
    }

    // Step 3: Delete test teacher profiles
    console.log(`\n   📍 Step 3: Deleting test teacher accounts...`);

    const testTeachers = [
      'group-0-teacher@test.com',
      'group-1-teacher@test.com',
      'group-2-teacher@test.com'
    ];

    for (const teacherEmail of testTeachers) {
      try {
        // Try to delete via profiles API
        const response = await adminPage.request.delete(`${baseUrl}/api/profiles?email=${teacherEmail}`);
        if (response.ok()) {
          console.log(`   ✅ Deleted profile: ${teacherEmail}`);
        } else if (response.status() === 404) {
          console.log(`   ℹ️ Profile not found: ${teacherEmail} (already deleted)`);
        } else {
          console.warn(`   ⚠️ Failed to delete ${teacherEmail} (status: ${response.status()})`);
        }
      } catch (err) {
        console.warn(`   ⚠️ Error deleting profile ${teacherEmail}: ${(err as Error).message}`);
      }
    }

    // Step 4: Database cleanup via DynamoDB (if admin has access)
    console.log(`\n   📍 Step 4: Database cleanup summary...`);
    
    try {
      // Navigate to admin panel to verify cleanup
      await adminPage.goto(`${baseUrl}/admin/course-reviews`, { waitUntil: 'domcontentloaded' });
      await adminPage.waitForTimeout(2000);
      
      const courseItems = await adminPage.locator('[data-testid*="course"], tr').count();
      console.log(`   📊 Courses remaining in review: ${courseItems}`);
    } catch (err) {
      console.warn(`   ⚠️ Could not verify cleanup in admin panel: ${(err as Error).message}`);
    }

    console.log(`\n✅ Cleanup process completed`);
    console.log(`   💡 Note: Some entries may still be visible if API doesn't support bulk deletion`);
    console.log(`   💡 For complete cleanup, use DynamoDB directly or admin dashboard`);

  } catch (err) {
    console.error(`\n❌ Cleanup failed: ${(err as Error).message}`);
    throw err;
  } finally {
    await adminCtx.close();
  }
});
