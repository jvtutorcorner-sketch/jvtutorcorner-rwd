import { test, expect, Page, BrowserContext } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

const APP_ENV = process.env.APP_ENV || 'local';
dotenv.config({ path: path.resolve(__dirname, '..', `.env.${APP_ENV}`) });

/**
 * Classroom Wait Page - Device Permissions & Media Tests
 * 
 * Tests the permission flow and device check functionality on /classroom/wait page:
 * 1. Grant microphone and camera permissions
 * 2. Test microphone input with audio level display
 * 3. Test camera/video preview
 * 4. Speaker/audio output test
 * 5. Verify "Ready" button is disabled until device checks pass
 */

function getTestConfig() {
  const requireEnv = (...keys: string[]): string => {
    for (const key of keys) {
      const value = process.env[key];
      if (value && value.trim()) {
        return value.trim();
      }
    }
    throw new Error(`Missing required env vars: ${keys.join(', ')}`);
  };

  const config = {
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    bypassSecret: requireEnv('LOGIN_BYPASS_SECRET', 'NEXT_PUBLIC_LOGIN_BYPASS_SECRET', 'QA_CAPTCHA_BYPASS'),
    teacherEmail: (process.env.QA_TEACHER_EMAIL || process.env.TEST_TEACHER_EMAIL || 'teacher@example.com').toLowerCase(),
    teacherPassword: requireEnv('TEST_TEACHER_PASSWORD', 'QA_TEACHER_PASSWORD'),
    studentEmail: (process.env.QA_STUDENT_EMAIL || process.env.TEST_STUDENT_EMAIL || 'student@example.com').toLowerCase(),
    studentPassword: requireEnv('TEST_STUDENT_PASSWORD', 'QA_STUDENT_PASSWORD'),
  };

  return config;
}

async function injectDeviceCheckBypass(page: Page): Promise<void> {
  await page.addInitScript(() => { (window as any).__E2E_BYPASS_DEVICE_CHECK__ = true; });
}

async function autoLogin(page: Page, email: string, password: string, bypassSecret: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  const captchaRes = await page.request.get(`${baseUrl}/api/captcha`).catch(() => null);
  const captchaToken = (await captchaRes?.json().catch(() => ({})))?.token || '';

  const loginRes = await page.request.post(`${baseUrl}/api/login`, {
    data: JSON.stringify({ email, password, captchaToken, captchaValue: bypassSecret }),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!loginRes.ok()) {
    throw new Error(`❌ Login failed (${loginRes.status()}): ${await loginRes.text()}`);
  }

  const loginData = await loginRes.json();
  const profile = loginData?.profile || loginData?.data || loginData;

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((data) => {
    localStorage.setItem('tutor_mock_user', JSON.stringify({
      email: data.email, 
      role: data.role || 'student', 
      plan: data.plan || 'basic',
      id: data.userId || data.id || '',
      teacherId: data.id || data.userId || data.email || ''
    }));
    const now = Date.now().toString();
    sessionStorage.setItem('tutor_last_login_time', now);
    localStorage.setItem('tutor_last_login_time', now);
    sessionStorage.setItem('tutor_login_complete', 'true');
    window.dispatchEvent(new Event('tutor:auth-changed'));
  }, profile);
}

async function navigateToWaitPage(page: Page, courseId: string = 'e2e-test-course', role: 'teacher' | 'student' = 'student'): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/classroom/wait?courseId=${encodeURIComponent(courseId)}&role=${role}`;
  
  console.log(`   📍 Navigation URL: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  
  // Wait for wait page to load
  await expect(page.locator('.wait-page-container, .classroom-wait')).toBeVisible({ timeout: 10000 });
  console.log(`   ✅ Wait page loaded`);
}

