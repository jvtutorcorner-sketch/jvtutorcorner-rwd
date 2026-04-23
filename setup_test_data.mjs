import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const teacherEmail = process.env.QA_TEACHER_EMAIL || process.env.TEST_TEACHER_EMAIL || 'lin@test.com';
const teacherPassword = process.env.TEST_TEACHER_PASSWORD || '123456';
const studentEmail = process.env.QA_STUDENT_EMAIL || process.env.TEST_STUDENT_EMAIL || 'pro@test.com';
const bypassSecret = process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET || process.env.LOGIN_BYPASS_SECRET || 'jv_secure_bypass_2024';
const testCourseId = process.env.TEST_COURSE_ID || '3ea66887-8145-4c10-ab3b-bf2d887c0bd4';

console.log(`📋 Test Setup Configuration:`);
console.log(`   Base URL: ${baseUrl}`);
console.log(`   Teacher: ${teacherEmail}`);
console.log(`   Student: ${studentEmail}`);
console.log(`   Test Course ID: ${testCourseId}`);

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // 1️⃣ Get teacher UUID
    console.log(`\n1️⃣ Getting teacher UUID for ${teacherEmail}...`);
    const profileRes = await page.request.get(`${baseUrl}/api/profile?email=${encodeURIComponent(teacherEmail)}`);
    if (!profileRes.ok()) {
      throw new Error(`Failed to get teacher profile: ${await profileRes.text()}`);
    }
    const profileData = await profileRes.json();
    const teacherId = profileData?.id || profileData?.profile?.id;
    console.log(`   ✅ Teacher UUID: ${teacherId}`);

    // 2️⃣ Get teacher's bypass token for login
    console.log(`\n2️⃣ Logging in teacher for JWT...`);
    const captchaRes = await page.request.get(`${baseUrl}/api/captcha`);
    const captchaToken = (await captchaRes.json())?.token || '';
    
    const loginRes = await page.request.post(`${baseUrl}/api/login`, {
      data: JSON.stringify({ 
        email: teacherEmail, 
        password: teacherPassword, 
        captchaToken, 
        captchaValue: bypassSecret 
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!loginRes.ok()) {
      throw new Error(`Teacher login failed: ${await loginRes.text()}`);
    }
    const loginData = await loginRes.json();
    const teacherJwt = loginData?.token;
    console.log(`   ✅ Teacher logged in (JWT obtained)`);

    // 3️⃣ Check if course exists
    console.log(`\n3️⃣ Checking if course ${testCourseId} exists...`);
    const courseCheckRes = await page.request.get(
      `${baseUrl}/api/courses?teacherId=${encodeURIComponent(teacherId)}`,
      teacherJwt ? { headers: { 'Authorization': `Bearer ${teacherJwt}` } } : {}
    );
    
    if (courseCheckRes.ok()) {
      const courseData = await courseCheckRes.json();
      const courses = courseData.data || courseData || [];
      const existingCourse = courses.find((c) => c.id === testCourseId);
      
      if (existingCourse) {
        console.log(`   ✅ Course exists: ${testCourseId}`);
        console.log(`      Title: ${existingCourse.title}`);
        console.log(`      Teacher: ${existingCourse.teacherId}`);
      } else {
        console.log(`   ⚠️ Course not found. Need to create it.`);
        
        // 4️⃣ Create course
        console.log(`\n4️⃣ Creating test course...`);
        const coursePayload = {
          id: testCourseId,
          title: `E2E Whiteboard Sync Test - ${Date.now()}`,
          teacherName: 'Test Teacher',
          enrollmentType: 'points',
          pointCost: 10,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 30 * 86400000).toISOString(),
          status: '上架',
          teacherId: teacherId,  // Include UUID
        };
        
        const createRes = await page.request.post(`${baseUrl}/api/courses`, {
          data: JSON.stringify(coursePayload),
          headers: { 
            'Content-Type': 'application/json',
            ...(teacherJwt && { 'Authorization': `Bearer ${teacherJwt}` })
          },
        });
        
        if (createRes.ok()) {
          console.log(`   ✅ Course created successfully`);
        } else {
          console.error(`   ⚠️ Course creation response: ${await createRes.text()}`);
        }
      }
    }

    // 5️⃣ Check student enrollment
    console.log(`\n5️⃣ Checking student ${studentEmail} enrollment...`);
    const ordersRes = await page.request.get(
      `${baseUrl}/api/orders?userId=${encodeURIComponent(studentEmail)}&limit=100`
    );
    
    if (ordersRes.ok()) {
      const ordersData = await ordersRes.json();
      const orders = ordersData.data || [];
      const courseOrder = orders.find((o) => o.courseId === testCourseId);
      
      if (courseOrder) {
        console.log(`   ✅ Student already enrolled in course ${testCourseId}`);
      } else {
        console.log(`   ⚠️ Student not enrolled in course ${testCourseId}`);
        console.log(`   📝 Note: Enrollment flow will be triggered automatically in the test`);
      }
    }

    console.log(`\n✅ Setup complete! Ready to run whiteboard sync test.`);

  } catch (err) {
    console.error(`\n❌ Setup failed:`, err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
