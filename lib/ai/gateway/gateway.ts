// lib/ai/gateway/gateway.ts
//
// The AI Gateway core. runModel() is the single entry every LLM call routes
// through: it resolves a provider+model chain (a ModelPolicy), enforces a
// per-request cost cap, calls the provider adapter with a timeout + one retry +
// cross-provider fallback + a per-provider circuit breaker, captures real token
// usage, and records cost into the 0b ledger (lib/ai/gateway/ledger.ts).
//
// Server-only. Pure enough to unit-test with a mocked adapter map + fetch.

import { randomUUID } from 'crypto';
import { recordUsage } from './ledger';
import { checkTenantBudget } from '../budget';
import { estimateMusd, estimateTokens, usageToMusd } from './pricing';
import { geminiGenerate } from './providers/gemini';
import { openaiGenerate } from './providers/openai';
import { anthropicGenerate } from './providers/anthropic';
import { openrouterGenerate } from './providers/openrouter';
import type {
  GenerateRequest,
  GenerateResult,
  ModelChoice,
  ModelPolicy,
  ProviderAdapter,
  ProviderName,
} from './types';

// Adapter registry. Overridable for tests via setAdapters().
let ADAPTERS: Record<ProviderName, ProviderAdapter> = {
  GEMINI: geminiGenerate,
  OPENAI: openaiGenerate,
  ANTHROPIC: anthropicGenerate,
  OPENROUTER: openrouterGenerate,
};
export function setAdapters(a: Partial<Record<ProviderName, ProviderAdapter>>) {
  ADAPTERS = { ...ADAPTERS, ...a };
}

// ── Circuit breaker (in-process, per provider) ──────────────────────────────
const BREAKER_THRESHOLD = 4; // consecutive failures before opening
const BREAKER_OPEN_MS = 30_000;
type BreakerState = { failures: number; openUntil: number };
const breakers = new Map<ProviderName, BreakerState>();
function breakerOpen(p: ProviderName, now: number): boolean {
  const b = breakers.get(p);
  return !!b && b.openUntil > now;
}
function breakerOnSuccess(p: ProviderName) {
  breakers.set(p, { failures: 0, openUntil: 0 });
}
function breakerOnFailure(p: ProviderName, now: number) {
  const b = breakers.get(p) ?? { failures: 0, openUntil: 0 };
  b.failures += 1;
  if (b.failures >= BREAKER_THRESHOLD) b.openUntil = now + BREAKER_OPEN_MS;
  breakers.set(p, b);
}
export function _resetBreakers() { breakers.clear(); }

export interface KeyResolution {
  apiKey: string;
  baseUrl?: string;
}

export interface RunContext {
  requestId?: string; // idempotency; generated when absent
  feature: string; // for ledger + entitlement attribution
  resolveKey: (provider: ProviderName) => Promise<KeyResolution | null> | KeyResolution | null;
  // ledger dimensions (all optional)
  orgId?: string;
  userId?: string;
  teacherId?: string;
  courseId?: string;
  sessionId?: string;
  segmentId?: string;
  meta?: Record<string, string | number | boolean | null>;
}

export type RunResult =
  | { ok: true; result: GenerateResult; costMusd: number; requestId: string; provider: ProviderName; model: string; duplicate: boolean }
  | { ok: false; error: string; requestId: string };

