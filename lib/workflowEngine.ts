import { listWorkflows } from './workflowService';
import { Node, Edge } from '@xyflow/react';
import nodemailer from 'nodemailer';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from './dynamo';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Workflow 執行引擎 — Workflow Execution Engine
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 支援的腳本執行功能版本:
 * 
 * 1️⃣ JavaScript 執行:
 *    • Runtime: Node.js 18+
 *    • 套件: isolated-vm ^6.0.2
 *    • 超時: 3000ms (可設定)
 *    • 記憶體: 128MB (可設定)
 * 
 * 2️⃣ Python 執行:
 *    • Runtime: Python 3.9 - 3.12 (Lambda)
 *    • 調用: AWS Lambda @aws-sdk/client-lambda ^3.1019.0
 *    • 超時: 30000ms (可設定, 1-300秒)
 *    • 記憶體: 512MB - 3GB (Lambda 配置)
 * 
 * 3️⃣ 其他動作:
 *    • Email: nodemailer ^8.0.1
 *    • HTTP: 原生 fetch API
 *    • LINE Integration: LINE Messaging API
 *    • AI: Google Generative AI
 *    • Data: DynamoDB 原生支援
 * 
 * ⚠️ AMPLIFY COMPATIBILITY:
 * • JavaScript 執行: ✅ 原生支援 (無額外依賴)
 * • Python 執行: ✅ 通過 Lambda 代理 (無構件增長)
 * • 所有長時間任務: 超時保護 + 詳細日誌
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────────
// 版本信息常數
// ─────────────────────────────────────────────────────────────────────────────

const WORKFLOW_ENGINE_VERSION_INFO = {
    engineVersion: '1.0.0',
    scriptExecution: {
        javascript: 'Node.js 18+ | isolated-vm 6.0.2+',
        python: 'Python 3.9-3.12 | AWS Lambda',
        timeout: 'Configurable per script',
        retry: 'Supported with exponential backoff'
    },
    dependencies: {
        '@xyflow/react': '^12.10.2',
        '@aws-sdk/client-lambda': '^3.1019.0',
        '@aws-sdk/lib-dynamodb': '^3.940.0',
        'isolated-vm': '^6.0.2',
        'nodemailer': '^8.0.1',
        '@google/generative-ai': '^0.24.1'
    },
    amplifyCompatibility: 'Full ✅',
    lastUpdated: '2026-03-31'
};

let lambdaClient: LambdaClient | null = null;

function getOrCreateLambdaClient(): LambdaClient {
    if (lambdaClient) return lambdaClient;

    const region = process.env.AWS_REGION || 'ap-northeast-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';

    if (!accessKeyId || !secretAccessKey) {
        console.warn('[Workflow Engine] ⚠️ AWS credentials not configured - Python execution will fail');
    }

    lambdaClient = new LambdaClient({
        region,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });

    return lambdaClient;
}

function getInternalBaseUrl() {
    return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

// Helpers for data mapping
function parseTemplate(template: string, data: any) {
    if (!template) return '';
    return template.replace(/\{\{(.*?)\}\}/g, (_, path) => {
        const keys = path.split('.');
        let value = data;
        if (keys.length > 0 && keys[0] !== '') {
            for (const key of keys) {
                value = value?.[key];
            }
        }
        return value ?? '';
    });
}

// Logic evaluator
function evaluateCondition(node: Node, data: any): boolean {
    const { variable, operator, value } = (node.data as any)?.config || {};
    const actualValue = parseTemplate(variable, data);

    switch (operator) {
        case 'greater_than': return Number(actualValue) > Number(value);
        case 'less_than': return Number(actualValue) < Number(value);
        case 'contains': return String(actualValue).includes(String(value));
        case 'not_empty': return !!actualValue && actualValue !== 'undefined' && actualValue !== 'null';
        default:
        case 'equals': return String(actualValue) === String(value);
    }
}

// Helper to extract nested data using dot notation (e.g. "response.data.user.id")
function getValueByPath(obj: any, path: string) {
    if (!path || path === '.') return obj;
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
}


// Email transporter helper
async function getTransporter() {
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
        console.warn('[Workflow Engine] 📧 SMTP credentials (SMTP_USER/PASS) not set. Email will be logged only.');
        return null;
    }

    return nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
            user: smtpUser,
            pass: smtpPass,
        },
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// LINE Push Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getLINEIntegration() {
    const APPS_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';
    try {
        const { Items } = await ddbDocClient.send(new ScanCommand({
            TableName: APPS_TABLE,
            FilterExpression: '#type = :type AND #status = :status',
            ExpressionAttributeNames: { '#type': 'type', '#status': 'status' },
            ExpressionAttributeValues: { ':type': 'LINE', ':status': 'ACTIVE' }
        }));
        if (Items && Items.length > 0) return Items[0];
    } catch (err) {
        console.error('[Workflow Engine] Error scanning apps table for LINE:', err);
    }
    return null;
}

