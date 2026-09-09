import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveOwnTeacherIds } from '@/lib/auth/courseOwnership';

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

// 先前完全沒有 auth：任何人都能替任意老師送出檔案修改審核。
async function handlePost(req: AuthedRequest, ctx?: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx!.params;
        const body = await req.json();

        const { role } = req.session;
        if (role !== 'admin' && role !== 'system') {
            const ownIds = await resolveOwnTeacherIds(req.session);
            if (!ownIds.has(String(id))) {
                return NextResponse.json({ ok: false, message: 'Forbidden: not your teacher profile' }, { status: 403 });
            }
        }

        // Validate teacher exists
        const getCmd = new GetCommand({ TableName: TEACHERS_TABLE, Key: { id } });
        const res = await ddbDocClient.send(getCmd);

        if (!res.Item) {
            return NextResponse.json({ ok: false, message: 'Teacher not found' }, { status: 404 });
        }

        const allowedFields = ['intro', 'languages', 'subjects', 'name'];
        const pendingChanges: Record<string, any> = {};

        Object.keys(body).forEach((key) => {
            if (allowedFields.includes(key)) {
                pendingChanges[key] = body[key];
            }
        });

        if (Object.keys(pendingChanges).length === 0) {
            return NextResponse.json({ ok: false, message: 'No valid fields provided for review' }, { status: 400 });
        }

        // Add requestedAt timestamp
        pendingChanges.requestedAt = new Date().toISOString();

        const updateCmd = new UpdateCommand({
            TableName: TEACHERS_TABLE,
            Key: { id },
            UpdateExpression: `SET profileReviewStatus = :status, pendingProfileChanges = :changes`,
            ExpressionAttributeValues: {
                ':status': 'PENDING',
                ':changes': pendingChanges
            },
            ReturnValues: 'ALL_NEW',
        });

        await ddbDocClient.send(updateCmd);
        return NextResponse.json({ ok: true, message: 'Review request submitted successfully' });
    } catch (err: any) {
        console.error('[review-request POST] error:', err);
        return NextResponse.json({ ok: false, message: err?.message || 'Submit failed' }, { status: 500 });
    }
}

export const POST = withAuth(handlePost);
