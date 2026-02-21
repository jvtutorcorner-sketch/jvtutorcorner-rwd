import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { action } = await req.json();

        if (action !== 'approve' && action !== 'reject') {
            return NextResponse.json({ ok: false, message: 'Invalid action. Must be approve or reject' }, { status: 400 });
        }

        // 1. Get current teacher data
        const getCmd = new GetCommand({ TableName: TEACHERS_TABLE, Key: { id } });
        const res = await ddbDocClient.send(getCmd);

        if (!res.Item) {
            return NextResponse.json({ ok: false, message: 'Teacher not found' }, { status: 404 });
        }

        const teacher = res.Item;

        if (teacher.profileReviewStatus !== 'PENDING') {
            return NextResponse.json({ ok: false, message: 'No pending review request for this teacher' }, { status: 400 });
        }

        if (action === 'approve') {
            // Apply pending changes
            const pendingChanges = teacher.pendingProfileChanges || {};
            const updateExpression: string[] = [];
            const expressionAttributeNames: Record<string, string> = {};
            const expressionAttributeValues: Record<string, any> = {};

            // We update the fields that were pending, plus clear out the pending state
            Object.keys(pendingChanges).forEach((key) => {
                if (key !== 'requestedAt') {
                    const attrName = `#${key}`;
                    const attrValue = `:${key}`;
                    updateExpression.push(`${attrName} = ${attrValue}`);
                    expressionAttributeNames[attrName] = key;
                    expressionAttributeValues[attrValue] = pendingChanges[key];
                }
            });

            // Set status to approved and remove pending changes object
            updateExpression.push(`#status = :status`);
            expressionAttributeNames['#status'] = 'profileReviewStatus';
            expressionAttributeValues[':status'] = 'APPROVED';

            let updateExpString = `SET ${updateExpression.join(', ')}`;

            // Remove pendingProfileChanges entirely from the item
            updateExpString += ` REMOVE pendingProfileChanges`;

            const updateCmd = new UpdateCommand({
                TableName: TEACHERS_TABLE,
                Key: { id },
                UpdateExpression: updateExpString,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW',
            });

            await ddbDocClient.send(updateCmd);
            return NextResponse.json({ ok: true, message: 'Request approved successfully' });

        } else if (action === 'reject') {
            // Set status to REJECTED and remove pendingProfileChanges

            const updateCmd = new UpdateCommand({
                TableName: TEACHERS_TABLE,
                Key: { id },
                UpdateExpression: `SET profileReviewStatus = :status REMOVE pendingProfileChanges`,
                ExpressionAttributeValues: {
                    ':status': 'REJECTED'
                },
                ReturnValues: 'ALL_NEW',
            });

            await ddbDocClient.send(updateCmd);
            return NextResponse.json({ ok: true, message: 'Request rejected successfully' });
        }
    } catch (err: any) {
        console.error('[admin/teacher-reviews POST] error:', err);
        return NextResponse.json({ ok: false, message: err?.message || 'Failed to process review' }, { status: 500 });
    }

    return NextResponse.json({ ok: false, message: 'Unknown error' }, { status: 500 });
}