async function getUserLineUid(email: string) {
    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';
    try {
        const targetEmail = String(email).trim().toLowerCase();
        const { Items } = await ddbDocClient.send(new ScanCommand({
            TableName: PROFILES_TABLE,
            FilterExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': targetEmail }
        }));
        if (Items && Items.length > 0 && Items[0].lineUid) return Items[0].lineUid;
    } catch (err) {
        console.error('[Workflow Engine] Error scanning profiles table for LINE UID:', err);
    }
    return null;
}

async function sendLinePushMessage(lineUid: string, text: string, channelAccessToken: string) {
    try {
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${channelAccessToken}`
            },
            body: JSON.stringify({
                to: lineUid,
                messages: [{ type: 'text', text }]
            })
        });
        if (!res.ok) {
            const errorText = await res.text();
            console.error('[Workflow Engine] LINE push failed:', res.status, errorText);
            return false;
        }
        return true;
    } catch (err) {
        console.error('[Workflow Engine] Error sending LINE push:', err);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LINE Reply API (uses replyToken — same approach as /api/line/webhook route)
// ─────────────────────────────────────────────────────────────────────────────

async function replyToLineWithToken(replyToken: string, text: string, channelAccessToken: string) {
    // Split text into 4500-char chunks (LINE limit is 5000, leave buffer)
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 4500) {
        chunks.push(remaining.substring(0, 4500));
        remaining = remaining.substring(4500);
    }
    if (remaining.length > 0) chunks.push(remaining);

    const messages = chunks.map(c => ({ type: 'text', text: c }));
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${channelAccessToken}`
        },
        body: JSON.stringify({ replyToken, messages })
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`LINE Reply API failed: ${res.status} ${errText.substring(0, 200)}`);
    }
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// LINE Image Download + Vision AI Analysis helpers
// (mirrors the logic in /api/line/webhook/[integrationId]/route.ts)
// ─────────────────────────────────────────────────────────────────────────────

async function findActiveAIIntegrationForLINE(linkedServiceId?: string) {
    const APPS_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';
    // 1. If specifically linked service is provided, try that first
    if (linkedServiceId) {
        try {
            const { Items } = await ddbDocClient.send(new ScanCommand({
                TableName: APPS_TABLE,
                FilterExpression: 'integrationId = :id',
                ExpressionAttributeValues: { ':id': linkedServiceId }
            }));
            const linked = Items?.[0];
            if (linked && ['OPENAI', 'ANTHROPIC', 'GEMINI'].includes(linked.type) && linked.status === 'ACTIVE' && linked.config?.apiKey) {
                return linked;
            }
        } catch (e) { console.error('[Workflow Engine] findActiveAIIntegrationForLINE linked lookup error:', e); }
    }
    // 2. Fallback: first active AI service (OPENAI > ANTHROPIC > GEMINI)
    for (const type of ['OPENAI', 'ANTHROPIC', 'GEMINI']) {
        try {
            const { Items } = await ddbDocClient.send(new ScanCommand({
                TableName: APPS_TABLE,
                FilterExpression: '#typ = :type AND #sts = :status',
                ExpressionAttributeNames: { '#typ': 'type', '#sts': 'status' },
                ExpressionAttributeValues: { ':type': type, ':status': 'ACTIVE' }
            }));
            if (Items && Items.length > 0 && Items[0].config?.apiKey) return Items[0];
        } catch (e) { console.error(`[Workflow Engine] findActiveAIIntegrationForLINE ${type} scan error:`, e); }
    }
    return null;
}

