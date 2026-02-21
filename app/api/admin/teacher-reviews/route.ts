import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

export async function GET() {
    try {
        const scanCmd = new ScanCommand({
            TableName: TEACHERS_TABLE,
            FilterExpression: 'profileReviewStatus = :status',
            ExpressionAttributeValues: {
                ':status': 'PENDING'
            }
        });

        const res = await ddbDocClient.send(scanCmd);

        return NextResponse.json({
            ok: true,
            reviews: res.Items || [],
            count: res.Count || 0
        });
    } catch (err: any) {
        console.error('[admin/teacher-reviews GET] error:', err);
        return NextResponse.json({ ok: false, message: err?.message || 'Failed to fetch reviews' }, { status: 500 });
    }
}
