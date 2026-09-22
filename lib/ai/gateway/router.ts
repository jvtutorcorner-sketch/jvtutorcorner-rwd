// lib/ai/gateway/router.ts
//
// Task router: maps a task (l1_detect / l2_segment / l3_lesson / tutor / …) to a
// ModelPolicy (primary + fallbacks + limits). Cost-quality tiers (low/mid/high)
// map to concrete provider+model choices, overridable per-tier by env and, later,
// per-feature by ai-feature-config.model_policy (Phase 2.4).
//
// This supersedes the broken SMART_ROUTER field-name path (fastServiceId/
// smartServiceId vs fastModelId/balancedModelId/complexModelId): callers pass a
// task (or a complexity tier from smartRouterService) and get a working policy.

import type { ModelChoice, ModelPolicy, ProviderName } from './types';

export type Tier = 'low' | 'mid' | 'high' | 'vision' | 'stt' | 'embedding';

export type Task =
  | 'l1_detect'
  | 'l2_segment'
  | 'l3_lesson'
  | 'l3_lesson_high'
  | 'l4_profile'
  | 'tutor'
  | 'copilot'
  | 'assessment_gen'
  | 'grading'
  | 'chat'
  | 'chat_fast'
  | 'chat_complex'
  | 'vision'
  | 'stt'
  | 'embedding'
  | 'llm-json';

// Default concrete model per tier. Env overrides let ops retune without a deploy
// (e.g. AI_TIER_MID_MODEL=google/gemini-2.5-flash when routing via OpenRouter).
function tierChoice(tier: Tier): ModelChoice {
  const env = (k: string) => process.env[k];
  const provider = (env(`AI_TIER_${tier.toUpperCase()}_PROVIDER`) as ProviderName) || defaultTierProvider(tier);
  const model = env(`AI_TIER_${tier.toUpperCase()}_MODEL`) || defaultTierModel(tier);
  return { provider, model };
}

function defaultTierProvider(tier: Tier): ProviderName {
  switch (tier) {
    case 'high': return 'ANTHROPIC';
    default: return 'GEMINI';
  }
}
function defaultTierModel(tier: Tier): string {
  switch (tier) {
    case 'low': return 'gemini-2.5-flash-lite';
    case 'mid': return 'gemini-2.5-flash';
    case 'high': return 'claude-3-5-sonnet-20241022';
    case 'vision': return 'gemini-2.5-flash';
    case 'stt': return 'gemini-1.5-flash';
    case 'embedding': return 'gemini-embedding-2-preview';
  }
}

// Task → ordered tiers (primary first, rest are fallbacks) + limits.
interface TaskSpec {
  tiers: Tier[];
  maxTokens: number;
  timeoutMs: number;
  maxCostMusd?: number;
}

const TASK_SPECS: Record<Task, TaskSpec> = {
  l1_detect: { tiers: ['low', 'mid'], maxTokens: 1024, timeoutMs: 30_000 },
  l2_segment: { tiers: ['mid', 'low'], maxTokens: 1500, timeoutMs: 45_000 },
  l3_lesson: { tiers: ['mid', 'high'], maxTokens: 3000, timeoutMs: 60_000 },
  l3_lesson_high: { tiers: ['high', 'mid'], maxTokens: 3000, timeoutMs: 60_000 },
  l4_profile: { tiers: ['mid', 'low'], maxTokens: 2000, timeoutMs: 45_000 },
  tutor: { tiers: ['mid', 'low'], maxTokens: 512, timeoutMs: 14_000, maxCostMusd: 6_000 },
  copilot: { tiers: ['mid', 'low'], maxTokens: 512, timeoutMs: 14_000, maxCostMusd: 6_000 },
  assessment_gen: { tiers: ['mid', 'high'], maxTokens: 2048, timeoutMs: 45_000 },
  grading: { tiers: ['low', 'mid'], maxTokens: 1024, timeoutMs: 30_000 },
  chat: { tiers: ['mid', 'low'], maxTokens: 2048, timeoutMs: 20_000 },
  chat_fast: { tiers: ['low', 'mid'], maxTokens: 2048, timeoutMs: 15_000 },
  chat_complex: { tiers: ['high', 'mid'], maxTokens: 4096, timeoutMs: 30_000 },
  vision: { tiers: ['vision', 'high'], maxTokens: 2048, timeoutMs: 45_000 },
  stt: { tiers: ['stt'], maxTokens: 4096, timeoutMs: 60_000 },
  embedding: { tiers: ['embedding'], maxTokens: 0, timeoutMs: 20_000 },
  'llm-json': { tiers: ['mid', 'low'], maxTokens: 2048, timeoutMs: 30_000 },
};

export interface PolicyOverride {
  primary?: ModelChoice;
  fallbacks?: ModelChoice[];
  maxTokens?: number;
  timeoutMs?: number;
  maxCostMusd?: number;
}

/**
 * Resolve a ModelPolicy for a task. `override` (later sourced from
 * ai-feature-config.model_policy) wins over tier defaults.
 */
export function resolvePolicy(task: Task, override?: PolicyOverride): ModelPolicy {
  const spec = TASK_SPECS[task] ?? TASK_SPECS['llm-json'];
  const choices = spec.tiers.map(tierChoice);
  const primary = override?.primary ?? choices[0];
  const fallbacks = override?.fallbacks ?? choices.slice(1);
  return {
    primary,
    fallbacks,
    maxTokens: override?.maxTokens ?? spec.maxTokens,
    timeoutMs: override?.timeoutMs ?? spec.timeoutMs,
    maxCostMusd: override?.maxCostMusd ?? spec.maxCostMusd,
  };
}

/** Map a smartRouterService complexity level to a chat task. */
export function chatTaskForComplexity(level: 'FAST' | 'BALANCED' | 'COMPLEX'): Task {
  if (level === 'FAST') return 'chat_fast';
  if (level === 'COMPLEX') return 'chat_complex';
  return 'chat';
}