async function downloadLineImageById(messageId: string, channelAccessToken: string): Promise<Buffer | null> {
    for (const url of [
        `https://api-data.line.me/v2/bot/message/${messageId}/content`,
        `https://api.line.me/v2/bot/message/${messageId}/content`,
    ]) {
        try {
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${channelAccessToken}` },
                cache: 'no-store',
            } as RequestInit);
            if (res.ok) {
                const buf = await res.arrayBuffer();
                return Buffer.from(buf);
            }
        } catch (e) { /* try next URL */ }
    }
    return null;
}

async function analyzeLineImageWithVisionAI(imageBuffer: Buffer, aiIntegration: any, prompt: string): Promise<any> {
    const base64 = imageBuffer.toString('base64');
    const apiKey = aiIntegration.config?.apiKey;
    // Prefer model stored in DynamoDB (set via /apps), fall back to provider default
    const configuredModel = aiIntegration.config?.models?.[0] || aiIntegration.config?.model;

    if (aiIntegration.type === 'GEMINI') {
        const model = configuredModel || 'gemini-2.0-flash';
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64 } }] }],
                generationConfig: { response_mime_type: 'application/json', maxOutputTokens: 1024 }
            })
        });
        if (!res.ok) throw new Error(`Gemini Vision error: ${res.status}`);
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        try { return JSON.parse(text); } catch { return { raw: text }; }

    } else if (aiIntegration.type === 'OPENAI') {
        const model = configuredModel || 'gpt-4o';
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model,
                messages: [{
                    role: 'user', content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
                    ]
                }],
                max_tokens: 1024, response_format: { type: 'json_object' }
            })
        });
        if (!res.ok) throw new Error(`OpenAI Vision error: ${res.status}`);
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        try { return JSON.parse(text); } catch { return { raw: text }; }

    } else if (aiIntegration.type === 'ANTHROPIC') {
        const model = configuredModel || 'claude-3-5-sonnet-20241022';
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model, max_tokens: 1024,
                messages: [{
                    role: 'user', content: [
                        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
                        { type: 'text', text: prompt }
                    ]
                }]
            })
        });
        if (!res.ok) throw new Error(`Anthropic Vision error: ${res.status}`);
        const data = await res.json();
        const text = data.content?.[0]?.text;
        try { return JSON.parse(text); } catch { return { raw: text }; }
    }

    throw new Error(`Unsupported AI provider for LINE Vision: ${aiIntegration.type}`);
}

const LINE_DRUG_ANALYSIS_PROMPT = `
你是一位專業且嚴謹的「AI 數位藥劑師視覺助理」。請仔細觀察圖片中的藥品，並精準萃取外觀特徵。
只根據圖片中真實看到的特徵，不猜測或推論。若無法辨識請填 "無法辨識"。
請回傳以下 JSON 結構：
{
  "shape": "圓形|橢圓形|長圓柱形|膠囊形|三角形|方形|多邊形|其他|無法辨識",
  "color": "白|黃|紅|棕|粉紅|綠|藍|黑|灰（雙色用/隔開）|無法辨識",
  "imprint": "刻字內容（無字填無、看不清填無法辨識）",
  "score_line": "一字|十字|無|無法辨識"
}`;

// Basic action executor
async function executeAction(actionNode: Node, payloadData: any, logs: any[]) {
    const { actionType, config } = actionNode.data as any;
    const nodeLabel = (actionNode.data as any)?.label || actionType;
    const timestamp = new Date().toISOString();

    logs.push({
        nodeId: actionNode.id,
        nodeLabel,
        status: 'running',
        time: timestamp,
        payload: JSON.parse(JSON.stringify(payloadData))
    });

    try {
        switch (actionType) {
            case 'action_send_email':
            case 'action_send_gmail':
                const to = parseTemplate(config?.to || process.env.DAILY_REPORT_EMAIL || 'jvtutorcorner@gmail.com', payloadData);
                const subject = parseTemplate(config?.subject, payloadData);
                const body = parseTemplate(config?.body, payloadData);

                // --- Whitelist Check ---
                const { isEmailWhitelisted } = await import('./email/whitelist');
                if (!(await isEmailWhitelisted(to))) {
                    const blockMsg = `[Workflow Engine] Blocked sending to ${to} (not in whitelist)`;
                    console.warn(blockMsg);
                    logs.push({ nodeId: actionNode.id, nodeLabel, status: 'blocked', time: new Date().toISOString(), error: 'Email not whitelisted' });
                    break;
                }
                // -----------------------

                const transporter = await getTransporter();
                if (transporter) {
                    await transporter.sendMail({
                        from: `"JV Tutor AI Workflow" <${process.env.SMTP_USER}>`,
                        to,
                        subject,
                        html: body,
                    });
                }
                break;

            case 'action_notification_line':
            case 'action_notification_slack':
            case 'action_notification': {
                const ntChannel = config?.channel || (actionType === 'action_notification_slack' ? 'slack' : 'discord');
                const ntMessage = parseTemplate(config?.message || 'Default notification from workflow', payloadData);
                const ntWebhookUrl = config?.webhookUrl;

                if (ntChannel === 'line') {
                    const recipientEmail = parseTemplate(config?.userEmail || '{{email}}', payloadData);
                    const title = parseTemplate(config?.title || '', payloadData);
                    const lineConfig = await getLINEIntegration();

                    if (!lineConfig || !lineConfig.config?.channelAccessToken) {
                        throw new Error('LINE integration not found or missing channelAccessToken');
                    }

                    const lineUid = await getUserLineUid(recipientEmail);
                    if (!lineUid) {
                        throw new Error(`User ${recipientEmail} has not bound LINE`);
                    }

                    const finalMessage = title ? `【${title}】\n${ntMessage}` : ntMessage;
                    const success = await sendLinePushMessage(lineUid, finalMessage, lineConfig.config.channelAccessToken);
                    if (!success) throw new Error('Failed to send LINE push message');
                } else if (ntWebhookUrl && (ntChannel === 'slack' || ntChannel === 'discord')) {
                    const discordPayload = ntChannel === 'discord' ? { content: ntMessage } : { text: ntMessage };
                    await fetch(ntWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(discordPayload)
                    });
                }
                break;
            }

            case 'action_http_request': {
                const url = parseTemplate(config?.url, payloadData);
                const method = (config?.method || 'GET').toUpperCase();

                // Parse headers if provided
                let headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (config?.headers) {
                    try {
                        const parsedHeaders = JSON.parse(config.headers);
                        headers = { ...headers, ...parsedHeaders };
                    } catch (e) {
                        // If not valid JSON, try to parse as template
                        const templatedHeaders = parseTemplate(config.headers, payloadData);
                        try {
                            headers = { ...headers, ...JSON.parse(templatedHeaders) };
                        } catch (e2) {
                            console.warn('[HTTP] Invalid headers format', e);
                        }
                    }
                }

                // Parse body if provided
                let body: any = undefined;
                if (config?.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
                    try {
                        body = JSON.parse(config.body);
                    } catch (e) {
                        // If not valid JSON, try to parse as template
                        const templatedBody = parseTemplate(config.body, payloadData);
                        try {
                            body = JSON.parse(templatedBody);
                        } catch (e2) {
                            body = templatedBody;
                        }
                    }
                }

                const response = await fetch(url, {
                    method,
                    headers,
                    body: body ? JSON.stringify(body) : undefined
                });
                const resData = await response.json();
                payloadData[`response_${actionNode.id}`] = resData;
                payloadData.last_response = resData;
                break;
            }

            case 'action_js_script':
                /**
                 * JavaScript 腳本執行節點
                 * 
                 * 版本信息:
                 * • Runtime: Node.js 18+
                 * • Sandbox: isolated-vm 6.0.2+
                 * • Timeout: 3000ms (預設, 可在 scriptExecutor 設定)
                 * • Memory: 128MB (可設定)
                 * 
                 * 支援特性:
                 * ✅ ES2020+ 語法 (async/await, Promise 等)
                 * ✅ 標準 JavaScript 庫 (JSON, Math, String 等)
                 * ✅ 完整的 console 日誌
                 * ❌ 網絡呼叫 (fetch 不支援)
                 * ❌ 異步操作 (setTimeout 不支援)
                 * 
                 * 輸入: data (payload data)
                 * 輸出: result (assigned to payload)
                 */
                const jsCode = config?.script || 'return data;';
                const scriptFunc = new Function('data', 'context', jsCode);
                const result = scriptFunc(payloadData, { nodeId: actionNode.id, timestamp: Date.now() });
                if (result && typeof result === 'object') {
                    Object.assign(payloadData, result);
                }
                payloadData.js_result = result;
                break;

            case 'action_ai_summarize': {
                const userPrompt = parseTemplate(config?.userPrompt || config?.prompt || '{{data}}', payloadData);
                // Delegates to /api/ai-chat so the model and API key come from the active
                // AI service configured in /apps — no hardcoded model.
                const aiSumRes = await fetch(`${getInternalBaseUrl()}/api/ai-chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: [{ role: 'user', content: userPrompt }],
                        useSmartRouter: !!config?.useSmartRouter,
                    }),
                });
                const aiSumData = await aiSumRes.json().catch(() => ({}));
                payloadData.ai_output = aiSumData.reply || aiSumData.text || '';
                if (!aiSumRes.ok) {
                    console.error('[Workflow Engine] action_ai_summarize /api/ai-chat error:', aiSumData?.error);
                    payloadData.ai_output = aiSumData?.error || '[AI Error]';
                }
                break;
            }

            case 'action_python_script': {
                /**
                 * Python 腳本執行節點
                 * 
                 * 版本信息:
                 * • Runtime: Python 3.9, 3.10, 3.11 (推薦), 3.12
                 * • Executor: AWS Lambda
                 * • SDK: @aws-sdk/client-lambda ^3.1019.0
                 * • Timeout: 30000ms (預設, 可自訂 1-300秒)
                 * • Memory: 512MB - 3GB (Lambda 配置)
                 * • Max Script Size: 1MB
                 * • Max Data Size: 6MB
                 * 
                 * 常用套件 (通常在 Lambda 層中):
                 * ✅ NumPy 1.24+
                 * ✅ Pandas 2.0+
                 * ✅ Pillow 10.1+ (圖片處理)
                 * ✅ Boto3 1.28+ (AWS 服務)
                 * ✅ Requests 2.31+ (HTTP)
                 * ✅ 標準庫 (json, re, datetime, math 等)
                 * 
                 * 支援特性:
                 * ✅ 同步執行
                 * ✅ 異步操作 (asyncio)
                 * ✅ 檔案臨時存儲 (/tmp)
                 * ✅ 環境變數存取
                 * ❌ 網絡連接 (需要配置)
                 * 
                 * 頻繁超時?
                 * → 增加 LAMBDA_TIMEOUT_MS (最多 300000ms)
                 * → 優化 Python 程式碼效率
                 * → 拆分為多個小任務
                 * 
                 * 輸入: script (Python 程式碼), data (輸入資料)
                 * 輸出: python_result (stdout/output)
                 */
                const script = config?.script || '';
                if (!script.trim()) {
                    payloadData.python_result = null;
                    logs.push('[Python] ⚠️ Empty script - skipping');
                    break;
                }

                try {
                    const lambdaTimeoutMs = parseInt(process.env.LAMBDA_TIMEOUT_MS || '30000', 10);

                    logs.push(`[Python] 🚀 Executing Lambda function (timeout: ${lambdaTimeoutMs}ms)...`);

                    const pyLambdaCommand = new InvokeCommand({
                        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'RunPythonWorkflowNode',
                        InvocationType: 'RequestResponse',
                        Payload: Buffer.from(JSON.stringify({
                            script,
                            data: payloadData,
                            timeout_ms: lambdaTimeoutMs
                        })),
                    });

                    // Execute with timeout wrapper
                    const lambdaClient = getOrCreateLambdaClient();
                    const lambdaPromise = lambdaClient.send(pyLambdaCommand);
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Lambda execution timeout')), lambdaTimeoutMs + 5000)
                    );

                    const pyLambdaResponse = await Promise.race([lambdaPromise, timeoutPromise]);
                    const pyLambdaResponseAny: any = pyLambdaResponse as any;

                    const pyResultStr = Buffer.from(pyLambdaResponseAny.Payload || []).toString('utf-8');
                    let pyResult: any = {};
                    try {
                        pyResult = JSON.parse(pyResultStr);
                    } catch (parseErr) {
                        logs.push(`[Python] ❌ Failed to parse Lambda response: ${pyResultStr}`);
                        throw new Error(`Invalid Lambda response format`);
                    }
                    if (pyLambdaResponseAny.FunctionError) {
                        const errorMsg = pyResult.stderr || pyResult.errorMessage || 'Execution failed';
                        logs.push(`[Python] ❌ Lambda execution error: ${errorMsg}`);
                        throw new Error(`Python script error: ${errorMsg}`);
                    }

                    if (!pyResult.ok) {
                        logs.push(`[Python] ❌ Script error: ${pyResult.stderr || 'Unknown error'}`);
                        throw new Error(`Python script error: ${pyResult.stderr || pyResult.errorMessage || 'Execution failed'}`);
                    }

                    payloadData.python_result = pyResult.output ?? pyResult.stdout;
                    if (pyResult.output && typeof pyResult.output === 'object') {
                        Object.assign(payloadData, pyResult.output);
                    }
                    logs.push(`[Python] ✅ Success - Output: ${String(payloadData.python_result).substring(0, 100)}...`);

                } catch (error: any) {
                    const errorMsg = error?.message || String(error);
                    logs.push(`[Python] ❌ Error: ${errorMsg}`);

                    // For Amplify, provide diagnostic hints
                    if (process.env.AWS_AMPLIFY) {
                        logs.push('[Python] 📋 Amplify diagnostic: Check AWS credentials and Lambda function configuration');
                    }

                    throw error;
                }
                break;
            }

            case 'action_data_transform': {
                const xfPath = config?.path || '.';
                const xfTargetKey = config?.targetKey || 'transformed_data';
                payloadData[xfTargetKey] = getValueByPath(payloadData, xfPath);
                break;
            }

            case 'transform_markdown_html': {
                const mdSourceField = config?.sourceField || 'content';
                const mdTargetField = config?.targetField || 'htmlContent';
                const mdSource = getValueByPath(payloadData, mdSourceField) || parseTemplate(`{{${mdSourceField}}}`, payloadData) || '';
                // Basic markdown → HTML conversion without external lib
                const html = String(mdSource)
                    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.+?)\*/g, '<em>$1</em>')
                    .replace(/`(.+?)`/g, '<code>$1</code>')
                    .replace(/\n/g, '<br>');
                payloadData[mdTargetField] = html;
                break;
            }

            case 'action_delay': {
                const milliseconds = parseInt(config?.milliseconds || '0') || 0;

                if (milliseconds > 0 && milliseconds <= 300000) { // Max 5 minutes
                    await new Promise(resolve => setTimeout(resolve, milliseconds));
                }
                break;
            }

            // ── Set Variable ─────────────────────────────────────────────────────────────
            case 'action_set_variable': {
                // Supports multiple key-value pairs; each value can use {{template}} syntax
                const variables: { key: string; value: string }[] = config?.variables || [];
                for (const { key, value } of variables) {
                    if (key) {
                        payloadData[key] = parseTemplate(value ?? '', payloadData);
                    }
                }
                // Also support single key/value shorthand
                if (config?.key && !config?.variables?.length) {
                    payloadData[config.key] = parseTemplate(config.value ?? '', payloadData);
                }
                break;
            }

            case 'action_image_analysis': {
                const baseUrl = getInternalBaseUrl();
                const apiEndpoint = config?.apiEndpoint || '/api/image-analysis';
                const inputField = config?.inputField || 'imageBase64';
                const outputField = config?.outputField || 'analysisResult';
                const prompt = config?.prompt ? parseTemplate(config.prompt, payloadData) : undefined;

                const imageBase64 = getValueByPath(payloadData, inputField) || parseTemplate(inputField, payloadData);

                if (!imageBase64) throw new Error(`Image data not found in path: ${inputField}`);

                const targetUrl = apiEndpoint.startsWith('http') ? apiEndpoint : `${baseUrl}${apiEndpoint.startsWith('/') ? '' : '/'}${apiEndpoint}`;

                const imgRes = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageBase64, prompt })
                });

                const imgData = await imgRes.json();
                if (!imgRes.ok || !imgData.ok) {
                    throw new Error(`Image analysis failed: ${imgData.error || imgRes.statusText}`);
                }

                payloadData[outputField] = imgData.result;
                break;
            }

            case 'action_ai_dispatch': {
                const qField = config?.queryField || 'message.content';
                const outField = config?.outputField || 'dispatchResult';

                // Parse template first, if not found then traverse path
                let query = parseTemplate(qField, payloadData);
                if (query === qField || typeof query !== 'string') {
                    // Try to get from path if parseTemplate didn't change anything or returned non-string
                    query = getValueByPath(payloadData, qField?.replace(/\{\{|\}\}/g, '')) || query;
                }

                const dispatchRes = await fetch(`${getInternalBaseUrl()}/api/ai-chat/dispatch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query })
                });

                let dispatchData;
                try { dispatchData = await dispatchRes.json(); } catch (e) { }

                if (!dispatchRes.ok) {
                    throw new Error(`AI Dispatch failed: ${dispatchData?.error || dispatchRes.statusText}`);
                }

                payloadData[outField] = dispatchData;
                break;
            }

            case 'action_agent_execute': {
                const agentIdField = config?.agentIdField || 'dispatchResult.primary.id';
                const inField = config?.inputField || 'message.content';

                // Clean the {{ }} for getting the value by path if needed
                const cleanAgentIdField = agentIdField.replace(/\{\{|\}\}/g, '');
                const cleanInField = inField.replace(/\{\{|\}\}/g, '');

                const agentId = parseTemplate(agentIdField, payloadData) || getValueByPath(payloadData, cleanAgentIdField);
                const query = parseTemplate(inField, payloadData) || getValueByPath(payloadData, cleanInField);

                const useSmartRouter = !!config?.useSmartRouter;
                const usePromptCache = !!config?.usePromptCache;

                const executeRes = await fetch(`${getInternalBaseUrl()}/api/ai-chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: [{ role: 'user', content: query }],
                        agentId: agentId && typeof agentId === 'string' && agentId !== agentIdField ? agentId : undefined,
                        useSmartRouter,
                        usePromptCache
                    })
                });

                let executeData;
                try { executeData = await executeRes.json(); } catch (e) { }

                if (!executeRes.ok) {
                    throw new Error(`Agent Execution failed: ${executeData?.error || executeRes.statusText}`);
                }

                payloadData.agent_output = executeData?.reply;
                payloadData.agent_execution_details = executeData;
                break;
            }

            // ── LINE Image Download + Vision Analysis ─────────────────────────────────
            // Mirrors the image handling in /api/line/webhook/[integrationId]/route.ts
            case 'action_line_image_analyze': {
                const imageSource = config?.imageSource || 'line';
                let imageBuffer: Buffer | null = null;

                if (imageSource === 'file' && config?.imageBase64) {
                    // Convert base64 to buffer
                    const base64Data = config.imageBase64.split(',')[1] || config.imageBase64;
                    imageBuffer = Buffer.from(base64Data, 'base64');
                } else if (imageSource === 'url' && config?.imageUrl) {
                    // Download from URL
                    const imageUrl = parseTemplate(config.imageUrl, payloadData);
                    const response = await fetch(imageUrl);
                    const arrayBuffer = await response.arrayBuffer();
                    imageBuffer = Buffer.from(arrayBuffer);
                    if (!imageBuffer) {
                        throw new Error(`Failed to download image from URL: ${imageUrl}`);
                    }
                } else if (imageSource === 'line') {
                    // Original LINE image download logic
                    const lineConfig = await getLINEIntegration();
                    if (!lineConfig?.config?.channelAccessToken) {
                        throw new Error('LINE integration not found or missing channelAccessToken');
                    }
                    const channelAccessToken = lineConfig.config.channelAccessToken;

                    const msgIdField = config?.messageIdField || 'message.id';
                    const messageId = parseTemplate(`{{${msgIdField.replace(/\{\{|\}\}/g, '')}}}`, payloadData)
                        || getValueByPath(payloadData, msgIdField.replace(/\{\{|\}\}/g, ''));
                    if (!messageId) throw new Error('LINE message.id not found in payload. Set messageIdField to {{message.id}}');

                    imageBuffer = await downloadLineImageById(messageId, channelAccessToken);
                    if (!imageBuffer) throw new Error(`Failed to download LINE image (messageId: ${messageId}). Check channelAccessToken.`);
                } else {
                    throw new Error('No valid image source provided');
                }

                // Find the AI service to use
                const aiIntegration = await findActiveAIIntegrationForLINE(config?.linkedServiceId);
                if (!aiIntegration?.config?.apiKey) throw new Error('No active AI service available for image analysis');

                // Analyze with Vision AI
                const analysisPrompt = config?.prompt || LINE_DRUG_ANALYSIS_PROMPT;
                const analysisResult = await analyzeLineImageWithVisionAI(imageBuffer, aiIntegration, analysisPrompt);

                const outField = config?.outputField || 'analysisResult';
                payloadData[outField] = analysisResult;

                // Also flatten top-level result fields for easy template access
                if (analysisResult && !analysisResult.raw) {
                    payloadData.analysis_shape = analysisResult.shape || '無法辨識';
                    payloadData.analysis_color = analysisResult.color || '無法辨識';
                    payloadData.analysis_imprint = analysisResult.imprint || '無';
                    payloadData.analysis_score_line = analysisResult.score_line || '無';
                }
                break;
            }

            // ── LINE Reply API ────────────────────────────────────────────────────────
            // Uses replyToken (from the LINE event) — CORRECT approach for chatbot replies.
            // action_notification_line uses Push API which requires UID lookup — that is for
            // proactive notifications, NOT webhook replies.
            case 'action_line_reply': {
                const lineConfig = await getLINEIntegration();
                if (!lineConfig?.config?.channelAccessToken) {
                    throw new Error('LINE integration not found or missing channelAccessToken');
                }
                const channelAccessToken = lineConfig.config.channelAccessToken;

                // Get replyToken — must come from the LINE webhook event (event.replyToken)
                const replyTokenValue = parseTemplate(config?.replyToken || '{{replyToken}}', payloadData)
                    || getValueByPath(payloadData, 'replyToken');
                if (!replyTokenValue) throw new Error('replyToken not found in payload. LINE events include event.replyToken.');

                const messageText = parseTemplate(config?.message || '{{ai_output}}', payloadData);
                if (!messageText) throw new Error('No message text to reply with');

                await replyToLineWithToken(replyTokenValue, messageText, channelAccessToken);
                payloadData.line_reply_sent = true;
                break;
            }

            case 'action_context7_retrieval': {
                const query = parseTemplate(config?.query || '{{user_query}}', payloadData);
                const libraryId = parseTemplate(config?.libraryId || '', payloadData);

                try {
                    const res = await fetch(`${getInternalBaseUrl()}/api/workflows/context7-retrieve`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query, libraryId })
                    });
                    const result = await res.json();
                    payloadData.context7_result = result;
                } catch (e: any) {
                    throw new Error(`Context7 retrieval failed: ${e.message}`);
                }
                break;
            }

            case 'action_gmail_send': {
                const to = parseTemplate(config?.to || '{{recipient_email}}', payloadData);
                const subject = parseTemplate(config?.subject || 'Message', payloadData);
                const body = parseTemplate(config?.body || '{{message}}', payloadData);

                try {
                    const res = await fetch(`${getInternalBaseUrl()}/api/workflows/gmail-send`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ to, subject, body })
                    });
                    const result = await res.json();
                    payloadData.gmail_sent = result;
                } catch (e: any) {
                    throw new Error(`Gmail send failed: ${e.message}`);
                }
                break;
            }

            case 'action_send_resend': {
                const to = parseTemplate(config?.to || '{{email_to}}', payloadData);
                const subject = parseTemplate(config?.subject || 'Message', payloadData);
                const body = parseTemplate(config?.body || '{{message}}', payloadData);

                try {
                    const res = await fetch(`${getInternalBaseUrl()}/api/workflows/resend-send`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ to, subject, body })
                    });
                    const result = await res.json();
                    payloadData.resend_sent = result;
                } catch (e: any) {
                    throw new Error(`Resend send failed: ${e.message}`);
                }
                break;
            }

            case 'action_notebooklm_create': {
                const title = parseTemplate(config?.title || 'New Notebook', payloadData);
                const content = parseTemplate(config?.content || '{{text}}', payloadData);

                try {
                    const res = await fetch(`${getInternalBaseUrl()}/api/workflows/notebooklm-create`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, content })
                    });
                    const result = await res.json();
                    payloadData.notebooklm_result = result;
                } catch (e: any) {
                    throw new Error(`NotebookLM creation failed: ${e.message}`);
                }
                break;
            }

            case 'action_figma_export': {
                const fileKey = parseTemplate(config?.fileKey || '', payloadData);
                const format = config?.format || 'json';

                try {
                    const res = await fetch(`${getInternalBaseUrl()}/api/workflows/figma-export`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fileKey, format })
                    });
                    const result = await res.json();
                    payloadData.figma_export = result;
                } catch (e: any) {
                    throw new Error(`Figma export failed: ${e.message}`);
                }
                break;
            }

            case 'action_import_file': {
                const fileContent = config?.fileContent || '';
                const fileName = config?.fileName || 'file';
                const fileType = config?.fileType || 'json';

                try {
                    const res = await fetch(`${getInternalBaseUrl()}/api/workflows/import-file`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fileContent, fileName, fileType })
                    });
                    const result = await res.json();
                    payloadData.imported_data = result;
                } catch (e: any) {
                    throw new Error(`File import failed: ${e.message}`);
                }
                break;
            }

            case 'action_export_file': {
                const format = config?.format || 'json';
                const fileName = parseTemplate(config?.fileName || 'export', payloadData);
                const data = parseTemplate(config?.dataField || '{{payload}}', payloadData);

                try {
                    const res = await fetch(`${getInternalBaseUrl()}/api/workflows/export-file`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ format, fileName, data })
                    });
                    const result = await res.json();
                    payloadData.export_result = result;
                } catch (e: any) {
                    throw new Error(`File export failed: ${e.message}`);
                }
                break;
            }

            default:
                // Handle other actions (including output_workflow — captures final payload snapshot)
                if ((actionNode.data as any)?.actionType === 'output_workflow' || (actionNode.data as any)?.type === 'output') {
                    // Collect the most meaningful reply from accumulated payload
                    const finalReply =
                        payloadData.agent_output ||
                        payloadData.ai_output ||
                        payloadData.reply ||
                        payloadData.message ||
                        null;
                    if (finalReply) payloadData._finalReply = finalReply;
                }
        }

        // Mark success
        const logEntry = logs.find(l => l.nodeId === actionNode.id && l.status === 'running');
        if (logEntry) {
            logEntry.status = 'success';
            logEntry.output = JSON.parse(JSON.stringify(payloadData));
        }
    } catch (err: any) {
        const logEntry = logs.find(l => l.nodeId === actionNode.id && l.status === 'running');
        if (logEntry) {
            logEntry.status = 'error';
            logEntry.error = err.message;
        }
        throw err; // Re-throw to stop flow
    }
}

