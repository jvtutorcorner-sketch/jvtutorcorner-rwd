import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const ddbRegion = process.env.CI_AWS_REGION || process.env.AWS_REGION;
const ddbExplicitAccessKey = process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const ddbExplicitSecretKey = process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const ddbExplicitSessionToken = process.env.CI_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;
const ddbExplicitCreds = ddbExplicitAccessKey && ddbExplicitSecretKey ? {
    accessKeyId: ddbExplicitAccessKey as string,
    secretAccessKey: ddbExplicitSecretKey as string,
    ...(ddbExplicitSessionToken ? { sessionToken: ddbExplicitSessionToken as string } : {})
} : undefined;

const client = new DynamoDBClient({ region: ddbRegion, credentials: ddbExplicitCreds });
const docClient = DynamoDBDocumentClient.from(client);

const UPGRADES_TABLE = process.env.DYNAMODB_TABLE_PLAN_UPGRADES || 'jvtutorcorner-plan-upgrades';

export async function POST(request: Request) {
    try {
        const { planId, amount, currency, userId } = await request.json();

        if (!planId || !userId) {
            return NextResponse.json({ error: 'Plan ID and User ID are required' }, { status: 400 });
        }

        const upgradeId = randomUUID();
        const createdAt = new Date().toISOString();

        const upgrade = {
            upgradeId,
            userId,
            planId,
            amount: amount || 0,
            currency: currency || 'TWD',
            status: 'PENDING',
            createdAt,
            updatedAt: createdAt,
        };

        const command = new PutCommand({
            TableName: UPGRADES_TABLE,
            Item: upgrade,
        });
        await docClient.send(command);

        return NextResponse.json({
            message: 'Upgrade order created successfully',
            upgrade,
        }, { status: 201 });

    } catch (error: any) {
        console.error('Error creating upgrade:', error?.message || error);
        return NextResponse.json({ error: 'Failed to create upgrade' }, { status: 500 });
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
