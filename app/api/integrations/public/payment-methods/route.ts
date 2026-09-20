// app/api/integrations/public/payment-methods/route.ts
//
// 公開端點：只回傳目前「啟用中」的金流類型清單，供結帳頁決定顯示哪些付款按鈕。
// 刻意不回傳 config、name、id 等任何敏感或可辨識資訊 —— 僅 { types: string[] }。
//
// 取代結帳頁原本直接打 GET /api/app-integrations（會暴露所有整合與明文金鑰）的作法。

import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';

const PAYMENT_TYPES = ['ECPAY', 'PAYPAL', 'STRIPE', 'LINEPAY', 'JKOPAY'];

const ddbRegion = process.env.CI_AWS_REGION || process.env.AWS_REGION;
const ddbAccessKey = process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const ddbSecretKey = process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const ddbSessionToken = process.env.CI_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;
const ddbCreds = ddbAccessKey && ddbSecretKey ? {
    accessKeyId: ddbAccessKey,
    secretAccessKey: ddbSecretKey,
    ...(ddbSessionToken ? { sessionToken: ddbSessionToken } : {}),
} : undefined;
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ddbRegion, credentials: ddbCreds }));
const TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';

export async function GET() {
    try {
        const res = await docClient.send(new ScanCommand({
            TableName: TABLE,
            FilterExpression: '#status = :active',
            // 只投影 type 與 status，不取回 config，避免明文金鑰離開資料庫
            ProjectionExpression: '#type, #status',
            ExpressionAttributeNames: { '#status': 'status', '#type': 'type' },
            ExpressionAttributeValues: { ':active': 'ACTIVE' },
        }));
        const types = Array.from(
            new Set(
                (res.Items || [])
                    .map((i: any) => String(i.type || '').toUpperCase())
                    .filter((t: string) => PAYMENT_TYPES.includes(t))
            )
        );
        return NextResponse.json({ ok: true, types });
    } catch (error: any) {
        console.error('[payment-methods] GET error:', error?.message || error);
        // 失敗時回空陣列，結帳頁自行退回預設行為，不阻斷結帳
        return NextResponse.json({ ok: true, types: [] });
    }
}
