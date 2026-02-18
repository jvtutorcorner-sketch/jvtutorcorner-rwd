import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

export async function GET(req: Request, { params }: { params: any }) {
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

export async function PATCH(req: Request, { params }: { params: any }) {
    try {
        const { id } = await params;
        const body = await req.json();

        const allowedFields = ['intro', 'languages', 'subjects', 'name', 'avatarUrl', 'hourlyRate', 'location'];
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
