// Image-based learning-content analysis. The multi-provider fan-out and app-integration
// key resolution now live in lib/ai/llmClient.ts (shared with the class-summary feature);
// this file keeps the prompt and the JSON parsing. Request shapes are unchanged.

import { getActiveAIIntegration, generateJson } from '@/lib/ai/llmClient';

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

export async function analyzeLearningContentImage(
  imageBase64: string,
  mimeType = 'image/jpeg',
  prompt = LEARNING_CONTENT_ANALYSIS_PROMPT
) {
  const integration = await getActiveAIIntegration();
  if (!integration?.config?.apiKey) {
    return { result: null, reason: 'AI learning-content analysis is not configured' };
  }
  try {
    const text = await generateJson({ integration, prompt, images: [{ base64: imageBase64, mimeType }] });
    const result = text ? parseJsonResponse(text) : null;
    return result ? { result } : { result: null, reason: 'AI provider returned no valid JSON result' };
  } catch (error: any) {
    console.error('[learning-content-analysis] provider error:', error?.message || error);
    return { result: null, reason: 'AI provider request failed' };
  }
}
