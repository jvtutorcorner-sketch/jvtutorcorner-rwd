import { NextResponse } from 'next/server';
import { ddbDocClient as docClient } from '@/lib/dynamo';
import { PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';

const UPGRADES_TABLE = process.env.DYNAMODB_TABLE_PLAN_UPGRADES || 'jvtutorcorner-plan-upgrades';

/**
 * Both handlers below were previously unauthenticated.
 *
 * POST took `userId` from the request body, so anyone could mint a PENDING
 * upgrade order against any account — including a POINTS order carrying an
 * arbitrary `points` value, which is the input the simulated-payment path in
 * [upgradeId]/route.ts later credits.
 *
 * GET with no userId returned every upgrade order in the table (user ids,
 * amounts, plan ids) to any caller.
 *
 * Both now require a session, and a non-admin caller is pinned to their own
 * identity regardless of what the request says.
 */
function isPrivileged(session: AuthedRequest['session']): boolean {
  return session.role === 'admin' || session.role === 'system';
}

export const POST = withAuth(async (request: AuthedRequest) => {
    try {
        const { planId, amount, currency, userId: requestedUserId, itemType, planLabel, points, appPlanIds } = await request.json();
        console.log('[plan-upgrades API] POST request:', { planId, amount, currency, requestedUserId, itemType, points, appPlanIds });

        if (!planId) {
            console.warn('[plan-upgrades API] Missing planId');
            return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
        }

        // Only an admin may open an upgrade order on someone else's behalf.
        const userId = isPrivileged(request.session)
            ? (requestedUserId || request.session.userId)
            : request.session.userId;

        if (!isPrivileged(request.session) && requestedUserId && requestedUserId !== userId) {
            return NextResponse.json(
                { error: 'Forbidden: cannot create an upgrade order for another user' },
                { status: 403 }
            );
        }

        const upgradeId = randomUUID();
        const createdAt = new Date().toISOString();

        const upgrade = {
            upgradeId,
            userId,
            planId,
            itemType: itemType || (planId.startsWith('points_') ? 'POINTS' : 'PLAN'),
            planLabel: planLabel || planId,
            amount: amount || 0,
            currency: currency || 'TWD',
            status: 'PENDING',
            points: points || 0,
            appPlanIds: appPlanIds || [],
            createdAt,
            updatedAt: createdAt,
        };

        console.log('[plan-upgrades API] Saving upgrade:', upgrade);

        const command = new PutCommand({
            TableName: UPGRADES_TABLE,
            Item: upgrade,
        });
        await docClient.send(command);

        console.log('[plan-upgrades API] Upgrade created successfully:', upgradeId);

        return NextResponse.json({
            message: 'Upgrade order created successfully',
            upgrade,
        }, { status: 201 });

    } catch (error: any) {
        console.error('[plan-upgrades API] Error creating upgrade:', error);
        return NextResponse.json({ error: 'Failed to create upgrade', details: error.message }, { status: 500 });
    }
});

export const GET = withAuth(async (request: AuthedRequest) => {
    try {
        const url = new URL(request.url);
        const requestedUserId = url.searchParams.get('userId');

        // Non-admins see only their own orders, whatever the query string asks for.
        const userId = isPrivileged(request.session)
            ? requestedUserId
            : request.session.userId;

        if (userId) {
            // byUserId GSI (scripts/setup-db.mjs :: createPlanUpgradesTable) — a
            // Query, not a filtered Scan, so the result is complete rather than
            // "whatever matched inside the first scanned page".
            const res = await docClient.send(new QueryCommand({
                TableName: UPGRADES_TABLE,
                IndexName: 'byUserId',
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: { ':userId': userId },
            }));
            return NextResponse.json({ ok: true, data: res.Items || [] }, { status: 200 });
        }

        // Unscoped listing is admin-only (isPrivileged is the only way userId is null here).
        const res = await docClient.send(new ScanCommand({ TableName: UPGRADES_TABLE }));
        return NextResponse.json({ ok: true, data: res.Items || [] }, { status: 200 });
    } catch (err) {
        console.error('plan-upgrades GET error:', err);
        return NextResponse.json({ ok: false, error: 'Failed to list upgrades' }, { status: 500 });
    }
});
