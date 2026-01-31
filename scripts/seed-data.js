// 1. 手動載入 .env.local (無需額外依賴)
const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('#') || trimmedLine === '') return; // Skip comments and empty lines
      const match = trimmedLine.match(/^([\w.-]+)=(.*)$/);
      if (match) {
        const key = match[1];
        let value = match[2].trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[key] = value;
      }
    });
    console.log('📝 Loaded configuration from .env.local');
  }
}

loadEnvLocal();

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

// 2. 除錯：檢查環境變數是否真的進來了 (只顯示前幾碼，確保安全)
const accessKey = process.env.AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

console.log("🔍 環境變數檢查:");
console.log(`- AWS_ACCESS_KEY_ID: ${accessKey ? accessKey.substring(0, 5) + "..." : "❌ 未讀取到 (undefined)"}`);
console.log(`- AWS_SECRET_ACCESS_KEY: ${secretKey ? "✅ 已讀取 (長度 " + secretKey.length + ")" : "❌ 未讀取到 (undefined)"}`);
console.log(`- AWS_REGION: ${process.env.AWS_REGION || "us-east-1"}`);

if (!accessKey || !secretKey) {
    console.error("\n🚨 錯誤：找不到 AWS 金鑰！請確認專案根目錄下的 .env.local 檔案內容正確。");
    process.exit(1);
}

// 3. 設定 DynamoDB Client (★★★ 關鍵修改：明確傳入 credentials ★★★)
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey
    }
});

const docClient = DynamoDBDocumentClient.from(client);

// 定義 Table 名稱 (請確認與 Amplify Console 顯示的一致)
const TABLES = {
    COURSES: "jvtutorcorner-courses",
    TEACHERS: "jvtutorcorner-teachers",
    ENROLLMENTS: "jvtutorcorner-enrollments",
    ORDERS: "jvtutorcorner-orders",
};

// 產生當下時間戳記
const timestamp = new Date().toISOString();

// --- 模擬資料 ---

const teachers = [
    {
        id: "t1",
        name: "林老師",
        avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
        intro: "10 年雙語教學經驗，專攻英檢、TOEIC 口說與寫作。",
        hourlyRate: 800,
        rating: 4.9,
        languages: ["中文", "English"],
        subjects: ["英文", "TOEIC"],
        location: "線上 / 台北",
        createdAt: timestamp,
        updatedAt: timestamp,
    },
];

const courses = [
    {
        id: "c1",
        teacherId: "t1",
        teacherName: "林老師",
        title: "英檢中級衝刺班 (12 週)",
        description: "針對英檢中級設計的完整衝刺課程，每週 2 堂，涵蓋聽、說、讀、寫四大範疇。",
        pricePerSession: 900,
        currency: "TWD",
        durationMinutes: 90,
        totalSessions: 24,
        seatsLeft: 5,
        level: "國高中",
        subject: "英文",
        language: "中文+英文",
        mode: "online",
        tags: ["英檢", "衝刺"],
        nextStartDate: "2025-12-10",
        status: "PUBLISHED",
        whiteboardUuid: "a1822080fdf511f0a19565e2fc917df0", // 固定 UUID
        createdAt: timestamp,
        updatedAt: timestamp,
    },
];

const orders = [
    {
        orderId: "ord_001",
        userId: "mock-user-123",
        courseId: "c1",
        amount: 1000,
        currency: "TWD",
        status: "PAID",
        paymentMethod: "CREDIT_CARD",
        createdAt: timestamp,
        updatedAt: timestamp,
    },
];

const enrollments = [
    {
        id: "enr_001",
        userId: "mock-user-123",
        courseId: "c1",
        courseTitle: "英檢中級衝刺班 (12 週)",
        email: "student@example.com",
        name: "王小明",
        status: "ACTIVE",
        paymentStatus: "PAID",
        createdAt: timestamp,
        updatedAt: timestamp,
    },
];

// --- 寫入函式 ---
async function seedData() {
    console.log(`\n🚀 開始寫入資料 (Timestamp: ${timestamp})...`);

    try {
        for (const item of teachers) {
            await docClient.send(new PutCommand({ TableName: TABLES.TEACHERS, Item: item }));
            console.log(`✅ [Teacher] 寫入: ${item.name}`);
        }
        for (const item of courses) {
            await docClient.send(new PutCommand({ TableName: TABLES.COURSES, Item: item }));
            console.log(`✅ [Course] 寫入: ${item.title}`);
        }
        for (const item of orders) {
            await docClient.send(new PutCommand({ TableName: TABLES.ORDERS, Item: item }));
            console.log(`✅ [Order] 寫入: ${item.orderId}`);
        }
        for (const item of enrollments) {
            await docClient.send(new PutCommand({ TableName: TABLES.ENROLLMENTS, Item: item }));
            console.log(`✅ [Enrollment] 寫入: User ${item.userId}`);
        }

        console.log("\n🎉 資料重建完成！DynamoDB 寫入成功。");

    } catch (error) {
        console.error("\n❌ 寫入失敗:", error.name, error.message);
        if (error.name === "ResourceNotFoundException") {
            console.error("👉 原因：找不到資料表。請檢查 TABLES 變數中的名稱是否與 Amplify Console 上的一致。");
        } else if (error.name === "UnrecognizedClientException" || error.name === "InvalidSignatureException") {
            console.error("👉 原因：金鑰無效。請重新建立一組 Access Key。");
        }
    }
}

seedData();