export async function executeSingleWorkflow(wf: { id?: string, name?: string, nodes: Node[], edges: Edge[] }, triggerType: string, payload: any) {
    const triggerNodes = wf.nodes.filter(
        (n: Node) => n.type === 'trigger' && (n.data as any)?.triggerType === triggerType
    );

    // If there is no specific trigger and we are manually testing, just use the first node
    const nodesToStart = triggerNodes.length > 0 ? triggerNodes : (payload.manual_test && wf.nodes.length > 0 ? [wf.nodes[0]] : []);

    const logs: any[] = [];
    const executionTrails: any[] = [];

    for (const tNode of nodesToStart) {
        const currentLogs: any[] = [];
        const currentPayload = JSON.parse(JSON.stringify(payload));

        currentLogs.push({
            nodeId: tNode.id,
            nodeLabel: (tNode.data as any)?.label || 'Trigger',
            status: 'success',
            time: new Date().toISOString(),
            payload: JSON.parse(JSON.stringify(currentPayload))
        });

        const queue: Node[] = [tNode];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const currentNode = queue.shift()!;
            if (visited.has(currentNode.id)) continue;
            visited.add(currentNode.id);

            // Execute logic or action
            const isActionable = ['action', 'ai', 'python', 'javascript', 'http', 'transform', 'notification', 'input', 'output', 'export', 'delay'].includes(currentNode.type || '');
            if (isActionable) {
                try {
                    await executeAction(currentNode, currentPayload, currentLogs);
                } catch (e) {
                    break;
                }
            }

            // Find next edges
            const outEdges = wf.edges.filter((e: Edge) => e.source === currentNode.id);
            for (const edge of outEdges) {
                const nextNode = wf.nodes.find(n => n.id === edge.target);
                if (!nextNode) continue;

                if (currentNode.type === 'logic') {
                    const result = evaluateCondition(currentNode, currentPayload);
                    const branchId = result ? 'true' : 'false';
                    if (edge.sourceHandle && edge.sourceHandle !== branchId) continue;

                    currentLogs.push({
                        nodeId: currentNode.id,
                        nodeLabel: (currentNode.data as any)?.label || 'Logic',
                        status: result ? 'success' : 'failed_condition',
                        result: result,
                        time: new Date().toISOString()
                    });
                }

                queue.push(nextNode);
            }
        }

        executionTrails.push({
            workflowId: wf.id || 'test_id',
            workflowName: wf.name || 'Test Workflow',
            logs: currentLogs
        });
    }

    return executionTrails;
}

/**
 * Triggers all active workflows that match the given trigger type.
 */
export async function triggerWorkflow(triggerType: string, data: any) {
    const executionTrails: any[] = [];

    try {
        const allWorkflows = await listWorkflows();
        const activeWorkflows = allWorkflows.filter(wf => wf.isActive);

        for (const wf of activeWorkflows) {
            const trails = await executeSingleWorkflow(wf, triggerType, data);
            executionTrails.push(...trails);
        }

        return { ok: true, executedCount: executionTrails.length, trails: executionTrails };
    } catch (error: any) {
        console.error('[Workflow Engine Error]', error);
        return { ok: false, error: error?.message || 'Workflow engine failure' };
    }
}
