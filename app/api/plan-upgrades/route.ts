import { NextResponse } from 'next/server';
import { ddbDocClient as docClient } from '@/lib/dynamo';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const UPGRADES_TABLE = process.env.DYNAMODB_TABLE_PLAN_UPGRADES || 'jvtutorcorner-plan-upgrades';

export async function POST(request: Request) {
    try {
        const { planId, amount, currency, userId, itemType, planLabel, points } = await request.json();
        console.log('[plan-upgrades API] POST request:', { planId, amount, currency, userId, itemType, points });

        if (!planId || !userId) {
            console.warn('[plan-upgrades API] Missing planId or userId');
            return NextResponse.json({ error: 'Plan ID and User ID are required' }, { status: 400 });
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
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get('userId');

        const scanInput: any = { TableName: UPGRADES_TABLE };
        if (userId) {
            scanInput.FilterExpression = 'userId = :userId';
            scanInput.ExpressionAttributeValues = { ':userId': userId };
        }

        const res = await docClient.send(new ScanCommand(scanInput));
        return NextResponse.json({ ok: true, data: res.Items || [] }, { status: 200 });
    } catch (err) {
        console.error('plan-upgrades GET error:', err);
        return NextResponse.json({ ok: false, error: 'Failed to list upgrades' }, { status: 500 });
    }
}
