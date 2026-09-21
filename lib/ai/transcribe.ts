// Speech-to-text for recorded class audio. Defaults to Gemini audio input (the project
// already uses @google/generative-ai, it handles Mandarin well, and it's cheap). The
// interface returns plain text per segment; the orchestrator interleaves segments by
// their recorded start time. Server-only.

import { getActiveAIIntegration } from '@/lib/ai/llmClient';

const STT_MODEL = process.env.CLASS_SUMMARY_STT_MODEL || 'gemini-1.5-flash';
const STT_PROMPT = '請將這段中文（可能夾雜英文）教學音訊逐字轉成文字，只輸出逐字稿內容，不要加入說明或標點以外的符號。';

/**
 * Transcribe one audio segment (base64) to text. Resolves a GEMINI integration itself;
 * returns null when no Gemini key is configured or the call fails (caller degrades).
 */
export async function transcribeAudio(audioBase64: string, mimeType = 'audio/webm'): Promise<string | null> {
  const integration = await getActiveAIIntegration(['GEMINI']);
  const apiKey = integration?.config?.apiKey;
  if (!apiKey) return null;
  const model = integration?.config?.model || STT_MODEL;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: STT_PROMPT }, { inlineData: { mimeType, data: audioBase64 } }] }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0 },
        }),
      }
    );
    if (!res.ok) {
      console.warn('[transcribe] STT failed', res.status);
      return null;
    }
    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts?.[0]?.text as string)?.trim() || null;
  } catch (err) {
    console.error('[transcribe] error', err);
    return null;
  }
}
