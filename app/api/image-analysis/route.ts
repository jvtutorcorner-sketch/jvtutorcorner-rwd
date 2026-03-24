import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
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

const useDynamoForApps =
    typeof APPS_TABLE === 'string' && APPS_TABLE.length > 0 &&
    (process.env.NODE_ENV === 'production' || !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

const DRUG_ANALYSIS_PROMPT = `
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

// Helper to get AI integration (fallback priority: OPENAI > ANTHROPIC > GEMINI)
async function getAIIntegration(): Promise<any> {
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

// Multi-provider image analysis
async function analyzeImageWithProvider(imageBase64: string, aiIntegration: any): Promise<any> {
    const provider = aiIntegration.type;
    const apiKey = aiIntegration.config?.apiKey;

    try {
        if (provider === 'GEMINI') {
            return await analyzeWithGemini(imageBase64, apiKey);
        } else if (provider === 'OPENAI') {
            return await analyzeWithOpenAI(imageBase64, apiKey);
        } else if (provider === 'ANTHROPIC') {
            return await analyzeWithAnthropic(imageBase64, apiKey);
        }
    } catch (err) {
        console.error(`[Image Analysis] Error with ${provider}:`, err);
    }
    return null;
}

async function analyzeWithGemini(imageBase64: string, apiKey: string): Promise<any> {
    console.log('[Image Analysis] Using Gemini Vision...');
    const model = 'gemini-2.5-flash';
    
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: DRUG_ANALYSIS_PROMPT },
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

async function analyzeWithOpenAI(imageBase64: string, apiKey: string): Promise<any> {
    console.log('[Image Analysis] Using OpenAI Vision...');
    
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
                    { type: 'text', text: DRUG_ANALYSIS_PROMPT },
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

async function analyzeWithAnthropic(imageBase64: string, apiKey: string): Promise<any> {
    console.log('[Image Analysis] Using Anthropic Vision...');
    
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
                    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
                    { type: 'text', text: DRUG_ANALYSIS_PROMPT }
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

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { imageBase64 } = body;

        if (!imageBase64) {
            return NextResponse.json({ error: '缺少 imageBase64' }, { status: 400 });
        }

        // Get AI integration (supports multiple providers)
        const aiIntegration = await getAIIntegration();

        if (!aiIntegration || !aiIntegration.config?.apiKey) {
            return NextResponse.json({ error: '圖片辨識功能尚未啟用' }, { status: 503 });
        }

        // Analyze image with configured provider
        const result = await analyzeImageWithProvider(imageBase64, aiIntegration);

        if (result) {
            return NextResponse.json({
                ok: true,
                result
            });
        } else {
            return NextResponse.json(
                { error: '圖片分析失敗，請重新上傳清晰的藥品圖片。' },
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
}
