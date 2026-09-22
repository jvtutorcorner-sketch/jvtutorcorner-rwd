import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { executeWebhookScript } from '@/lib/scriptExecutor';
import { LEARNING_CONTENT_ANALYSIS_PROMPT } from '@/lib/learningContentAnalysis';
import { runWithIntegration } from '@/lib/ai/gateway/gateway';

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
const WEBHOOK_LOGS_TABLE = process.env.DYNAMODB_TABLE_WEBHOOK_LOGS || 'jvtutorcorner-webhook-logs';

const useDynamoForApps =
    typeof APPS_TABLE === 'string' && APPS_TABLE.length > 0 &&
    (process.env.NODE_ENV === 'production' || !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

const useDynamoForProfiles =
    typeof PROFILES_TABLE === 'string' && PROFILES_TABLE.length > 0 &&
    (process.env.NODE_ENV === 'production' || !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

const useDynamoForWebhookLogs =
    typeof WEBHOOK_LOGS_TABLE === 'string' && WEBHOOK_LOGS_TABLE.length > 0 &&
    (process.env.NODE_ENV === 'production' || !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

// ==========================================
// Unified Logging System
// ==========================================

interface WebhookLog {
    integrationId: string;
    timestamp: number;
    logId: string;
    level: 'INFO' | 'WARN' | 'ERROR';
    category: string;
    message: string;
    context?: Record<string, any>;
}

async function logToWebhook(log: WebhookLog) {
    // 1. Always log to console (CloudWatch)
    const prefix = `[LINE Webhook] [${log.level}]`;
    const contextStr = log.context ? ` | ${JSON.stringify(log.context)}` : '';
    const logMessage = `${prefix} ${log.message}${contextStr}`;
    
    if (log.level === 'ERROR') {
        console.error(logMessage);
    } else if (log.level === 'WARN') {
        console.warn(logMessage);
    } else {
        console.log(logMessage);
    }

    // 2. Optionally store to DynamoDB for long-term tracking
    if (useDynamoForWebhookLogs) {
        try {
            await docClient.send(new PutCommand({
                TableName: WEBHOOK_LOGS_TABLE,
                Item: {
                    integrationId: log.integrationId,
                    timestamp: log.timestamp, // milliseconds for sorting
                    logId: log.logId,
                    level: log.level,
                    category: log.category,
                    message: log.message,
                    context: log.context,
                    expirationTime: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
                }
            }));
        } catch (err) {
            console.error('[LINE Webhook] Failed to store log to DynamoDB:', err);
        }
    }
    else {
        // Helpful diagnostic: explicitly note when DynamoDB logging is disabled
        console.log('[LINE Webhook] DynamoDB webhook logging disabled (useDynamoForWebhookLogs=false). Logs will only appear in console.');
    }
}

// Helpers to get App Integration config — 透過整合 store（新表 PK 查詢，含舊表 fallback）
async function getAppIntegration(integrationId: string) {
    if (!useDynamoForApps) {
        console.warn('[LINE Webhook] DynamoDB not configured for app integrations.');
        return null;
    }
    const { getIntegration } = await import('@/lib/integrations/store');
    return getIntegration(integrationId);
}

// Helper to find active AI service (priority: OPENAI > ANTHROPIC > GEMINI)
async function findActiveAIService() {
    if (!useDynamoForApps) {
        console.warn('[LINE Webhook] DynamoDB not configured for app integrations.');
        return null;
    }
    const { getFirstActiveOf } = await import('@/lib/integrations/store');
    return getFirstActiveOf(['OPENAI', 'ANTHROPIC', 'GEMINI']);
}

// Helpers to get AI Integration by linkedServiceId or default
async function getAIIntegrationByLinkedId(linkedServiceId?: string) {
    // If linkedServiceId provided, try to fetch it first
    if (linkedServiceId) {
        let linkedIntegration: any = null;

        if (useDynamoForApps) {
            const { getIntegration } = await import('@/lib/integrations/store');
            linkedIntegration = await getIntegration(linkedServiceId);
        }

        // Validate that linkedIntegration is a valid AI service and is active
        if (linkedIntegration && 
            ['OPENAI', 'ANTHROPIC', 'GEMINI'].includes(linkedIntegration.type) && 
            linkedIntegration.status === 'ACTIVE' &&
            linkedIntegration.config?.apiKey) {
            console.log(`[LINE Webhook] Using linked AI service: ${linkedIntegration.type}`);
            return linkedIntegration;
        }

        // If linkedServiceId is invalid or not active, log warning
        if (linkedServiceId) {
            console.warn(`[LINE Webhook] Linked AI service ${linkedServiceId} is invalid/missing/inactive. Falling back to active AI service.`);
        }
    }

    // Fallback: find first active AI service (priority: OPENAI > ANTHROPIC > GEMINI)
    return await findActiveAIService();
}

// Helpers to get active AI Integration (for backward compatibility)
async function getActiveAIIntegration() {
    return getAIIntegrationByLinkedId(undefined);
}

async function findUserProfileByEmail(email: string) {
    const targetEmail = String(email).trim().toLowerCase();
    console.log('[LINE Webhook] Finding profile for email (Dynamo only):', targetEmail);

    if (!useDynamoForProfiles) {
        console.warn('[LINE Webhook] DynamoDB for profiles not enabled; skipping local file lookup as requested.');
        return null;
    }

    try {
        const { Items } = await docClient.send(new QueryCommand({
            TableName: PROFILES_TABLE,
            IndexName: 'EmailIndex',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': targetEmail },
            Limit: 1,
        }));
        console.log('[LINE Webhook] DynamoDB query result:', Items?.length || 0, 'items found');
        return Items && Items.length > 0 ? Items[0] : null;
    } catch (err) {
        console.error('[LINE Webhook] findUserProfileByEmail error:', err);
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

// ==========================================
// Image Recognition Helpers
// ==========================================

async function downloadLineImage(messageId: string, channelAccessToken: string): Promise<Buffer | null> {
    try {
        console.log(`[LINE Webhook] Downloading image for messageId: ${messageId}`);
        console.log(`[LINE Webhook] Channel Access Token exists: ${!!channelAccessToken}`);
        
        // 方法 1: 使用官方最新的 Data API 端點
        const url1 = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
        console.log(`[LINE Webhook] Trying method 1 (api-data.line.me): ${url1}`);
        
        let res = await fetch(url1, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${channelAccessToken}`
            },
            cache: 'no-store' // 避免 Next.js 快取
        });

        console.log(`[LINE Webhook] Method 1 response status: ${res.status} ${res.statusText}`);

        if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            console.log(`[LINE Webhook] Downloaded image successfully via method 1, size: ${buffer.length} bytes`);
            return buffer;
        }

        // 如果失敗，嘗試方法 2: 舊版官方 API 端點
        const url2 = `https://api.line.me/v2/bot/message/${messageId}/content`;
        console.log(`[LINE Webhook] Method 1 failed (${res.status}), trying method 2 (api.line.me): ${url2}`);
        
        res = await fetch(url2, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${channelAccessToken}`
            },
            cache: 'no-store'
        });

        console.log(`[LINE Webhook] Method 2 response status: ${res.status} ${res.statusText}`);

        if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            console.log(`[LINE Webhook] Downloaded image successfully via method 2, size: ${buffer.length} bytes`);
            return buffer;
        }

        // 兩種方法都失敗
        const errorText = await res.text().catch(e => 'Could not read error text');
        console.error(`[LINE Webhook] Both methods failed. Final status: ${res.status} ${res.statusText}`);
        console.error(`[LINE Webhook] Error response: ${errorText.substring(0, 200)}`);
        return null;
    } catch (err) {
        console.error('[LINE Webhook] Error downloading image:', err);
        if (err instanceof Error) {
            console.error('[LINE Webhook] Error message:', err.message);
            console.error('[LINE Webhook] Error stack:', err.stack);
        }
        return null;
    }
}

// Default response template for LINE teaching-content messages. Site admins can override per-integration.
const DEFAULT_LEARNING_CONTENT_RESPONSE_TEMPLATE = `📚 教材分析結果：

{initial_instructions}

📋 訊息 ID: {messageId}
⏰ 時間: {timestamp}`;

function renderTemplate(template: string, data: Record<string, any>) {
    return String(template).replace(/\{(\w+)\}/g, (_m, key) => {
        const v = data[key];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
    });
}

// Text message API callers for each provider
// LINE text/vision now route through the AI Gateway (usage captured + metered +
// timeout/retry). The three text wrappers keep their (text, apiKey) signatures so
// the POST dispatch below is unchanged; each pins its original model.
const LINE_TEXT_MODEL: Record<string, string> = {
    GEMINI: 'gemini-2.5-flash',
    OPENAI: 'gpt-4-turbo',
    ANTHROPIC: 'claude-3-5-sonnet-20241022',
};

async function callTextAI(provider: string, text: string, apiKey: string): Promise<string | null> {
    const model = LINE_TEXT_MODEL[provider] || 'gpt-4-turbo';
    const res = await runWithIntegration(
        { type: provider, config: { apiKey, model } },
        { prompt: text, maxTokens: 4096 },
        { feature: 'line-text', defaultModel: model }
    );
    return res.ok ? res.result.text : null;
}

async function callGeminiText(text: string, apiKey: string): Promise<string | null> {
    return callTextAI('GEMINI', text, apiKey);
}
async function callOpenAIText(text: string, apiKey: string): Promise<string | null> {
    return callTextAI('OPENAI', text, apiKey);
}
async function callAnthropicText(text: string, apiKey: string): Promise<string | null> {
    return callTextAI('ANTHROPIC', text, apiKey);
}

const LINE_VISION_MODEL: Record<string, string> = {
    GEMINI: 'gemini-2.5-flash',
    OPENAI: 'gpt-4-turbo',
    ANTHROPIC: 'claude-3-5-sonnet-20241022',
};

async function analyzeImageWithVisionAPI(imageBuffer: Buffer, aiIntegration: any, prompt: string): Promise<any> {
    const base64Image = imageBuffer.toString('base64');
    const provider = aiIntegration.type;
    const configuredModel = aiIntegration.config?.models?.[0] || aiIntegration.config?.model;
    try {
        const res = await runWithIntegration(
            { type: provider, config: { apiKey: aiIntegration.config?.apiKey, model: configuredModel } },
            { prompt, images: [{ base64: base64Image, mimeType: 'image/jpeg' }], jsonMode: true, maxTokens: 1024 },
            { feature: 'line-vision', defaultModel: LINE_VISION_MODEL[provider] || 'gpt-4-turbo' }
        );
        if (!res.ok || !res.result.text) return null;
        try { return JSON.parse(res.result.text); } catch { return { raw: res.result.text }; }
    } catch (err) {
        console.error(`[LINE Webhook] Error analyzing image with ${provider}:`, err);
        return null;
    }
}

// Legacy function for backward compatibility
async function analyzeImageWithGeminiVision(imageBuffer: Buffer, geminiApiKey: string, model: string = 'gemini-2.5-flash', prompt?: string): Promise<any> {
    const geminiIntegration = {
        type: 'GEMINI',
        config: { apiKey: geminiApiKey, models: [model] }
    };
    return analyzeImageWithVisionAPI(imageBuffer, geminiIntegration, prompt || LEARNING_CONTENT_ANALYSIS_PROMPT);
}

export async function POST(request: Request, context: { params: Promise<{ integrationId: string }> | { integrationId: string } }) {
    try {
        // Handle Next.js 15+ async params
        const params = await context.params;
        const integrationId = params.integrationId;
        console.log(`[LINE Webhook] Received request for integrationId: ${integrationId}`);

        let appInfo = await getAppIntegration(integrationId);

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

        // In simulation mode, skip local file fallback (DynamoDB is required)
        if (isSimulation && (!appInfo || appInfo.type !== 'LINE' || !appInfo.config)) {
            console.warn('[LINE Webhook] Simulation mode: appInfo not found in DynamoDB for integrationId:', integrationId);
        }

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
                            // Use LINE's configured linkedServiceId if available, otherwise fallback
                            const aiIntegration = await getAIIntegrationByLinkedId(appInfo.config?.linkedServiceId);

                            if (aiIntegration && aiIntegration.config?.apiKey) {
                                console.log(`[LINE Webhook] Forwarding message to ${aiIntegration.type} AI service...`);
                                
                                // Call the appropriate AI provider
                                let aiResponseText: string | null = null;

                                if (aiIntegration.type === 'GEMINI') {
                                    aiResponseText = await callGeminiText(userText, aiIntegration.config.apiKey);
                                } else if (aiIntegration.type === 'OPENAI') {
                                    aiResponseText = await callOpenAIText(userText, aiIntegration.config.apiKey);
                                } else if (aiIntegration.type === 'ANTHROPIC') {
                                    aiResponseText = await callAnthropicText(userText, aiIntegration.config.apiKey);
                                }

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
                                    console.warn('[LINE Webhook] Empty response from AI service.');
                                    const msg = { type: 'text', text: '系統暫時無法處理您的訊息，請稍後再試。' };
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
                    } else if (event.type === 'message' && event.message?.type === 'image') {
                        console.log(`[LINE Webhook] Received image message from linked user`);
                        console.log(`[LINE Webhook] Event details:`, JSON.stringify({
                            messageId: event.message?.id,
                            messageType: event.message?.type,
                            timestamp: event.timestamp,
                            hasChannelToken: !!channelAccessToken,
                            tokenLength: channelAccessToken?.length || 0
                        }));

                        const messageId = event.message.id;
                        try {
                            console.log(`[LINE Webhook] Attempting to download image with messageId: ${messageId}`);
                            
                            // Validate token
                            if (!channelAccessToken) {
                                console.error('[LINE Webhook] Channel Access Token is missing!');
                                const msg = { type: 'text', text: '系統設定錯誤：缺少 LINE Channel Access Token。' };
                                if (isSimulation) simulationReplies.push(msg);
                                else await replyToLine(replyToken, [msg], channelAccessToken);
                                continue;
                            }
                            
                            // Use LINE's configured linkedServiceId if available, otherwise fallback
                            const aiIntegration = await getAIIntegrationByLinkedId(appInfo.config?.linkedServiceId);

                            if (!aiIntegration || !aiIntegration.config?.apiKey) {
                                const logId = `ai-missing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                                await logToWebhook({
                                    integrationId,
                                    timestamp: Date.now(),
                                    logId,
                                    level: 'ERROR',
                                    category: 'image_analysis',
                                    message: 'No active AI service available for image analysis',
                                    context: {
                                        linkedServiceId: appInfo.config?.linkedServiceId,
                                        aiIntegrationFound: !!aiIntegration,
                                        aiType: aiIntegration?.type,
                                        userLineUid: lineUid,
                                        messageId
                                    }
                                });
                                const msg = { type: 'text', text: '圖片辨識功能尚未啟用，請稍後再試。' };
                                if (isSimulation) simulationReplies.push(msg);
                                else await replyToLine(replyToken, [msg], channelAccessToken);
                            } else {
                                // Download image from LINE
                                const downloadLogId = `img-download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                                await logToWebhook({
                                    integrationId,
                                    timestamp: Date.now(),
                                    logId: downloadLogId,
                                    level: 'INFO',
                                    category: 'image_download',
                                    message: `Starting image download for messageId: ${messageId}`,
                                    context: { messageId, aiType: aiIntegration.type }
                                });
                                const imageBuffer = await downloadLineImage(messageId, channelAccessToken);

                                if (!imageBuffer) {
                                    const failLogId = `img-fail-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                                    await logToWebhook({
                                        integrationId,
                                        timestamp: Date.now(),
                                        logId: failLogId,
                                        level: 'ERROR',
                                        category: 'image_download_failed',
                                        message: `Failed to download image for messageId: ${messageId}`,
                                        context: {
                                            messageId,
                                            userLineUid: lineUid,
                                            tokenLength: channelAccessToken?.length,
                                            tokenStarts: channelAccessToken?.substring(0, 5) + '...',
                                            replyToken,
                                            timestamp: new Date().toISOString()
                                        }
                                    });
                                    const msg = { type: 'text', text: '無法下載圖片，請重新上傳。(err: download_failed)' };
                                    if (isSimulation) simulationReplies.push(msg);
                                    else await replyToLine(replyToken, [msg], channelAccessToken);
                                } else {
                                    const successLogId = `img-success-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                                    await logToWebhook({
                                        integrationId,
                                        timestamp: Date.now(),
                                        logId: successLogId,
                                        level: 'INFO',
                                        category: 'image_downloaded',
                                        message: `Successfully downloaded image. Buffer size: ${imageBuffer.length} bytes`,
                                        context: { messageId, bufferSize: imageBuffer.length, aiType: aiIntegration.type }
                                    });
                                    
                                    // Get prompt from config or use default
                                    const customPrompt = appInfo.config?.learningContentAnalysisPrompt || LEARNING_CONTENT_ANALYSIS_PROMPT;
                                    
                                    // Analyze image with configured AI service
                                    const analysisResult = await analyzeImageWithVisionAPI(imageBuffer, aiIntegration, customPrompt);

                                    if (analysisResult) {
                                        const analysisLogId = `img-analyzed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                                        await logToWebhook({
                                            integrationId,
                                            timestamp: Date.now(),
                                            logId: analysisLogId,
                                            level: 'INFO',
                                            category: 'image_analysis_success',
                                            message: `Image analysis completed successfully`,
                                            context: { messageId, aiType: aiIntegration.type, result: analysisResult }
                                        });
                                        
                                        // Add debug logs for raw response to help investigate truncation
                                        if (analysisResult.raw) {
                                            try {
                                                const rawStr = String(analysisResult.raw || '');
                                                const snippetHead = rawStr.slice(0, 200);
                                                const snippetTail = rawStr.slice(-200);
                                                const rawInfoLogId = `raw-info-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                                                await logToWebhook({
                                                    integrationId,
                                                    timestamp: Date.now(),
                                                    logId: rawInfoLogId,
                                                    level: 'INFO',
                                                    category: 'analysis_raw_debug',
                                                    message: 'analysisResult.raw received; logging length and snippets',
                                                    context: {
                                                        messageId,
                                                        rawLength: rawStr.length,
                                                        head: snippetHead,
                                                        tail: snippetTail
                                                    }
                                                });
                                            } catch (logErr) {
                                                console.error('[LINE Webhook] Failed to log analysisResult.raw debug info:', logErr);
                                            }
                                        }
                                        // Format result into readable message
                                        const responseText = '📚 教材分析結果：\n\n';
                                        const messages: any[] = [];

                                        if (analysisResult.raw) {
                                            // Use a configurable template for the initial user-facing message
                                            const template = appInfo.config?.learningContentAnalysisResponseTemplate || DEFAULT_LEARNING_CONTENT_RESPONSE_TEMPLATE;
                                            const initialInstructions = '目前無法完整解析這張教材圖片，請重新上傳清晰、光線充足且文字完整可見的教材內容。';
                                            const templateData = {
                                                messageId,
                                                timestamp: new Date().toISOString(),
                                                initial_instructions: initialInstructions,
                                                title: analysisResult.title || '未辨識',
                                                summary: analysisResult.summary || '無法產生摘要',
                                                content_type: analysisResult.contentType || 'unknown'
                                            };

                                            const userMsg = renderTemplate(template, templateData);
                                            messages.push({ type: 'text', text: userMsg });

                                            // Send raw response in a separate message(s)
                                            const rawText = String(analysisResult.raw || '');
                                            let formattedRaw = rawText;
                                            try {
                                                const parsed = JSON.parse(rawText);
                                                formattedRaw = JSON.stringify(parsed, null, 2);
                                            } catch (e) {
                                                formattedRaw = rawText;
                                            }

                                            const rawChunks: string[] = [];
                                            let currentChunk = '';
                                            if (formattedRaw.length > 0) {
                                                const lines = formattedRaw.split('\n');
                                                for (const line of lines) {
                                                    if ((currentChunk + line + '\n').length <= 4500) {
                                                        currentChunk += line + '\n';
                                                    } else {
                                                        if (currentChunk) rawChunks.push(currentChunk);
                                                        currentChunk = line + '\n';
                                                    }
                                                }
                                                if (currentChunk) rawChunks.push(currentChunk);
                                            }

                                            function attachHeader(chunk: string, index: number, total: number): string {
                                                const header = total > 1 ? `📄 詳細回應 (${index + 1}/${total}):\n\n` : '📄 詳細回應:\n\n';
                                                return header + '```\n' + chunk + '\n```';
                                            }

                                            rawChunks.forEach((chunk, idx) => {
                                                messages.push({ type: 'text', text: attachHeader(chunk, idx, rawChunks.length) });
                                            });
                                        } else {
                                            // Standard formatted response using template
                                            const template = appInfo.config?.learningContentAnalysisResponseTemplate || DEFAULT_LEARNING_CONTENT_RESPONSE_TEMPLATE;
                                            const templateData = {
                                                messageId,
                                                timestamp: new Date().toISOString(),
                                                initial_instructions: '',
                                                title: analysisResult.title || '未辨識',
                                                summary: analysisResult.summary || '無法產生摘要',
                                                content_type: analysisResult.contentType || 'unknown'
                                            };
                                            const userMsg = renderTemplate(template, templateData) + `\n\n📝 標題：${templateData.title}\n💡 摘要：${templateData.summary}\n📖 類型：${templateData.content_type}\n\n✅ 訊息 ID: ${messageId}`;
                                            messages.push({ type: 'text', text: userMsg });
                                        }

                                        // Send all messages
                                        for (const msg of messages) {
                                            if (msg.text && msg.text.length > 4500) {
                                                // Final safeguard: split any message that's still too long
                                                const chunks = [];
                                                let current = '';
                                                for (let i = 0; i < msg.text.length; i++) {
                                                    current += msg.text[i];
                                                    if (current.length >= 4500) {
                                                        chunks.push({ ...msg, text: current });
                                                        current = '';
                                                    }
                                                }
                                                if (current) chunks.push({ ...msg, text: current });
                                                if (isSimulation) simulationReplies.push(...chunks);
                                                else {
                                                    for (const chunk of chunks) {
                                                        await replyToLine(replyToken, [chunk], channelAccessToken);
                                                    }
                                                }
                                            } else {
                                                if (isSimulation) simulationReplies.push(msg);
                                                else await replyToLine(replyToken, [msg], channelAccessToken);
                                            }
                                        }
                                        
                                        // Message sending handled above
                                    } else {
                                        const analysisFailLogId = `img-analysis-fail-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                                        await logToWebhook({
                                            integrationId,
                                            timestamp: Date.now(),
                                            logId: analysisFailLogId,
                                            level: 'ERROR',
                                            category: 'image_analysis_failed',
                                            message: `Image analysis failed or returned null`,
                                            context: { messageId, aiType: aiIntegration.type, bufferSize: imageBuffer.length }
                                        });
                                        const msg = { type: 'text', text: '抱歉，我們無法成功分析這張教材圖片。請重新上傳清晰且完整入鏡的教材內容。\n\n訊息 ID: ' + messageId };
                                        if (isSimulation) simulationReplies.push(msg);
                                        else await replyToLine(replyToken, [msg], channelAccessToken);
                                    }
                                }
                            }
                        } catch (err: any) {
                            const errorLogId = `img-error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                            await logToWebhook({
                                integrationId,
                                timestamp: Date.now(),
                                logId: errorLogId,
                                level: 'ERROR',
                                category: 'image_processing_exception',
                                message: `Exception during image analysis: ${err?.message}`,
                                context: {
                                    messageId,
                                    userLineUid: lineUid,
                                    errorMessage: err?.message,
                                    errorStack: err?.stack,
                                    timestamp: new Date().toISOString()
                                }
                            });
                            if (err instanceof Error) {
                                console.error('[LINE Webhook] Error stack:', err.stack);
                            }
                            const msg = { type: 'text', text: '圖片分析資料異常，請稍後再試。' };
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

// Debug GET handler for testing image downloads
export async function GET(request: Request, context: { params: Promise<{ integrationId: string }> | { integrationId: string } }) {
    try {
        const params = await context.params;
        const integrationId = params.integrationId;
        
        // Get query parameters for testing
        const url = new URL(request.url);
        const messageId = url.searchParams.get('messageId');
        const testToken = url.searchParams.get('token');
        
        console.log(`[LINE Webhook DEBUG GET] Request for integrationId: ${integrationId}, messageId: ${messageId}`);
        
        if (!messageId) {
            return NextResponse.json({
                error: 'Missing messageId parameter',
                example: '/api/line/webhook/[integrationId]?messageId=abc123&token=YOUR_TOKEN'
            }, { status: 400 });
        }
        
        // Get app config to retrieve token if not provided
        const appInfo = await getAppIntegration(integrationId);
        if (!appInfo || appInfo.type !== 'LINE' || !appInfo.config) {
            return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
        }
        
        const channelAccessToken = testToken || appInfo.config.channelAccessToken;
        if (!channelAccessToken) {
            return NextResponse.json({ error: 'Channel Access Token not configured' }, { status: 500 });
        }
        
        console.log(`[LINE Webhook DEBUG GET] Using token: ${testToken ? 'provided' : 'from config'}`);
        console.log(`[LINE Webhook DEBUG GET] Token first 20 chars: ${channelAccessToken.substring(0, 20)}...`);
        
        // Test both download methods
        const results = {
            messageId,
            tokenUsed: testToken ? 'provided' : 'from_config',
            tokenValidation: {
                exists: !!channelAccessToken,
                length: channelAccessToken.length,
                startsWithExpected: channelAccessToken.startsWith('Y') ? 'Yes (likely valid)' : 'Unknown'
            },
            method1: {
                url: `https://api-data.line.me/v2/bot/message/${messageId}/content`,
                status: null as number | null,
                statusText: null as string | null,
                size: null as number | null,
                error: null as string | null
            },
            method2: {
                url: `https://api.line.me/v2/bot/message/${messageId}/content`,
                status: null as number | null,
                statusText: null as string | null,
                size: null as number | null,
                error: null as string | null
            }
        };
        
        // Try method 1
        try {
            console.log(`[LINE Webhook DEBUG GET] Attempting method 1...`);
            const res1 = await fetch(results.method1.url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${channelAccessToken}`
                },
                cache: 'no-store'
            });
            
            results.method1.status = res1.status;
            results.method1.statusText = res1.statusText;
            
            if (res1.ok) {
                const buffer = await res1.arrayBuffer();
                results.method1.size = buffer.byteLength;
                console.log(`[LINE Webhook DEBUG GET] Method 1 success: ${buffer.byteLength} bytes`);
            } else {
                const errorText = await res1.text().catch(e => 'Could not read error text');
                results.method1.error = errorText.substring(0, 300);
                console.log(`[LINE Webhook DEBUG GET] Method 1 failed: ${res1.status} - ${errorText.substring(0, 100)}`);
            }
        } catch (err: any) {
            results.method1.error = err?.message || String(err);
            console.log(`[LINE Webhook DEBUG GET] Method 1 exception:`, err);
        }
        
        // Try method 2
        try {
            console.log(`[LINE Webhook DEBUG GET] Attempting method 2...`);
            const res2 = await fetch(results.method2.url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${channelAccessToken}`
                },
                cache: 'no-store'
            });
            
            results.method2.status = res2.status;
            results.method2.statusText = res2.statusText;
            
            if (res2.ok) {
                const buffer = await res2.arrayBuffer();
                results.method2.size = buffer.byteLength;
                console.log(`[LINE Webhook DEBUG GET] Method 2 success: ${buffer.byteLength} bytes`);
            } else {
                const errorText = await res2.text().catch(e => 'Could not read error text');
                results.method2.error = errorText.substring(0, 300);
                console.log(`[LINE Webhook DEBUG GET] Method 2 failed: ${res2.status} - ${errorText.substring(0, 100)}`);
            }
        } catch (err: any) {
            results.method2.error = err?.message || String(err);
            console.log(`[LINE Webhook DEBUG GET] Method 2 exception:`, err);
        }
        
        // Summary
        const summary = {
            success: (results.method1.size || results.method2.size) ? true : false,
            successMethod: results.method1.size ? 'Method 1 (api.line.me)' : (results.method2.size ? 'Method 2 (obs.line-scdn.net)' : 'Neither'),
            downloadedBytes: (results.method1.size || results.method2.size) || null
        };
        
        console.log(`[LINE Webhook DEBUG GET] Final result:`, summary);
        
        return NextResponse.json({
            ...results,
            summary
        });
        
    } catch (error: any) {
        console.error('[LINE Webhook DEBUG GET] Error:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            message: error?.message || String(error)
        }, { status: 500 });
    }
}
