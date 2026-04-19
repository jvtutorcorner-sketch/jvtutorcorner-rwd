#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load env variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const adminEmail = process.env.QA_ADMIN_EMAIL || 'admin@jvtutorcorner.com';
const adminPassword = process.env.QA_ADMIN_PASSWORD || '123456';

async function getAuthToken(email, password) {
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
    console.warn(`⚠️ Login error: ${err.message}`);
    return null;
  }
}

async function deleteTestCourses() {
  console.log(`\n🎯 Step 1: Deleting stress test courses...`);

  const patterns = ['stress-group-', 'E2E 自動驗證課程-', 'E2E', 'stress'];
  let deletedCount = 0;

  try {
    console.log(`   🔍 Fetching all courses...`);
    const response = await fetch(`${baseUrl}/api/courses?limit=500`);
    
    if (!response.ok) {
      console.warn(`   ⚠️ Failed to fetch courses (status: ${response.status})`);
      return;
    }

    const data = await response.json();
    const courseList = data.courses || (Array.isArray(data) ? data : []);
    
    console.log(`   📋 Total courses found: ${courseList.length}`);

    // Filter courses matching any test pattern
    const matchingCourses = courseList.filter((course) => {
      const id = (course.id || '').toString().toLowerCase();
      const title = (course.title || '').toString().toLowerCase();
      return patterns.some(pattern => id.includes(pattern.toLowerCase()) || title.includes(pattern.toLowerCase()));
    });

    console.log(`   🎯 Matching test courses: ${matchingCourses.length}`);

    for (const course of matchingCourses) {
      const courseId = course.id;
      const courseTitle = course.title || 'Unknown';
      
      try {
        // Try multiple delete endpoints
        let delResponse = null;
        let deletedVia = '';

        // Method 1: Try DELETE with id parameter
        delResponse = await fetch(`${baseUrl}/api/courses?id=${courseId}`, {
          method: 'DELETE'
        });
        deletedVia = 'DELETE /api/courses?id=...';

        // Method 2: If Method 1 fails, try DELETE with pathname
        if (!delResponse.ok && delResponse.status !== 204) {
          delResponse = await fetch(`${baseUrl}/api/courses/${courseId}`, {
            method: 'DELETE'
          });
          deletedVia = 'DELETE /api/courses/{id}';
        }

        // Method 3: If still failing, try POST with delete action
        if (!delResponse.ok && delResponse.status !== 204) {
          delResponse = await fetch(`${baseUrl}/api/courses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: courseId, action: 'delete' })
          });
          deletedVia = 'POST /api/courses (delete action)';
        }

        if (delResponse && (delResponse.ok || delResponse.status === 204)) {
          console.log(`   ✅ Deleted: "${courseTitle}" (${courseId}) via ${deletedVia}`);
          deletedCount++;
        } else {
          const status = delResponse?.status || 'unknown';
          console.warn(`   ⚠️ Failed to delete "${courseTitle}" (${courseId}) - Status: ${status}`);
        }
      } catch (err) {
        console.warn(`   ⚠️ Error deleting course "${courseTitle}" (${courseId}): ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`   ⚠️ Error in deleteTestCourses: ${err.message}`);
  }

  console.log(`   📊 Total courses deleted: ${deletedCount}`);
}

async function deleteTestOrders() {
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

async function deleteTestProfiles() {
  console.log(`\n🎯 Step 3: Deleting test profiles (teachers & students)...`);

  // Fixed E2E test accounts
  const fixedTestEmails = [
    // Stress test accounts
    'group-0-teacher@test.com',
    'group-1-teacher@test.com',
    'group-2-teacher@test.com',
    'group-0-student@test.com',
    'group-1-student@test.com',
    'group-2-student@test.com'
  ];

  let deletedCount = 0;

  // Delete fixed test emails
  for (const email of fixedTestEmails) {
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
      console.warn(`   ⚠️ Error deleting profile ${email}: ${err.message}`);
    }
  }

  console.log(`   📊 Total profiles deleted: ${deletedCount}`);
}

async function deleteE2ETestProfiles() {
  console.log(`\n🎯 Step 4: Deleting E2E test profiles (dynamic accounts)...`);

  try {
    // Get all profiles and filter by test patterns
    const response = await fetch(`${baseUrl}/api/profiles?limit=1000`);
    
    if (!response.ok) {
      console.warn(`   ⚠️ Failed to fetch profiles (status: ${response.status})`);
      return;
    }

    const data = await response.json();
    const profiles = data.profiles || (Array.isArray(data) ? data : []);

    // Test patterns to match
    const testPatterns = [
      'testuser_',      // navbar_verification.spec.ts
      'teacher_',       // navbar_verification.spec.ts (teacher role test)
      'group-',         // classroom_room_whiteboard_sync.spec.ts
      '@example.com',   // Generic test domain
      '@test.com'       // Test domain
    ];

    let deletedCount = 0;

    for (const profile of profiles) {
      const email = profile.email || '';
      
      // Check if email matches any test pattern
      const isTestAccount = testPatterns.some(pattern => email.includes(pattern));
      
      if (isTestAccount) {
        try {
          const delResponse = await fetch(`${baseUrl}/api/profiles?email=${email}`, {
            method: 'DELETE'
          });

          if (delResponse.ok || delResponse.status === 204) {
            console.log(`   ✅ Deleted E2E profile: ${email}`);
            deletedCount++;
          } else if (delResponse.status !== 404) {
            console.warn(`   ⚠️ Failed to delete ${email} (status: ${delResponse.status})`);
          }
        } catch (err) {
          console.warn(`   ⚠️ Error deleting profile ${email}: ${err.message}`);
        }
      }
    }

    console.log(`   📊 Total E2E profiles deleted: ${deletedCount}`);
  } catch (err) {
    console.warn(`   ⚠️ Error in E2E profile cleanup: ${err.message}`);
  }
}

async function main() {
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
    await deleteE2ETestProfiles();

    console.log('\n✅ Cleanup process completed successfully');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error(`\n❌ Cleanup failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
