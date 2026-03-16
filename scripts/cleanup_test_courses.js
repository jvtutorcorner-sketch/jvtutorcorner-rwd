const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const awsRegion = process.env.AWS_REGION || process.env.CI_AWS_REGION;
const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN || process.env.CI_AWS_SESSION_TOKEN;

console.log('--- Course Cleanup Script ---');
console.log('Table:', COURSES_TABLE);
console.log('Region:', awsRegion);

const client = new DynamoDBClient({
  region: awsRegion,
  credentials: accessKey && secretKey ? {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    ...(sessionToken ? { sessionToken } : {})
  } : undefined,
});

const ddbDocClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

async function cleanup() {
  try {
    console.log('Scanning for test courses...');
    const scanCmd = new ScanCommand({ TableName: COURSES_TABLE });
    const result = await ddbDocClient.send(scanCmd);
    const items = result.Items || [];
    
    const testCourses = items.filter(c => String(c.id || '').startsWith('test-course-'));
    console.log(`Found ${testCourses.length} test courses to delete.`);

    for (const course of testCourses) {
      console.log(`Deleting: ${course.id} (${course.title})`);
      await ddbDocClient.send(new DeleteCommand({
        TableName: COURSES_TABLE,
        Key: { id: course.id }
      }));
    }

    console.log('Cleanup completed successfully.');
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanup();
