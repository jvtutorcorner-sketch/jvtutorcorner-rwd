
import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

// 強制動態執行，避免被 Next.js 快取
export const dynamic = 'force-dynamic';

export async function GET() {
    // 檢查所有可能的 Region 變數來源
    const REGION = process.env.CI_AWS_REGION || process.env.AWS_REGION || 'ap-northeast-1';
    // 檢查 Table 名稱變數
    const TABLE_NAME = process.env.DYNAMODB_TABLE_CAROUSEL || 'jvtutorcorner-carousel';

    const client = new DynamoDBClient({ region: REGION });
    const docClient = DynamoDBDocumentClient.from(client);

    const testId = 'test-item-' + Date.now();
    const testItem = {
        id: testId,
        url: 'https://test.com/diagnostic-image.png',
        alt: 'Diagnostic Write Test',
        createdAt: new Date().toISOString(),
        details: 'This item is created by /api/test-db to verify write permissions'
    };

    try {
        console.log(`[TestDB] Starting diagnostic...`);
        console.log(`[TestDB] Target Table: ${TABLE_NAME}`);
        console.log(`[TestDB] Target Region: ${REGION}`);

        // 1. 嘗試寫入 (Write Test)
        console.log(`[TestDB] Step 1: Attempting Write (PutItem)...`);
        await docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: testItem,
        }));
        console.log('[TestDB] ✅ Write successful');

        // 2. 嘗試刪除 (Cleanup/Delete Test)
        // 這一步很重要，可以驗證是否具備完整的讀寫刪權限，並且不留垃圾資料
        console.log(`[TestDB] Step 2: Attempting Cleanup (DeleteItem)... (SKIPPED BY USER REQUEST)`);
        /*
        await docClient.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { id: testId },
        }));
        console.log('[TestDB] ✅ Cleanup successful');
        */

        return NextResponse.json({
            success: true,
            message: '✅ 診斷成功：資料庫寫入正常！(清除步驟已略過)',
            details: {
                step1_write: 'OK',
                step2_cleanup: 'SKIPPED'
            },
            env: {
                REGION,
                TABLE_NAME,
                // 檢查是否有 Credential (不顯示內容，只顯示有無)
                HAS_AWS_ACCESS_KEY: !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID),
                HAS_AWS_SECRET: !!(process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY),
            }
        });

    } catch (error: any) {
        console.error('[TestDB] ❌ Diagnostic failed:', error);

        return NextResponse.json({
            success: false,
            message: '❌ 診斷失敗',
            error: {
                name: error.name,        // 例如: ResourceNotFoundException (Table名稱錯), AccessDeniedException (權限錯)
                message: error.message,
                code: error.code,
                requestId: error.$metadata?.requestId
            },
            env: {
                REGION,
                TABLE_NAME,
                HAS_AWS_ACCESS_KEY: !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID),
            }
        }, { status: 500 });
    }
}
