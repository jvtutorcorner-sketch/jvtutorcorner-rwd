'use client';

/**
 * Phase 3 Stub: LiveKit on ECS Fargate RTC provider.
 *
 * ACTIVATION (when ready):
 *   1. Infrastructure:
 *      - Deploy livekit/livekit Docker image on ECS Fargate (ap-northeast-1)
 *      - Open UDP 50000–60000 via NLB (Network Load Balancer)
 *      - Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET in ECS task environment
 *   2. npm install @livekit/components-react livekit-client
 *   3. Create /api/livekit/token/route.ts:
 *        POST { channelName, userId, role } → return signed JWT AccessToken
 *        using livekit-server-sdk: new AccessToken(key, secret).addGrant({roomJoin, room}).toJwt()
 *   4. Implement this hook using:
 *        import { Room, RoomEvent, Track } from 'livekit-client'
 *      Key similarities to Agora:
 *        - Room.connect(url, token) ≈ client.join(appId, channel, token, uid)
 *        - Room.localParticipant.publishTrack ≈ client.publish
 *        - room.on(RoomEvent.TrackSubscribed) ≈ client.on('user-published')
 *   5. Set env vars:
 *        NEXT_PUBLIC_RTC_PROVIDER=livekit
 *        NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit.example.com
 *   6. Migrate whiteboard to tldraw+Hocuspocus simultaneously (Phase 3b).
 *
 * COST: ~$100–150/month fixed (ECS Fargate) vs $559/month Agora at 50 classes/day = 73% saving.
 * Break-even vs Chime: > 22 classes/day → prefer LiveKit (fixed cost cap).
 */

import { useRef, useState } from 'react';
import type { RTCProviderOptions } from '../types';

const NOOP_ASYNC = async () => {};

export function useLiveKitProvider(_opts: RTCProviderOptions) {
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
      console.warn('[LiveKitProvider] LiveKit is not yet configured. See lib/providers/rtc/useLiveKitProvider.ts for activation steps.');
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
