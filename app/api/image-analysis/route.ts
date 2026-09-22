import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { withAdminOrHmac, type AuthedRequest } from '@/lib/auth/apiGuard';
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

const DEFAULT_VISION_MODEL: Record<string, string> = {
    GEMINI: 'gemini-1.5-flash',
    OPENAI: 'gpt-4o',
    ANTHROPIC: 'claude-3-5-sonnet-20241022',
};

// Vision analysis via the AI Gateway: token usage is captured + metered
// (feature 'image-analysis'), with the gateway's timeout/retry. Returns the
// parsed JSON object, or null on any failure (same contract as before).
async function analyzeImageWithProvider(imageBase64: string, aiIntegration: any, prompt: string, modelOverride?: string, requestId?: string): Promise<any> {
    const res = await runWithIntegration(
        { type: aiIntegration.type, config: { apiKey: aiIntegration.config?.apiKey, model: modelOverride || aiIntegration.config?.model } },
        { prompt, images: [{ base64: imageBase64, mimeType: 'image/jpeg' }], jsonMode: true, maxTokens: 2048 },
        { feature: 'image-analysis', requestId, defaultModel: DEFAULT_VISION_MODEL[aiIntegration.type] || 'gpt-4o' }
    );
    if (!res.ok || !res.result.text) {
        if (!res.ok) console.error('[Image Analysis] gateway failed:', res.error);
        return null;
    }
    try {
        return JSON.parse(res.result.text);
    } catch (parseErr: any) {
        console.error('[Image Analysis] Failed to parse JSON response:', parseErr?.message);
        console.error('[Image Analysis] Response text (first 500 chars):', res.result.text.substring(0, 500));
        return null;
    }
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
