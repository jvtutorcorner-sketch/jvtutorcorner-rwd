import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
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

async function fixGmailIntegrations() {
  const table = "jvtutorcorner-app-integrations";
  const newUser = "jvtutorcorner@gmail.com";
  const newPass = "vitu otqp cmdu wxwd";
  
  console.log(`Fixing GMAIL integrations in table: ${table}`);

  try {
    const { Items } = await ddb.send(new ScanCommand({
        TableName: table,
        FilterExpression: "#tp = :tp",
        ExpressionAttributeNames: { "#tp": "type" },
        ExpressionAttributeValues: { ":tp": "GMAIL" },
    }));

    if (!Items || Items.length === 0) {
      console.log("No GMAIL apps found to fix.");
      return;
    }

    for (const item of Items) {
        console.log(`Updating app for user ${item.userId}...`);
        await ddb.send(new UpdateCommand({
            TableName: table,
            Key: { userId: item.userId, type: item.type },
            UpdateExpression: "SET #cfg.smtpUser = :u, #cfg.smtpPass = :pw, #cfg.fromAddress = :f",
            ExpressionAttributeNames: { "#cfg": "config" },
            ExpressionAttributeValues: { ":u": newUser, ":pw": newPass, ":f": newUser }
        }));
        console.log(`✅ Updated User and Pass for ${item.userId}.`);
    }
  } catch (err: any) {
    console.error("Error fixing:", err.message);
  }
}

fixGmailIntegrations();
