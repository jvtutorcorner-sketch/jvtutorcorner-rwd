// lib/agora/useAgoraClassroom.ts
"use client";

import { useEffect, useRef, useState } from 'react';
import type {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
} from 'agora-rtc-sdk-ng';
// don't import types from white-web-sdk (we load it from CDN at runtime)
type Room = any;

export type ClassroomRole = 'teacher' | 'student';

const hexToRgbArray = (value: string | number[]): [number, number, number] => {
  if (Array.isArray(value) && value.length === 3) {
    const arr = value as number[];
    return [arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0];
  }
  let hex = (value || '').toString().trim();
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (hex.length !== 6 || Number.isNaN(Number.parseInt(hex, 16))) {
    return [0, 0, 0];
  }
  const num = Number.parseInt(hex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
};

// 视频质量配置
export type VideoQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface VideoQualityConfig {
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
}

const VIDEO_QUALITY_PRESETS: Record<VideoQuality, VideoQualityConfig> = {
  low: { width: 320, height: 240, frameRate: 15, bitrate: 200 },
  medium: { width: 640, height: 480, frameRate: 15, bitrate: 500 },
  high: { width: 1280, height: 720, frameRate: 30, bitrate: 1500 },
  ultra: { width: 1920, height: 1080, frameRate: 30, bitrate: 3000 }
};

interface UseAgoraClassroomOptions {
  channelName: string;
  role: ClassroomRole;
  // 新增：1对1优化
  isOneOnOne?: boolean;
  // 新增：默认视频质量
  defaultQuality?: VideoQuality;
}

interface AgoraJoinResponse {
  appId: string;
  channelName: string;
  uid: number;
  token: string;
  whiteboardAppId: string;
  whiteboardRoomUUID: string;
  whiteboardRoomToken: string;
}

export function useAgoraClassroom({ 
  channelName, 
  role, 
  isOneOnOne = false,
  defaultQuality = 'high'
}: UseAgoraClassroomOptions) {
  // create client lazily on join (dynamic import) to avoid server-side evaluation
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  // runtime-loaded Agora SDK module (avoid top-level import to prevent SSR errors)
  let AgoraSDK: any = null;

  const [joined, setJoined] = useState(false);
  const [autoplayFailed, setAutoplayFailed] = useState(false);
  const [fixStatus, setFixStatus] = useState<'idle' | 'fixing' | 'success' | 'error'>('idle');
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whiteboardMeta, setWhiteboardMeta] = useState<{ uuid?: string; appId?: string; region?: string } | null>(null);

  // 新增：视频质量控制状态
  const [currentQuality, setCurrentQuality] = useState<VideoQuality>(defaultQuality);
  const [isLowLatencyMode, setIsLowLatencyMode] = useState(isOneOnOne);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const whiteboardRef = useRef<HTMLDivElement | null>(null);
  const clientChannelRef = useRef<string | null>(null);

  const localMicTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localCamTrackRef = useRef<ICameraVideoTrack | null>(null);
  const handleUserPublishedRef = useRef<((user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => Promise<void>) | null>(null);
  const handleUserUnpublishedRef = useRef<((user: IAgoraRTCRemoteUser) => void) | null>(null);
  const handleUserLeftRef = useRef<((user: IAgoraRTCRemoteUser) => void) | null>(null);

  // 视频质量控制函数
  const setVideoQuality = async (quality: VideoQuality) => {
    if (!localCamTrackRef.current) return;

    const config = VIDEO_QUALITY_PRESETS[quality];
    try {
      await localCamTrackRef.current.setEncoderConfiguration({
        width: config.width,
        height: config.height,
        frameRate: config.frameRate,
        bitrateMin: config.bitrate * 0.8,
        bitrateMax: config.bitrate * 1.2,
      });
      setCurrentQuality(quality);
      console.log(`Video quality set to ${quality}:`, config);
    } catch (e) {
      console.warn('Failed to set video quality:', e);
    }
  };

  // 低延迟模式切换
  const setLowLatencyMode = async (enabled: boolean) => {
    if (!clientRef.current) return;

    try {
      if (enabled) {
        // 启用低延迟模式 - 设置为观众角色以获得更低的延迟
        await clientRef.current.setClientRole('audience');
      } else {
        // 恢复正常模式
        await clientRef.current.setClientRole('host');
      }
      setIsLowLatencyMode(enabled);
      console.log(`Low latency mode ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Failed to set low latency mode:', error);
    }
  };

  // 1对1优化配置
  const applyOneOnOneOptimizations = async (client: IAgoraRTCClient) => {
    try {
      // 设置网络质量优先级 - 在 RTC 模式下音频优先
      await client.setStreamFallbackOption(0, 1); // 音频优先
      
      console.log('Applied 1-on-1 optimizations');
    } catch (error) {
      console.error('Failed to apply 1-on-1 optimizations:', error);
    }
  };

  // join with options: whether to publish audio/video
  const joinWithOptions = async (opts?: { publishAudio?: boolean; publishVideo?: boolean; audioDeviceId?: string; videoDeviceId?: string; }) => {
    const { publishAudio = true, publishVideo = true, audioDeviceId, videoDeviceId } = opts || {};
    if (joined || loading) return;

    try {
      setLoading(true);
      setError(null);

      // 簡單給 uid：老師用 1，學生隨機

      const uid = role === 'teacher' ? 1 : Math.floor(1000 + Math.random() * 9000);

      const res = await fetch(`/api/agora/token?channelName=${encodeURIComponent(channelName)}&uid=${uid}`);

      if (!res.ok) {
        let bodyText = '';
        try { bodyText = await res.text(); } catch (e) { bodyText = String(e); }
        console.error('[Agora] Token fetch failed', { status: res.status, bodyText, channelName, uid });
        const { error } = await res.json().catch(() => ({ error: bodyText }));
        throw new Error(error || 'Failed to fetch token');
      }

      const data = (await res.json()) as AgoraJoinResponse;
      console.log('[Agora] Token response', { channelName: data.channelName, uid: data.uid });

      // if a client is already connected to a different channel, leave first
      if (clientRef.current && clientChannelRef.current && clientChannelRef.current !== channelName) {
        try {
          // ensure previous session is cleaned up before joining new course
          await leave();
        } catch (e) {
          console.warn('Failed to leave previous session before rejoining', e);
        }
      }

      // ensure Agora client exists (dynamic import)
      if (!clientRef.current) {
        const AgoraModule = await import('agora-rtc-sdk-ng');
        const Agora = (AgoraModule as any).default ?? AgoraModule;
        AgoraSDK = Agora;
        
        // 開啟詳細日誌
        try {
          Agora.setLogLevel(0); // 0: DEBUG, 1: INFO, 2: WARNING, 3: ERROR, 4: NONE
          console.log('[Agora] SDK Log level set to DEBUG');
        } catch (e) {
          console.warn('[Agora] Failed to set log level', e);
        }
        
        // 使用 RTC 模式，所有参与者都可以发布 and 订阅
        const clientConfig = {
          mode: 'rtc' as const,
          codec: 'vp8' as const
        };
        
        const client = Agora.createClient(clientConfig);
        clientRef.current = client;

        // 監控連線狀態
        client.on('connection-state-change', (curState: string, revState: string, reason?: string) => {
          console.log(`[Agora] Connection state changed from ${revState} to ${curState}. Reason: ${reason}`);
          if (curState === 'DISCONNECTED' && reason === 'INTERRUPTED') {
            console.warn('[Agora] Connection interrupted, check your network (UDP ports might be blocked)');
          }
        });

        // Register persistent listeners that use refs to call the latest handlers
        client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
          console.log('[Agora] Persistent user-published event', { uid: user.uid, mediaType });
          if (handleUserPublishedRef.current) {
            await handleUserPublishedRef.current(user, mediaType);
          }
        });
        client.on('user-unpublished', (user: IAgoraRTCRemoteUser) => {
          console.log('[Agora] Persistent user-unpublished event', { uid: user.uid });
          if (handleUserUnpublishedRef.current) {
            handleUserUnpublishedRef.current(user);
          }
        });
        client.on('user-left', (user: IAgoraRTCRemoteUser) => {
          console.log('[Agora] Persistent user-left event', { uid: user.uid });
          if (handleUserLeftRef.current) {
            handleUserLeftRef.current(user);
          }
        });
      }

      const client = clientRef.current!;

      // 監聽遠端使用者 — 定義 handlers 並更新 refs
      const onUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        try {
          console.log('[Agora] user-published handler executing', { uid: user.uid, mediaType });
          console.log('[Agora] Subscribing to user', { uid: user.uid, mediaType });
          await client.subscribe(user, mediaType);

          // Log presence of tracks
          console.log('[Agora] After subscribe, tracks:', {
            uid: user.uid,
            hasVideo: !!user.videoTrack,
            hasAudio: !!user.audioTrack
          });

          // To reduce A/V desync, prefer to start audio playback first and await it,
          // then start video playback. This reduces the chance video appears before audio.
          const tStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

          // Play audio first (if present)
          if (user.audioTrack) {
            try {
              const audioPlay: any = user.audioTrack.play();
              try { if (typeof window !== 'undefined') (window as any).__agoraAudioPlaying = false; } catch (e) {}
              if (audioPlay && typeof audioPlay.then === 'function') {
                await audioPlay as Promise<void>;
                try { if (typeof window !== 'undefined') (window as any).__agoraAudioPlaying = true; } catch (e) {}
                console.log('[Agora] Remote audio started playing for', user.uid, 'at', (performance.now ? performance.now() : Date.now()) - tStart, 'ms');
              } else {
                try { if (typeof window !== 'undefined') (window as any).__agoraAudioPlaying = true; } catch (e) {}
                console.log('[Agora] Remote audio play (non-promise) assumed playing for', user.uid);
              }
            } catch (err) {
              console.warn('[Agora] Remote audio play failed/blocked', err);
              setAutoplayFailed(true);
              setTimeout(() => { try { requestEnableSound(); } catch (e) { console.warn('[Agora] requestEnableSound failed', e); } }, 1000);
            }
          }

          // Then play video (if present)
          if (user.videoTrack) {
            const remoteEl = remoteVideoRef.current ?? localVideoRef.current;
            if (remoteEl) {
              try {
                const playRes: any = user.videoTrack.play(remoteEl);
                if (playRes && typeof playRes.then === 'function') {
                  await playRes;
                  console.log('[Agora] Remote video started playing for', user.uid, 'at', (performance.now ? performance.now() : Date.now()) - tStart, 'ms');
                }
              } catch (e) {
                console.warn('[Agora] Failed to play remote video track, scheduling retry', e);
                setTimeout(() => {
                  try { 
                    if (user.videoTrack) {
                      user.videoTrack.play(remoteEl); 
                      console.log('[Agora] Retry video play attempted'); 
                    }
                  } catch (err) { console.warn('[Agora] Retry video play failed', err); }
                }, 300);
              }
            } else {
              console.warn('[Agora] No video element available to play remote video');
            }
          }

          setRemoteUsers([...client.remoteUsers]);
          console.log('[Agora] remoteUsers updated, count:', client.remoteUsers.length);
        } catch (err) {
          console.warn('user-published handler error', err);
        }
      };

      const onUserUnpublished = (user: IAgoraRTCRemoteUser) => {
        console.log('[Agora] user-unpublished handler executing', { uid: user.uid });
        setRemoteUsers([...client.remoteUsers]);
        try { if (typeof window !== 'undefined') (window as any).__agoraAudioPlaying = false; } catch (e) {}
      };

      const onUserLeft = (user: IAgoraRTCRemoteUser) => {
        console.log('[Agora] user-left handler executing', { uid: user.uid });
        setRemoteUsers([...client.remoteUsers]);
        try { if (typeof window !== 'undefined') (window as any).__agoraAudioPlaying = false; } catch (e) {}
      };

      handleUserPublishedRef.current = onUserPublished;
      handleUserUnpublishedRef.current = onUserUnpublished;
      handleUserLeftRef.current = onUserLeft;

      console.log('[Agora] Final channel name for join:', channelName);
      console.log('[Agora] Attempting client.join', { appId: data.appId, channelName: data.channelName, uid: data.uid });
      await client.join(data.appId, data.channelName, data.token, data.uid);
      console.log('[Agora] client.join succeeded', { channelName: data.channelName, uid: data.uid });

      // Safety check: if there are already remote users publishing, trigger handlers manually
      // (though registering before join should have caught them)
      if (client.remoteUsers && client.remoteUsers.length > 0) {
        console.log('[Agora] Found existing remote users after join:', client.remoteUsers.length);
        for (const user of client.remoteUsers) {
          if (user.hasAudio) onUserPublished(user, 'audio');
          if (user.hasVideo) onUserPublished(user, 'video');
        }
      }

      clientChannelRef.current = data.channelName;
      // Expose client on window for E2E debugging (temporary)
      try {
        if (typeof window !== 'undefined') {
          (window as any).__agoraClient = client;
          // initialize audio-playing flag for E2E
          (window as any).__agoraAudioPlaying = false;
        }
      } catch (e) {}

      // 应用1对1优化 (AFTER join, when websocket is ready)
      if (isOneOnOne) {
        await applyOneOnOneOptimizations(client);
      }

      // Request server to create/return Agora Whiteboard room + token
      // Use localStorage to share the same whiteboard room UUID across participants
      const whiteboardRoomKey = `whiteboard_room_${channelName}`;
      let wbAppId: string | null = null;
      let wbUuid: string | null = null;
      let wbRoomToken: string | null = null;
      let wbRegion: string | null = null;
      
      try {
        // Try to get existing room UUID from localStorage
        const cachedUuid = typeof window !== 'undefined' ? localStorage.getItem(whiteboardRoomKey) : null;

        // If cachedUuid exists and is NOT a local course-scoped fallback, request token from server.
        if (cachedUuid && !cachedUuid.startsWith('course_')) {
          const wbResp = await fetch('/api/agora/whiteboard', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ 
              uuid: cachedUuid, // If we have cached UUID, request token for existing room
              name: channelName,
              role: 'admin' // Use admin role to ensure both teacher and student can write
            }),
          });
          if (wbResp.ok) {
            const wbJson = await wbResp.json();
            wbAppId = wbJson.whiteboardAppId ?? null;
            wbUuid = wbJson.uuid ?? null;
            wbRoomToken = wbJson.roomToken ?? null;
            wbRegion = wbJson.region ?? null;

            // Cache the UUID for other participants to use
            if (wbUuid && typeof window !== 'undefined') {
              const isNewRoom = !cachedUuid;
              localStorage.setItem(whiteboardRoomKey, wbUuid);

              // Notify other tabs if this is a newly created room
              if (isNewRoom) {
                try {
                  const courseIdFromChannel = channelName.replace(/^course_/, '').split('_')[0];
                  const bc = new BroadcastChannel(`whiteboard_course_${courseIdFromChannel}`);
                  bc.postMessage({ type: 'whiteboard_room_created', uuid: wbUuid, timestamp: Date.now() });
                  setTimeout(() => bc.close(), 100); // Close after brief delay to ensure message sent
                } catch (e) {
                  console.warn('BroadcastChannel not available:', e);
                }
              }
            }

            console.log('Whiteboard: Using canvas-based fallback instead of Netless SDK');
            setWhiteboardMeta({ uuid: wbUuid ?? undefined, appId: wbAppId ?? undefined, region: wbRegion ?? undefined });
          } else {
            const txt = await wbResp.text();
            console.warn('whiteboard API returned non-OK:', wbResp.status, txt);
          }
        } else if (cachedUuid && cachedUuid.startsWith('course_')) {
          // Use the cached course-scoped uuid without contacting server
          setWhiteboardMeta({ uuid: cachedUuid, appId: undefined, region: undefined });
          console.log('Whiteboard: Using cached course-scoped fallback uuid');
        }
      } catch (err) {
        console.warn('Failed to call /api/agora/whiteboard', err);
      }

      // Note: Whiteboard initialization removed - using canvas fallback instead
      console.log('Whiteboard: Using canvas-based fallback instead of Netless SDK');

      // Create tracks according to requested publish options
      let micTrack: IMicrophoneAudioTrack | null = null;
      let camTrack: ICameraVideoTrack | null = null;

      // New: Prepare device configs
      const micConfig: any = {};
      if (audioDeviceId) {
        micConfig.microphoneId = audioDeviceId;
      }

      const camConfig: any = {
        // Prefer front camera for classroom setting on mobile
        facingMode: 'user',
      };
      if (videoDeviceId) {
        camConfig.cameraId = videoDeviceId;
      }

      try {
        if (!AgoraSDK) {
          // ensure SDK is loaded (should have been loaded when creating client)
          const mod = await import('agora-rtc-sdk-ng');
          AgoraSDK = (mod as any).default ?? mod;
        }

        if (publishAudio && publishVideo) {
          console.log('[Agora] creating microphone and camera tracks with config', { micConfig, camConfig });
          const tracks = await AgoraSDK.createMicrophoneAndCameraTracks(micConfig, camConfig);
          micTrack = tracks[0] ?? null;
          camTrack = tracks[1] ?? null;
        } else if (publishAudio && !publishVideo) {
          console.log('[Agora] creating microphone track only with config', { micConfig });
          micTrack = await AgoraSDK.createMicrophoneAudioTrack(micConfig);
        } else if (!publishAudio && publishVideo) {
          console.log('[Agora] creating camera track only with config', { camConfig });
          camTrack = await AgoraSDK.createCameraVideoTrack(camConfig);
        }

        console.log('[Agora] tracks created', { hasMic: !!micTrack, hasCam: !!camTrack, currentQuality });

        // 应用视频质量设置
        if (camTrack) {
          const qualityConfig = VIDEO_QUALITY_PRESETS[currentQuality];
          await camTrack.setEncoderConfiguration({
            width: qualityConfig.width,
            height: qualityConfig.height,
            frameRate: qualityConfig.frameRate,
            bitrateMin: qualityConfig.bitrate * 0.8,
            bitrateMax: qualityConfig.bitrate * 1.2,
          });
        }
      } catch (err) {
        console.warn('create tracks failed, attempting fallbacks', (err as any)?.message ?? err);
        // individual fallbacks
        if (!micTrack && publishAudio) {
          try {
            if (!AgoraSDK) {
              const mod = await import('agora-rtc-sdk-ng');
              AgoraSDK = (mod as any).default ?? mod;
            }
            micTrack = await AgoraSDK.createMicrophoneAudioTrack(micConfig);
          } catch (mErr) {
            console.warn('createMicrophoneAudioTrack failed', (mErr as any)?.message ?? mErr);
            micTrack = null;
          }
        }
        if (!camTrack && publishVideo) {
          try {
            if (!AgoraSDK) {
              const mod = await import('agora-rtc-sdk-ng');
              AgoraSDK = (mod as any).default ?? mod;
            }
            camTrack = await AgoraSDK.createCameraVideoTrack(camConfig);
            // 即使是fallback也要應用質量設置
            if (camTrack) {
              const qualityConfig = VIDEO_QUALITY_PRESETS[currentQuality];
              await camTrack.setEncoderConfiguration({
                width: qualityConfig.width,
                height: qualityConfig.height,
                frameRate: qualityConfig.frameRate,
                bitrateMin: qualityConfig.bitrate * 0.8,
                bitrateMax: qualityConfig.bitrate * 1.2,
              });
            }
          } catch (cErr) {
            console.warn('createCameraVideoTrack failed', (cErr as any)?.message ?? cErr);
            camTrack = null;
          }
        }
      }

      localMicTrackRef.current = micTrack;
      localCamTrackRef.current = camTrack;

      if (camTrack) {
        // Always play the local camera track into the local preview element.
        // This ensures both teachers and students see their own camera preview.
        const playEl = localVideoRef.current ?? remoteVideoRef.current;
        if (playEl) {
          try {
            const playRes = camTrack.play(playEl) as any;
            // Some implementations return a Promise
            if (playRes && typeof playRes.then === 'function') {
              playRes.catch((playErr: any) => {
                console.warn('Failed to play local video track (promise)', playErr);
              });
            }
          } catch (playErr) {
            console.warn('Failed to play local video track', playErr);
          }
        } else {
          console.warn('No local or remote video element available to play local camera');
        }
      }

        const publishList: any[] = [];
      if (micTrack) publishList.push(micTrack);
      if (camTrack) publishList.push(camTrack);

      if (publishList.length > 0) {
        try {
          console.log('[Agora] publishing local tracks', { count: publishList.length });
          await client.publish(publishList);
          console.log('[Agora] publish succeeded');
        } catch (pubErr) {
          console.warn('[Agora] Failed to publish local tracks', (pubErr as any)?.message ?? pubErr);
        }
      } else {
        // No local tracks available: inform user but continue joined without publishing
        console.warn('[Agora] No local audio/video tracks available to publish');
        setError((prev) => (prev ? prev + ' | No local devices available' : 'No local devices available'));
      }

      setJoined(true);
      // Listen for SDK-level autoplay fail events if available
      try {
        if (client && typeof client.on === 'function') {
            // common variants of the event name
            const onAutoplay = (ev: any) => {
              console.warn('Agora autoplay failed event received', ev);
              setAutoplayFailed(true);
            };
            try { client.on('autoplay-failed', onAutoplay); } catch (e) {}
            try { client.on('AUTOPLAY_FAILED', onAutoplay); } catch (e) {}
          }
      } catch (e) {}
    } catch (e) {
      console.error('join classroom error:', e);
      setError((e as any)?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // expose a convenience join that uses defaults (audio+video)
  const join = async (opts?: { publishAudio?: boolean; publishVideo?: boolean; audioDeviceId?: string; videoDeviceId?: string; }) => {
    return joinWithOptions(opts);
  };

  // Attempt to enable audio playback by re-playing remote audio tracks.
  const requestEnableSound = async () => {
    try {
      setAutoplayFailed(false);
      const client = clientRef.current;
      if (!client) return false;
      const users = (client.remoteUsers || []) as any[];
      let ok = false;
      for (const u of users) {
        try {
          if (u.audioTrack) {
            const r = u.audioTrack.play();
            if (r && typeof r.then === 'function') {
              try {
                await r;
                try { if (typeof window !== 'undefined') (window as any).__agoraAudioPlaying = true; } catch (e) {}
              } catch (e) {
                try { if (typeof window !== 'undefined') (window as any).__agoraAudioPlaying = false; } catch (e) {}
              }
            } else {
              try { if (typeof window !== 'undefined') (window as any).__agoraAudioPlaying = true; } catch (e) {}
            }
            ok = true;
          }
        } catch (e) {
          // ignore per-track failures
        }
      }
      // also try to unmute/enable local audio if present
      if (localMicTrackRef.current) {
        try {
          if (typeof localMicTrackRef.current.setEnabled === 'function') localMicTrackRef.current.setEnabled(true);
        } catch (e) {}
      }
      return ok;
    } catch (e) {
      return false;
    }
  };

  // triggerFix: three-step troubleshooting sequence
  const triggerFix = async () => {
    // Steps (sequential): 1) force-play remote audio tracks to leverage user gesture
    // 2) recover local media devices (recreate + publish if needed)
    // 3) refresh subscriptions for remote users
    setFixStatus('fixing');
    try {
      const client = clientRef.current;
      if (!client) {
        setFixStatus('error');
        return false;
      }

      // Step 1: Force-play remote audio tracks (user gesture unlocking)
      try {
        const users = (client.remoteUsers || []) as any[];
        for (const u of users) {
          if (u && u.audioTrack) {
            try {
              const res = u.audioTrack.play();
              if (res && typeof res.then === 'function') {
                await res.catch(() => {});
              }
            } catch (e) {
              console.warn('triggerFix: audioTrack.play() failed for remote user', e);
            }
          }
        }
      } catch (e) {
        console.warn('triggerFix Step1 (play remote audio) failed', e);
      }

      // Step 2: Recover local media tracks (recreate & publish if closed)
      try {
        if (!AgoraSDK) {
          const mod = await import('agora-rtc-sdk-ng');
          AgoraSDK = (mod as any).default ?? mod;
        }

        const publishList: any[] = [];

        // Audio
        try {
          let mic = localMicTrackRef.current;
          let needPublishMic = false;
          if (!mic) {
            try {
              mic = await AgoraSDK.createMicrophoneAudioTrack();
              localMicTrackRef.current = mic;
              needPublishMic = true;
            } catch (e) {
              console.warn('triggerFix: failed to recreate microphone track', e);
            }
          } else {
            // check whether it appears stopped/closed
            try {
              if ((mic as any).closed || (mic as any).stopped) {
                try {
                  mic.stop?.(); mic.close?.();
                } catch {}
                mic = await AgoraSDK.createMicrophoneAudioTrack();
                localMicTrackRef.current = mic;
                needPublishMic = true;
              }
            } catch (e) {}
          }
          if (mic && needPublishMic && client) publishList.push(mic);
        } catch (e) {
          console.warn('triggerFix audio recover error', e);
        }

        // Video
        try {
          let cam = localCamTrackRef.current;
          let needPublishCam = false;
          if (!cam) {
            try {
              cam = await AgoraSDK.createCameraVideoTrack();
              localCamTrackRef.current = cam;
              needPublishCam = true;
            } catch (e) {
              console.warn('triggerFix: failed to recreate camera track', e);
            }
          } else {
            try {
              if ((cam as any).closed || (cam as any).stopped) {
                try { cam.stop?.(); cam.close?.(); } catch {}
                cam = await AgoraSDK.createCameraVideoTrack();
                localCamTrackRef.current = cam;
                needPublishCam = true;
              }
            } catch (e) {}
          }
          if (cam && needPublishCam && client) publishList.push(cam);
        } catch (e) {
          console.warn('triggerFix video recover error', e);
        }

        // If we have tracks to publish, unpublish old ones and publish new ones
        if (publishList.length > 0 && client) {
          try {
            // Unpublish any existing local tracks that are closed
            const toUnpublish: any[] = [];
            if (localMicTrackRef.current && (localMicTrackRef.current as any).closed) toUnpublish.push(localMicTrackRef.current);
            if (localCamTrackRef.current && (localCamTrackRef.current as any).closed) toUnpublish.push(localCamTrackRef.current);
            try { if (toUnpublish.length > 0) await client.unpublish(toUnpublish); } catch (e) {}

            try {
              await client.publish(publishList);
            } catch (pubErr) {
              console.warn('triggerFix: publish failed', pubErr);
            }
          } catch (e) {
            console.warn('triggerFix publishing error', e);
          }
        }
      } catch (e) {
        console.warn('triggerFix Step2 (recover local devices) failed', e);
      }

      // Step 3: Refresh subscriptions
      try {
        const client = clientRef.current;
        if (client) {
          const users = (client.remoteUsers || []) as any[];
          for (const u of users) {
            try {
              if (u && (u.videoTrack || u.audioTrack)) {
                // attempt to re-subscribe to both media types
                try { await client.subscribe(u, 'video'); } catch (e) {}
                try { await client.subscribe(u, 'audio'); } catch (e) {}

                // attempt to play tracks into elements (if present)
                if (u.videoTrack) {
                  try {
                    const remoteEl = remoteVideoRef.current ?? localVideoRef.current;
                    if (remoteEl) u.videoTrack.play(remoteEl);
                  } catch (e) {}
                }
                if (u.audioTrack) {
                  try {
                    const p = u.audioTrack.play();
                    if (p && typeof p.then === 'function') {
                      try { await p; try { if (typeof window !== 'undefined') (window as any).__agoraAudioPlaying = true; } catch (e) {} } catch (e) { try { if (typeof window !== 'undefined') (window as any).__agoraAudioPlaying = false; } catch (e) {} }
                    } else {
                      try { if (typeof window !== 'undefined') (window as any).__agoraAudioPlaying = true; } catch (e) {}
                    }
                  } catch (e) {}
                }
              }
            } catch (e) {
              // ignore per-user errors
            }
          }
        }
      } catch (e) {
        console.warn('triggerFix Step3 (refresh subscriptions) failed', e);
      }

      setFixStatus('success');
      // clear autoplay failed as we've tried forcing playback
      setAutoplayFailed(false);
      return true;
    } catch (e) {
      console.error('triggerFix top-level error', e);
      setFixStatus('error');
      return false;
    } finally {
      // after a short delay, revert to idle so UI can trigger again
      setTimeout(() => {
        setFixStatus('idle');
      }, 1500);
    }
  };

  const leave = async () => {
    try {
      localCamTrackRef.current?.stop();
      localCamTrackRef.current?.close();
      localMicTrackRef.current?.stop();
      localMicTrackRef.current?.close();

      const client = clientRef.current;
      if (client) {
        try {
          // remove listeners we registered (pass the same handler we attached)
          try {
            if (client.off && handleUserPublishedRef.current) client.off('user-published', handleUserPublishedRef.current);
          } catch {}
          try {
            if (client.off && handleUserUnpublishedRef.current) client.off('user-unpublished', handleUserUnpublishedRef.current);
          } catch {}
          try {
            if (client.off && handleUserLeftRef.current) client.off('user-left', handleUserLeftRef.current);
          } catch {}
        } catch {}

        try {
          await client.leave();
        } catch (e) {
          console.warn('client.leave() failed', e);
        }

        clientRef.current = null;
        clientChannelRef.current = null;
      }
    } finally {
        try { if (typeof window !== 'undefined') (window as any).__agoraAudioPlaying = false; } catch (e) {}
        setJoined(false);
        setRemoteUsers([]);
    }
  };

  // Listen for whiteboard room UUID from other tabs
  useEffect(() => {
    console.log('[useAgoraClassroom] Hook initialized for channel:', channelName, 'role:', role);
    
    if (typeof window === 'undefined') return;
    
    const courseIdFromChannel = channelName.replace(/^course_/, '').split('_')[0];
    const bc = new BroadcastChannel(`whiteboard_course_${courseIdFromChannel}`);
    
    bc.onmessage = (event) => {
      if (event.data?.type === 'whiteboard_room_created' && event.data.uuid) {
        const whiteboardRoomKey = `whiteboard_room_${channelName}`;
        const existingUuid = localStorage.getItem(whiteboardRoomKey);
        
        if (!existingUuid) {
          console.log('Received whiteboard UUID from other tab');
          localStorage.setItem(whiteboardRoomKey, event.data.uuid);
        }
      }
    };
    
    return () => {
      bc.close();
    };
  }, [channelName]);

  // 元件卸載時自動離開
  useEffect(() => {
    return () => {
      // ensure we leave when unmounting
      leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // 狀態
    joined,
    loading,
    error,
    remoteUsers,
    whiteboardMeta,
    // 新增：视频质量控制状态
    currentQuality,
    isLowLatencyMode,
    // device helpers
    checkAudioDevice: async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return false;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some((d) => d.kind === 'audioinput');
      } catch (e) {
        return false;
      }
    },
    checkVideoDevice: async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return false;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some((d) => d.kind === 'videoinput');
      } catch (e) {
        return false;
      }
    },
    checkDevices: async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return { hasAudioInput: false, hasVideoInput: false };
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasAudioInput = devices.some((d) => d.kind === 'audioinput');
        const hasVideoInput = devices.some((d) => d.kind === 'videoinput');
        return { hasAudioInput, hasVideoInput };
      } catch (e) {
        return { hasAudioInput: false, hasVideoInput: false };
      }
    },
    // DOM refs
    localVideoRef,
    remoteVideoRef,
    whiteboardRef,
    // Troubleshoot helpers
    fixStatus,
    triggerFix,
    // 控制
    join,
    leave,
    // control local audio track (mute/unmute or create+publish)
    setLocalAudioEnabled: async (enabled: boolean) => {
      try {
        // If not joined, nothing to do
        if (!clientRef.current) return;
        if (!AgoraSDK) {
          const mod = await import('agora-rtc-sdk-ng');
          AgoraSDK = (mod as any).default ?? mod;
        }

        if (enabled) {
          // create & publish if missing
          if (!localMicTrackRef.current) {
            try {
              localMicTrackRef.current = await AgoraSDK.createMicrophoneAudioTrack();
              if (localMicTrackRef.current && clientRef.current) {
                await clientRef.current.publish([localMicTrackRef.current]);
              }
            } catch (e) {
              console.warn('Failed to create/publish local mic track', e);
            }
          } else {
            try {
              if (typeof localMicTrackRef.current.setEnabled === 'function') {
                localMicTrackRef.current.setEnabled(true);
              } else if (typeof (localMicTrackRef.current as any).setMuted === 'function') {
                (localMicTrackRef.current as any).setMuted(false);
              }
            } catch (e) { console.warn('Failed to enable local mic track', e); }
          }
        } else {
          if (localMicTrackRef.current) {
            try {
              if (typeof localMicTrackRef.current.setEnabled === 'function') {
                localMicTrackRef.current.setEnabled(false);
              } else if (typeof (localMicTrackRef.current as any).setMuted === 'function') {
                (localMicTrackRef.current as any).setMuted(true);
              }
            } catch (e) { console.warn('Failed to disable local mic track', e); }
          }
        }
      } catch (e) {
        console.warn('setLocalAudioEnabled error', e);
      }
    },
    // 新增：视频质量控制函数
    setVideoQuality,
    setLowLatencyMode,
  };
}
