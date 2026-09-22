// lib/lessonAI/l1Verdict.ts
//
// Pure pass/fail decision for the 0b L1 go/no-go (architecture plan §3 gate + §15
// acceptance). Kept separate so both the harness and its offline test share one
// definition of "the gate passed".

export interface L1SegmentResult {
  file: string;
  decoded: boolean; // provider returned a non-empty transcript for this segment on its own
  wer?: number; // vs a reference transcript, if provided
  costMusd?: number; // actual cost of this segment's call
  latencyMs?: number;
  events?: number;
}

export interface L1Thresholds {
  werMax: number; // e.g. 0.25 mixed error rate
  costMaxMusd: number; // e.g. 1200 µ$ = $0.0012/segment (§15)
  latencyMaxMs: number; // e.g. 30000 (§15: ≤30s after upload)
}

export const DEFAULT_L1_THRESHOLDS: L1Thresholds = {
  werMax: 0.25,
  costMaxMusd: 1200,
  latencyMaxMs: 30_000,
};

export interface L1Verdict {
  pass: boolean;
  reasons: string[];
}

export function l1Verdict(segments: L1SegmentResult[], t: L1Thresholds): L1Verdict {
  const reasons: string[] = [];
  if (segments.length === 0) return { pass: false, reasons: ['no segments tested'] };

  // Premise 1: every rotated segment decodes on its own (the recorder-rotation fix).
  const failedDecode = segments.filter((s) => !s.decoded);
  if (failedDecode.length) {
    reasons.push(`${failedDecode.length}/${segments.length} segment(s) did not decode independently: ${failedDecode.map((s) => s.file).join(', ')}`);
  }

  // Premise 2: mixed zh/en WER within target (only segments that have a reference).
  const wers = segments.filter((s) => typeof s.wer === 'number').map((s) => s.wer as number);
  if (wers.length) {
    const worst = Math.max(...wers);
    if (worst > t.werMax) reasons.push(`worst WER ${worst.toFixed(3)} > ${t.werMax}`);
  }

  const costs = segments.filter((s) => typeof s.costMusd === 'number').map((s) => s.costMusd as number);
  if (costs.length) {
    const worst = Math.max(...costs);
    if (worst > t.costMaxMusd) reasons.push(`worst cost ${worst}µ$ > ${t.costMaxMusd}µ$/segment`);
  }

  const lats = segments.filter((s) => typeof s.latencyMs === 'number').map((s) => s.latencyMs as number);
  if (lats.length) {
    const worst = Math.max(...lats);
    if (worst > t.latencyMaxMs) reasons.push(`worst latency ${worst}ms > ${t.latencyMaxMs}ms`);
  }

  return { pass: reasons.length === 0, reasons };
}
