'use client';
// lib/classroom/useClassRecording.ts
//
// Ties recording consent to the (fixed) segmented recorder. INERT by default:
// nothing happens unless NEXT_PUBLIC_CLASS_SUMMARY_ENABLED === 'true' (public
// flag, unset by default). Even when the dialog is shown and one side agrees, the
// SERVER still gates capture on CLASS_SUMMARY_ENABLED + both-party consent
// (canRecord) at presign time, so audio is only ever recorded when every gate is
// open. This hook just wires the UI to the recorder; it adds no new capture path.

import { useEffect, useState } from 'react';
import { useClassAudioRecorder } from './useClassAudioRecorder';

const PUBLIC_ENABLED = process.env.NEXT_PUBLIC_CLASS_SUMMARY_ENABLED === 'true';

export interface UseClassRecordingOptions {
  courseId: string;
  orderId: string | null;
  startTime: string | null; // ISO scheduled start
  audioDeviceId?: string;
}

export interface ClassRecordingApi {
  /** Whether to render <RecordingConsentDialog> now. */
  showConsentDialog: boolean;
  dialogProps: { courseId: string; orderId: string; startTime: string; onConsent: (summaryId: string) => void; onDecline: () => void } | null;
  isRecording: boolean;
}

export function useClassRecording(opts: UseClassRecordingOptions): ClassRecordingApi {
  const { courseId, orderId, startTime, audioDeviceId } = opts;
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  const recorder = useClassAudioRecorder({
    summaryId,
    enabled: PUBLIC_ENABLED && !!summaryId,
    audioDeviceId,
  });

  // Start capture once consent yields a summaryId; stop on unmount. The recorder
  // itself no-ops (start() early-returns) until enabled + summaryId are set.
  useEffect(() => {
    if (PUBLIC_ENABLED && summaryId) void recorder.start();
    return () => recorder.stop();
    // recorder.start/stop are stable useCallbacks keyed on summaryId.
  }, [summaryId, recorder]);

  const canPrompt = PUBLIC_ENABLED && !!orderId && !!startTime && !summaryId && !declined;

  return {
    showConsentDialog: canPrompt,
    dialogProps: canPrompt
      ? {
          courseId,
          orderId: orderId as string,
          startTime: startTime as string,
          onConsent: setSummaryId,
          onDecline: () => setDeclined(true),
        }
      : null,
    isRecording: recorder.isRecording(),
  };
}
