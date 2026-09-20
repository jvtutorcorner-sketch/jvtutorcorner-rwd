import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { withAdminOrHmac, type AuthedRequest } from '@/lib/auth/apiGuard';
import { LEARNING_CONTENT_ANALYSIS_PROMPT } from '@/lib/learningContentAnalysis';

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

const useDynamoForApps =
    typeof APPS_TABLE === 'string' && APPS_TABLE.length > 0 &&
    (process.env.NODE_ENV === 'production' || !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

// Helper to get AI integration (fallback priority: OPENAI > ANTHROPIC > GEMINI)
async function getAIIntegration(): Promise<any> {
    if (!useDynamoForApps) {
        console.warn('[Image Analysis] DynamoDB not configured for app integrations.');
        return null;
    }
    const { getFirstActiveOf } = await import('@/lib/integrations/store');
    return getFirstActiveOf(['OPENAI', 'ANTHROPIC', 'GEMINI']);
}

// Multi-provider image analysis
async function analyzeImageWithProvider(imageBase64: string, aiIntegration: any, prompt: string, modelOverride?: string): Promise<any> {
    const provider = aiIntegration.type;
    const apiKey = aiIntegration.config?.apiKey;
    const model = modelOverride || aiIntegration.config?.model;

    try {
        if (provider === 'GEMINI') {
            return await analyzeWithGemini(imageBase64, apiKey, prompt, model);
        } else if (provider === 'OPENAI') {
            return await analyzeWithOpenAI(imageBase64, apiKey, prompt, model);
        } else if (provider === 'ANTHROPIC') {
            return await analyzeWithAnthropic(imageBase64, apiKey, prompt, model);
        }
    } catch (err) {
        console.error(`[Image Analysis] Error with ${provider}:`, err);
    }
    return null;
}

async function analyzeWithGemini(imageBase64: string, apiKey: string, prompt: string, modelOverride?: string): Promise<any> {
    console.log('[Image Analysis] Using Gemini Vision...');
    const model = modelOverride || 'gemini-1.5-flash';
    
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
                ]
            }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2048 }
        })
    });

    if (!res.ok) {
        console.error('[Image Analysis] Gemini error:', res.status, await res.text());
        return null;
    }

    const data = await res.json();
    console.log('[Image Analysis] Gemini response:', JSON.stringify(data, null, 2));
    
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === 'MAX_TOKENS') {
        console.warn('[Image Analysis] Gemini response truncated (MAX_TOKENS reached)');
    }
    
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
        console.error('[Image Analysis] Gemini returned no text:', data);
        return null;
    }
    
    try {
        return JSON.parse(responseText);
    } catch (parseErr: any) {
        console.error('[Image Analysis] Failed to parse Gemini JSON response:', parseErr.message);
        console.error('[Image Analysis] Response text (first 500 chars):', responseText?.substring(0, 500));
        return null;
    }
}

async function analyzeWithOpenAI(imageBase64: string, apiKey: string, prompt: string, modelOverride?: string): Promise<any> {
    console.log('[Image Analysis] Using OpenAI Vision...');
    const model = modelOverride || 'gpt-4o';
    
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                ]
            }],
            max_tokens: 1024,
            response_format: { type: "json_object" }
        })
    });

    if (!res.ok) {
        console.error('[Image Analysis] OpenAI error:', res.status);
        return null;
    }

    const data = await res.json();
    const responseText = data.choices?.[0]?.message?.content;
    return responseText ? JSON.parse(responseText) : null;
}

async function analyzeWithAnthropic(imageBase64: string, apiKey: string, prompt: string, modelOverride?: string): Promise<any> {
    console.log('[Image Analysis] Using Anthropic Vision...');
    const model = modelOverride || 'claude-3-5-sonnet-20241022';
    
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: model,
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
                    { type: 'text', text: prompt + '\n\n請以 JSON 格式回應。' }
                ]
            }]
        })
    });

    if (!res.ok) {
        console.error('[Image Analysis] Anthropic error:', res.status);
        return null;
    }

    const data = await res.json();
    const responseText = data.content?.[0]?.text;
    return responseText ? JSON.parse(responseText) : null;
}

// 先前完全沒有 auth：任何人都能匿名觸發付費的 AI 視覺模型呼叫（OpenAI/Anthropic/Gemini），
// 等同一個公開、無限制的第三方 API 額度濫用管道。工作流程引擎會用 HMAC 呼叫，人類使用者
// 只能透過 /apps 後台（admin）觸發，所以用 withAdminOrHmac。
export const POST = withAdminOrHmac('/api/image-analysis', async (request: AuthedRequest) => {
    try {
        const body = await request.json();
        const { imageBase64, prompt = LEARNING_CONTENT_ANALYSIS_PROMPT, model } = body;

        if (!imageBase64) {
            return NextResponse.json({ error: '缺少 imageBase64' }, { status: 400 });
        }

        // Get AI integration (supports multiple providers)
        const aiIntegration = await getAIIntegration();

        if (!aiIntegration || !aiIntegration.config?.apiKey) {
            return NextResponse.json({ error: '圖片辨識功能尚未啟用' }, { status: 503 });
        }

        // Analyze image with configured provider (and optional model override from request)
        const result = await analyzeImageWithProvider(imageBase64, aiIntegration, prompt, model);

        if (result) {
            return NextResponse.json({
                ok: true,
                result
            });
        } else {
            return NextResponse.json(
                { error: '教材分析失敗，請重新上傳清晰的教材圖片。' },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error('[Image Analysis API] Error:', error);
        return NextResponse.json(
            { error: `系統錯誤: ${error?.message || error}` },
            { status: 500 }
        );
    }
});
