import { NextResponse } from 'next/server';
import { ddbDocClient as docClient } from '@/lib/dynamo';
import { UpdateCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getUserPoints, setUserPoints } from '@/lib/pointsStorage';

const UPGRADES_TABLE = process.env.DYNAMODB_TABLE_PLAN_UPGRADES || 'jvtutorcorner-plan-upgrades';
const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';
const POINTS_TABLE = process.env.DYNAMODB_TABLE_USER_POINTS || 'jvtutorcorner-user-points';

export async function PATCH(request: Request, { params }: { params: Promise<{ upgradeId: string }> }) {
    try {
        const { upgradeId } = await params;
        const { status } = await request.json();

        if (!status) {
            return NextResponse.json({ error: 'Status is required' }, { status: 400 });
        }

        const updatedAt = new Date().toISOString();

        // 0. Check old status to ensure idempotency
        const getCmd = new GetCommand({
            TableName: UPGRADES_TABLE,
            Key: { upgradeId },
        });
        const getRes = await docClient.send(getCmd);
        const oldUpgrade = getRes.Item;

        // 1. Update the upgrade record status
        const command = new UpdateCommand({
            TableName: UPGRADES_TABLE,
            Key: { upgradeId },
            UpdateExpression: 'SET #s = :status, updatedAt = :updatedAt',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':status': status, ':updatedAt': updatedAt },
            ReturnValues: 'ALL_NEW',
        });

        const res = await docClient.send(command);
        const upgrade = res.Attributes;

        // NOTE: Business logic (adding points, activating plans, updating profiles)
        // is now centrally handled by paymentSuccessHandler.ts strictly triggered by webhooks
        // to prevent unauthenticated HTTP PATCH spoofing vulnerabilities.
        
        return NextResponse.json({ ok: true, upgrade }, { status: 200 });

    } catch (err: any) {
        console.error('Error updating upgrade:', err?.message || err);
        return NextResponse.json({ error: 'Failed to update upgrade' }, { status: 500 });
    }
}

export async function GET(request: Request, { params }: { params: Promise<{ upgradeId: string }> }) {
    try {
        const { upgradeId } = await params;
        const res = await docClient.send(new GetCommand({
            TableName: UPGRADES_TABLE,
            Key: { upgradeId },
        }));
        if (!res.Item) {
            return NextResponse.json({ ok: false, error: 'Upgrade not found' }, { status: 404 });
        }
        return NextResponse.json({ ok: true, upgrade: res.Item }, { status: 200 });
    } catch (err: any) {
        console.error('Error getting upgrade:', err?.message || err);
        return NextResponse.json({ ok: false, error: 'Failed to get upgrade' }, { status: 500 });
    }
}
