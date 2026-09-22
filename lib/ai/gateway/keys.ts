// lib/ai/gateway/keys.ts
//
// Per-provider API key resolver for the task-routed gateway path (runModel).
// Prefers a configured integration (metered, key-managed in /apps), then an env
// key so a feature keeps working before /apps is configured. Shared by every
// caller that routes by task rather than by a single integration.

import { getActiveAIIntegration } from '@/lib/ai/llmClient';
import type { ProviderName } from './types';
import type { KeyResolution } from './gateway';

const ENV_KEY: Record<ProviderName, string> = {
  GEMINI: 'GEMINI_API_KEY',
  OPENAI: 'OPENAI_API_KEY',
  ANTHROPIC: 'ANTHROPIC_API_KEY',
  OPENROUTER: 'OPENROUTER_API_KEY',
};

export async function resolveProviderKey(provider: ProviderName): Promise<KeyResolution | null> {
  try {
    const integ = await getActiveAIIntegration([provider as never]);
    const cfg = integ?.config as { apiKey?: string; baseUrl?: string } | undefined;
    if (cfg?.apiKey) return { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl };
  } catch {
    // fall through to env
  }
  const env = process.env[ENV_KEY[provider]];
  return env ? { apiKey: env } : null;
}
