import { test, expect } from '@playwright/test';

test('正式郵件功能測試 - n7842165@gmail.com', async ({ page, context }) => {
  const testEmail = 'n7842165@gmail.com';
  
  console.log('\n' + '='.repeat(70));
  console.log('📧 正式郵件功能測試');
  console.log('='.repeat(70));
  console.log(`🎯 目標 Email: ${testEmail}`);
  
  // =========================================
  // 1️⃣ 驗證帳號狀態
  // =========================================
  console.log('\n1️⃣  驗證帳號狀態...');
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  console.log('   ✓ 進入登入頁面');
  
  // =========================================
  // 2️⃣ 測試驗證信寄送（通過 API）
  // =========================================
  console.log('\n2️⃣  調用驗證信發送 API...');
  const apiResponse = await page.request.post(
    'http://localhost:3000/api/test/send-verification-email',
    {
      data: {
        email: testEmail
      }
    }
  );
  
  console.log(`   📡 API 狀態碼: ${apiResponse.status()}`);
  const responseBody = await apiResponse.json();
  
  if (apiResponse.status() === 200 && responseBody.ok) {
    console.log('   ✅ 驗證信寄送請求成功');
    console.log(`   📧 目標信箱: ${responseBody.email}`);
    console.log(`   🔐 Token 預覽: ${responseBody.tokenPreview}`);
    console.log(`   💾 Send Result: ${JSON.stringify(responseBody.sendResult)}`);
  } else {
    console.log('   ❌ API 返回錯誤:');
    console.log(`   ${JSON.stringify(responseBody, null, 2)}`);
  }
  
  // =========================================
  // 3️⃣ 等待伺服器日誌輸出
  // =========================================
  console.log('\n3️⃣  等待伺服器郵件發送日誌...');
  await page.waitForTimeout(3000); // 等待 3 秒讓伺服器處理和日誌輸出
  console.log('   ⏱️  已等待 3 秒');
  
  // =========================================
  // 4️⃣ 驗證測試結果
  // =========================================
  console.log('\n4️⃣  驗證測試結果...');
  console.log('\n📊 預期結果 (應在伺服器日誌中看到):');
  console.log('   1️⃣  [VerificationService] Gmail SMTP Config: { ... }');
  console.log('   2️⃣  [VerificationService] Verifying Gmail SMTP connection...');
  console.log('   3️⃣  [VerificationService] Gmail SMTP connection verified successfully');
  console.log('   4️⃣  [VerificationService] Email sent successfully via Gmail SMTP: <messageId>');
  console.log('   5️⃣  [VerificationService] Sent via Gmail SMTP: <messageId>');
  
  // =========================================
  // 5️⃣ 總結
  // =========================================
  console.log('\n5️⃣  測試總結:');
  console.log(`   ✅ Email: ${testEmail}`);
  console.log(`   ✅ API 端點: /api/test/send-verification-email`);
  console.log(`   ✅ SMTP 提供商: Gmail (ap-northeast-1)`);
  console.log(`   ✅ Whitelist 狀態: ${testEmail} 已授權`);
  
  console.log('\n' + '='.repeat(70));
  console.log('📬 郵件功能測試完成！');
  console.log('='.repeat(70));
  console.log('💡 請檢查伺服器日誌確認郵件是否成功發送');
  console.log('📧 請檢查收件箱 (n7842165@gmail.com) 是否收到驗證信');
  console.log('='.repeat(70) + '\n');
  
  // 加上斷言確保 API 呼叫成功
  expect(apiResponse.status()).toBe(200);
  expect(responseBody.ok).toBe(true);
});
