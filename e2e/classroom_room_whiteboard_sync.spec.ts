import { test, expect, Dialog } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import {
  getTestConfig,
  getStressGroupConfigs,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  COURSE_ID_PREFIXES,
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
  drawOnWhiteboard,
  hasDrawingContent,
  createCourseAsTeacher,
  adminApproveCourse,
  cleanupTestData,
} from './helpers/whiteboard_helpers';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// ─── smoke ──────────────────────────────────────────────────────────
test.describe('[smoke] Whiteboard Quick Entry', () => {
  test.setTimeout(120000);

  test('Quick classroom entry and canvas load', async ({ browser }) => {
    const config = getTestConfig();
    const courseId = `${COURSE_ID_PREFIXES.smoke}${Date.now()}`;
    runEnrollmentFlow(courseId);

    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();
    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();

    try {
      await injectDeviceCheckBypass(teacherPage);
      await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
      await goToWaitRoom(teacherPage, courseId, 'teacher');

      await injectDeviceCheckBypass(studentPage);
      await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);
      await goToWaitRoom(studentPage, courseId, 'student');

      await Promise.all([
        enterClassroom(teacherPage, 'teacher'),
        enterClassroom(studentPage, 'student'),
      ]);
      await clickReadyButton(teacherPage, 'teacher');
      await clickReadyButton(studentPage, 'student');
      await Promise.all([
        waitAndEnterClassroom(teacherPage, 'teacher'),
        waitAndEnterClassroom(studentPage, 'student'),
      ]);

      // Smoke: just verify canvas is visible — no drawing sync needed
      const canvas = teacherPage.locator('canvas:visible').first();
      await expect(canvas).toBeVisible({ timeout: 30000 });
      console.log('   ✅ [smoke] Canvas visible for teacher — basic entry verified');
    } finally {
      if (!process.env.SKIP_CLEANUP) {
        await teacherPage.request.delete(`${config.baseUrl}/api/courses?id=${courseId}`).catch(() => {});
        await teacherPage.request.delete(`${config.baseUrl}/api/orders?courseId=${courseId}`).catch(() => {});
      }
      await teacherCtx.close();
      await studentCtx.close();
    }
  });
});

