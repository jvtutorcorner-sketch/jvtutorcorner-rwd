// lib/classroom/recorderRotation.ts
//
// Pure helpers for the segmented class-audio recorder. Extracted so the segment
// metadata math is unit-tested offline (scripts/verify-recorder-rotation.mjs)
// without a browser MediaRecorder.
//
// Why rotation instead of MediaRecorder timeslice: `rec.start(SEGMENT_MS)` emits
// the container header only in the first blob; every later blob is a bare cluster
// that cannot be decoded on its own (the STT provider and the L3 transcriber both
// need a self-contained file). Stopping and restarting a fresh MediaRecorder each
// segment makes every blob a complete, independently-decodable file. This module
// owns the segment-count / start-offset bookkeeping that rotation needs.

/** One segment per ~SEGMENT_MS. */
export const SEGMENT_MS = 60_000;

export interface SegmentMeta {
  /** 0-based segment index within the recording. */
  seq: number;
  /** Offset (ms) from the recording start to THIS segment's start. */
  startMs: number;
}

/**
 * Metadata for a segment, from the recording's start timestamp and this
 * segment's own start timestamp. Using the segment's actual start (not "now minus
 * one interval") keeps startMs correct for the final short segment and immune to
 * upload-time drift — the bug in the old `Date.now() - startedAt - SEGMENT_MS`.
 */
export function segmentMeta(recordingStartMs: number, segmentStartMs: number, seq: number): SegmentMeta {
  const startMs = Math.max(0, Math.round(segmentStartMs - recordingStartMs));
  return { seq: Math.max(0, Math.floor(seq)), startMs };
}
