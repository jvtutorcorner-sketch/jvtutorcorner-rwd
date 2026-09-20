// Shared multi-provider LLM client. The Gemini/OpenAI/Anthropic fan-out (key resolution
// from the app-integrations table + strict-JSON request bodies) was copy-pasted across
// learningContentAnalysis, image-analysis and workflowEngine. This consolidates the key
// resolution and a JSON-output generate call so new features (e.g. class summaries) reuse
// it instead of adding another copy. Server-only (reads API keys from DynamoDB).

import { getFirstActiveOf } from '@/lib/integrations/store';

export type LlmProvider = 'OPENAI' | 'ANTHROPIC' | 'GEMINI';

export interface LlmIntegration {
  type: string;
  config?: { apiKey?: string; model?: string };
}

export interface LlmImage {
  base64: string;
  mimeType: string;
}

/**
 * Resolve the first ACTIVE AI integration by preference order. Returns null when AWS is
 * not reachable (local without creds) or nothing is configured — callers degrade
 * gracefully rather than throw.
 *
 * Delegates to the shared integrations store (new jvtutorcorner-integrations table with a
 * legacy-table read fallback during the transition), respecting each type's default.
 */
export async function getActiveAIIntegration(
  order: LlmProvider[] = ['OPENAI', 'ANTHROPIC', 'GEMINI']
): Promise<LlmIntegration | null> {
  const configuredForAws =
    process.env.NODE_ENV === 'production' || !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID);
  if (!configuredForAws) return null;

  try {
    const integration = await getFirstActiveOf(order);
    if (integration?.config?.apiKey) return integration as LlmIntegration;
  } catch (err) {
    console.warn('[llmClient] integration lookup failed', err);
  }
  return null;
}

async function callGemini(apiKey: string, model: string, prompt: string, images: LlmImage[], maxTokens: number) {
  const parts: any[] = [{ text: prompt }, ...images.map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.base64 } }))];
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens } }),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts?.[0]?.text as string) ?? null;
}

async function callOpenAI(apiKey: string, model: string, prompt: string, images: LlmImage[], maxTokens: number) {
  const content: any[] = [
    { type: 'text', text: prompt },
    ...images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mimeType};base64,${i.base64}` } })),
  ];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content }], max_tokens: maxTokens, response_format: { type: 'json_object' } }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.choices?.[0]?.message?.content as string) ?? null;
}

async function callAnthropic(apiKey: string, model: string, prompt: string, images: LlmImage[], maxTokens: number) {
  const content: any[] = [
    ...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mimeType, data: i.base64 } })),
    { type: 'text', text: `${prompt}\n\n請只回傳 JSON。` },
  ];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.content?.[0]?.text as string) ?? null;
}

const DEFAULT_MODEL: Record<string, string> = {
  GEMINI: 'gemini-1.5-flash',
  OPENAI: 'gpt-4o-mini',
  ANTHROPIC: 'claude-3-5-sonnet-20241022',
};

/**
 * Generate a JSON-mode completion from the given integration. `images` may be empty for
 * text-only prompts. Returns the raw model text (caller parses) or null on any failure.
 */
export async function generateJson(args: {
  integration: LlmIntegration;
  prompt: string;
  images?: LlmImage[];
  maxTokens?: number;
}): Promise<string | null> {
  const { integration, prompt, images = [], maxTokens = 2048 } = args;
  const apiKey = integration.config?.apiKey;
  if (!apiKey) return null;
  const model = integration.config?.model || DEFAULT_MODEL[integration.type] || 'gpt-4o-mini';
  try {
    if (integration.type === 'GEMINI') return await callGemini(apiKey, model, prompt, images, maxTokens);
    if (integration.type === 'OPENAI') return await callOpenAI(apiKey, model, prompt, images, maxTokens);
    if (integration.type === 'ANTHROPIC') return await callAnthropic(apiKey, model, prompt, images, maxTokens);
    return null;
  } catch (err) {
    console.error('[llmClient] provider error:', (err as any)?.message || err);
    return null;
  }
}
