import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

export async function GET() {
    try {
        const scanCmd = new ScanCommand({
            TableName: COURSES_TABLE,
            FilterExpression: '#status = :pendingStatus OR reviewStatus = :reviewStatus',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':pendingStatus': '待審核',
                ':reviewStatus': 'pending'
            }
        });

        const res = await ddbDocClient.send(scanCmd);

        return NextResponse.json({
            ok: true,
            reviews: res.Items || [],
            count: res.Count || 0
        });
    } catch (err: any) {
        console.error('[admin/course-reviews GET] error:', err);
        return NextResponse.json({ ok: false, message: err?.message || 'Failed to fetch reviews' }, { status: 500 });
    }
}
