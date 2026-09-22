// lib/ai/gateway/providers/gemini.ts
import type { GenerateRequest, GenerateResult, ProviderCallOptions } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

function buildParts(req: GenerateRequest): any[] {
  const text =
    req.prompt ??
    (req.messages ?? []).map((m) => `${m.role}: ${m.content}`).join('\n');
  const parts: any[] = [{ text }];
  for (const img of req.images ?? []) parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
  return parts;
}

export async function geminiGenerate(req: GenerateRequest, opts: ProviderCallOptions): Promise<GenerateResult> {
  const url = `${opts.baseUrl || 'https://generativelanguage.googleapis.com'}/v1beta/models/${opts.model}:generateContent?key=${opts.apiKey}`;
  const generationConfig: any = { maxOutputTokens: req.maxTokens ?? 2048 };
  if (req.jsonMode) generationConfig.responseMimeType = 'application/json';
  if (typeof req.temperature === 'number') generationConfig.temperature = req.temperature;
  const body: any = { contents: [{ parts: buildParts(req) }], generationConfig };
  if (req.systemInstruction) body.systemInstruction = { parts: [{ text: req.systemInstruction }] };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`GEMINI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const u = data.usageMetadata ?? {};
  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? null,
    usage: {
      inputTokens: u.promptTokenCount ?? 0,
      outputTokens: u.candidatesTokenCount ?? 0,
      reasoningTokens: u.thoughtsTokenCount ?? 0,
    },
    model: opts.model,
    provider: 'GEMINI',
    finishReason: data.candidates?.[0]?.finishReason,
  };
}
