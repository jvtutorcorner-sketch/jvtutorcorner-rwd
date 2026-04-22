import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-northeast-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  }
});

const ddb = DynamoDBDocumentClient.from(client);

async function checkGmailApps() {
  const table = "jvtutorcorner-app-integrations";
  try {
    const { Items } = await ddb.send(new ScanCommand({
        TableName: table,
        FilterExpression: "#tp = :tp",
        ExpressionAttributeNames: { "#tp": "type" },
        ExpressionAttributeValues: { ":tp": "GMAIL" },
    }));

    if (!Items || Items.length === 0) {
      console.log("No GMAIL apps found.");
    } else {
      Items.forEach(item => {
        console.log("FULL ITEM:", JSON.stringify(item, null, 2));
      });
    }
  } catch (err: any) {
    console.error("Error scanning:", err.message);
  }
}

checkGmailApps();
