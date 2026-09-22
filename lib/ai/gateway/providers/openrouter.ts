// lib/ai/gateway/providers/openrouter.ts
// OpenRouter is OpenAI-compatible; reuse the OpenAI adapter with OpenRouter's
// base URL + attribution headers. usage accounting comes back in the same
// `usage` block. Model ids are namespaced (e.g. "google/gemini-2.5-flash").
import type { GenerateRequest, GenerateResult, ProviderCallOptions } from '../types';
import { openaiCompatibleGenerate } from './openai';

export function openrouterGenerate(req: GenerateRequest, opts: ProviderCallOptions): Promise<GenerateResult> {
  return openaiCompatibleGenerate(
    req,
    { ...opts, baseUrl: opts.baseUrl || 'https://openrouter.ai/api' },
    'OPENROUTER',
    {
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://www.jvtutorcorner.com',
      'X-Title': 'JV Tutor Corner',
    }
  );
}
