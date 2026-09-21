import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveOwnTeacherIds } from '@/lib/auth/courseOwnership';

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const getCmd = new GetCommand({ TableName: TEACHERS_TABLE, Key: { id } });
        const res = await ddbDocClient.send(getCmd);
        if (!res.Item) {
            return NextResponse.json({ ok: false, message: 'Teacher not found' }, { status: 404 });
        }
        return NextResponse.json({ ok: true, teacher: res.Item });
    } catch (err: any) {
        return NextResponse.json({ ok: false, message: err?.message || 'Server error' }, { status: 500 });
    }
}

// GET 維持公開（老師檔案頁）。PATCH 先前完全沒有 auth，也沒有擁有權檢查：
// 任何人都能改寫任何一位老師的姓名、簡介、時薪、頭像與在職狀態。
async function handlePatch(req: AuthedRequest, ctx?: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx!.params;
        const body = await req.json();

        const { role } = req.session;
        const isAdmin = role === 'admin' || role === 'system';
        if (!isAdmin) {
            const ownIds = await resolveOwnTeacherIds(req.session);
            if (!ownIds.has(String(id))) {
                return NextResponse.json({ ok: false, message: 'Forbidden: not your teacher profile' }, { status: 403 });
            }
        }

        // 在職狀態屬於管理端決定，老師不能自己改。
        if (!isAdmin && Object.prototype.hasOwnProperty.call(body, 'status')) {
            return NextResponse.json({ ok: false, message: 'Forbidden: status is managed by admins' }, { status: 403 });
        }

        const allowedFields = ['intro', 'languages', 'subjects', 'name', 'avatarUrl', 'hourlyRate', 'location', 'status'];
        const updateExpression: string[] = [];
        const expressionAttributeNames: Record<string, string> = {};
        const expressionAttributeValues: Record<string, any> = {};

        Object.keys(body).forEach((key) => {
            if (allowedFields.includes(key)) {
                const attrName = `#${key}`;
                const attrValue = `:${key}`;
                updateExpression.push(`${attrName} = ${attrValue}`);
                expressionAttributeNames[attrName] = key;
                expressionAttributeValues[attrValue] = body[key];
            }
        });

        if (updateExpression.length === 0) {
            return NextResponse.json({ ok: false, message: 'No valid fields provided' }, { status: 400 });
        }

        const updateCmd = new UpdateCommand({
            TableName: TEACHERS_TABLE,
            Key: { id },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW',
        });

        const result = await ddbDocClient.send(updateCmd);
        return NextResponse.json({ ok: true, teacher: result.Attributes });
    } catch (err: any) {
        console.error('[teachers PATCH] error:', err);
        return NextResponse.json({ ok: false, message: err?.message || 'Update failed' }, { status: 500 });
    }
}

export const PATCH = withAuth(handlePatch);
