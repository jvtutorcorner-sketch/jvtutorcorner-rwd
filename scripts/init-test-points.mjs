#!/usr/bin/env node
/**
 * Quick test points initialization
 * Grants 1000 points to all test accounts for QA automation
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function grantPoints() {
  console.log(`🎯 Initializing test points at: ${BASE_URL}\n`);

  try {
    // Step 1: Call the admin grant-points endpoint
    console.log('📍 Calling /api/admin/grant-points...');
    const res = await fetch(`${BASE_URL}/api/admin/grant-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      console.error(`❌ Failed with status ${res.status}`);
      console.error(await res.text());
      process.exit(1);
    }

    const data = await res.json();
    console.log('✅ Grant points success!\n');
    console.log('📊 Result:');
    console.log(JSON.stringify(data, null, 2));

    // Step 2: Verify the student points
    console.log('\n✓ Verifying student points...');
    const studentEmail = process.env.QA_STUDENT_EMAIL || process.env.TEST_STUDENT_EMAIL || 'student@example.com';
    const checkRes = await fetch(`${BASE_URL}/api/points?userId=${encodeURIComponent(studentEmail)}`);
    const checkData = await checkRes.json();
    console.log(`✅ ${studentEmail} points: ${checkData.balance}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

grantPoints();
