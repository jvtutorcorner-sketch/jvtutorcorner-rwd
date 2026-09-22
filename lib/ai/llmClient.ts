// Shared multi-provider LLM client. The Gemini/OpenAI/Anthropic fan-out (key resolution
// from the app-integrations table + strict-JSON request bodies) was copy-pasted across
// learningContentAnalysis, image-analysis and workflowEngine. This consolidates the key
// resolution and a JSON-output generate call so new features (e.g. class summaries) reuse
// it instead of adding another copy. Server-only (reads API keys from DynamoDB).

import { getFirstActiveOf } from '@/lib/integrations/store';
import { runWithIntegration } from '@/lib/ai/gateway/gateway';

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

const DEFAULT_MODEL: Record<string, string> = {
  GEMINI: 'gemini-1.5-flash',
  OPENAI: 'gpt-4o-mini',
  ANTHROPIC: 'claude-3-5-sonnet-20241022',
};

/**
 * Generate a JSON-mode completion from the given integration. `images` may be empty for
 * text-only prompts. Returns the raw model text (caller parses) or null on any failure.
 *
 * Now a thin shim over the AI Gateway (lib/ai/gateway): the actual provider call,
 * timeout/retry/fallback and token-usage metering happen there. Callers may pass
 * `feature`/`requestId`/dims to attribute the cost; existing callers that omit them
 * still work and are metered under a generic feature.
 */
export async function generateJson(args: {
  integration: LlmIntegration;
  prompt: string;
  images?: LlmImage[];
  maxTokens?: number;
  feature?: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  courseId?: string;
  teacherId?: string;
  orgId?: string;
}): Promise<string | null> {
  const { integration, prompt, images = [], maxTokens = 2048, feature = 'llm-json', requestId, userId, sessionId, courseId, teacherId, orgId } = args;
  if (!integration.config?.apiKey) return null;
  const res = await runWithIntegration(
    integration,
    { prompt, images, jsonMode: true, maxTokens },
    { feature, requestId, userId, sessionId, courseId, teacherId, orgId, defaultModel: DEFAULT_MODEL[integration.type] || 'gpt-4o-mini' }
  );
  return res.ok ? res.result.text : null;
}
