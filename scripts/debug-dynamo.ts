
import fs from 'fs';
import path from 'path';

// Force load env BEFORE importing service
const envLocal = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envLocal)) {
    const envConfig = fs.readFileSync(envLocal, 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

// Now import service
const { saveWhiteboardState, getWhiteboardState } = require('../lib/whiteboardService');

async function testDynamo() {
  const testId = 'debug-test-' + Date.now();
  console.log('Testing DynamoDB connection...');
  console.log('Test Key:', testId);
  console.log('Table Name:', process.env.WHITEBOARD_TABLE || 'jvtutorcorner-whiteboard');
  console.log('Region:', process.env.AWS_REGION || process.env.CI_AWS_REGION);

  try {
    console.log('Attempting write...');
    await saveWhiteboardState(testId, [], { name: 'debug.pdf', s3Key: 'debug-key', url: 'debug-url' });
    console.log('Write function returned. Now verifying read...');
    
    // Immediate read
    let state = await getWhiteboardState(testId);
    if (state) {
      console.log('✅ Read SUCCESS! State:', state);
    } else {
      console.log('⚠️ Read returned null immediately. Waiting 2s...');
      await new Promise(r => setTimeout(r, 2000));
      state = await getWhiteboardState(testId);
      if (state) {
         console.log('✅ Read SUCCESS after delay!');
      } else {
         console.error('❌ Read FAILED. Item not found.');
      }
    }
  } catch (err) {
    console.error('❌ CRITICAL ERROR:', err);
  }
}

testDynamo();
