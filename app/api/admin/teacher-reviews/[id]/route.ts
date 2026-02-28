import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createReviewRecord } from '@/lib/teacherReviewService';

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { action, reviewedBy, notes } = await req.json();

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

        // Prepare review record data
        const pendingChanges = teacher.pendingProfileChanges || {};
        const originalData: Record<string, any> = {};
        
        // Extract original data for changed fields
        Object.keys(pendingChanges).forEach((key) => {
            if (key !== 'requestedAt') {
                originalData[key] = teacher[key];
            }
        });

        const reviewedAt = new Date().toISOString();
        const requestedAt = pendingChanges.requestedAt || reviewedAt;

        if (action === 'approve') {
            // Apply pending changes
            const updateExpression: string[] = [];
            const expressionAttributeNames: Record<string, string> = {};
            const expressionAttributeValues: Record<string, any> = {};

            console.log('[teacher-reviews] Approving changes for teacher:', id);
            console.log('[teacher-reviews] Pending changes:', pendingChanges);

            // We update the fields that were pending, plus clear out the pending state
            Object.keys(pendingChanges).forEach((key) => {
                if (key !== 'requestedAt') {
                    const attrName = `#${key}`;
                    const attrValue = `:${key}`;
                    updateExpression.push(`${attrName} = ${attrValue}`);
                    expressionAttributeNames[attrName] = key;
                    expressionAttributeValues[attrValue] = pendingChanges[key];
                    console.log(`[teacher-reviews] Will update ${key} to:`, pendingChanges[key]);
                }
            });

            // Set status to approved and update timestamp
            updateExpression.push(`#status = :status`);
            updateExpression.push(`#updatedAt = :updatedAt`);
            expressionAttributeNames['#status'] = 'profileReviewStatus';
            expressionAttributeNames['#updatedAt'] = 'updatedAt';
            expressionAttributeValues[':status'] = 'APPROVED';
            expressionAttributeValues[':updatedAt'] = reviewedAt;

            let updateExpString = `SET ${updateExpression.join(', ')}`;

            // Remove pendingProfileChanges entirely from the item
            updateExpString += ` REMOVE pendingProfileChanges`;

            console.log('[teacher-reviews] Update expression:', updateExpString);
            console.log('[teacher-reviews] Attribute names:', expressionAttributeNames);
            console.log('[teacher-reviews] Attribute values:', expressionAttributeValues);

            const updateCmd = new UpdateCommand({
                TableName: TEACHERS_TABLE,
                Key: { id },
                UpdateExpression: updateExpString,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW',
            });

            const updateResult = await ddbDocClient.send(updateCmd);
            console.log('[teacher-reviews] Update successful, new teacher data:', updateResult.Attributes);

            // Save review record to audit trail (non-blocking)
            try {
                await createReviewRecord({
                    teacherId: id,
                    teacherName: teacher.name || id,
                    requestedAt,
                    reviewedAt,
                    reviewedBy: reviewedBy || 'admin',
                    action: 'approve',
                    originalData,
                    requestedChanges: pendingChanges,
                    notes: notes || 'Profile changes approved and applied',
                });
                console.log('[teacher-reviews] Review record saved to audit trail');
            } catch (auditError: any) {
                console.error('[teacher-reviews] Failed to save audit record (non-critical):', auditError.message);
                console.error('[teacher-reviews] Audit error details:', auditError);
                // Don't fail the whole operation if audit logging fails
            }

            return NextResponse.json({ 
                ok: true, 
                message: 'Request approved successfully',
                updatedTeacher: updateResult.Attributes 
            });

        } else if (action === 'reject') {
            // Set status to REJECTED and remove pendingProfileChanges
            console.log('[teacher-reviews] Rejecting changes for teacher:', id);

            const updateCmd = new UpdateCommand({
                TableName: TEACHERS_TABLE,
                Key: { id },
                UpdateExpression: `SET profileReviewStatus = :status, updatedAt = :updatedAt REMOVE pendingProfileChanges`,
                ExpressionAttributeValues: {
                    ':status': 'REJECTED',
                    ':updatedAt': reviewedAt
                },
                ReturnValues: 'ALL_NEW',
            });

            const updateResult = await ddbDocClient.send(updateCmd);
            console.log('[teacher-reviews] Rejection successful');

            // Save review record to audit trail (non-blocking)
            try {
                await createReviewRecord({
                    teacherId: id,
                    teacherName: teacher.name || id,
                    requestedAt,
                    reviewedAt,
                    reviewedBy: reviewedBy || 'admin',
                    action: 'reject',
                    originalData,
                    requestedChanges: pendingChanges,
                    notes: notes || 'Profile changes rejected',
                });
                console.log('[teacher-reviews] Rejection record saved to audit trail');
            } catch (auditError: any) {
                console.error('[teacher-reviews] Failed to save audit record (non-critical):', auditError.message);
                console.error('[teacher-reviews] Audit error details:', auditError);
                // Don't fail the whole operation if audit logging fails
            }

            return NextResponse.json({ 
                ok: true, 
                message: 'Request rejected successfully',
                updatedTeacher: updateResult.Attributes 
            });
        }
    } catch (err: any) {
        console.error('[admin/teacher-reviews POST] error:', err);
        return NextResponse.json({ ok: false, message: err?.message || 'Failed to process review' }, { status: 500 });
    }

    return NextResponse.json({ ok: false, message: 'Unknown error' }, { status: 500 });
}
