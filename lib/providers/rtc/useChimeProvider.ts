'use client';

/**
 * Phase 2 Stub: Amazon Chime SDK RTC provider.
 *
 * ACTIVATION (when ready):
 *   1. npm install amazon-chime-sdk-js
 *   2. Create /api/chime/meeting/route.ts:
 *        POST  → CreateMeeting + CreateAttendee via @aws-sdk/client-chime-sdk-meetings
 *        DELETE → DeleteMeeting
 *   3. Implement this hook using:
 *        import { DefaultMeetingSession, ConsoleLogger, DefaultDeviceController, MeetingSessionConfiguration } from 'amazon-chime-sdk-js'
 *      Key differences from Agora:
 *        - "Meeting" ≈ Agora channel; "Attendee" ≈ Agora UID
 *        - Chime uses AudioVideoFacade instead of IAgoraRTCClient
 *        - Video tiles are bound via meetingSession.audioVideo.bindVideoElement(tileId, videoEl)
 *   4. Set env vars:
 *        NEXT_PUBLIC_RTC_PROVIDER=chime
 *   5. No whiteboard/signaling changes needed at this phase.
 *
 * COST: $0.0017/attendee-minute = 54% cheaper than Agora RTC at $3.99/1,000 user-min.
 * Break-even vs LiveKit: < 22 classes/day → prefer Chime (no server to manage).
 */

import { useRef, useState } from 'react';
import type { RTCProviderOptions } from '../types';

const NOOP_ASYNC = async () => {};

export function useChimeProvider(_opts: RTCProviderOptions) {
  const [joined] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const whiteboardRef = useRef<HTMLDivElement | null>(null);

  return {
    joined,
    loading: false,
    error: null,
    remoteUsers: [],
    whiteboardMeta: null,
    currentQuality: 'high',
    isLowLatencyMode: false,
    audioOutputDeviceId: null,
    localVideoRef,
    remoteVideoRef,
    whiteboardRef,
    fixStatus: 'idle',
    triggerFix: NOOP_ASYNC,
    join: async (_opts?: { publishAudio?: boolean; publishVideo?: boolean; audioDeviceId?: string; videoDeviceId?: string }) => {
      console.warn('[ChimeProvider] Amazon Chime SDK is not yet configured. See lib/providers/rtc/useChimeProvider.ts for activation steps.');
    },
    leave: NOOP_ASYNC,
    setLocalAudioEnabled: NOOP_ASYNC,
    setLocalVideoEnabled: NOOP_ASYNC,
    setVideoQuality: NOOP_ASYNC,
    setLowLatencyMode: () => {},
    checkAudioDevice: async () => false,
    checkVideoDevice: async () => false,
    checkDevices: async () => ({ hasAudioInput: false, hasVideoInput: false }),
    getAudioOutputDevices: async () => [] as Array<{ deviceId: string; label?: string }>,
    setAudioOutputDevice: NOOP_ASYNC,
    autoplayFailed: false,
  };
}