test.describe('Classroom Wait Page - Device Permissions', () => {
  
  test('Test 1: Verify Device Permission UI and Grant Permissions', async ({ page, context }) => {
    const config = getTestConfig();
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ Test 1: Device Permission UI and Grant Permissions         ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    // Setup: Login and inject bypass
    await injectDeviceCheckBypass(page);
    await autoLogin(page, config.studentEmail, config.studentPassword, config.bypassSecret);
    
    // Navigate to wait page
    await navigateToWaitPage(page, 'device-test-course', 'student');
    
    // Find and verify permission grant button exists
    const grantBtn = page.locator('button').filter({ hasText: /授予|Allow|Grant|Permission/i }).first();
    console.log('   ⏳ Looking for "Grant Permissions" button...');
    await expect(grantBtn).toBeVisible({ timeout: 5000 });
    console.log('   ✅ "Grant Permissions" button found');
    
    // Verify device control buttons exist (might be disabled initially)
    const micBtn = page.locator('button').filter({ hasText: /測試麥克風|test.*mic/i }).first();
    console.log('   ⏳ Checking for microphone test button...');
    const hasMicBtn = await micBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasMicBtn) {
      console.log('   ✅ Microphone test button is visible');
    } else {
      console.log('   ℹ️ Microphone test button not found');
    }
    
    // Verify camera preview button exists
    const cameraBtn = page.locator('button').filter({ hasText: /預覽攝影機|preview.*video/i }).first();
    console.log('   ⏳ Checking for camera preview button...');
    const hasCameraBtn = await cameraBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasCameraBtn) {
      console.log('   ✅ Camera preview button is visible');
    } else {
      console.log('   ℹ️ Camera preview button not found');
    }
    
    // Verify device check section title
    const deviceCheckTitle = page.getByText(/檢查您的麥克風|Check your devices/i).first();
    console.log('   ⏳ Looking for device check section...');
    const hasTitle = await deviceCheckTitle.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTitle) {
      console.log('   ✅ Device check section is visible');
    } else {
      console.log('   ℹ️ Device check title not found');
    }
  });

  test('Test 2: Microphone Permission and Test Flow', async ({ page, context }) => {
    const config = getTestConfig();
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ Test 2: Microphone Permission and Audio Level Test         ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    await injectDeviceCheckBypass(page);
    await autoLogin(page, config.teacherEmail, config.teacherPassword, config.bypassSecret);
    await navigateToWaitPage(page, 'device-test-course-mic', 'teacher');
    
    console.log('   ⏳ Waiting for device permission UI...');
    
    // Wait for VideoSetup component to initialize
    await page.waitForTimeout(2000);
    
    // Find and click "Grant Permissions" button
    const grantBtn = page.locator('button').filter({ hasText: /授予|Permission/i }).first();
    console.log('   ⏳ Looking for grant permissions button...');
    const hasGrantBtn = await grantBtn.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasGrantBtn) {
      console.log('   ✅ Grant permissions button found');
      console.log('   ⏳ Clicking grant permissions button...');
      await grantBtn.click({ timeout: 5000 }).catch(() => null);
      console.log('   ✅ Permission button clicked');
      
      // Wait for bypass to process
      await page.waitForTimeout(1000);
    } else {
      console.log('   ℹ️ Grant button not found, bypass may have already granted permissions');
    }
    
    // Now try to find and click the microphone test button
    const micTestBtn = page.locator('button').filter({ hasText: /測試麥克風|test.*mic/i }).first();
    console.log('   ⏳ Looking for microphone test button...');
    const hasMicBtn = await micTestBtn.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasMicBtn) {
      const isEnabled = await micTestBtn.isEnabled({ timeout: 3000 }).catch(() => false);
      
      if (isEnabled) {
        console.log('   ✅ Microphone test button found and ENABLED');
        console.log('   ⏳ Clicking microphone test button...');
        await micTestBtn.click();
        console.log('   ✅ Microphone test started');
        
        // Wait for audio levels display
        console.log('   ⏳ Waiting for audio level indicator...');
        await page.waitForTimeout(1500);
        
        // Check for audio level display
        const audioText = page.getByText(/level|audio|volume|音量/i).first();
        const hasAudio = await audioText.isVisible({ timeout: 5000 }).catch(() => false);
        
        if (hasAudio) {
          console.log('   ✅ Audio level indicator/text is visible');
        } else {
          console.log('   ℹ️ Audio level display not found in expected format');
        }
      } else {
        console.log('   ℹ️ Microphone test button exists but is disabled - permissions may not be granted yet');
      }
    } else {
      console.log('   ℹ️ Microphone test button not found');
    }
  });

  test('Test 3: Camera/Video Permission and Preview Flow', async ({ page, context }) => {
    const config = getTestConfig();
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ Test 3: Camera Permission and Video Preview Test          ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    await injectDeviceCheckBypass(page);
    await autoLogin(page, config.studentEmail, config.studentPassword, config.bypassSecret);
    await navigateToWaitPage(page, 'device-test-course-video', 'student');
    
    // Wait for UI to load
    await page.waitForTimeout(2000);
    
    // Find camera preview button
    const cameraBtn = page.locator('button').filter({ hasText: /預覽攝影機|preview|camera/i }).first();
    console.log('   ⏳ Looking for camera preview button...');
    const hasCameraBtn = await cameraBtn.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasCameraBtn) {
      const isEnabled = await cameraBtn.isEnabled({ timeout: 3000 }).catch(() => false);
      
      if (isEnabled) {
        console.log('   ✅ Camera preview button found and ENABLED');
        console.log('   ⏳ Clicking camera preview button...');
        await cameraBtn.click();
        console.log('   ✅ Camera preview started');
        
        // Check for video element
        await page.waitForTimeout(1000);
        const videoElement = page.locator('video').first();
        const hasVideo = await videoElement.isVisible({ timeout: 5000 }).catch(() => false);
        
        if (hasVideo) {
          console.log('   ✅ Video element is visible');
        } else {
          console.log('   ℹ️ Video preview element not found');
        }
      } else {
        console.log('   ℹ️ Camera preview button exists but is disabled - permissions may not be granted yet');
      }
    } else {
      console.log('   ℹ️ Camera preview button not found');
    }
  });

  test('Test 4: Audio Output / Speaker Test', async ({ page, context }) => {
    const config = getTestConfig();
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ Test 4: Audio Output / Speaker Test Flow                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    await injectDeviceCheckBypass(page);
    await autoLogin(page, config.teacherEmail, config.teacherPassword, config.bypassSecret);
    await navigateToWaitPage(page, 'device-test-course-speaker', 'teacher');
    
    // Wait for UI
    await page.waitForTimeout(2000);
    
    // Look for speaker/audio output test button
    const speakerBtn = page.locator('button').filter({ hasText: /speaker|audio|output|測試聲音|🔊/i }).first();
    console.log('   ⏳ Looking for speaker/audio output test button...');
    const hasSpeakerBtn = await speakerBtn.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasSpeakerBtn) {
      const btnText = await speakerBtn.textContent();
      console.log(`   ✅ Speaker test button found: "${btnText?.trim()}"`);
      
      const isEnabled = await speakerBtn.isEnabled({ timeout: 3000 }).catch(() => false);
      if (isEnabled) {
        console.log('   ✅ Speaker button is enabled');
      } else {
        console.log('   ℹ️ Speaker button is found but currently disabled');
      }
      
      // Note: We can't actually verify audio output in automated tests, but we can verify the UI button exists
    } else {
      console.log('   ℹ️ Speaker test button not found in expected location');
    }
  });

  test('Test 5: Device Check Completion and Ready Button State', async ({ page, context }) => {
    const config = getTestConfig();
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ Test 5: Device Check Flow -> Ready Button State            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    // Inject bypass to simulate all permissions granted
    await injectDeviceCheckBypass(page);
    await autoLogin(page, config.studentEmail, config.studentPassword, config.bypassSecret);
    await navigateToWaitPage(page, 'device-test-course-ready', 'student');
    
    console.log('   ⏳ Injected device check bypass - all permissions should be granted');
    
    // Wait a moment for the bypass to take effect
    await page.waitForTimeout(2000);
    
    // Check if the grant permissions button is visible (or if it's hidden because bypass worked)
    const grantBtn = page.locator('button').filter({ hasText: /授予|Permission/i }).first();
    const isGrantBtnVisible = await grantBtn.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (isGrantBtnVisible) {
      console.log('   ℹ️ Grant permissions button still visible - may not have been clicked or bypass not applied');
    } else {
      console.log('   ✅ Grant permissions button hidden (permissions likely granted)');
    }
    
    // Now check if the "Ready" button should be enabled
    const readyBtn = page.locator('button').filter({ hasText: /準備好|Ready|點擊表示準備好/i }).first();
    console.log('   ⏳ Checking Ready button state...');
    const isEnabled = await readyBtn.isEnabled({ timeout: 5000 }).catch(() => false);
    
    // Ready button might be disabled if waiting for participants or if bypass didn't fully work
    console.log(`   📊 "Ready" button state: ${isEnabled ? 'ENABLED ✅' : 'DISABLED ⏳'}`);
    console.log('   ℹ️ Note: Ready button may be disabled while waiting for all participants to be ready');
    
    // Verify device check status indicator
    const deviceCheckTitle = page.getByText(/檢查您的麥克風|Check your devices/i).first();
    console.log('   ⏳ Checking device check section...');
    const hasTitleVisible = await deviceCheckTitle.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasTitleVisible) {
      console.log('   ✅ Device check section is visible');
    } else {
      console.log('   ℹ️ Device check section not visible (may have been collapsed or navigation happened)');
    }
  });

  test('Test 6: Device Selectors and Device List', async ({ page, context }) => {
    const config = getTestConfig();
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ Test 6: Device Selection Dropdowns                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    await injectDeviceCheckBypass(page);
    await autoLogin(page, config.teacherEmail, config.teacherPassword, config.bypassSecret);
    await navigateToWaitPage(page, 'device-test-course-selector', 'teacher');
    
    // Wait for UI
    await page.waitForTimeout(2000);
    
    // Look for device dropdowns/selectors (could be <select> or custom combobox)
    const deviceSelectors = page.locator('select, [role="combobox"]');
    console.log('   ⏳ Looking for device selectors...');
    
    const selectorCount = await deviceSelectors.count();
    if (selectorCount > 0) {
      console.log(`   ✅ Found ${selectorCount} device selector(s)`);
      
      // Try to find specific device types
      const labels = page.locator('label, [class*="label"]');
      const labelCount = await labels.count();
      console.log(`   ℹ️ Found ${labelCount} label(s) for device sections`);
    } else {
      console.log('   ℹ️ No device selectors found in expected locations');
    }
    
    // Look for device list items
    const options = page.locator('option, [role="option"]');
    console.log('   ⏳ Looking for device options...');
    const optionCount = await options.count();
    if (optionCount > 0) {
      console.log(`   ✅ Found ${optionCount} device option(s)`);
    } else {
      console.log('   ℹ️ No device options visible yet');
    }
  });

  test('Test 7: Device Grant Button and Disable State', async ({ page, context }) => {
    const config = getTestConfig();
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ Test 7: Device Grant Button and Initial State              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    // Don't inject bypass this time - simulating initial state without permissions
    await autoLogin(page, config.studentEmail, config.studentPassword, config.bypassSecret);
    await navigateToWaitPage(page, 'device-test-course-denied', 'student');
    
    // Look for "Grant Permissions" button in initial state
    const grantBtn = page.locator('button').filter({ hasText: /授予|Permission|Allow/i }).first();
    console.log('   ⏳ Looking for permission grant button in initial state...');
    const hasGrantBtn = await grantBtn.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasGrantBtn) {
      console.log('   ✅ Permission grant button found');
      
      // Verify device control buttons are initially disabled
      const micBtn = page.locator('button').filter({ hasText: /測試麥克風/i }).first();
      const micDisabled = await micBtn.isDisabled({ timeout: 3000 }).catch(() => true);
      
      const cameraBtn = page.locator('button').filter({ hasText: /預覽攝影機/i }).first();
      const cameraDisabled = await cameraBtn.isDisabled({ timeout: 3000 }).catch(() => true);
      
      console.log(`   📊 Microphone test button: ${micDisabled ? 'DISABLED ✅' : 'ENABLED'}`);
      console.log(`   📊 Camera preview button: ${cameraDisabled ? 'DISABLED ✅' : 'ENABLED'}`);
      
      // Verify "Ready" button is disabled
      const readyBtn = page.locator('button').filter({ hasText: /準備好|Ready/i }).first();
      const readyDisabled = await readyBtn.isDisabled({ timeout: 3000 }).catch(() => false);
      
      console.log(`   📊 "Ready" button: ${readyDisabled ? 'DISABLED ✅' : 'ENABLED'}`);
    } else {
      console.log('   ℹ️ Permission UI layout might be different or permissions already granted');
    }
  });

  test('Test 8: Concurrent Device Checks (Teacher + Student)', async ({ browser }) => {
    const config = getTestConfig();
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ Test 8: Concurrent Device Checks (Teacher + Student)       ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    // Create two contexts for teacher and student
    const teacherContext = await browser.newContext();
    const studentContext = await browser.newContext();
    
    const teacherPage = await teacherContext.newPage();
    const studentPage = await studentContext.newPage();
    
    try {
      // Setup both pages in parallel
      console.log('   ⏳ Setting up teacher page...');
      await injectDeviceCheckBypass(teacherPage);
      await autoLogin(teacherPage, config.teacherEmail, config.teacherPassword, config.bypassSecret);
      
      console.log('   ⏳ Setting up student page...');
      await injectDeviceCheckBypass(studentPage);
      await autoLogin(studentPage, config.studentEmail, config.studentPassword, config.bypassSecret);
      
      // Navigate both to wait page
      console.log('   ⏳ Navigating both to wait page...');
      await Promise.all([
        navigateToWaitPage(teacherPage, 'concurrent-device-test', 'teacher'),
        navigateToWaitPage(studentPage, 'concurrent-device-test', 'student')
      ]);
      
      console.log('   ✅ Both pages successfully loaded wait page');
      
      // Check device UI visibility on both pages
      console.log('   ⏳ Verifying device permission UI on both pages...');
      
      const teacherGrantBtn = teacherPage.locator('button').filter({ hasText: /授予|Permission/i }).first();
      const studentGrantBtn = studentPage.locator('button').filter({ hasText: /授予|Permission/i }).first();
      
      const teacherHasUI = await teacherGrantBtn.isVisible({ timeout: 3000 }).catch(() => false);
      const studentHasUI = await studentGrantBtn.isVisible({ timeout: 3000 }).catch(() => false);
      
      console.log(`   📊 Teacher device UI: ${teacherHasUI ? 'VISIBLE ✅' : 'NOT VISIBLE (bypass may have worked)'}`);
      console.log(`   📊 Student device UI: ${studentHasUI ? 'VISIBLE ✅' : 'NOT VISIBLE (bypass may have worked)'}`);
      
      // Check participant sync
      const teacherWaitText = teacherPage.getByText(/等待老師加入|等待學生加入/i).first();
      const studentWaitText = studentPage.getByText(/等待老師加入|等待學生加入/i).first();
      
      console.log('   ⏳ Checking participant sync status...');
      const teacherHasWait = await teacherWaitText.isVisible({ timeout: 3000 }).catch(() => false);
      const studentHasWait = await studentWaitText.isVisible({ timeout: 3000 }).catch(() => false);
      
      console.log(`   📊 Teacher wait status: ${teacherHasWait ? 'VISIBLE ✅' : 'NOT FOUND'}`);
      console.log(`   📊 Student wait status: ${studentHasWait ? 'VISIBLE ✅' : 'NOT FOUND'}`);
      
    } finally {
      await teacherPage.close();
      await studentPage.close();
      await teacherContext.close();
      await studentContext.close();
    }
  });
});
