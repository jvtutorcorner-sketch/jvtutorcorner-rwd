import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import fs from 'fs';
import resolveDataFile from '@/lib/localData';

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
const docClient = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

const APPS_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';
const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';

const useDynamoForApps =
    typeof APPS_TABLE === 'string' && APPS_TABLE.length > 0 &&
    (process.env.NODE_ENV === 'production' || !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

const useDynamoForProfiles =
    typeof PROFILES_TABLE === 'string' && PROFILES_TABLE.length > 0 &&
    (process.env.NODE_ENV === 'production' || !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

// Helpers to get App Integration config
async function getAppIntegration(integrationId: string) {
    if (useDynamoForApps) {
        const { Items } = await docClient.send(new ScanCommand({
            TableName: APPS_TABLE,
            FilterExpression: 'integrationId = :id',
            ExpressionAttributeValues: { ':id': integrationId }
        }));
        return Items && Items.length > 0 ? Items[0] : null;
    } else {
        const FILE = await resolveDataFile('app-integrations.json');
        if (fs.existsSync(FILE)) {
            const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
            return data.find((i: any) => i.integrationId === integrationId);
        }
    }
    return null;
}

async function findUserProfileByEmail(email: string) {
    const targetEmail = String(email).trim().toLowerCase();
    console.log('[LINE Webhook] Finding profile for email (Dynamo only):', targetEmail);

    if (!useDynamoForProfiles) {
        console.warn('[LINE Webhook] DynamoDB for profiles not enabled; skipping local file lookup as requested.');
        return null;
    }

    try {
        const { Items } = await docClient.send(new ScanCommand({
            TableName: PROFILES_TABLE,
            FilterExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': targetEmail }
        }));
        console.log('[LINE Webhook] DynamoDB scan result:', Items?.length || 0, 'items found');
        return Items && Items.length > 0 ? Items[0] : null;
    } catch (err) {
        console.error('[LINE Webhook] DynamoDB scan error:', err);
        return null;
    }
}

async function updateUserProfileLineUid(profile: any, lineUid: string) {
    if (!useDynamoForProfiles) {
        console.warn('[LINE Webhook] DynamoDB for profiles not enabled; skipping local file update as requested.');
        return;
    }

    const updatedProfile = { ...profile, lineUid, updatedAt: new Date().toISOString() };
    await docClient.send(new PutCommand({
        TableName: PROFILES_TABLE,
        Item: updatedProfile
    }));
}

async function replyToLine(replyToken: string, messages: any[], channelAccessToken: string) {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${channelAccessToken}`
        },
        body: JSON.stringify({ replyToken, messages })
    });
    if (!res.ok) {
        console.error('[LINE Webhook] Failed to reply:', await res.text());
    }
}

export async function POST(request: Request, context: { params: Promise<{ integrationId: string }> | { integrationId: string } }) {
    try {
        // Handle Next.js 15+ async params
        const params = await context.params;
        const integrationId = params.integrationId;
        const appInfo = await getAppIntegration(integrationId);

        if (!appInfo || appInfo.type !== 'LINE' || !appInfo.config) {
            return new NextResponse('Integration not found', { status: 404 });
        }

        const channelSecret = appInfo.config.channelSecret;
        const channelAccessToken = appInfo.config.channelAccessToken;

        if (!channelSecret || !channelAccessToken) {
            return new NextResponse('Invalid LINE configuration', { status: 500 });
        }

        // Get raw body for verification
        const rawBody = await request.text();
        const signature = request.headers.get('x-line-signature') || '';
        const isSimulation = request.headers.get('x-simulation') === 'true';

        // Verify signature (skip if simulation)
        if (!isSimulation) {
            const hash = crypto.createHmac('SHA256', channelSecret).update(rawBody).digest('base64');
            if (hash !== signature) {
                console.warn('[LINE Webhook] Invalid signature');
                return new NextResponse('Invalid signature', { status: 401 });
            }
        }

        const body = JSON.parse(rawBody);
        const events = body.events || [];
        const simulationReplies: any[] = [];

        for (const event of events) {
            // Reply context
            const replyToken = event.replyToken;
            const lineUid = event.source?.userId;

            if (!replyToken || !lineUid) continue;

            if (event.type === 'message' && event.message?.type === 'text') {
                const text = event.message.text.trim();

                // Email pattern for validation
                const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                let emailToBind: string | null = null;

                // Check if text starts with BIND or is a direct email input
                if (text.toUpperCase().startsWith('BIND ')) {
                    emailToBind = text.substring(5).trim();
                } else if (emailPattern.test(text)) {
                    // Direct email input detected
                    emailToBind = text;
                }

                if (emailToBind) {
                    const profile = await findUserProfileByEmail(emailToBind);

                    if (profile) {
                        await updateUserProfileLineUid(profile, lineUid);
                        const msg = {
                            type: 'text',
                            text: `✅ 綁定成功！\n您的 LINE 帳戶已與平台帳號 (${profile.email}) 連結。之後您可以直接透過 LINE 接收課程通知。`
                        };
                        if (isSimulation) {
                            simulationReplies.push(msg);
                        } else {
                            await replyToLine(replyToken, [msg], channelAccessToken);
                        }
                    } else {
                        const msg = {
                            type: 'text',
                            text: `❌ 找不到該電子信箱 (${emailToBind}) 的帳號。\n\n請檢查：\n• 信箱是否正確\n• 帳號是否已在平台註冊\n\n如有問題，請聯絡客服。`
                        };
                        if (isSimulation) {
                            simulationReplies.push(msg);
                        } else {
                            await replyToLine(replyToken, [msg], channelAccessToken);
                        }
                    }
                } else {
                    const msg = {
                        type: 'text',
                        text: '如需綁定平台帳號，請輸入：\nBIND 您的登入信箱'
                    };
                    if (isSimulation) {
                        simulationReplies.push(msg);
                    } else {
                        await replyToLine(replyToken, [msg], channelAccessToken);
                    }
                }
            }
        }

        if (isSimulation) {
            return NextResponse.json({ ok: true, replies: simulationReplies });
        }
        return new NextResponse('OK', { status: 200 });
    } catch (error: any) {
        console.error('[LINE Webhook API] Error:', error);
        return new NextResponse(`Internal Server Error: ${error?.message || error}`, { status: 500 });
    }
}
