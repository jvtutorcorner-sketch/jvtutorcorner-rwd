// lib/ai/gateway/types.ts
//
// Shared types for the AI Gateway — the single metered, entitlement-checked,
// model-routed layer all LLM calls go through. Provider adapters implement
// generate(); gateway.runModel() wraps them with reliability + cost metering.

export type ProviderName = 'GEMINI' | 'OPENAI' | 'ANTHROPIC' | 'OPENROUTER';

export interface LlmImage {
  base64: string;
  mimeType: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  // tool-calling round-trips (filled in Phase 2.5); optional for plain chat
  toolCallId?: string;
  name?: string;
}

export interface ToolDef {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>; // JSON schema
}

export interface ToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface GenerateRequest {
  /** Simple single-prompt mode (text/JSON). Ignored when `messages` is set. */
  prompt?: string;
  /** Multi-turn / tool-calling mode. */
  messages?: ChatMessage[];
  images?: LlmImage[];
  systemInstruction?: string;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDef[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export interface GenerateResult {
  text: string | null;
  toolCalls?: ToolCall[];
  usage: Usage;
  model: string;
  provider: ProviderName;
  finishReason?: string;
}

export interface ProviderCallOptions {
  apiKey: string;
  baseUrl?: string; // OpenRouter / self-hosted overrides
  model: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

/** A provider adapter: turns a request into a result, reading back token usage. */
export type ProviderAdapter = (req: GenerateRequest, opts: ProviderCallOptions) => Promise<GenerateResult>;

/** One model choice in a policy: which provider + model to try. */
export interface ModelChoice {
  provider: ProviderName;
  model: string;
}

/** Resolved routing policy for a task: try primary, then fallbacks. */
export interface ModelPolicy {
  primary: ModelChoice;
  fallbacks: ModelChoice[];
  maxTokens: number;
  timeoutMs: number;
  maxCostMusd?: number; // reject a request whose estimate exceeds this
}

export const EMPTY_USAGE: Usage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
