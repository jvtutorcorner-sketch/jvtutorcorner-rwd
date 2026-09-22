'use client';

// Records THIS participant's own microphone during class, in ~60s segments, and uploads
// each segment to S3 via a presigned PUT (POST /api/class-summaries/presign). Each side
// records its own mic → natural speaker separation, no diarization needed; segmented
// upload → a crash/refresh only loses the last segment. Provider-agnostic: it opens its
// own audio capture, so it works identically whether video is on Agora or the SFU.
//
// Only records when `enabled` (both sides consented, gated server-side too). Nothing
// happens until start() is called and stops on unmount.

import { useCallback, useEffect, useRef } from 'react';
import { SEGMENT_MS, segmentMeta } from './recorderRotation';

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export interface ClassAudioRecorderOptions {
  summaryId: string | null;
  enabled: boolean;
  audioDeviceId?: string;
}

export function useClassAudioRecorder(opts: ClassAudioRecorderOptions) {
  const { summaryId, enabled, audioDeviceId } = opts;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');
  const recordingStartRef = useRef(0);
  const seqRef = useRef(0);
  const activeRef = useRef(false);

  const uploadSegment = useCallback(
    async (blob: Blob, mimeType: string, segmentStartMs: number) => {
      if (!summaryId || blob.size === 0) return;
      // Segment metadata from the segment's ACTUAL start timestamp — correct for a
      // short final segment and immune to upload-time drift (see recorderRotation).
      const { seq, startMs } = segmentMeta(recordingStartRef.current, segmentStartMs, seqRef.current++);
      try {
        const res = await fetch('/api/class-summaries/presign', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ summaryId, seq, startMs, mimeType }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.url) return; // 409 = recording no longer permitted; stop trying quietly
        await fetch(data.url, { method: 'PUT', body: blob, headers: { 'content-type': mimeType } });
      } catch (e) {
        console.warn('[class-audio] segment upload failed', e);
      }
    },
    [summaryId]
  );

  // Start one fresh recorder for one segment. Without a timeslice, MediaRecorder
  // emits exactly one self-contained blob when it is stopped.
  const startOneSegment = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = mimeTypeRef.current;
    const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 24_000 });
    const segmentStartMs = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) void uploadSegment(e.data, mimeType, segmentStartMs);
    };
    rec.start(); // no timeslice → a single complete file emitted on stop()
    recorderRef.current = rec;
  }, [uploadSegment]);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (rotateTimerRef.current) {
      clearInterval(rotateTimerRef.current);
      rotateTimerRef.current = null;
    }
    try {
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') rec.stop(); // flushes the final segment
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current || !enabled || !summaryId) return;
    const mimeType = pickMimeType();
    if (!mimeType) return; // MediaRecorder unsupported → skip recording, class continues
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      mimeTypeRef.current = mimeType;
      recordingStartRef.current = Date.now();
      seqRef.current = 0;
      activeRef.current = true;
      startOneSegment();
      // Rotate every SEGMENT_MS: stop the current recorder (flushes a complete
      // file) and immediately start a new one on the same stream.
      rotateTimerRef.current = setInterval(() => {
        if (!activeRef.current) return;
        const rec = recorderRef.current;
        if (rec && rec.state !== 'inactive') rec.stop();
        startOneSegment();
      }, SEGMENT_MS);
    } catch (e) {
      console.warn('[class-audio] could not start recording', e);
    }
  }, [enabled, summaryId, audioDeviceId, startOneSegment]);

  // Stop cleanly on unmount.
  useEffect(() => () => stop(), [stop]);

  return { start, stop, isRecording: () => activeRef.current };
}
