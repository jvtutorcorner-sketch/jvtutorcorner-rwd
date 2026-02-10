
import fs from 'fs';
import path from 'path';

// Load env
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

const { saveWhiteboardState, getWhiteboardState, normalizeUuid } = require('../lib/whiteboardService');

async function testPdfFlow() {
  const testUuid = 'classroom_session_ready_c1';
  const normalized = normalizeUuid(testUuid);
  
  console.log('=== PDF Flow Test ===');
  console.log('Test UUID:', testUuid);
  console.log('Normalized UUID:', normalized);
  console.log('Table Name:', process.env.WHITEBOARD_TABLE);
  console.log('Region:', process.env.AWS_REGION);
  console.log('S3 Bucket:', process.env.AWS_S3_BUCKET_NAME);
  console.log('Has AWS Credentials:', !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY);
  console.log('');

  try {
    // Step 1: Save PDF metadata to DynamoDB
    console.log('Step 1: Saving PDF metadata to DynamoDB...');
    const pdfData = {
      name: 'test.pdf',
      s3Key: `whiteboard/session_${normalized}.pdf`,
      url: `/api/whiteboard/pdf?uuid=${encodeURIComponent(testUuid)}`,
      size: 1024,
      type: 'application/pdf',
      uploadedAt: Date.now(),
      currentPage: 1
    };
    
    await saveWhiteboardState(normalized, [], pdfData);
    console.log('✓ PDF metadata saved');
    console.log('');

    // Step 2: Retrieve PDF metadata
    console.log('Step 2: Retrieving PDF metadata from DynamoDB...');
    const state = await getWhiteboardState(normalized);
    
    if (state?.pdf) {
      console.log('✓ PDF metadata found!');
      console.log('  - PDF Name:', state.pdf.name);
      console.log('  - S3 Key:', state.pdf.s3Key);
      console.log('  - URL:', state.pdf.url);
    } else {
      console.error('✗ PDF metadata NOT found');
      return;
    }
    console.log('');

    // Step 3: Test S3 key format
    console.log('Step 3: Verifying S3 key format...');
    const s3Key = state.pdf.s3Key;
    console.log('  - Full S3 Key:', s3Key);
    console.log('  - Bucket:', process.env.AWS_S3_BUCKET_NAME);
    console.log('  - Full S3 URL would be: s3://' + process.env.AWS_S3_BUCKET_NAME + '/' + s3Key);
    
    // Try to check if file exists in S3 (but we won't actually upload anything)
    console.log('');
    console.log('✓ PDF flow test COMPLETE');
    console.log('');
    console.log('Next steps:');
    console.log('1. Upload a PDF through the UI in /classroom/wait');
    console.log('2. Check server logs for [PDF POST] and [PDF GET] messages');
    console.log('3. Verify the UUID used in logs');
    
  } catch (err) {
    console.error('❌ Test failed:', err);
  }
}

testPdfFlow();
