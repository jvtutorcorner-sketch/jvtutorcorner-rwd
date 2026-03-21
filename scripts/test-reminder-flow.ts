import dotenv from 'dotenv';
// Using native fetch (Node.js 18+)

dotenv.config({ path: '.env.local' });

const APP_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET || 'test-secret';

async function testReminderFlow() {
  console.log('🚀 Starting Calendar Reminder Flow Test...');

  try {
    // 1. Create a mock reminder that starts in 10 minutes
    const startTime = new Date(Date.now() + 10 * 60000).toISOString();
    const reminderMinutes = 15; // Should be triggered because now > (start - 15min)
    
    console.log(`Step 1: Creating a test reminder for ${startTime} (reminder: ${reminderMinutes}min)`);

    const createRes = await fetch(`${APP_URL}/api/calendar/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'test-student@example.com',
        eventId: 'test-event-' + Date.now(),
        courseId: 'course_1', // Using an existing course from data/courses.ts
        eventStartTime: startTime,
        reminderMinutes: reminderMinutes,
      }),
    });

    const createData = await createRes.json();
    if (!createData.ok) {
      throw new Error('Failed to create reminder: ' + JSON.stringify(createData));
    }
    const reminderId = createData.data.id;
    console.log(`✅ Reminder created with ID: ${reminderId}`);

    // 2. Trigger processing
    console.log('Step 2: Triggering process-reminders...');
    const processRes = await fetch(`${APP_URL}/api/cron/process-reminders`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json' 
      },
    });

    const processData = await processRes.json();
    console.log('Processing result:', JSON.stringify(processData, null, 2));

    if (!processData.ok) {
        throw new Error('Processing failed: ' + processData.error);
    }

    // 3. Verify status
    console.log('Step 3: Verifying reminder status...');
    const verifyRes = await fetch(`${APP_URL}/api/calendar/reminders?id=${reminderId}&isAdmin=true&userId=admin@example.com`);
    const verifyData = await verifyRes.json();
    
    const reminder = verifyData.data.find((r: any) => r.id === reminderId);
    if (!reminder) {
        throw new Error('Could not find created reminder in DB');
    }

    console.log(`📊 Final Status: ${reminder.emailStatus}`);
    if (reminder.emailStatus === 'sent' || reminder.emailStatus === 'failed') {
      console.log('✅ End-to-end test completed successfully!');
    } else {
      console.log('❌ Reminder status is still:', reminder.emailStatus);
    }

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
  }
}

testReminderFlow();
