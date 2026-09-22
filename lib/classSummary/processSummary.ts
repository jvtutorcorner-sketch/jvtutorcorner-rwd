// Orchestrates one class summary: download audio segments → STT → merge transcript →
// (with whiteboard images) LLM summary. All external effects are injected as `deps` so
// the flow is verified offline with mocks (scripts/verify-class-summary-process.mjs).
// The caller (the cron worker) persists the returned outcome.

import type { ClassSummaryRow, TranscriptSegment, SummaryJson, ClassroomRole } from './types';
import {
  transcriptToText,
  buildSummaryPrompt,
  parseSummaryJson,
  SUMMARY_MIN_TRANSCRIPT_CHARS,
} from './summaryLogic';
import type { LlmIntegration, LlmImage } from '@/lib/ai/llmClient';

export interface ProcessDeps {
  getObjectBase64: (key: string) => Promise<{ base64: string; mimeType: string } | null>;
  getIntegration: () => Promise<LlmIntegration | null>;
  transcribe: (base64: string, mimeType: string) => Promise<string | null>;
  generateJson: (args: { integration: LlmIntegration; prompt: string; images?: LlmImage[]; maxTokens?: number; feature?: string; requestId?: string }) => Promise<string | null>;
}

export type ProcessOutcome =
  | { kind: 'ready'; summary: SummaryJson; transcriptText: string; model?: string }
  | { kind: 'insufficient'; summary: SummaryJson; transcriptText: string }
  | { kind: 'failed'; reason: string };

/** class-audio/<summaryId>/<role>/<seq>-<startMs>.<ext> → role + startMs. */
export function parseAudioKey(key: string): { role: ClassroomRole; startMs: number } | null {
  const m = key.match(/class-audio\/[^/]+\/([^/]+)\/(\d+)-(\d+)\.[a-z0-9]+$/i);
  if (!m) return null;
  const role = m[1] as ClassroomRole;
  const startMs = Number(m[3]);
  if (!Number.isFinite(startMs)) return null;
  return { role, startMs };
}

/** Download + transcribe every audio segment into ordered transcript segments. */
export async function buildTranscript(audioKeys: string[], deps: ProcessDeps): Promise<TranscriptSegment[]> {
  const segments: TranscriptSegment[] = [];
  for (const key of audioKeys) {
    const meta = parseAudioKey(key);
    if (!meta) continue;
    const obj = await deps.getObjectBase64(key);
    if (!obj) continue;
    const text = await deps.transcribe(obj.base64, obj.mimeType);
    if (text && text.trim()) segments.push({ role: meta.role, startMs: meta.startMs, text: text.trim() });
  }
  return segments;
}

const INSUFFICIENT: SummaryJson = {
  summary: '',
  keyConcepts: [],
  teacherHighlights: [],
  studentDifficulties: [],
  homework: [],
  nextLessonSuggestions: [],
  vocabulary: [],
  confidence: 'low',
  insufficient: true,
};

/** Run the full pipeline for one row. Does not write to the DB — returns an outcome. */
export async function processSummaryRow(row: ClassSummaryRow, deps: ProcessDeps): Promise<ProcessOutcome> {
  const integration = await deps.getIntegration();
  if (!integration) return { kind: 'failed', reason: 'no-ai-integration' };

  const transcript = await buildTranscript(row.audioKeys || [], deps);
  const transcriptText = transcriptToText(transcript);

  if (transcriptText.length < SUMMARY_MIN_TRANSCRIPT_CHARS) {
    return { kind: 'insufficient', summary: INSUFFICIENT, transcriptText };
  }

  // Attach whiteboard page images (multimodal) when available.
  const images: LlmImage[] = [];
  for (const key of (row.boardKeys || []).slice(0, 6)) {
    const obj = await deps.getObjectBase64(key);
    if (obj) images.push({ base64: obj.base64, mimeType: obj.mimeType });
  }

  const prompt = buildSummaryPrompt(transcriptText);
  const raw = await deps.generateJson({ integration, prompt, images, maxTokens: 2048, feature: 'class-summary' });
  const summary = raw ? parseSummaryJson(raw) : null;
  if (!summary) return { kind: 'failed', reason: 'no-valid-json' };
  if (summary.insufficient) return { kind: 'insufficient', summary, transcriptText };
  return { kind: 'ready', summary, transcriptText, model: integration.config?.model };
}
