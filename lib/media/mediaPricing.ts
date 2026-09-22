// lib/media/mediaPricing.ts
//
// Fixed per-workflow media prices (Phase 5). PLACEHOLDER values — the real prices
// must be set from p90 RunPod gpu_seconds (architecture plan §6/§15) and expressed
// in AI credits once the credit granularity lands (1 point = 100 credits, a 0b
// deferred decision). Today `amount` in the ledger == points, so these are coarse
// stand-ins used only to exercise the reserve/settle/refund engine end to end.

export type MediaWorkflow = 'image' | 'img2img' | 'image_to_video' | 'tts' | 'lipsync';
export type MediaFeatureId = 'ai_image' | 'ai_video' | 'ai_voice' | 'ai_digital_human';

export interface WorkflowSpec {
  featureId: MediaFeatureId;
  gpuTier: string;
  priceCredits: number; // PLACEHOLDER — recalibrate from real gpu_seconds
  label: string;
}

export const WORKFLOWS: Record<MediaWorkflow, WorkflowSpec> = {
  image: { featureId: 'ai_image', gpuTier: '24GB', priceCredits: 2, label: 'AI 生圖' },
  img2img: { featureId: 'ai_image', gpuTier: '24GB', priceCredits: 2, label: 'AI 圖生圖' },
  image_to_video: { featureId: 'ai_video', gpuTier: '80GB', priceCredits: 40, label: '圖生影片' },
  tts: { featureId: 'ai_voice', gpuTier: 'api', priceCredits: 1, label: 'AI 語音' },
  lipsync: { featureId: 'ai_digital_human', gpuTier: '24-80GB', priceCredits: 30, label: '數位人 / 對嘴' },
};

/** Reservation lifetime before the sweeper refunds a stuck job. */
export const RESERVATION_TTL_MS = 15 * 60 * 1000;

export function isMediaWorkflow(v: unknown): v is MediaWorkflow {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(WORKFLOWS, v);
}

export function quotePrice(workflow: MediaWorkflow): number {
  return WORKFLOWS[workflow].priceCredits;
}

export function featureForWorkflow(workflow: MediaWorkflow): MediaFeatureId {
  return WORKFLOWS[workflow].featureId;
}
