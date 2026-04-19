#!/usr/bin/env node
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load env variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const adminEmail = process.env.QA_ADMIN_EMAIL || 'admin@jvtutorcorner.com';
const adminPassword = process.env.QA_ADMIN_PASSWORD || '123456';

interface CourseData {
  ok?: boolean;
  courses?: Array<{ id: string; title: string }>;
  message?: string;
}

async function getAuthToken(email: string, password: string): Promise<string | null> {
  try {
    console.log(`🔐 Getting auth token for ${email}...`);
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      console.warn(`⚠️ Login failed for ${email} (status: ${response.status})`);
      return null;
    }

    const data = await response.text();
    console.log(`✅ Login successful for ${email}`);
    return email; // Token or identifier
  } catch (err) {
    console.warn(`⚠️ Login error: ${(err as Error).message}`);
    return null;
  }
}

async function deleteTestCourses(): Promise<void> {
  console.log(`\n🎯 Step 1: Deleting stress test courses...`);

  const patterns = ['stress-group-', 'E2E 自動驗證課程-'];
  let deletedCount = 0;

  for (const pattern of patterns) {
    try {
      console.log(`   🔍 Searching for courses with pattern: "${pattern}"`);
      
      // Try to get courses that match the pattern
      const response = await fetch(`${baseUrl}/api/courses?limit=100`);
      
      if (!response.ok) {
        console.warn(`   ⚠️ Failed to fetch courses (status: ${response.status})`);
        continue;
      }

      const courses = await response.json() as CourseData;
      const courseList = courses.courses || (Array.isArray(courses) ? courses : []);
      
      // Filter courses matching the pattern
      const matchingCourses = courseList.filter((course: any) => {
        const title = course.title || course.id || '';
        return title.includes(pattern);
      });

      for (const course of matchingCourses) {
        const courseId = course.id;
        try {
          const delResponse = await fetch(`${baseUrl}/api/courses?id=${courseId}`, {
            method: 'DELETE'
          });

          if (delResponse.ok || delResponse.status === 204) {
            console.log(`   ✅ Deleted course: ${courseId}`);
            deletedCount++;
          } else {
            console.warn(`   ⚠️ Failed to delete ${courseId} (status: ${delResponse.status})`);
          }
        } catch (err) {
          console.warn(`   ⚠️ Error deleting ${courseId}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      console.warn(`   ⚠️ Error processing pattern "${pattern}": ${(err as Error).message}`);
    }
  }

  console.log(`   📊 Total courses deleted: ${deletedCount}`);
}

async function deleteTestOrders(): Promise<void> {
  console.log(`\n🎯 Step 2: Deleting test orders...`);

  const coursePatterns = ['stress-group-0-', 'stress-group-1-', 'stress-group-2-'];
  let deletedCount = 0;

  for (const pattern of coursePatterns) {
    try {
      const response = await fetch(`${baseUrl}/api/orders?courseId=${pattern}`);
      
      if (response.ok) {
        console.log(`   ✅ Deleted orders for courses matching: ${pattern}`);
        deletedCount++;
      }
    } catch (err) {
      // Silent fail for non-existent orders
    }
  }

  console.log(`   📊 Total order deletions attempted: ${deletedCount}`);
}

async function deleteTestProfiles(): Promise<void> {
  console.log(`\n🎯 Step 3: Deleting test teacher profiles...`);

  const testEmails = [
    'group-0-teacher@test.com',
    'group-1-teacher@test.com',
    'group-2-teacher@test.com'
  ];

  let deletedCount = 0;

  for (const email of testEmails) {
    try {
      const response = await fetch(`${baseUrl}/api/profiles?email=${email}`, {
        method: 'DELETE'
      });

      if (response.ok || response.status === 204) {
        console.log(`   ✅ Deleted profile: ${email}`);
        deletedCount++;
      } else if (response.status === 404) {
        console.log(`   ℹ️ Profile not found: ${email} (already deleted)`);
      } else {
        console.warn(`   ⚠️ Failed to delete ${email} (status: ${response.status})`);
      }
    } catch (err) {
      console.warn(`   ⚠️ Error deleting profile ${email}: ${(err as Error).message}`);
    }
  }

  console.log(`   📊 Total profiles deleted: ${deletedCount}`);
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧹 TEST DATA CLEANUP');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Admin: ${adminEmail}`);
  console.log('');

  try {
    // Get auth token
    const token = await getAuthToken(adminEmail, adminPassword);
    if (!token) {
      console.warn('⚠️ Could not authenticate as admin, proceeding with public API calls...');
    }

    // Execute cleanup steps
    await deleteTestCourses();
    await deleteTestOrders();
    await deleteTestProfiles();

    console.log('\n✅ Cleanup process completed successfully');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error(`\n❌ Cleanup failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
