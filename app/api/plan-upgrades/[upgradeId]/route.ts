import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

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
const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';

export async function PATCH(request: Request, { params }: { params: Promise<{ upgradeId: string }> }) {
    try {
        const { upgradeId } = await params;
        const { status } = await request.json();

        if (!status) {
            return NextResponse.json({ error: 'Status is required' }, { status: 400 });
        }

        const updatedAt = new Date().toISOString();

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

        // 2. If marked as PAID and this is a PLAN upgrade, update the user's plan in DynamoDB profiles table
        if (status === 'PAID' && upgrade && upgrade.itemType === 'PLAN' && upgrade.userId && upgrade.planId) {
            try {
                let profile: any = null;

                // A. Try direct lookup by ID first (new format where userId = profile ID)
                try {
                    const getRes = await docClient.send(new GetCommand({
                        TableName: PROFILES_TABLE,
                        Key: { id: upgrade.userId },
                    }));
                    profile = getRes.Item;
                } catch (e) {
                    console.log(`[plan-upgrades PATCH] Direct ID lookup failed for ${upgrade.userId}, trying fallback...`);
                }

                // B. Fallback to scan by email (legacy format where userId = email)
                if (!profile) {
                    const scanRes = await docClient.send(new ScanCommand({
                        TableName: PROFILES_TABLE,
                        FilterExpression: 'email = :email',
                        ExpressionAttributeValues: { ':email': upgrade.userId },
                    }));
                    profile = scanRes.Items?.[0];
                }

                if (profile) {
                    // Update ONLY the plan field — do NOT overwrite the rest of the profile
                    await docClient.send(new UpdateCommand({
                        TableName: PROFILES_TABLE,
                        Key: { id: profile.id },
                        UpdateExpression: 'SET #plan = :plan, updatedAt = :updatedAt',
                        ExpressionAttributeNames: { '#plan': 'plan' },
                        ExpressionAttributeValues: {
                            ':plan': upgrade.planId,
                            ':updatedAt': updatedAt,
                        },
                    }));
                    console.log(`[plan-upgrades PATCH] Updated profile plan for ${profile.email} (${profile.id}) → ${upgrade.planId}`);
                } else {
                    console.warn(`[plan-upgrades PATCH] No profile found for userId=${upgrade.userId}, plan not updated in DynamoDB`);
                }
            } catch (profileErr: any) {
                // Non-fatal: the upgrade status is already updated; log the error
                console.error('[plan-upgrades PATCH] Failed to update profile plan:', profileErr?.message || profileErr);
            }
        }

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
