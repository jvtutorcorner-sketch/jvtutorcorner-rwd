import dotenv from 'dotenv';
// Using native fetch (Node.js 18+)

dotenv.config({ path: '.env.local' });

const APP_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const TEST_RECIPIENT = process.env.NEXT_PUBLIC_TEST_EMAIL || 'admin@jvtutorcorner.com';

async function testGmailSend() {
  console.log('🚀 Starting Gmail Workflow Send Test...');
  console.log(`Target Recipient: ${TEST_RECIPIENT}`);

  try {
    const res = await fetch(`${APP_URL}/api/workflows/gmail-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: TEST_RECIPIENT,
        subject: '🚀 JV Tutor Corner - Gmail Workflow 測試',
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #ea4335;">Gmail 寄送功能測試成功！</h2>
            <p>這是一封透過 <strong>Gmail SMTP Workflow</strong> 發出的測試郵件。</p>
            <p><strong>發送時間：</strong> ${new Date().toLocaleString()}</p>
            <hr />
            <p style="font-size: 12px; color: #666;">如果您收到這封郵件，代表系統已成功整合 Gmail 動態配置並通過白名單檢查。</p>
          </div>
        `,
        purpose: 'test' 
      }),
    });

    const data = await res.json();
    console.log('Response status:', res.status);
    console.log('Response body:', JSON.stringify(data, null, 2));

    if (data.ok) {
        console.log('✅ Gmail Send Test PASSED!');
    } else {
        console.log('❌ Gmail Send Test FAILED.');
        if (data.code === 'WHITELIST_BLOCKED') {
            console.log('💡 Note: The recipient email must be a registered user in DynamoDB profiles table.');
        }
    }
  } catch (error: any) {
    console.error('❌ Network error:', error.message);
  }
}

testGmailSend();
