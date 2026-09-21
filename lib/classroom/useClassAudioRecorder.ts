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

const SEGMENT_MS = 60_000;

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
  const seqRef = useRef(0);
  const startedAtRef = useRef(0);
  const activeRef = useRef(false);

  const uploadSegment = useCallback(
    async (blob: Blob, mimeType: string) => {
      if (!summaryId || blob.size === 0) return;
      const seq = seqRef.current++;
      const startMs = Math.max(0, Date.now() - startedAtRef.current - SEGMENT_MS);
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

  const stop = useCallback(() => {
    activeRef.current = false;
    try {
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') rec.stop();
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
      const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 24_000 });
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) void uploadSegment(e.data, mimeType);
      };
      rec.start(SEGMENT_MS); // emit a blob every SEGMENT_MS
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      seqRef.current = 0;
      activeRef.current = true;
    } catch (e) {
      console.warn('[class-audio] could not start recording', e);
    }
  }, [enabled, summaryId, audioDeviceId, uploadSegment]);

  // Stop cleanly on unmount.
  useEffect(() => () => stop(), [stop]);

  return { start, stop, isRecording: () => activeRef.current };
}