async function callWithTimeout(
  adapter: ProviderAdapter,
  req: GenerateRequest,
  key: KeyResolution,
  choice: ModelChoice,
  timeoutMs: number
): Promise<GenerateResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await adapter(req, { apiKey: key.apiKey, baseUrl: key.baseUrl, model: choice.model, timeoutMs, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run a request against a model policy with reliability + metering.
 * Records exactly one usage row per requestId on the first success.
 */
export async function runModel(policy: ModelPolicy, req: GenerateRequest, ctx: RunContext): Promise<RunResult> {
  const requestId = ctx.requestId ?? randomUUID();
  const chain: ModelChoice[] = [policy.primary, ...policy.fallbacks];

  // Worst-case estimate on the primary model (shared by the per-request cap and
  // the tenant budget check).
  let estCache: number | undefined;
  const estimate = () => {
    if (estCache === undefined) {
      const promptText = req.prompt ?? (req.messages ?? []).map((m) => m.content).join('\n');
      estCache = estimateMusd(
        policy.primary.model,
        estimateTokens(promptText) + estimateTokens(req.systemInstruction ?? ''),
        policy.maxTokens
      );
    }
    return estCache;
  };

  // Per-request cost cap.
  if (policy.maxCostMusd != null && estimate() > policy.maxCostMusd) {
    return { ok: false, error: `estimated cost ${estimate()}µ$ exceeds cap ${policy.maxCostMusd}µ$`, requestId };
  }

  // Tenant/global monthly AI budget (Phase 6). Only when orgId is set; scopes
  // without a configured cap are unaffected. Denies BEFORE any provider call, so
  // an over-budget request is never charged.
  if (ctx.orgId) {
    const budget = await checkTenantBudget(ctx.orgId, estimate());
    if (!budget.allowed) {
      return { ok: false, error: `tenant AI budget exceeded (${budget.reason || 'budget_exceeded'})`, requestId };
    }
  }

  const now0 = Date.now();
  let lastErr = 'no provider available';

  for (const choice of chain) {
    const now = Date.now();
    if (breakerOpen(choice.provider, now)) { lastErr = `${choice.provider} circuit open`; continue; }
    const adapter = ADAPTERS[choice.provider];
    if (!adapter) { lastErr = `no adapter for ${choice.provider}`; continue; }
    const key = await ctx.resolveKey(choice.provider);
    if (!key?.apiKey) { lastErr = `no key for ${choice.provider}`; continue; }

    // up to 2 attempts (1 retry) per choice
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await callWithTimeout(adapter, { ...req, maxTokens: req.maxTokens ?? policy.maxTokens }, key, choice, policy.timeoutMs);
        breakerOnSuccess(choice.provider);
        const costMusd = usageToMusd(result.model, result.usage);
        const rec = await recordUsage({
          requestId,
          costCenter: 'ai',
          actualCostMusd: costMusd,
          feature: ctx.feature,
          model: result.model,
          provider: result.provider,
          orgId: ctx.orgId,
          userId: ctx.userId,
          teacherId: ctx.teacherId,
          courseId: ctx.courseId,
          sessionId: ctx.sessionId,
          segmentId: ctx.segmentId,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          reasoningTokens: result.usage.reasoningTokens,
          tenantMonth: ctx.orgId ? `${ctx.orgId}#${new Date().toISOString().slice(0, 7).replace('-', '')}` : undefined,
          status: 'ok',
          meta: ctx.meta,
        });
        return { ok: true, result, costMusd, requestId, provider: result.provider, model: result.model, duplicate: rec.duplicate };
      } catch (err) {
        lastErr = (err as Error)?.message || String(err);
        const aborted = (err as Error)?.name === 'AbortError';
        // Don't retry the same provider on a timeout; move to fallback.
        if (aborted) { breakerOnFailure(choice.provider, Date.now()); break; }
        if (attempt === 1) breakerOnFailure(choice.provider, Date.now());
      }
    }
  }
  void now0;
  return { ok: false, error: lastErr, requestId };
}

/**
 * Convenience for the llmClient shim / single-integration callers: build a
 * one-choice policy from a resolved integration and run it.
 */
export async function runWithIntegration(
  integration: { type: string; config?: { apiKey?: string; model?: string } },
  req: GenerateRequest,
  ctx: Omit<RunContext, 'resolveKey'> & { defaultModel?: string }
): Promise<RunResult> {
  const provider = integration.type as ProviderName;
  const model = integration.config?.model || ctx.defaultModel || 'gpt-4o-mini';
  const apiKey = integration.config?.apiKey;
  const policy: ModelPolicy = {
    primary: { provider, model },
    fallbacks: [],
    maxTokens: req.maxTokens ?? 2048,
    timeoutMs: 30_000,
  };
  return runModel(policy, req, { ...ctx, resolveKey: () => (apiKey ? { apiKey } : null) });
}
