import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const client = new DynamoDBClient({
  region: process.env.NEXT_PUBLIC_AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const ddbDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const COURSE_ID = 'eba868d3-542f-4b36-9255-202ab66b0d1a';

async function updateCourse() {
  try {
    console.log(`Checking course ${COURSE_ID} in table ${TABLE_NAME}...`);
    const getRes = await ddbDocClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: COURSE_ID }
    }));
    
    if (!getRes.Item) {
      console.log('Course not found');
      return;
    }
    
    console.log(`Current enrollmentType: ${getRes.Item.enrollmentType}, pointCost: ${getRes.Item.pointCost}`);
    
    // Update to 'both' to allow both plan and point enrollments
    console.log('Updating to points...');
    const updateRes = await ddbDocClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id: COURSE_ID },
      UpdateExpression: 'set enrollmentType = :e',
      ExpressionAttributeValues: {
        ':e': 'points'
      },
      ReturnValues: 'UPDATED_NEW'
    }));
    
    console.log('Update result:', updateRes.Attributes);
  } catch (e) {
    console.error('Error:', e);
  }
}

updateCourse();
