import { NextResponse } from 'next/server';
import { ddbDocClient as docClient } from '@/lib/dynamo';
import { UpdateCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

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

        const wasAlreadyPaid = oldUpgrade && oldUpgrade.status === 'PAID';

        if (status === 'PAID' && upgrade && !wasAlreadyPaid) {
            // 2. If marked as PAID and this is a PLAN upgrade, update the user's plan in DynamoDB profiles table
            if (upgrade.itemType === 'PLAN' && upgrade.userId && upgrade.planId) {
                try {
                    let profile: any = null;

                    // A. Try direct lookup by ID first (new format where userId = profile ID)
                    try {
                        const getProfileRes = await docClient.send(new GetCommand({
                            TableName: PROFILES_TABLE,
                            Key: { id: upgrade.userId },
                        }));
                        profile = getProfileRes.Item;
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

            // 3. If marked as PAID and this is a POINTS purchase, add points to the user and activate app plans
            if (upgrade.itemType === 'POINTS' && upgrade.userId && upgrade.points) {
                try {
                    // Use the unified storage layer to ensure consistency (works for both DynamoDB and LOCAL_POINTS)
                    const { getUserPoints, setUserPoints } = await import('@/lib/pointsStorage');
                    const currentBalance = await getUserPoints(upgrade.userId);
                    const newBalance = currentBalance + upgrade.points;
                    await setUserPoints(upgrade.userId, newBalance);
                    
                    console.log(`[plan-upgrades PATCH] Granted ${upgrade.points} points to ${upgrade.userId} (via pointsStorage: ${currentBalance} -> ${newBalance})`);


                    // ACTIVATE App Plans if any
                    if (upgrade.appPlanIds && Array.isArray(upgrade.appPlanIds) && upgrade.appPlanIds.length > 0) {
                        // 1. Find profile first to get existing app plans
                        let profile: any = null;
                        try {
                            const getProfileRes = await docClient.send(new GetCommand({
                                TableName: PROFILES_TABLE,
                                Key: { id: upgrade.userId },
                            }));
                            profile = getProfileRes.Item;
                        } catch (e) {
                            console.log(`[plan-upgrades PATCH] Profile lookup failed for app activation: ${upgrade.userId}`);
                        }

                        if (!profile) {
                            // Fallback scan
                            const scanRes = await docClient.send(new ScanCommand({
                                TableName: PROFILES_TABLE,
                                FilterExpression: 'email = :email',
                                ExpressionAttributeValues: { ':email': upgrade.userId },
                            }));
                            profile = scanRes.Items?.[0];
                        }

                        if (profile) {
                            const existingPlans = Array.isArray(profile.activeAppPlanIds) ? profile.activeAppPlanIds : [];
                            // Unique set of app plan IDs
                            const newPlansSet = new Set([...existingPlans, ...upgrade.appPlanIds]);
                            const finalPlans = Array.from(newPlansSet);

                            await docClient.send(new UpdateCommand({
                                TableName: PROFILES_TABLE,
                                Key: { id: profile.id },
                                UpdateExpression: 'SET activeAppPlanIds = :plans, updatedAt = :updatedAt',
                                ExpressionAttributeValues: {
                                    ':plans': finalPlans,
                                    ':updatedAt': updatedAt,
                                },
                            }));
                            console.log(`[plan-upgrades PATCH] Activated app plans for ${upgrade.userId}:`, upgrade.appPlanIds);
                        }
                    }
                } catch (pointsErr: any) {
                    console.error('[plan-upgrades PATCH] Failed to update user points/app plans:', pointsErr?.message || pointsErr);
                }
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
