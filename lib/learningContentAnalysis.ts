import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

export const LEARNING_CONTENT_ANALYSIS_PROMPT = `
你是線上教學平台的教材分析助理。請分析使用者上傳的教材、講義、題目、圖表、投影片或手寫筆記圖片，只描述圖片中能確認的內容，不要猜測看不清楚的文字。

請回傳合法 JSON，格式如下：
{
  "contentType": "textbook|worksheet|diagram|slide|handwritten_note|other|unknown",
  "title": "圖片中可辨識的教材或主題；無法辨識時填空字串",
  "summary": "用繁體中文整理這張教材圖片的學習重點",
  "extractedText": "可清楚讀取的文字；不確定的片段省略",
  "keyConcepts": ["概念一", "概念二"],
  "difficulty": "beginner|intermediate|advanced|unknown",
  "suggestedQuestions": [
    { "question": "一個可用來檢核理解的問題", "answerHint": "根據圖片可得到的答案提示" }
  ],
  "confidence": "high|medium|low"
}

規則：
1. 圖片模糊、不是教材或無法判斷時，使用 unknown／空陣列，不要捏造答案。
2. 不要提供醫療、法律或其他專業診斷；只做教學內容整理與學習檢核建議。
3. extractedText 只保留實際看得到的文字，無法辨識的內容不要補寫。
4. suggestedQuestions 最多 3 題，若內容不足可以回傳空陣列。
`;

type AIIntegration = {
  type: string;
  config?: { apiKey?: string; model?: string };
};

const ddbRegion = process.env.CI_AWS_REGION || process.env.AWS_REGION;
const accessKey = process.env.AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN;
const client = new DynamoDBClient({
  region: ddbRegion,
  credentials: accessKey && secretKey
    ? { accessKeyId: accessKey, secretAccessKey: secretKey, ...(sessionToken ? { sessionToken } : {}) }
    : undefined,
});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const APPS_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';

async function getActiveAIIntegration(): Promise<AIIntegration | null> {
  const configuredForAws = process.env.NODE_ENV === 'production' ||
    !!(process.env.AWS_ACCESS_KEY_ID);
  if (!configuredForAws) return null;

  for (const type of ['OPENAI', 'ANTHROPIC', 'GEMINI']) {
    const result = await docClient.send(new ScanCommand({
      TableName: APPS_TABLE,
      FilterExpression: '#typ = :type AND #sts = :status',
      ExpressionAttributeNames: { '#typ': 'type', '#sts': 'status' },
      ExpressionAttributeValues: { ':type': type, ':status': 'ACTIVE' },
    }));
    const integration = result.Items?.[0] as AIIntegration | undefined;
    if (integration?.config?.apiKey) return integration;
  }
  return null;
}

function parseJsonResponse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
    if (!fenced) return null;
    try {
      return JSON.parse(fenced);
    } catch {
      return null;
    }
  }
}

async function analyzeWithGemini(imageBase64: string, mimeType: string, apiKey: string, prompt: string, model?: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2048 },
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? parseJsonResponse(text) : null;
}

async function analyzeWithOpenAI(imageBase64: string, mimeType: string, apiKey: string, prompt: string, model?: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      }],
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  return text ? parseJsonResponse(text) : null;
}

async function analyzeWithAnthropic(imageBase64: string, mimeType: string, apiKey: string, prompt: string, model?: string) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: `${prompt}\n\n請只回傳 JSON。` },
        ],
      }],
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const text = data.content?.[0]?.text;
  return text ? parseJsonResponse(text) : null;
}

export async function analyzeLearningContentImage(
  imageBase64: string,
  mimeType = 'image/jpeg',
  prompt = LEARNING_CONTENT_ANALYSIS_PROMPT,
) {
  const integration = await getActiveAIIntegration();
  if (!integration?.config?.apiKey) {
    return { result: null, reason: 'AI learning-content analysis is not configured' };
  }

  const type = integration.type;
  const apiKey = integration.config?.apiKey;
  const model = integration.config?.model;
  if (!apiKey) return { result: null, reason: 'AI learning-content analysis is not configured' };
  try {
    let result: unknown | null = null;
    if (type === 'GEMINI') result = await analyzeWithGemini(imageBase64, mimeType, apiKey, prompt, model);
    if (type === 'OPENAI') result = await analyzeWithOpenAI(imageBase64, mimeType, apiKey, prompt, model);
    if (type === 'ANTHROPIC') result = await analyzeWithAnthropic(imageBase64, mimeType, apiKey, prompt, model);
    return result ? { result } : { result: null, reason: 'AI provider returned no valid JSON result' };
  } catch (error: any) {
    console.error('[learning-content-analysis] provider error:', error?.message || error);
    return { result: null, reason: 'AI provider request failed' };
  }
}
