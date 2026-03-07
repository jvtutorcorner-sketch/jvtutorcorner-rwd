import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { action } = await req.json();

        if (action !== 'approve' && action !== 'reject') {
            return NextResponse.json({ ok: false, message: 'Invalid action. Must be approve or reject' }, { status: 400 });
        }

        const getCmd = new GetCommand({ TableName: COURSES_TABLE, Key: { id } });
        const res = await ddbDocClient.send(getCmd);

        if (!res.Item) {
            return NextResponse.json({ ok: false, message: 'Course not found' }, { status: 404 });
        }

        const course = res.Item;
        const now = new Date().toISOString();

        if (action === 'approve') {
            const requestedStatus = course.reviewRequestedStatus || '上架';
            const updateParts: string[] = ['#status = :status', 'updatedAt = :updatedAt'];
            const attrNames: any = { '#status': 'status' };
            const attrValues: any = { ':status': requestedStatus, ':updatedAt': now };

            let updateExp = 'SET ' + updateParts.join(', ');
            updateExp += ' REMOVE reviewStatus, reviewRequestedStatus';

            const updateCmd = new UpdateCommand({
                TableName: COURSES_TABLE,
                Key: { id },
                UpdateExpression: updateExp,
                ExpressionAttributeNames: attrNames,
                ExpressionAttributeValues: attrValues,
                ReturnValues: 'ALL_NEW'
            });

            await ddbDocClient.send(updateCmd);
            return NextResponse.json({ ok: true, message: 'Course approved' });

        } else if (action === 'reject') {
            let updateExp = '';
            const attrValues: any = { ':updatedAt': now };
            const attrNames: any = {};

            if (course.status === '待審核') {
                updateExp = 'SET #status = :status, updatedAt = :updatedAt';
                attrNames['#status'] = 'status';
                attrValues[':status'] = '已退回';
            } else {
                updateExp = 'SET updatedAt = :updatedAt';
            }

            updateExp += ' REMOVE reviewStatus, reviewRequestedStatus';

            const updateCmd = new UpdateCommand({
                TableName: COURSES_TABLE,
                Key: { id },
                UpdateExpression: updateExp,
                ExpressionAttributeNames: Object.keys(attrNames).length > 0 ? attrNames : undefined,
                ExpressionAttributeValues: attrValues,
                ReturnValues: 'ALL_NEW'
            });

            await ddbDocClient.send(updateCmd);
            return NextResponse.json({ ok: true, message: 'Course rejected' });
        }
    } catch (err: any) {
        console.error('[admin/course-reviews POST] error:', err);
        return NextResponse.json({ ok: false, message: err?.message || 'Failed to process review' }, { status: 500 });
    }
}