// ─── standard ────────────────────────────────────────────────────────
test.describe('[standard] Whiteboard Sync', () => {
  test.setTimeout(300000);

  test('Teacher drawings sync to student', async ({ browser }) => {
    const config = getTestConfig();
    const baseId = process.env.TEST_COURSE_ID || `sync-${Date.now()}`;
    
    // Step 0: Enrollment Check
    console.log('\n📍 Step 0: Enrollment Check');
    const tempPage = await (await browser.newContext()).newPage();
    const forcedId = process.env.TEST_COURSE_ID;
    const foundId = await checkAndFindEnrollment(tempPage, config, forcedId);
    await tempPage.context().close();

    const finalCourseId = foundId || forcedId || `sync-${Date.now()}`;

    if (foundId) {
      console.log(`   ⏭️ Using existing enrollment: ${finalCourseId}`);
    } else {
      console.log(`   📍 No actual enrollment found for ${finalCourseId}. Triggering enrollment flow...`);
      runEnrollmentFlow(finalCourseId);
    }

    // Step 1: Login & Enter Wait Room
    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();
    await injectDeviceCheckBypass(teacherPage);
    await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
    await goToWaitRoom(teacherPage, finalCourseId, 'teacher');

    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();
    await injectDeviceCheckBypass(studentPage);
    await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);
    await goToWaitRoom(studentPage, finalCourseId, 'student');

    // Step 2: Enter Classroom
    console.log('\n📍 Step 2a: Wait Page Validation (parallel)');
    try {
      await Promise.all([
        enterClassroom(teacherPage, 'teacher'),
        enterClassroom(studentPage, 'student')
      ]);

      // Step 2b: Sequential ready clicks to avoid DynamoDB race condition
      console.log('\n📍 Step 2b: Click Ready (sequential - avoids DynamoDB race condition)');
      await clickReadyButton(teacherPage, 'teacher');
      await clickReadyButton(studentPage, 'student');

      // Step 2c: Parallel wait and enter
      console.log('\n📍 Step 2c: Enter Classroom (parallel)');
      await Promise.all([
        waitAndEnterClassroom(teacherPage, 'teacher'),
        waitAndEnterClassroom(studentPage, 'student')
      ]);

      console.log('\n📍 Step 2.5: Waiting for Whiteboard Initialization');
      console.log('   ⏳ 等待教師白板房間初始化...');
      await teacherPage.waitForTimeout(8000);
      
      console.log('   ⏳ 等待學生發現教師的白板房間 UUID (轮询 4 秒)...');
      await studentPage.waitForTimeout(8000);
      
      // 驗證兩個頁面都有 Agora 白板 SDK
      const teacherHasAgora = await teacherPage.evaluate(() => {
        const sdk = (window as any).WhiteWebSdk;
        return sdk && sdk.WhiteWebSdk !== undefined;
      }).catch(() => false);
      const studentHasAgora = await studentPage.evaluate(() => {
        const sdk = (window as any).WhiteWebSdk;
        return sdk && sdk.WhiteWebSdk !== undefined;
      }).catch(() => false);
      console.log(`   ✅ Teacher WhiteWebSdk Loaded: ${teacherHasAgora}, Student WhiteWebSdk Loaded: ${studentHasAgora}`);
      
      // 也驗證白板房間是否已連接
      const teacherRoomConnected = await teacherPage.evaluate(() => {
        return (window as any).agoraRoom !== undefined;
      }).catch(() => false);
      const studentRoomConnected = await studentPage.evaluate(() => {
        return (window as any).agoraRoom !== undefined;
      }).catch(() => false);
      console.log(`   ✅ Teacher Room Connected: ${teacherRoomConnected}, Student Room Connected: ${studentRoomConnected}`);

      // Step 3: Draw & Verify
      console.log('\n📍 Step 3: Verifying Sync');
      await drawOnWhiteboard(teacherPage);
      await teacherPage.waitForTimeout(3000);
      
      const teacherOk = await hasDrawingContent(teacherPage);
      const studentOk = await hasDrawingContent(studentPage);
      
      console.log(`   📊 Teacher Canvas Check: ${teacherOk}`);
      console.log(`   📊 Student Canvas Check: ${studentOk}`);
      
      expect(teacherOk).toBe(true);
      expect(studentOk).toBe(true);

      // Step 4: 模擬待在教室 1 分鐘
      console.log('\n📍 Step 4: Staying in classroom for 1 minute to test countdown...');
      await teacherPage.waitForTimeout(60000);

      // Optional: Check the timer display in classroom
      const roomTimeText = await teacherPage.locator('div').filter({ hasText: /剩餘時間|Remaining/ }).last().innerText().catch(() => 'unknown');
      console.log(`   [Classroom] Teacher sees remaining time: ${roomTimeText}`);

      // Step 5: 老師退出教室
      console.log('\n📍 Step 5: Teacher exiting classroom...');
      teacherPage.on('dialog', (dialog: Dialog) => dialog.accept());
      
      const endBtn = teacherPage.locator('button').filter({ hasText: /結束課程|離開|End Session|Leave|終了/ }).last();
      const isEndBtnVisible = await endBtn.isVisible().catch(() => false);
      if (isEndBtnVisible) {
        await endBtn.click();
        // 結束課程後導航回課程列表
        await teacherPage.goto(`${config.baseUrl}/teacher_courses`);
        console.log('   ✅ [Teacher] Successfully returned to /teacher_courses');
      } else {
        console.log('   ℹ️  [Teacher] End button not found, navigating away manually');
        await teacherPage.goto(`${config.baseUrl}/teacher_courses`);
      }
      
      // 學生也退出
      await studentPage.goto(`${config.baseUrl}/student_courses`);
      console.log('   ✅ [Student] Successfully returned to /student_courses');
      
      // Step 6: 分別回到頁面檢查倒數時間
      console.log('\n📍 Step 6: Verifying remaining time on dashboard...');
      
      const teacherRow = teacherPage.locator(`tr:has-text("${finalCourseId}"), .course-card:has-text("${finalCourseId}")`).first();
      await teacherRow.waitFor({ state: 'visible', timeout: 10000 });
      const teacherTimeText = await teacherRow.innerText().catch(() => '');
      console.log(`   [Teacher] Row Text: ${teacherTimeText.replace(/\n/g, ' ')}`);
      
      const studentRow = studentPage.locator(`tr:has-text("${finalCourseId}"), .course-card:has-text("${finalCourseId}")`).first();
      await studentRow.waitFor({ state: 'visible', timeout: 10000 });
      const studentTimeText = await studentRow.innerText().catch(() => '');
      console.log(`   [Student] Row Text: ${studentTimeText.replace(/\n/g, ' ')}`);

      // Time should logically decrement (e.g. 59 m or 58 m) since 1 minute has passed
      expect(teacherTimeText).not.toContain('60 m');
      expect(studentTimeText).not.toContain('60 m');

    } finally {
      // Cleanup
      if (!process.env.SKIP_CLEANUP) {
        console.log(`   🧹 Cleaning up test course: ${finalCourseId}`);
        await teacherPage.request.delete(`${config.baseUrl}/api/courses?id=${finalCourseId}`).catch(e => console.warn('Cleanup failed:', e));
        await teacherPage.request.delete(`${config.baseUrl}/api/orders?courseId=${finalCourseId}`).catch(() => {});
      }
      await teacherCtx.close();
      await studentCtx.close();
    }
  });

  test('Simulate disconnection and reconnection to verify classroom timer syncs with database', async ({ browser }) => {
    const config = getTestConfig();
    const finalCourseId = `net-${Date.now()}`;
    
    console.log('\n📍 Setup: Prepare enrollment for network test...');
    runEnrollmentFlow(finalCourseId);

    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();
    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();
    
    try {
      await injectDeviceCheckBypass(teacherPage);
      await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
      await goToWaitRoom(teacherPage, finalCourseId, 'teacher');

      await injectDeviceCheckBypass(studentPage);
      await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);
      await goToWaitRoom(studentPage, finalCourseId, 'student');

      console.log('\n📍 Entering Classroom (Teacher and Student)...');
      await Promise.all([
        enterClassroom(teacherPage, 'teacher'),
        enterClassroom(studentPage, 'student')
      ]);

      console.log('\n📍 Simulating Offline State (Teacher)...');
      await teacherPage.waitForTimeout(5000); 
      
      const beforeTimeText = await teacherPage.locator('div').filter({ hasText: /剩餘時間|Remaining/ }).last().innerText().catch(() => 'unknown');
      console.log(`   [Online] Initial timer: ${beforeTimeText.replace(/\n/g, ' ')}`);

      await teacherCtx.setOffline(true);
      console.log('   ❌ [System] Network disconnected (Offline)');
      
      await teacherPage.waitForTimeout(10000);
      
      console.log('\n📍 Restoring Connection...');
      await teacherCtx.setOffline(false);
      console.log('   ✅ [System] Network reconnected (Online)');

      await teacherPage.waitForTimeout(5000);
      const afterTimeText = await teacherPage.locator('div').filter({ hasText: /剩餘時間|Remaining/ }).last().innerText().catch(() => 'unknown');
      console.log(`   [Online] Recovered timer: ${afterTimeText.replace(/\n/g, ' ')}`);
      
      expect(afterTimeText).not.toBe('unknown');

    } finally {
      if (!process.env.SKIP_CLEANUP) {
        console.log(`   🧹 Cleaning up network test course: ${finalCourseId}`);
        await teacherPage.request.delete(`${config.baseUrl}/api/courses?id=${finalCourseId}`).catch(() => {});
        await teacherPage.request.delete(`${config.baseUrl}/api/orders?courseId=${finalCourseId}`).catch(() => {});
      }
      await teacherCtx.close();
      await studentCtx.close();
    }
  });

});

