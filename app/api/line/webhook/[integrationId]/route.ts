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

// Helper to find active AI service (priority: OPENAI > ANTHROPIC > GEMINI)
async function findActiveAIService() {
    if (useDynamoForApps) {
        for (const type of ['OPENAI', 'ANTHROPIC', 'GEMINI']) {
            const { Items } = await docClient.send(new ScanCommand({
                TableName: APPS_TABLE,
                FilterExpression: '#typ = :type AND #sts = :status',
                ExpressionAttributeNames: { '#typ': 'type', '#sts': 'status' },
                ExpressionAttributeValues: { ':type': type, ':status': 'ACTIVE' }
            }));
            if (Items && Items.length > 0) return Items[0];
        }
    } else {
        const FILE = await resolveDataFile('app-integrations.json');
        if (fs.existsSync(FILE)) {
            const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
            for (const type of ['OPENAI', 'ANTHROPIC', 'GEMINI']) {
                const found = data.find((i: any) => i.type === type && i.status === 'ACTIVE');
                if (found) return found;
            }
        }
    }
    return null;
}

// Helpers to get AI Integration by linkedServiceId or default
async function getAIIntegrationByLinkedId(linkedServiceId?: string) {
    // If linkedServiceId provided, try to fetch it first
    if (linkedServiceId) {
        let linkedIntegration = null;
        
        if (useDynamoForApps) {
            const { Items } = await docClient.send(new ScanCommand({
                TableName: APPS_TABLE,
                FilterExpression: 'integrationId = :id',
                ExpressionAttributeValues: { ':id': linkedServiceId }
            }));
            linkedIntegration = Items && Items.length > 0 ? Items[0] : null;
        } else {
            const FILE = await resolveDataFile('app-integrations.json');
            if (fs.existsSync(FILE)) {
                const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
                linkedIntegration = data.find((i: any) => i.integrationId === linkedServiceId);
            }
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

const DEFAULT_DRUG_ANALYSIS_PROMPT = `
你是一位專業且嚴謹的「AI 數位藥劑師視覺助理」。你的任務是仔細觀察使用者上傳的藥品圖片，並精準萃取出藥品的外觀特徵。

【任務規則】
1. 你只能根據圖片中「真實看到」的特徵進行描述。絕對不可以猜測、推論或捏造圖片中看不清楚的細節。
2. 如果圖片極度模糊、嚴重反光，或者根本不是藥品，請在對應的特徵欄位填寫 "無法辨識"。

【特徵萃取標準】
請分析圖片並回傳以下 JSON 結構：
{
  "shape": "請從以下選項中選擇：圓形、橢圓形、長圓柱形、膠囊形、三角形、方形、多邊形、其他。若無法辨識請填 '無法辨識'。",
  "color": "請辨識藥品的主要顏色。請使用單一基礎顏色描述，例如：白、黃、紅、棕、粉紅、綠、藍、黑、灰。若有雙色請用 '/' 隔開。若無法辨識請填 '無法辨識'。",
  "imprint": "請仔細讀取藥丸表面的『英文、數字或符號刻字』。請區分大小寫，若有空格請保留。若雙面皆有刻字請用 '/' 隔開。若表面平滑無字，請填寫 '無'。若模糊看不清請填 '無法辨識'。",
  "score_line": "請觀察藥丸表面是否有『刻痕』。若有一條直線請填 '一字'，若有十字線請填 '十字'，若無刻痕請填 '無'。"
}

這攸關醫療安全，寧可回傳 "無法辨識"，也絕對不可以使用推測的數值。
`;

// Default response template for LINE messages. Site admins can override per-integration
// using `appInfo.config.drugAnalysisResponseTemplate` via the /apps UI.
const DEFAULT_DRUG_RESPONSE_TEMPLATE = `📸 藥品辨識結果：

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
async function callGeminiText(text: string, apiKey: string): Promise<string | null> {
    const model = 'gemini-2.5-flash';
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text }] }],
                generationConfig: { maxOutputTokens: 4096 }
            })
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (err) {
        console.error('[LINE Webhook] Error calling Gemini text API:', err);
        return null;
    }
}

async function callOpenAIText(text: string, apiKey: string): Promise<string | null> {
    try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4-turbo',
                messages: [{ role: 'user', content: text }],
                max_tokens: 4096
            })
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.choices?.[0]?.message?.content || null;
    } catch (err) {
        console.error('[LINE Webhook] Error calling OpenAI text API:', err);
        return null;
    }
}

async function callAnthropicText(text: string, apiKey: string): Promise<string | null> {
    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 4096,
                messages: [{ role: 'user', content: text }]
            })
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.content?.[0]?.text || null;
    } catch (err) {
        console.error('[LINE Webhook] Error calling Anthropic text API:', err);
        return null;
    }
}

async function analyzeImageWithVisionAPI(imageBuffer: Buffer, aiIntegration: any, prompt: string): Promise<any> {
    const base64Image = imageBuffer.toString('base64');
    const provider = aiIntegration.type;
    const apiKey = aiIntegration.config?.apiKey;

    try {
        if (provider === 'GEMINI') {
            return await analyzeWithGemini(base64Image, apiKey, prompt);
        } else if (provider === 'OPENAI') {
            return await analyzeWithOpenAI(base64Image, apiKey, prompt);
        } else if (provider === 'ANTHROPIC') {
            return await analyzeWithAnthropic(base64Image, apiKey, prompt);
        } else {
            console.error('[LINE Webhook] Unsupported provider:', provider);
            return null;
        }
    } catch (err) {
        console.error(`[LINE Webhook] Error analyzing image with ${provider}:`, err);
        return null;
    }
}

async function analyzeWithGemini(base64Image: string, apiKey: string, prompt: string): Promise<any> {
    console.log('[LINE Webhook] Analyzing image with Gemini Vision...');
    const model = 'gemini-2.5-flash';
    
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
                ]
            }],
            generationConfig: { response_mime_type: 'application/json', maxOutputTokens: 1024 }
        })
    });

    if (!res.ok) {
        console.error('[LINE Webhook] Gemini error:', res.status);
        return null;
    }

    const data = await res.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) return null;
    try {
        if (typeof responseText === 'string') {
            return JSON.parse(responseText);
        }
        return responseText;
    } catch (err) {
        console.warn('[LINE Webhook] Gemini returned non-JSON response; returning raw text', { err: String(err) });
        return { raw: responseText };
    }
}

async function analyzeWithOpenAI(base64Image: string, apiKey: string, prompt: string): Promise<any> {
    console.log('[LINE Webhook] Analyzing image with OpenAI Vision...');
    
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4-turbo-with-vision',
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                ]
            }],
            max_tokens: 1024,
            response_format: { type: "json_object" }
        })
    });

    if (!res.ok) {
        console.error('[LINE Webhook] OpenAI error:', res.status);
        return null;
    }

    const data = await res.json();
    const responseText = data.choices?.[0]?.message?.content;
    if (!responseText) return null;
    try {
        if (typeof responseText === 'string') {
            return JSON.parse(responseText);
        }
        // already an object
        return responseText;
    } catch (err) {
        console.warn('[LINE Webhook] OpenAI returned non-JSON response; returning raw text', { err: String(err) });
        return { raw: responseText };
    }
}

async function analyzeWithAnthropic(base64Image: string, apiKey: string, prompt: string): Promise<any> {
    console.log('[LINE Webhook] Analyzing image with Anthropic Vision...');
    
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
                    { type: 'text', text: prompt }
                ]
            }]
        })
    });

    if (!res.ok) {
        console.error('[LINE Webhook] Anthropic error:', res.status);
        return null;
    }

    const data = await res.json();
    const responseText = data.content?.[0]?.text;
    if (!responseText) return null;
    try {
        if (typeof responseText === 'string') {
            return JSON.parse(responseText);
        }
        return responseText;
    } catch (err) {
        console.warn('[LINE Webhook] Anthropic returned non-JSON response; returning raw text', { err: String(err) });
        return { raw: responseText };
    }
}

// Legacy function for backward compatibility
async function analyzeImageWithGeminiVision(imageBuffer: Buffer, geminiApiKey: string, model: string = 'gemini-2.5-flash', prompt?: string): Promise<any> {
    const geminiIntegration = {
        type: 'GEMINI',
        config: { apiKey: geminiApiKey, models: [model] }
    };
    return analyzeImageWithVisionAPI(imageBuffer, geminiIntegration, prompt || DEFAULT_DRUG_ANALYSIS_PROMPT);
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
                                    const customPrompt = appInfo.config?.drugAnalysisPrompt || DEFAULT_DRUG_ANALYSIS_PROMPT;
                                    
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
                                        let responseText = '📸 藥品辨識結果：\n\n';
                                        let messages: any[] = [];

                                        if (analysisResult.raw) {
                                            // Use a configurable template for the initial user-facing message
                                            const template = appInfo.config?.drugAnalysisResponseTemplate || DEFAULT_DRUG_RESPONSE_TEMPLATE;
                                            const initialInstructions = '抱歉，我們無法以標準格式解析此張照片的結果。請先嘗試下列步驟，再重新上傳：\n1) 拍攝清晰、光線充足的照片；\n2) 藥丸完整置於畫面中央，避免手指或反光遮擋；\n3) 若有刻字，請拍攝近照並確保對焦。';
                                            const templateData = {
                                                messageId,
                                                timestamp: new Date().toISOString(),
                                                initial_instructions: initialInstructions,
                                                shape: analysisResult.shape || '無法辨識',
                                                color: analysisResult.color || '無法辨識',
                                                imprint: analysisResult.imprint || '無',
                                                score_line: analysisResult.score_line || '無'
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
                                            const template = appInfo.config?.drugAnalysisResponseTemplate || DEFAULT_DRUG_RESPONSE_TEMPLATE;
                                            const templateData = {
                                                messageId,
                                                timestamp: new Date().toISOString(),
                                                initial_instructions: '',
                                                shape: analysisResult.shape || '無法辨識',
                                                color: analysisResult.color || '無法辨識',
                                                imprint: analysisResult.imprint || '無',
                                                score_line: analysisResult.score_line || '無'
                                            };
                                            const userMsg = renderTemplate(template, templateData) + `\n\n🔷 形狀：${templateData.shape}\n🔶 顏色：${templateData.color}\n✏️ 刻字：${templateData.imprint}\n📏 刻痕：${templateData.score_line}\n\n✅ 訊息 ID: ${messageId}`;
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
                                        const msg = { type: 'text', text: '抱歉，我們無法成功辨識此張圖片。請依照下列建議重試：\n1) 攝影時確保光線充足且對焦清晰；\n2) 藥品置於畫面中央、整顆入鏡；\n3) 避免反光或手指遮擋；\n4) 若有刻字，請拍攝更接近且清晰的照片。\n\n若多次嘗試仍失敗，請聯絡客服並提供此張圖片與時間，我們會協助處理。\n\n訊息 ID: ' + messageId };
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
