
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const path = require("path");
const fs = require("fs");

// Load .env.local manually
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, "utf8");
    envText.split("\n").forEach(line => {
        // Basic env parsing
        if (line.trim() && !line.startsWith("#")) {
            const idx = line.indexOf("=");
            if (idx > -1) {
                const key = line.substring(0, idx).trim();
                const val = line.substring(idx + 1).trim();
                process.env[key] = val;
            }
        }
    });
}

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "ap-northeast-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const ddbDocClient = DynamoDBDocumentClient.from(client);
const PAGE_PERMISSIONS_TABLE = process.env.DYNAMODB_TABLE_PAGE_PERMISSIONS;

async function run() {
    if (!PAGE_PERMISSIONS_TABLE) {
        throw new Error("DYNAMODB_TABLE_PAGE_PERMISSIONS not set");
    }

    console.log("Scanning table:", PAGE_PERMISSIONS_TABLE);
    const scanResult = await ddbDocClient.send(new ScanCommand({
        TableName: PAGE_PERMISSIONS_TABLE
    }));

    const items = scanResult.Items || [];
    console.log("Found items:", items.length);

    const target = items.find(item => item.path === "/courses_manage");
    if (target) {
        console.log("Current /courses_manage permissions:", JSON.stringify(target.permissions, null, 2));

        // Fix teacher permission
        let changed = false;
        const newPermissions = target.permissions.map(p => {
            if (p.roleId.toLowerCase() === "teacher") {
                if (p.pageVisible === false) {
                    console.log("Fixing teacher pageVisible from false to true");
                    changed = true;
                    return { ...p, pageVisible: true, menuVisible: true, dropdownVisible: true };
                }
            }
            return p;
        });

        if (changed) {
            target.permissions = newPermissions;
            await ddbDocClient.send(new PutCommand({
                TableName: PAGE_PERMISSIONS_TABLE,
                Item: target
            }));
            console.log("Successfully updated /courses_manage permissions in DynamoDB.");
        } else {
            console.log("Teacher permission already set to true or not found.");
        }
    } else {
        console.log("/courses_manage block not found in DynamoDB.");
    }
}

run().catch(console.error);
