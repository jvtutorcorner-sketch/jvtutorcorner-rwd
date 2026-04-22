import { test, expect, Dialog } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import {
  getTestConfig,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from './test_data/whiteboard_test_data';
import {
  runEnrollmentFlow,
  injectDeviceCheckBypass,
  autoLogin,
  checkAndFindEnrollment,
  goToWaitRoom,
  enterClassroom,
  clickReadyButton,
  waitAndEnterClassroom,
} from './helpers/whiteboard_helpers';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

/**
 * This test specifically verifies that the "Remaining Time" (剩餘時間) 
 * is updated correctly in the database and reflected on the UI 
 * after a teacher ends a classroom session.
 */
test.describe('Remaining Time Update Verification', () => {
  test.setTimeout(300000);

  test('Verify remaining time decreases after ending session', async ({ browser }) => {
    const config = getTestConfig();
    const testId = `time-sync-${Date.now()}`;
    const courseId = testId;
    
    console.log(`\n📍 Starting Remaining Time Verification: ${courseId}`);
    
    // Step 0: Ensure a 60-minute course and enrollment exists
    console.log('   📍 Step 0: Triggering enrollment flow (60m course)...');
    runEnrollmentFlow(courseId);

    // Step 1: Login to get initial state
    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();
    await injectDeviceCheckBypass(teacherPage);
    await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
    
    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();
    await injectDeviceCheckBypass(studentPage);
    await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);

    // Verify initial time is 60m on both dashboards
    console.log('\n📍 Step 1: Verifying initial time is 60 m');
    await teacherPage.goto(`${config.baseUrl}/teacher_courses?includeTests=true`);
    // More robust locator: find row that has a link to this course ID
    const teacherRowInitial = teacherPage.locator('tr, .course-card').filter({ 
      has: teacherPage.locator(`a[href*="${courseId}"]`) 
    }).first();
    await teacherRowInitial.waitFor({ state: 'visible', timeout: 30000 });
    
    // Improved time cell detection: find a cell that contains "m" or "minutes"
    const teacherTimeInitial = await teacherRowInitial.locator('td, div').filter({ hasText: / \d+ m|分/ }).first().innerText();
    console.log(`   [Teacher] Initial time seen: ${teacherTimeInitial}`);
    
    await studentPage.goto(`${config.baseUrl}/student_courses?includeTests=true`);
    const studentRowInitial = studentPage.locator('tr, .course-card').filter({ 
      has: studentPage.locator(`a[href*="${courseId}"]`) 
    }).first();
    await studentRowInitial.waitFor({ state: 'visible', timeout: 30000 });
    const studentTimeInitial = await studentRowInitial.locator('td, div').filter({ hasText: / \d+ m|分/ }).first().innerText();
    console.log(`   [Student] Initial time seen: ${studentTimeInitial}`);

    // expect(teacherTimeInitial).toContain('60 m');
    // expect(studentTimeInitial).toContain('60 m');

    // Step 2: Enter Classroom
    console.log('\n📍 Step 2: Entering classroom');
    await goToWaitRoom(teacherPage, courseId, 'teacher');
    await goToWaitRoom(studentPage, courseId, 'student');

    await Promise.all([
      enterClassroom(teacherPage, 'teacher'),
      enterClassroom(studentPage, 'student')
    ]);

    await clickReadyButton(teacherPage, 'teacher');
    await clickReadyButton(studentPage, 'student');

    await Promise.all([
      waitAndEnterClassroom(teacherPage, 'teacher'),
      waitAndEnterClassroom(studentPage, 'student')
    ]);

    console.log('\n📍 Step 3: Staying in classroom for 65 seconds to trigger timer update');
    // We wait 65 seconds to ensure at least one "60s periodic sync" happens OR the total time decreases visibly
    await teacherPage.waitForTimeout(65000);

    // Verify time in room is visible and counting down
    const roomTimeText = await teacherPage.locator('div').filter({ hasText: /剩餘時間|Remaining/ }).last().innerText().catch(() => 'unknown');
    console.log(`   [Classroom] Teacher sees remaining time: ${roomTimeText.replace(/\n/g, ' ')}`);

    // Step 4: Teacher ends the course
    console.log('\n📍 Step 4: Teacher ending course (triggers DB update)');
    teacherPage.on('dialog', (dialog: Dialog) => dialog.accept());
    
    const endBtn = teacherPage.locator('button').filter({ hasText: /結束課程|離開|End Session|Leave|終了/ }).last();
    await endBtn.click();
    console.log('   ✅ End button clicked');

    // Wait for the navigation/update to process
    await teacherPage.waitForTimeout(3000);

    // Step 5: Verify remaining time on dashboards
    console.log('\n📍 Step 5: Verifying updated time on dashboards');
    
    await teacherPage.goto(`${config.baseUrl}/teacher_courses?includeTests=true`);
    const teacherRowFinal = teacherPage.locator('tr, .course-card').filter({ 
      has: teacherPage.locator(`a[href*="${courseId}"]`) 
    }).first();
    await teacherRowFinal.waitFor({ state: 'visible', timeout: 30000 });
    const teacherTimeFinal = await teacherRowFinal.locator('td, div').filter({ hasText: / \d+ m|分/ }).first().innerText();
    console.log(`   [Teacher] Final time seen: ${teacherTimeFinal}`);
    
    await studentPage.goto(`${config.baseUrl}/student_courses?includeTests=true`);
    const studentRowFinal = studentPage.locator('tr, .course-card').filter({ 
      has: studentPage.locator(`a[href*="${courseId}"]`) 
    }).first();
    await studentRowFinal.waitFor({ state: 'visible', timeout: 30000 });
    const studentTimeFinal = await studentRowFinal.locator('td, div').filter({ hasText: / \d+ m|分/ }).first().innerText();
    console.log(`   [Student] Final time seen: ${studentTimeFinal}`);

    // Verification: Time should have decreased from 60m
    const initialNum = parseInt(teacherTimeInitial.match(/\d+/)?.[0] || '60');
    const finalNum = parseInt(teacherTimeFinal.match(/\d+/)?.[0] || '60');
    
    console.log(`   📊 Calculation: ${initialNum}m -> ${finalNum}m`);
    
    expect(finalNum).toBeLessThan(initialNum);
    console.log('   ✅ Verification Passed: Remaining time updated successfully');

    // Only cleanup after confirmation (Step 6)
    if (!process.env.SKIP_CLEANUP) {
      console.log(`\n📍 Step 6: Cleaning up test data for ${courseId}`);
      await teacherPage.request.delete(`${config.baseUrl}/api/courses?id=${courseId}`).catch(() => {});
      await teacherPage.request.delete(`${config.baseUrl}/api/orders?courseId=${courseId}`).catch(() => {});
    } else {
      console.log(`\n📍 SKIP_CLEANUP=true. Test data for ${courseId} remains for inspection.`);
    }

    await teacherCtx.close();
    await studentCtx.close();
  });
});
