// lib/ai/gateway/providers/anthropic.ts
import type { GenerateRequest, GenerateResult, ProviderCallOptions } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

function buildContent(req: GenerateRequest): any[] {
  const content: any[] = [];
  for (const img of req.images ?? []) content.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.base64 } });
  const text = req.prompt ?? (req.messages ?? []).map((m) => `${m.role}: ${m.content}`).join('\n');
  content.push({ type: 'text', text: req.jsonMode ? `${text}\n\n請只回傳 JSON。` : text });
  return content;
}

export async function anthropicGenerate(req: GenerateRequest, opts: ProviderCallOptions): Promise<GenerateResult> {
  const url = `${opts.baseUrl || 'https://api.anthropic.com'}/v1/messages`;
  const body: any = { model: opts.model, max_tokens: req.maxTokens ?? 2048, messages: [{ role: 'user', content: buildContent(req) }] };
  if (req.systemInstruction) body.system = req.systemInstruction;
  if (typeof req.temperature === 'number') body.temperature = req.temperature;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`ANTHROPIC ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const u = data.usage ?? {};
  return {
    text: data.content?.[0]?.text ?? null,
    usage: {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      reasoningTokens: 0,
    },
    model: opts.model,
    provider: 'ANTHROPIC',
    finishReason: data.stop_reason,
  };
}