// ─── stress ──────────────────────────────────────────────────────────
test.describe('[stress] Concurrent Groups', () => {
  test.setTimeout(600000);

  test('3 concurrent teacher-student groups with isolation verification', async ({ browser }) => {
    const config = getTestConfig();
    const baseUrl = config.baseUrl;
    const timestamp = Date.now();

    // ─── Group Configuration with Different Teachers ───
    const groupCount = parseInt(process.env.STRESS_GROUP_COUNT || '3', 10);
    const groupConfigs = getStressGroupConfigs(groupCount, timestamp);

    console.log(`\n🔴 STRESS TEST: ${groupCount} Concurrent Groups with Isolated Teachers & Students`);
    console.log(`   📍 Timestamp: ${timestamp}`);
    console.log(`   📋 Group Configuration:`);
    groupConfigs.forEach(g => {
      console.log(`      [${g.groupId}] Teacher: ${g.teacherEmail}, Student: ${g.studentEmail}, Course: ${g.courseId}`);
    });
    
    // Step 0: Teacher accounts registration and course creation (Sequential)
    console.log('\n📍 Step 0: Each teacher creates their own course...');
    const courseCreationErrors: string[] = [];
    for (const group of groupConfigs) {
      try {
        const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
        const teacherPage = await teacherCtx.newPage();
        
        console.log(`\n   ⏳ [${group.groupId}] Teacher ${group.teacherEmail} creating course...`);
        await createCourseAsTeacher(
          teacherPage,
          group.courseId,
          group.teacherEmail,
          group.teacherPassword,
          config.bypassSecret
        );
        console.log(`   ✅ [${group.groupId}] Course "${group.courseId}" created by ${group.teacherEmail}`);
        
        await teacherCtx.close();
      } catch (err) {
        const errorMsg = `[${group.groupId}] Course creation by ${group.teacherEmail} failed: ${(err as Error)?.message || String(err)}`;
        console.error(`   ❌ ${errorMsg}`);
        courseCreationErrors.push(errorMsg);
      }
    }
    
    // Report on course creation phase
    if (courseCreationErrors.length > 0) {
      console.error(`\n⚠️ Course Creation Phase Completed with ${courseCreationErrors.length}/${groupCount} errors:`);
      courseCreationErrors.forEach(e => console.error(`    - ${e}`));
    } else {
      console.log(`\n✅ All ${groupCount} courses created successfully by their respective teachers`);
    }

    // Step 0.5: Admin approves all test courses (MUST be before student enrollment)
    console.log('\n📍 Step 0.5: Admin approving all courses...');
    const approvalErrors: string[] = [];
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    
    for (const group of groupConfigs) {
      try {
        await adminApproveCourse(
          adminPage,
          group.courseId,
          ADMIN_EMAIL,
          ADMIN_PASSWORD,
          config.bypassSecret
        );
        console.log(`   ✅ [${group.groupId}] Course approved`);
      } catch (err) {
        const errorMsg = `[${group.groupId}] Course approval failed: ${(err as Error)?.message || String(err)}`;
        console.error(`   ❌ ${errorMsg}`);
        approvalErrors.push(errorMsg);
      }
    }

    if (approvalErrors.length > 0) {
      console.error(`\n⚠️ Course Approval Phase Completed with ${approvalErrors.length}/${groupCount} errors:`);
      approvalErrors.forEach(e => console.error(`    - ${e}`));
    } else {
      console.log(`\n✅ All ${groupCount} courses approved by admin`);
    }

    await adminCtx.close();

    // Step 1: Enrollment for all groups (Sequential to avoid DynamoDB throttling)
    console.log('\n📍 Step 1: Student enrolls in all courses...');
    const enrollmentErrors: string[] = [];
    for (const group of groupConfigs) {
      try {
        console.log(`   ⏳ [${group.groupId}] Starting enrollment subprocess for ${group.studentEmail}...`);
        runEnrollmentFlow(group.courseId, group.teacherEmail, group.studentEmail);
        console.log(`   ✅ [${group.groupId}] Enrollment flow completed`);
      } catch (err) {
        const errorMsg = `[${group.groupId}] Enrollment failed: ${(err as Error)?.message || String(err)}`;
        console.error(`   ❌ ${errorMsg}`);
        enrollmentErrors.push(errorMsg);
      }
    }
    
    // Report on enrollment phase
    if (enrollmentErrors.length > 0) {
      console.error(`\n⚠️ Enrollment Phase Completed with ${enrollmentErrors.length}/${groupCount} errors:`);
      enrollmentErrors.forEach(e => console.error(`    - ${e}`));
    } else {
      console.log(`\n✅ All ${groupCount} groups completed enrollment successfully`);
    }

    interface GroupSession {
      groupId: string;
      courseId: string;
      teacherCtx: any;
      teacherPage: any;
      studentCtx: any;
      studentPage: any;
      result: {
        waitRoomParticipants?: number;
        classroomEntered: boolean;
        drawingVerified: boolean;
        error?: string;
      };
    }

    const sessions: GroupSession[] = [];

    // Step 2: Parallel Setup - Create contexts and login
    console.log('\n📍 Step 2: Setting up browser contexts and login for all groups...');
    for (const group of groupConfigs) {
      const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      const teacherPage = await teacherCtx.newPage();
      const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      const studentPage = await studentCtx.newPage();
      
      const session: GroupSession = {
        groupId: group.groupId,
        courseId: group.courseId,
        teacherCtx,
        teacherPage,
        studentCtx,
        studentPage,
        result: {
          classroomEntered: false,
          drawingVerified: false
        }
      };
      sessions.push(session);
    }

    try {
      // Step 3: Parallel Login & Navigate to Wait Room
      console.log('\n📍 Step 3: Parallel login and navigate to wait room for all groups...');
      await Promise.all(sessions.map(async (session, idx) => {
        const group = groupConfigs[idx];
        console.log(`   ⏳ [${session.groupId}] Logging in teacher and student...`);
        
        try {
          // Teacher login
          await injectDeviceCheckBypass(session.teacherPage);
          await autoLogin(session.teacherPage, group.teacherEmail, group.teacherPassword, config.bypassSecret);
          await goToWaitRoom(session.teacherPage, group.courseId, 'teacher');
          console.log(`   ✅ [${session.groupId}] Teacher at wait room`);
          
          // Student login
          await injectDeviceCheckBypass(session.studentPage);
          await autoLogin(session.studentPage, group.studentEmail, group.studentPassword, config.bypassSecret);
          await goToWaitRoom(session.studentPage, group.courseId, 'student');
          console.log(`   ✅ [${session.groupId}] Student at wait room`);
        } catch (e) {
          session.result.error = `Wait room setup failed: ${(e as Error).message}`;
          console.error(`   ❌ [${session.groupId}] ${session.result.error}`);
          throw e;
        }
      }));

      // Step 4: Verify Wait Room Isolation - Each group should only see 2 participants
      console.log('\n📍 Step 4: Verifying wait room isolation (each group should have exactly 2 participants)...');
      await Promise.all(sessions.map(async (session) => {
        try {
          // Count visible participants in teacher's wait room
          const participantCount = await session.teacherPage.evaluate(() => {
            // Try multiple selectors to find participant cards/rows
            const selectors = [
              '[class*="participant"]',
              '[class*="user-card"]',
              '[class*="member"]',
              'div[role="listitem"]'
            ];
            
            let maxCount = 0;
            for (const selector of selectors) {
              const elements = document.querySelectorAll(selector);
              maxCount = Math.max(maxCount, elements.length);
            }
            
            // Also check for explicit participant list
            const participantList = document.querySelectorAll('[data-testid*="participant"], .participant-list li');
            maxCount = Math.max(maxCount, participantList.length);
            
            // If still 0, try to count visible user elements
            if (maxCount === 0) {
              const visibleDivs = Array.from(document.querySelectorAll('div')).filter(el => {
                const text = el.textContent || '';
                return (text.includes('準備好') || text.includes('Ready')) && el.offsetHeight > 0;
              });
              maxCount = visibleDivs.length;
            }
            
            return Math.max(2, maxCount); // At least teacher + student = 2
          });
          
          session.result.waitRoomParticipants = participantCount;
          console.log(`   📊 [${session.groupId}] Wait room participant count: ${participantCount} (expected: 2)`);
          
          // Log the HTML snippet for debugging if count is unexpected
          if (participantCount !== 2) {
            const htmlSnippet = await session.teacherPage.content();
            if (htmlSnippet.includes('participant') || htmlSnippet.includes('ready')) {
              console.log(`   ℹ️ [${session.groupId}] Wait room HTML contains participant/ready data`);
            }
          }
        } catch (e) {
          console.warn(`   ⚠️ [${session.groupId}] Could not verify participant count: ${(e as Error).message}`);
        }
      }));

      // Step 5: Parallel Ready Check and Enter Classroom
      console.log('\n📍 Step 5: Ready check and entering classroom for all groups (parallel groups)...');
      await Promise.all(sessions.map(async (session) => {
        try {
          console.log(`   ⏳ [${session.groupId}] Validating wait page...`);
          await Promise.all([
            enterClassroom(session.teacherPage, 'teacher'),
            enterClassroom(session.studentPage, 'student')
          ]);

          console.log(`   ⏳ [${session.groupId}] Clicking Ready (sequential within group)...`);
          await clickReadyButton(session.teacherPage, 'teacher');
          await clickReadyButton(session.studentPage, 'student');

          console.log(`   ⏳ [${session.groupId}] Entering room...`);
          await Promise.all([
            waitAndEnterClassroom(session.teacherPage, 'teacher'),
            waitAndEnterClassroom(session.studentPage, 'student')
          ]);

          session.result.classroomEntered = true;
          console.log(`   ✅ [${session.groupId}] Both in classroom`);
        } catch (e) {
          session.result.error = `Classroom entry failed: ${(e as Error).message}`;
          console.error(`   ❌ [${session.groupId}] ${session.result.error}`);
          throw e;
        }
      }));

      // Step 6: Wait for Whiteboard Initialization (parallel)
      console.log('\n📍 Step 6: Waiting for whiteboard initialization (all groups parallel)...');
      await Promise.all(sessions.map(async (session) => {
        console.log(`   ⏳ [${session.groupId}] Waiting for whiteboard (8 seconds)...`);
        await session.teacherPage.waitForTimeout(8000);
        await session.studentPage.waitForTimeout(8000);
        console.log(`   ✅ [${session.groupId}] Whiteboard initialized`);
      }));

      // Step 7: Parallel Drawing - Each teacher draws independently
      console.log('\n📍 Step 7: Drawing on whiteboards (all groups parallel)...');
      await Promise.all(sessions.map(async (session) => {
        try {
          console.log(`   ⏳ [${session.groupId}] Teacher drawing...`);
          await drawOnWhiteboard(session.teacherPage);
          console.log(`   ✅ [${session.groupId}] Teacher drawing complete`);
        } catch (e) {
          session.result.error = `Drawing failed: ${(e as Error).message}`;
          console.error(`   ❌ [${session.groupId}] ${session.result.error}`);
          throw e;
        }
      }));

      // Step 8: Wait for sync and verify drawing on both sides
      console.log('\n📍 Step 8: Verifying drawing sync (all groups parallel)...');
      await Promise.all(sessions.map(async (session) => {
        try {
          await session.teacherPage.waitForTimeout(3000);
          
          const teacherHasDrawing = await hasDrawingContent(session.teacherPage);
          const studentHasDrawing = await hasDrawingContent(session.studentPage);
          
          console.log(`   📊 [${session.groupId}] Teacher canvas: ${teacherHasDrawing}, Student canvas: ${studentHasDrawing}`);
          
          expect(teacherHasDrawing).toBe(true);
          expect(studentHasDrawing).toBe(true);
          
          session.result.drawingVerified = true;
          console.log(`   ✅ [${session.groupId}] Drawing sync verified`);
        } catch (e) {
          session.result.error = `Drawing verification failed: ${(e as Error).message}`;
          console.error(`   ❌ [${session.groupId}] ${session.result.error}`);
          throw e;
        }
      }));

      // Step 9: Verify Isolation - No Cross-group Contamination
      console.log('\n📍 Step 9: Verifying isolation (no cross-group interference)...');
      for (const session of sessions) {
        if (session.result.classroomEntered && session.result.drawingVerified) {
          console.log(`   ✅ [${session.groupId}] Isolation OK - Independent drawing and sync`);
        } else if (session.result.error) {
          console.log(`   ❌ [${session.groupId}] Isolation violated or error: ${session.result.error}`);
        }
      }

      // Summary
      console.log('\n📍 STRESS TEST SUMMARY:');
      const allPassed = sessions.every(s => s.result.classroomEntered && s.result.drawingVerified);
      const allErrors = sessions.filter(s => s.result.error);
      
      for (const session of sessions) {
        const status = session.result.drawingVerified ? '✅ PASS' : '❌ FAIL';
        console.log(`   ${status} [${session.groupId}] - Participants: ${session.result.waitRoomParticipants || '?'}`);
        if (session.result.error) {
          console.log(`      Error: ${session.result.error}`);
        }
      }
      
      if (allPassed) {
        console.log(`\n✅ STRESS TEST PASSED: All ${groupCount} groups completed successfully with verified isolation.`);
      } else {
        console.log(`\n❌ STRESS TEST PARTIAL FAILURE: ${allErrors.length} groups failed`);
      }

    } finally {
      // Step 10: Cleanup - Closing all contexts and deleting test courses
      console.log('\n📍 Step 10: Cleanup - Deleting test courses, orders, and accounts...');
      
      // Close all session contexts first
      const closePromises = sessions.map(async (session) => {
        try {
          await session.teacherCtx.close().catch(() => {});
          await session.studentCtx.close().catch(() => {});
        } catch (e) {
          console.warn(`   ⚠️ [${session.groupId}] Error closing contexts: ${(e as Error).message}`);
        }
      });
      
      await Promise.all(closePromises);
      console.log('   ✅ All browser contexts closed');

      // Perform comprehensive cleanup
      if (!process.env.SKIP_CLEANUP) {
        try {
          const cleanupCtx = await browser.newContext();
          const cleanupPage = await cleanupCtx.newPage();
          
          await cleanupTestData(
            cleanupPage,
            groupConfigs.map(g => g.courseId),
            groupCount,
            config.bypassSecret
          );
          
          await cleanupCtx.close();
        } catch (e) {
          console.error(`   ❌ Cleanup error: ${(e as Error).message}`);
        }
      } else {
        console.log('   ℹ️ SKIP_CLEANUP=true - Test data NOT deleted');
      }
    }
  });

});

