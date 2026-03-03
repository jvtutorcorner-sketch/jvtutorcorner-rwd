import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import fs from 'fs';
import resolveDataFile from '@/lib/localData';
import { executeWebhookScript } from '@/lib/scriptExecutor';

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

// Helpers to get active AI Integration
async function getActiveAIIntegration() {
    if (useDynamoForApps) {
        // Here we scan for an active GEMINI integration (or OPENAI etc. depending on your priority)
        // For simplicity, we just look for type = 'GEMINI' and status = 'ACTIVE'
        // In a real app, you might want to query by userId or have a generic 'AI' type.
        // Assuming global AI service for the bot here.
        const { Items } = await docClient.send(new ScanCommand({
            TableName: APPS_TABLE,
            FilterExpression: '#typ = :type AND #sts = :status',
            ExpressionAttributeNames: { '#typ': 'type', '#sts': 'status' },
            ExpressionAttributeValues: { ':type': 'GEMINI', ':status': 'ACTIVE' }
        }));
        return Items && Items.length > 0 ? Items[0] : null;
    } else {
        const FILE = await resolveDataFile('app-integrations.json');
        if (fs.existsSync(FILE)) {
            const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
            return data.find((i: any) => i.type === 'GEMINI' && i.status === 'ACTIVE');
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

async function findProfileByLineUid(lineUid: string) {
    if (!useDynamoForProfiles) {
        return null;
    }
    try {
        const { Items } = await docClient.send(new ScanCommand({
            TableName: PROFILES_TABLE,
            FilterExpression: 'lineUid = :lineUid',
            ExpressionAttributeValues: { ':lineUid': lineUid }
        }));
        return Items && Items.length > 0 ? Items[0] : null;
    } catch (err) {
        console.error('[LINE Webhook] findProfileByLineUid error:', err);
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
        console.log(`[LINE Webhook] Received request for integrationId: ${integrationId}`);

        const appInfo = await getAppIntegration(integrationId);

        if (!appInfo || appInfo.type !== 'LINE' || !appInfo.config) {
            console.error(`[LINE Webhook] Integration not found or invalid: ${integrationId}`);
            return new NextResponse('Integration not found', { status: 404 });
        }

        const channelSecret = appInfo.config.channelSecret;
        const channelAccessToken = appInfo.config.channelAccessToken;

        if (!channelSecret || !channelAccessToken) {
            console.error(`[LINE Webhook] Missing credentials for ID ${integrationId}`);
            return new NextResponse('Invalid LINE configuration', { status: 500 });
        }

        // Get raw body for verification
        const rawBody = await request.text();
        const signature = request.headers.get('x-line-signature') || '';
        const isSimulation = request.headers.get('x-simulation') === 'true';

        console.log(`[LINE Webhook] Body length: ${rawBody.length}, Signature present: ${!!signature}`);

        // Verify signature (skip if simulation)
        if (!isSimulation) {
            const hash = crypto.createHmac('SHA256', channelSecret).update(rawBody).digest('base64');
            if (hash !== signature) {
                console.warn(`[LINE Webhook] Invalid signature. Expected: ${hash}, Received: ${signature}`);
                return new NextResponse('Invalid signature', { status: 401 });
            }
        }

        const body = JSON.parse(rawBody);
        const events = body.events || [];
        console.log(`[LINE Webhook] Processing ${events.length} events`);

        const simulationReplies: any[] = [];

        for (const event of events) {
            const replyToken = event.replyToken;
            const lineUid = event.source?.userId;
            console.log(`[LINE Webhook] Event type: ${event.type}, userId: ${lineUid}`);

            if (!replyToken || !lineUid) {
                console.warn('[LINE Webhook] Missing replyToken or lineUid in event');
                continue;
            }

            if (event.type === 'message' || event.type === 'postback') {

                // If the user has configured a custom webhook script, intercept here:
                if (appInfo.config.customScript && appInfo.config.customScript.trim()) {
                    console.log(`[LINE Webhook] Found custom script for ${integrationId}, executing...`);
                    const execResult = await executeWebhookScript(appInfo.config.customScript, body);
                    console.log(`[LINE Webhook] Script executed. Success: ${execResult.success}`);

                    if (execResult.success && execResult.result) {
                        // Attempt to format the generic result into Line messages
                        let messages: any[] = [];
                        if (typeof execResult.result === 'string') {
                            messages = [{ type: 'text', text: execResult.result }];
                        } else if (Array.isArray(execResult.result)) {
                            messages = execResult.result;
                        } else if (typeof execResult.result === 'object') {
                            messages = [execResult.result];
                        }

                        if (messages.length > 0) {
                            if (isSimulation) simulationReplies.push(...messages);
                            else await replyToLine(replyToken, messages, channelAccessToken);
                        }
                    } else if (!execResult.success) {
                        console.error(`[LINE Webhook] Custom Script failed via isolated-vm:`, execResult.error);
                        console.error('Logs:', execResult.logs);
                        const msg = { type: 'text', text: '[Webhook Error] 執行客製化腳本失敗，請聯絡管理員。' };
                        if (isSimulation) simulationReplies.push(msg);
                        else await replyToLine(replyToken, [msg], channelAccessToken);
                    }
                    continue; // Skip the rest of the standard AI binding logic because script handled it
                }

                const existingProfile = await findProfileByLineUid(lineUid);

                if (existingProfile) {
                    console.log(`[LINE Webhook] User ${lineUid} is already linked to ${existingProfile.email}. Allowing conversation.`);

                    if (event.type === 'message' && event.message?.type === 'text') {
                        const userText = event.message.text.trim();
                        console.log(`[LINE Webhook] Received message from linked user: "${userText}"`);

                        try {
                            const aiIntegration = await getActiveAIIntegration();

                            if (aiIntegration && aiIntegration.config?.apiKey) {
                                console.log('[LINE Webhook] Forwarding message to Gemini...');
                                const apiKey = aiIntegration.config.apiKey;
                                const config = aiIntegration.config;
                                // Use configured model or fallback
                                const model = Array.isArray(config.models) && config.models.length > 0 ? config.models[0] : 'gemini-2.5-flash';

                                console.log(`[LINE Webhook] Using model: ${model}`);

                                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        contents: [{ parts: [{ text: userText }] }],
                                        generationConfig: { maxOutputTokens: 4096 }
                                    }),
                                });

                                if (res.ok) {
                                    const data = await res.json();
                                    const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

                                    if (aiResponseText) {
                                        // LINE message limit 5000 chars
                                        const chunks: string[] = [];
                                        let currentText = aiResponseText;
                                        while (currentText.length > 4500) {
                                            chunks.push(currentText.substring(0, 4500));
                                            currentText = currentText.substring(4500);
                                        }
                                        chunks.push(currentText);

                                        const messages = chunks.map(c => ({ type: 'text', text: c }));
                                        if (isSimulation) simulationReplies.push(...messages);
                                        else await replyToLine(replyToken, messages, channelAccessToken);
                                    } else {
                                        console.warn('[LINE Webhook] Empty response from Gemini.');
                                        const msg = { type: 'text', text: '系統暫時無法處理您的訊息，請稍後再試。' };
                                        if (isSimulation) simulationReplies.push(msg);
                                        else await replyToLine(replyToken, [msg], channelAccessToken);
                                    }
                                } else {
                                    console.error('[LINE Webhook] Gemini API Error:', res.status, await res.text());
                                    const msg = { type: 'text', text: 'AI 服務發生錯誤（' + res.status + '），請聯絡管理員。' };
                                    if (isSimulation) simulationReplies.push(msg);
                                    else await replyToLine(replyToken, [msg], channelAccessToken);
                                }
                            } else {
                                console.warn('[LINE Webhook] No active AI connection found for chatbot.');
                                const msg = { type: 'text', text: '目前尚未啟用 AI 助理服務。我們已收到您的訊息：' + userText };
                                if (isSimulation) simulationReplies.push(msg);
                                else await replyToLine(replyToken, [msg], channelAccessToken);
                            }
                        } catch (err: any) {
                            console.error('[LINE Webhook] Error calling AI:', err);
                            const msg = { type: 'text', text: '服務異常，請稍後再試。' };
                            if (isSimulation) simulationReplies.push(msg);
                            else await replyToLine(replyToken, [msg], channelAccessToken);
                        }
                    }
                    continue;
                }

                if (event.type === 'message' && event.message?.type === 'text') {
                    const text = event.message.text.trim();
                    console.log(`[LINE Webhook] Received text message from unlinked user: "${text}"`);

                    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    let emailToBind: string | null = null;

                    if (text.toUpperCase().startsWith('BIND ')) {
                        emailToBind = text.substring(5).trim();
                    } else if (emailPattern.test(text)) {
                        emailToBind = text;
                    }

                    if (emailToBind) {
                        const profile = await findUserProfileByEmail(emailToBind);
                        if (profile) {
                            console.log(`[LINE Webhook] Binding user ${lineUid} to ${profile.email}`);
                            await updateUserProfileLineUid(profile, lineUid);
                            const msg = {
                                type: 'text',
                                text: `✅ 綁定成功！\n您的 LINE 帳戶已與平台帳號 (${profile.email}) 連結。之後您可以直接透過 LINE 接收課程通知。`
                            };
                            if (isSimulation) simulationReplies.push(msg);
                            else await replyToLine(replyToken, [msg], channelAccessToken);
                        } else {
                            console.log(`[LINE Webhook] Profile not found for email: ${emailToBind}`);
                            const msg = {
                                type: 'text',
                                text: `❌ 找不到該電子信箱 (${emailToBind}) 的帳號。\n\n請檢查：\n• 信箱是否正確\n• 帳號是否已在平台註冊\n\n如有問題，請聯絡客服。`
                            };
                            if (isSimulation) simulationReplies.push(msg);
                            else await replyToLine(replyToken, [msg], channelAccessToken);
                        }
                    } else {
                        console.log(`[LINE Webhook] Sending help message to unlinked user ${lineUid}`);
                        const msg = {
                            type: 'text',
                            text: '如需綁定平台帳號，請輸入：\nBIND 您的登入信箱'
                        };
                        if (isSimulation) simulationReplies.push(msg);
                        else await replyToLine(replyToken, [msg], channelAccessToken);
                    }
                } else {
                    console.log(`[LINE Webhook] Non-text event from ${lineUid}`);
                    const msg = {
                        type: 'text',
                        text: '如需綁定平台帳號，請輸入：\nBIND 您的登入信箱'
                    };
                    if (isSimulation) simulationReplies.push(msg);
                    else await replyToLine(replyToken, [msg], channelAccessToken);
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
