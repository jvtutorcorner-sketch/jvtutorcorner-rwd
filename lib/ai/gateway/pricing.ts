// lib/ai/gateway/pricing.ts
//
// Model price table + token→cost math. Costs are integer MICRO-USD (1 USD =
// 1_000_000) to match lib/ai/gateway/ledger.ts. Prices are USD per 1M tokens,
// from the verified pricing baseline in
// docs/ai-platform/architecture-and-cost-plan-2026-09-21.md (2026-09-21).
//
// A model not in the table falls back to a conservative default so an unpriced
// model over-estimates rather than logging zero cost. Update from real invoices
// during the Phase 0b cost audit.

import type { ProviderName, Usage } from './types';

export interface ModelPrice {
  inPerM: number; // USD / 1M input tokens
  outPerM: number; // USD / 1M output tokens (reasoning billed at this rate)
  audioInPerM?: number; // USD / 1M audio-input tokens (STT), when applicable
}

// Keyed by bare model id (provider-agnostic where the id is unique).
export const MODEL_PRICES: Record<string, ModelPrice> = {
  // Google Gemini (OpenRouter / direct)
  'gemini-2.5-flash-lite': { inPerM: 0.1, outPerM: 0.4, audioInPerM: 0.3 },
  'gemini-2.5-flash': { inPerM: 0.3, outPerM: 2.5, audioInPerM: 1.0 },
  'gemini-2.0-flash': { inPerM: 0.1, outPerM: 0.4, audioInPerM: 0.7 },
  'gemini-1.5-flash': { inPerM: 0.075, outPerM: 0.3, audioInPerM: 1.0 },
  'gemini-1.5-pro': { inPerM: 1.25, outPerM: 5.0 },
  // OpenAI
  'gpt-4o-mini': { inPerM: 0.15, outPerM: 0.6 },
  'gpt-4o': { inPerM: 2.5, outPerM: 10.0 },
  'gpt-4-turbo': { inPerM: 10.0, outPerM: 30.0 },
  // Anthropic
  'claude-3-5-haiku-20241022': { inPerM: 0.8, outPerM: 4.0 },
  'claude-3-5-sonnet-20241022': { inPerM: 3.0, outPerM: 15.0 },
};

// Conservative fallback for an unpriced model (mid-tier rates).
export const DEFAULT_PRICE: ModelPrice = { inPerM: 1.0, outPerM: 5.0, audioInPerM: 1.0 };

export function priceForModel(model: string): ModelPrice {
  return MODEL_PRICES[model] ?? DEFAULT_PRICE;
}

const MUSD_PER_USD = 1_000_000;

/** Integer micro-USD for a known usage, given a model. Reasoning billed as output. */
export function usageToMusd(model: string, usage: Usage): number {
  const p = priceForModel(model);
  const usd =
    (usage.inputTokens * p.inPerM +
      (usage.outputTokens + (usage.reasoningTokens || 0)) * p.outPerM) /
    1_000_000;
  return Math.round(usd * MUSD_PER_USD);
}

/**
 * Pre-call cost estimate in micro-USD: charge estimated input tokens now and
 * assume the response fills maxTokens (worst case) so budget checks are safe.
 * `estInputTokens` may be a rough char/4 estimate from the caller.
 */
export function estimateMusd(model: string, estInputTokens: number, maxTokens: number): number {
  const p = priceForModel(model);
  const usd = (estInputTokens * p.inPerM + maxTokens * p.outPerM) / 1_000_000;
  return Math.round(usd * MUSD_PER_USD);
}

/** Cheap token estimate from text length (~4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

// Embedding models — USD per 1M input tokens.
export const EMBEDDING_PRICES: Record<string, number> = {
  'gemini-embedding-2-preview': 0.15,
  'embedding-001': 0.15,
  'text-embedding-3-small': 0.02,
};

/** Integer micro-USD for an embedding call (input tokens only). */
export function embeddingUsageToMusd(model: string, inputTokens: number): number {
  const perM = EMBEDDING_PRICES[model] ?? 0.15;
  return Math.round(inputTokens * perM); // = inputTokens * perM/1e6 USD * 1e6 µ$
}

/**
 * Integer micro-USD for an STT (audio-input) call: the prompt tokens are audio,
 * priced at the model's audio rate (falls back to text input rate).
 */
export function audioUsageToMusd(model: string, audioInputTokens: number, outputTokens: number): number {
  const p = priceForModel(model);
  const audioRate = p.audioInPerM ?? p.inPerM;
  const usd = (audioInputTokens * audioRate + outputTokens * p.outPerM) / 1_000_000;
  return Math.round(usd * MUSD_PER_USD);
}

// eslint no-unused-vars guard for ProviderName re-export consumers
export type { ProviderName };