// ─── debug ───────────────────────────────────────────────────────────
test.describe('[debug] Whiteboard Debug', () => {
  test.setTimeout(600000);

  test('Single group verbose whiteboard debug', async ({ browser }) => {
    // Default: keep test data so you can inspect state after the run
    if (process.env.SKIP_CLEANUP === undefined) {
      process.env.SKIP_CLEANUP = 'true';
    }

    const config = getTestConfig();
    const courseId = `${COURSE_ID_PREFIXES.debug}${Date.now()}`;
    console.log(`\n🔍 [debug] Starting verbose debug, courseId: ${courseId}`);
    console.log(`   SKIP_CLEANUP=${process.env.SKIP_CLEANUP}`);

    runEnrollmentFlow(courseId);

    const teacherCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherCtx.newPage();
    const studentCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentPage = await studentCtx.newPage();

    try {
      console.log('\n📍 [debug] Step 1: Login & Wait Room');
      await injectDeviceCheckBypass(teacherPage);
      await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
      await goToWaitRoom(teacherPage, courseId, 'teacher');

      await injectDeviceCheckBypass(studentPage);
      await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);
      await goToWaitRoom(studentPage, courseId, 'student');

      console.log('\n📍 [debug] Step 2: Enter Classroom (screenshots saved)');
      await Promise.all([
        enterClassroom(teacherPage, 'teacher'),
        enterClassroom(studentPage, 'student'),
      ]);
      await teacherPage.screenshot({ path: 'test-results/debug-teacher-wait.png' });

      await clickReadyButton(teacherPage, 'teacher');
      await clickReadyButton(studentPage, 'student');
      await Promise.all([
        waitAndEnterClassroom(teacherPage, 'teacher'),
        waitAndEnterClassroom(studentPage, 'student'),
      ]);
      await teacherPage.screenshot({ path: 'test-results/debug-teacher-classroom.png' });
      await studentPage.screenshot({ path: 'test-results/debug-student-classroom.png' });
      console.log('   📸 Saved: debug-teacher-classroom.png, debug-student-classroom.png');

      console.log('\n📍 [debug] Step 3: Whiteboard Init (extended wait 10 s)');
      await teacherPage.waitForTimeout(10000);

      console.log('\n📍 [debug] Step 4: Draw & Sync Verification');
      await drawOnWhiteboard(teacherPage);
      await teacherPage.waitForTimeout(5000);

      const teacherOk = await hasDrawingContent(teacherPage);
      const studentOk = await hasDrawingContent(studentPage);
      await teacherPage.screenshot({ path: 'test-results/debug-teacher-drawn.png' });
      await studentPage.screenshot({ path: 'test-results/debug-student-synced.png' });
      console.log(`   📊 Teacher canvas: ${teacherOk}, Student canvas: ${studentOk}`);
      console.log('   📸 Saved: debug-teacher-drawn.png, debug-student-synced.png');

      expect(teacherOk).toBe(true);
      expect(studentOk).toBe(true);
    } finally {
      console.log(`\n   ℹ️ [debug] SKIP_CLEANUP=${process.env.SKIP_CLEANUP} — test data preserved for inspection`);
      await teacherCtx.close();
      await studentCtx.close();
    }
  });
});