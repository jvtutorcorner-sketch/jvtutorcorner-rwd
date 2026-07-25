import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { withAdmin } from '@/lib/auth/apiGuard';

const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

const getCourseReviews = async () => {
    try {
        const params = {
            TableName: COURSES_TABLE,
            ConsistentRead: true,
            FilterExpression: '#status = :pendingStatus OR reviewStatus = :reviewStatus',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':pendingStatus': '待審核',
                ':reviewStatus': 'pending'
            }
        };

        // Scan's ~1MB-per-call limit applies before the FilterExpression runs,
        // so a single call can miss matching items once the table grows —
        // page through LastEvaluatedKey to collect every match.
        let items: any[] = [];
        let exclusiveStartKey: any = undefined;
        do {
            const res = await ddbDocClient.send(new ScanCommand({
                ...params,
                ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
            }));
            items.push(...(res.Items || []));
            exclusiveStartKey = res.LastEvaluatedKey;
        } while (exclusiveStartKey);

        return NextResponse.json({
            ok: true,
            reviews: items,
            count: items.length
        });
    } catch (err: any) {
        console.error('[admin/course-reviews GET] error:', err);
        return NextResponse.json({ ok: false, message: err?.message || 'Failed to fetch reviews' }, { status: 500 });
    }
};

export const GET = withAdmin(getCourseReviews);
