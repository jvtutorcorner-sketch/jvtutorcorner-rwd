import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
// 如果您有實作 S3 刪除邏輯，請保留這行；如果沒有，可以先註解掉
import { deleteFromS3, getS3KeyFromUrl } from '@/lib/s3'; 

// 強制動態執行
export const dynamic = 'force-dynamic';

// 1. 設定區域與表名 (恢復讀取環境變數)
const REGION = process.env.CI_AWS_REGION || process.env.AWS_REGION || 'ap-northeast-1';
const TABLE_NAME = process.env.DYNAMODB_TABLE_CAROUSEL || 'jvtutorcorner-carousel';

// 2. 初始化 Client
// 這裡做了一個聰明的判斷：
// - 如果有環境變數金鑰 (通常是本機開發)，就用金鑰
// - 如果沒有 (Amplify 線上環境)，就用 IAM Role (最安全)
const clientConfig: any = { region: REGION };

const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;

if (accessKeyId && secretAccessKey) {
  console.log('[Carousel API] Init: Using explicit credentials from env (AWS_* or CI_AWS_*)');
  clientConfig.credentials = {
    accessKeyId,
    secretAccessKey
  };
} else {
  console.log('[Carousel API] Init: No explicit keys found, relying on IAM Role / Default Chain');
}

const client = new DynamoDBClient(clientConfig);
const docClient = DynamoDBDocumentClient.from(client);

// ==========================================
// 🟢 GET: 讀取圖片列表
// ==========================================
export async function GET() {
  try {
    console.log(`[Carousel API] Reading from table: ${TABLE_NAME} in ${REGION}`);
    
    const command = new ScanCommand({ TableName: TABLE_NAME });
    const response = await docClient.send(command);
    
    // 依照 order 排序
    const items = (response.Items || []).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

    return NextResponse.json(items);
  } catch (error: any) {
    console.error('[Carousel API] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch images', details: error.message }, 
      { status: 500 }
    );
  }
}

// ==========================================
// 🔵 POST: 儲存圖片 (上傳後)
// ==========================================
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, alt, order } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // 建立新資料 (直接儲存 S3 完整網址)
    const newItem = {
      id: `carousel-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      url: url, // ✅ 絕對路徑
      alt: alt || '',
      order: typeof order === 'number' ? order : 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log(`[Carousel API] Writing to ${TABLE_NAME}...`);

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: newItem,
    }));

    return NextResponse.json(newItem);

  } catch (error: any) {
    console.error('[Carousel API] POST Error:', error);
    return NextResponse.json({ 
      error: 'Database error', 
      details: error.message,
      name: error.name // 如果是 AccessDeniedException，代表 IAM 權限還是沒設好
    }, { status: 500 });
  }
}

// ==========================================
// 🔴 DELETE: 刪除圖片
// ==========================================
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    console.log(`[Carousel API] Deleting item ${id}...`);

    // 1. 從 DynamoDB 刪除
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { id }
    }));

    // 2. (選用) 嘗試刪除 S3 檔案
    // 這裡加了 try-catch 防止 S3 刪除失敗導致 API 報錯 (讓使用者至少覺得刪除成功了)
    try {
        // 如果您的前端傳來 S3 URL 參數，也可以在這裡解析並刪除
        // 為了簡單起見，這裡先只做 DB 刪除，確保 UI 反應正常
    } catch (s3Error) {
        console.warn('[Carousel API] S3 delete failed (ignoring):', s3Error);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Carousel API] DELETE Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}