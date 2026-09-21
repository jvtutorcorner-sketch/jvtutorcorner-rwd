import { NextResponse } from 'next/server';
import { ddbDocClient as docClient } from '@/lib/dynamo';
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { withAuth, withAnyAuth, AuthedRequest } from '@/lib/auth/apiGuard';
import { handlePaymentSuccess } from '@/lib/paymentSuccessHandler';
import { IS_LOCAL } from '@/lib/envConfig';

const UPGRADES_TABLE = process.env.DYNAMODB_TABLE_PLAN_UPGRADES || 'jvtutorcorner-plan-upgrades';

export const runtime = 'nodejs';

// 先前完全沒有 auth：任何人送一個 upgradeId 就能把方案升級單改成 PAID。
// 現在需要 session 或 HMAC，且只有付款權威（admin/system，含金流回調的內部簽章呼叫）
// 能標記為 PAID。
async function handlePatch(request: AuthedRequest, ctx?: { params: Promise<{ upgradeId: string }> }) {
    try {
        const { upgradeId } = await ctx!.params;
        const { status } = await request.json();

        if (!status) {
            return NextResponse.json({ error: 'Status is required' }, { status: 400 });
        }

        const { role, userId: sessionUserId } = request.session;
        const isPrivileged = role === 'admin' || role === 'system';
        if (status === 'PAID' && !isPrivileged) {
            return NextResponse.json(
                { error: 'Forbidden: only the payment gateway or an admin can mark an upgrade paid' },
                { status: 403 }
            );
        }

        const updatedAt = new Date().toISOString();

        // 0. Check old status to ensure idempotency
        const getCmd = new GetCommand({
            TableName: UPGRADES_TABLE,
            Key: { upgradeId },
        });
        const getRes = await docClient.send(getCmd);
        const oldUpgrade = getRes.Item;

        if (!oldUpgrade) {
            return NextResponse.json({ error: 'Upgrade not found' }, { status: 404 });
        }
        if (!isPrivileged && oldUpgrade.userId !== sessionUserId) {
            return NextResponse.json({ error: 'Forbidden: not the owner of this upgrade' }, { status: 403 });
        }

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

async function handleGet(request: AuthedRequest, ctx?: { params: Promise<{ upgradeId: string }> }) {
    try {
        const { upgradeId } = await ctx!.params;
        const res = await docClient.send(new GetCommand({
            TableName: UPGRADES_TABLE,
            Key: { upgradeId },
        }));
        if (!res.Item) {
            return NextResponse.json({ ok: false, error: 'Upgrade not found' }, { status: 404 });
        }
        const { role, userId } = request.session;
        if (role !== 'admin' && role !== 'system' && res.Item.userId !== userId) {
            return NextResponse.json({ ok: false, error: 'Upgrade not found' }, { status: 404 });
        }
        return NextResponse.json({ ok: true, upgrade: res.Item }, { status: 200 });
    } catch (err: any) {
        console.error('Error getting upgrade:', err?.message || err);
        return NextResponse.json({ ok: false, error: 'Failed to get upgrade' }, { status: 500 });
    }
}

const _POST = withAuth(
    async (req: AuthedRequest, { params }: { params: Promise<{ upgradeId: string }> }) => {
        const simulationEnabled =
            process.env.NODE_ENV !== 'production' ||
            IS_LOCAL ||
            process.env.NEXT_PUBLIC_PAYMENT_MOCK_MODE === 'true';

        if (!simulationEnabled) {
            return NextResponse.json(
                { ok: false, error: 'Simulated payment is disabled in production' },
                { status: 403 }
            );
        }

        const { upgradeId } = await params;
        const getRes = await docClient.send(new GetCommand({
            TableName: UPGRADES_TABLE,
            Key: { upgradeId },
        }));
        const upgrade = getRes.Item as Record<string, any> | undefined;

        if (!upgrade) {
            return NextResponse.json({ ok: false, error: 'Upgrade not found' }, { status: 404 });
        }

        const callerIds = new Set([req.session.userId, req.session.email].filter(Boolean));
        const isPrivileged = req.session.role === 'admin' || req.session.role === 'system';
        const isOwner = callerIds.has(String(upgrade.userId || ''));

        if (!isPrivileged && !isOwner) {
            return NextResponse.json(
                { ok: false, error: 'Forbidden: cannot simulate payment for another user' },
                { status: 403 }
            );
        }

        const currentStatus = String(upgrade.status || 'PENDING').toUpperCase();

        if (currentStatus !== 'PAID' && currentStatus !== 'COMPLETED') {
            await docClient.send(new UpdateCommand({
                TableName: UPGRADES_TABLE,
                Key: { upgradeId },
                UpdateExpression: 'SET #s = :status, updatedAt = :updatedAt',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: {
                    ':status': 'PAID',
                    ':updatedAt': new Date().toISOString(),
                },
            }));
        }

        const result = await handlePaymentSuccess({
            orderId: upgradeId,
            paymentMethod: 'simulated',
            transactionId: `SIM-${upgradeId}`,
            amount: Number(upgrade.amount || 0),
        });

        if (!result.ok) {
            return NextResponse.json(
                { ok: false, error: result.error || 'Failed to process simulated payment' },
                { status: 500 }
            );
        }

        const updatedRes = await docClient.send(new GetCommand({
            TableName: UPGRADES_TABLE,
            Key: { upgradeId },
        }));

        return NextResponse.json({
            ok: true,
            upgrade: updatedRes.Item || upgrade,
            pointsAdded: result.pointsAdded || 0,
        });
    },
    { roles: ['student', 'teacher', 'admin', 'system'] }
);

export const POST = _POST;

// withAnyAuth：使用者用 session 查/改自己的升級單；金流回調用 HMAC 簽章以 system 身分回寫。
export const PATCH = withAnyAuth('/api/plan-upgrades/[upgradeId]', handlePatch);
export const GET = withAuth(handleGet);
