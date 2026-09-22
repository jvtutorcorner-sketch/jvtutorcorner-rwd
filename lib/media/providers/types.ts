// lib/media/providers/types.ts
//
// Provider-agnostic media generation. The stub provider (stub.ts) implements this
// for offline development; the RunPod adapter (gated, not built this pass) will
// implement the same interface so the engine/API never change.

import type { MediaWorkflow } from '../mediaPricing';

export interface MediaSubmitInput {
  jobId: string;
  workflow: MediaWorkflow;
  inputRef?: string;
  /** Where a provider webhook should call back (carries jobId), for async providers. */
  webhookUrl?: string;
}

export interface MediaResult {
  providerJobId: string;
  status: 'queued' | 'succeeded' | 'failed';
  outputKey?: string;
  actualCostMusd?: number;
  gpuSeconds?: number;
  error?: string;
}

export interface MediaProvider {
  name: string;
  submit(input: MediaSubmitInput): Promise<MediaResult>;
  /** Verify a provider webhook (signature). Real providers only. */
  verifyWebhook?(headers: Record<string, string | null>, rawBody: string): boolean;
  /** Parse a provider webhook payload into a normalized result + jobId. */
  parseWebhook?(body: unknown): (MediaResult & { jobId: string }) | null;
}
