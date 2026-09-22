// lib/ai/gateway/providers/openai.ts
// Also serves OpenRouter (OpenAI-compatible /chat/completions). See openrouter.ts.
import type { GenerateRequest, GenerateResult, ProviderCallOptions, ProviderName } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

function buildMessages(req: GenerateRequest): any[] {
  const messages: any[] = [];
  if (req.systemInstruction) messages.push({ role: 'system', content: req.systemInstruction });
  if (req.messages?.length) {
    for (const m of req.messages) messages.push({ role: m.role === 'tool' ? 'tool' : m.role, content: m.content, ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}) });
  } else {
    const content: any[] = [{ type: 'text', text: req.prompt ?? '' }];
    for (const img of req.images ?? []) content.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
    messages.push({ role: 'user', content: (req.images?.length ? content : (req.prompt ?? '')) });
  }
  return messages;
}

export async function openaiCompatibleGenerate(
  req: GenerateRequest,
  opts: ProviderCallOptions,
  provider: ProviderName,
  extraHeaders: Record<string, string> = {}
): Promise<GenerateResult> {
  const url = `${opts.baseUrl || 'https://api.openai.com'}/v1/chat/completions`;
  const body: any = { model: opts.model, messages: buildMessages(req), max_tokens: req.maxTokens ?? 2048 };
  if (req.jsonMode) body.response_format = { type: 'json_object' };
  if (typeof req.temperature === 'number') body.temperature = req.temperature;
  if (req.tools?.length) body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters ?? {} } }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}`, ...extraHeaders },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`${provider} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const choice = data.choices?.[0];
  const u = data.usage ?? {};
  const toolCalls = (choice?.message?.tool_calls ?? []).map((tc: any) => ({
    id: tc.id,
    name: tc.function?.name,
    arguments: safeJson(tc.function?.arguments),
  }));
  return {
    text: choice?.message?.content ?? null,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    usage: {
      inputTokens: u.prompt_tokens ?? 0,
      outputTokens: u.completion_tokens ?? 0,
      reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
    },
    model: opts.model,
    provider,
    finishReason: choice?.finish_reason,
  };
}

function safeJson(s: unknown): Record<string, unknown> {
  if (typeof s !== 'string') return {};
  try { return JSON.parse(s); } catch { return {}; }
}

export function openaiGenerate(req: GenerateRequest, opts: ProviderCallOptions): Promise<GenerateResult> {
  return openaiCompatibleGenerate(req, opts, 'OPENAI');
}
