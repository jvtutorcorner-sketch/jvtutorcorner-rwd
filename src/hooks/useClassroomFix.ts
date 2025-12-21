import { useState } from 'react';
import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';

type FixStatus = 'idle' | 'fixing' | 'success' | 'error';

/**
 * Hook to perform a sequential classroom fix:
 *  - Step A: force-play remote audio tracks (user gesture)
 *  - Step B: ensure local tracks are enabled
 *  - Step C: manage status transitions
 */
export function useClassroomFix(
  client: IAgoraRTCClient | null | undefined,
  localTracks: Array<ICameraVideoTrack | IMicrophoneAudioTrack | null | undefined>
) {
  const [fixStatus, setFixStatus] = useState<FixStatus>('idle');

  const triggerFix = async (): Promise<boolean> => {
    setFixStatus('fixing');
    try {
      // Step A: autoplay unlock - iterate remote users and call play() on audio tracks
      try {
        const users = (client?.remoteUsers ?? []) as IAgoraRTCRemoteUser[];
        for (const u of users) {
          try {
            const audioTrack = (u as any).audioTrack;
            if (audioTrack && typeof audioTrack.play === 'function') {
              const p = audioTrack.play();
              if (p && typeof p.then === 'function') {
                // await but ignore rejections (they indicate autoplay still blocked)
                await p.catch(() => {});
              }
            }
          } catch (e) {
            // per-user play failure shouldn't stop the sequence
          }
        }
      } catch (e) {
        // ignore
      }

      // Step B: ensure local tracks are enabled (unmute / setEnabled(true))
      try {
        for (const t of localTracks || []) {
          if (!t) continue;
          try {
            // Agora tracks expose setEnabled for both audio & video in v4.x
            if (typeof (t as any).setEnabled === 'function') {
              (t as any).setEnabled(true);
            } else if (typeof (t as any).setMuted === 'function') {
              (t as any).setMuted(false);
            }
          } catch (e) {
            // ignore per-track errors
          }
        }
      } catch (e) {
        // ignore
      }

      setFixStatus('success');
      // revert after 3s so UI can be used again
      setTimeout(() => setFixStatus('idle'), 3000);
      return true;
    } catch (e) {
      setFixStatus('error');
      setTimeout(() => setFixStatus('idle'), 3000);
      return false;
    }
  };

  return { fixStatus, triggerFix } as const;
}

export type { FixStatus };

export default useClassroomFix;
