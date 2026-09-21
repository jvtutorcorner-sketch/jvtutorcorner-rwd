'use client';

/**
 * Phase 3: LiveKit RTC provider（自建 LiveKit 的前端實作，Agora 的備援方案）。
 *
 * 這個 hook 回傳與 `lib/agora/useAgoraClassroom.ts` **完全相同的形狀**，所以
 * `useRTC.ts` 切換 provider 時，`ClientClassroom.tsx` 一行都不用改：
 *   NEXT_PUBLIC_RTC_PROVIDER=livekit
 *
 * ── 與 Agora 的相容重點 ──────────────────────────────────────────────────────
 *   * remoteUsers[]：每項是「Agora 形狀」的物件 { uid, hasVideo, hasAudio,
 *     videoTrack:{play(el),stop()}, audioTrack:{play(el),stop()} }。
 *     ClientClassroom 用 String(user.uid) 當 key、用 user.videoTrack.play(el)
 *     把畫面放到 <div>（RemoteParticipantVideo）或 <video>（remoteVideoRef）。
 *   * 第一位遠端的視訊，hook 內部自動接到 remoteVideoRef.current（<video>）。
 *   * join(opts) 收 { publishAudio, publishVideo, audioDeviceId, videoDeviceId }。
 *
 * ── 未被啟用時零連線 ─────────────────────────────────────────────────────────
 * useRTC 會無條件呼叫三個 provider hook，但真正的連線只在 ClientClassroom 對
 * 「當前啟用的 provider」呼叫 join() 時才發生。provider=agora 時 ClientClassroom
 * 拿到的是 Agora 的 join，這裡的 join 永遠不會被呼叫 → 本 hook 只是一堆 ref/state。
 *
 * ── Token 來源 ───────────────────────────────────────────────────────────────
 * POST /api/livekit/token（見 app/api/livekit/token/route.ts），目前用 channelName
 * 當作 roomId 反查 course-session。要用 courseSessionId 直接授權時，於 session 佈建
 * 階段把 course-sessions.roomId 設成 channelName（見 docs/livekit-migration/README.md）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  ConnectionState,
  type RemoteTrack,
  type LocalVideoTrack,
} from 'livekit-client';
import type { RTCProviderOptions, VideoQuality } from '../types';

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

// 品質對應到 LiveKit 的擷取解析度預設
const QUALITY_TO_PRESET: Record<VideoQuality, { width: number; height: number }> = {
  low: { width: VideoPresets.h180.width, height: VideoPresets.h180.height },
  medium: { width: VideoPresets.h360.width, height: VideoPresets.h360.height },
  high: { width: VideoPresets.h720.width, height: VideoPresets.h720.height },
  ultra: { width: VideoPresets.h1080.width, height: VideoPresets.h1080.height },
};

// ── Agora 形狀的 track 包裝 ────────────────────────────────────────────────────
// Agora 的 track.play(el) 接受 <video>/<audio>/<div>/elementId；LiveKit 是 attach()。
// 這裡把差異吸收掉，讓 ClientClassroom 現有的呼叫方式原封不動能用。

interface AgoraLikeTrack {
  play: (el: HTMLElement | string) => void;
  stop: () => void;
  _lkTrack: RemoteTrack;
}

function resolveElement(el: HTMLElement | string): HTMLElement | null {
  if (typeof el === 'string') return document.getElementById(el);
  return el ?? null;
}

function wrapVideoTrack(track: RemoteTrack): AgoraLikeTrack {
  let created: HTMLMediaElement | null = null;
  return {
    _lkTrack: track,
    play: (el) => {
      try {
        const target = resolveElement(el);
        if (!target) return;
        if (target instanceof HTMLMediaElement) {
          track.attach(target);
        } else {
          // 容器 <div>：建一個 <video> 塞進去（RemoteParticipantVideo 的用法）
          const video = document.createElement('video');
          video.autoplay = true;
          video.playsInline = true;
          video.muted = true; // 視訊元素靜音，聲音走 audioTrack
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.objectFit = 'cover';
          target.innerHTML = '';
          target.appendChild(video);
          created = video;
          track.attach(video);
        }
      } catch (e) {
        console.warn('[LiveKit] videoTrack.play failed', e);
      }
    },
    stop: () => {
      try {
        track.detach();
        if (created) {
          created.remove();
          created = null;
        }
      } catch (e) {
        console.warn('[LiveKit] videoTrack.stop failed', e);
      }
    },
  };
}

function wrapAudioTrack(track: RemoteTrack, sinkId: string | null): AgoraLikeTrack {
  let created: HTMLAudioElement | null = null;
  return {
    _lkTrack: track,
    play: (el) => {
      try {
        const target = el ? resolveElement(el) : null;
        if (target instanceof HTMLMediaElement) {
          track.attach(target);
          return;
        }
        // Agora 遠端音訊是自動播放：建一個隱藏 <audio> 掛到 body
        const audio = track.attach() as HTMLAudioElement;
        if (sinkId && typeof (audio as any).setSinkId === 'function') {
          (audio as any).setSinkId(sinkId).catch(() => {});
        }
        audio.style.display = 'none';
        document.body.appendChild(audio);
        created = audio;
      } catch (e) {
        console.warn('[LiveKit] audioTrack.play failed', e);
      }
    },
    stop: () => {
      try {
        track.detach();
        if (created) {
          created.remove();
          created = null;
        }
      } catch (e) {
        console.warn('[LiveKit] audioTrack.stop failed', e);
      }
    },
  };
}

/** ClientClassroom 讀取的遠端使用者形狀（對齊 Agora IAgoraRTCRemoteUser 的子集）。 */
export interface AgoraLikeRemoteUser {
  uid: string;
  hasVideo: boolean;
  hasAudio: boolean;
  videoTrack: AgoraLikeTrack | null;
  audioTrack: AgoraLikeTrack | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLiveKitProvider(opts: RTCProviderOptions) {
  const { channelName, defaultQuality = 'high' } = opts;

  const roomRef = useRef<Room | null>(null);
  const joiningRef = useRef(false);
  const sinkIdRef = useRef<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const whiteboardRef = useRef<HTMLDivElement | null>(null);

  // 以 track.sid 快取包裝物件，讓同一條 track 在多次 rebuild 間保持「同一個參考」，
  // 避免 ClientClassroom 的 RemoteParticipantVideo（effect deps [user, user.videoTrack]）
  // 每次 rebuild 都 detach/reattach 造成畫面閃爍。
  const trackWrapCache = useRef<Map<string, AgoraLikeTrack>>(new Map());

  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<AgoraLikeRemoteUser[]>([]);
  const [currentQuality, setCurrentQuality] = useState<VideoQuality>(defaultQuality);
  const [isLowLatencyMode, setIsLowLatencyMode] = useState(false);
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState<string | null>(null);
  const [fixStatus, setFixStatus] = useState<'idle' | 'fixing' | 'success' | 'error'>('idle');
  const [autoplayFailed, setAutoplayFailed] = useState(false);

  // ── 從 LiveKit Room 重建 remoteUsers 快照 ────────────────────────────────────
  const rebuildRemoteUsers = useCallback((room: Room) => {
    const cache = trackWrapCache.current;
    const liveSids = new Set<string>();

    const wrapCached = (
      track: RemoteTrack,
      make: () => AgoraLikeTrack
    ): AgoraLikeTrack => {
      const sid = track.sid || '';
      liveSids.add(sid);
      const existing = cache.get(sid);
      if (existing && existing._lkTrack === track) return existing;
      const wrapped = make();
      if (sid) cache.set(sid, wrapped);
      return wrapped;
    };

    const users: AgoraLikeRemoteUser[] = [];
    room.remoteParticipants.forEach((p) => {
      const videoPub = p.getTrackPublication(Track.Source.Camera);
      const audioPub = p.getTrackPublication(Track.Source.Microphone);
      const vt = videoPub?.track;
      const at = audioPub?.track;
      const videoTrack = vt && !videoPub!.isMuted ? wrapCached(vt, () => wrapVideoTrack(vt)) : null;
      const audioTrack = at ? wrapCached(at, () => wrapAudioTrack(at, sinkIdRef.current)) : null;
      users.push({
        uid: p.identity,
        hasVideo: !!videoTrack,
        hasAudio: !!audioTrack,
        videoTrack,
        audioTrack,
      });
    });

    // 清掉已消失的 track 快取，避免記憶體洩漏
    for (const sid of Array.from(cache.keys())) {
      if (!liveSids.has(sid)) cache.delete(sid);
    }
    setRemoteUsers(users);

    // 第一位遠端的視訊自動接到 remoteVideoRef（<video>），對齊 Agora hook 的行為
    const first = users[0];
    if (first?.videoTrack && remoteVideoRef.current) {
      first.videoTrack.play(remoteVideoRef.current);
    }
    // 遠端音訊自動播放
    users.forEach((u) => u.audioTrack?.play(''));
  }, []);

  // ── 事件註冊 ────────────────────────────────────────────────────────────────
  const wireRoomEvents = useCallback(
    (room: Room) => {
      const refresh = () => rebuildRemoteUsers(room);
      room
        .on(RoomEvent.ParticipantConnected, refresh)
        .on(RoomEvent.ParticipantDisconnected, refresh)
        .on(RoomEvent.TrackSubscribed, refresh)
        .on(RoomEvent.TrackUnsubscribed, refresh)
        .on(RoomEvent.TrackMuted, refresh)
        .on(RoomEvent.TrackUnmuted, refresh)
        .on(RoomEvent.Reconnecting, () => {
          console.warn('[LiveKit] reconnecting…');
          setError('網路不穩，重新連線中…');
        })
        .on(RoomEvent.Reconnected, () => {
          console.log('[LiveKit] reconnected');
          setError(null);
          refresh();
        })
        .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          if (state === ConnectionState.Connected) setError(null);
        })
        .on(RoomEvent.Disconnected, () => {
          setJoined(false);
          setRemoteUsers([]);
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => {
          setAutoplayFailed(!room.canPlaybackAudio);
        })
        .on(RoomEvent.MediaDevicesError, (e: Error) => {
          console.warn('[LiveKit] media device error', e);
          setError('無法存取麥克風或攝影機');
        });
    },
    [rebuildRemoteUsers]
  );

  // ── join ────────────────────────────────────────────────────────────────────
  const join = useCallback(
    async (joinOpts?: {
      publishAudio?: boolean;
      publishVideo?: boolean;
      audioDeviceId?: string;
      videoDeviceId?: string;
    }) => {
      if (joiningRef.current || roomRef.current) return;
      joiningRef.current = true;
      setLoading(true);
      setError(null);
      try {
        if (!LIVEKIT_URL) throw new Error('NEXT_PUBLIC_LIVEKIT_URL is not set');

        // 1. 取 token（授權在後端做，見 authorizeJoin）
        const res = await fetch('/api/livekit/token', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ roomId: channelName }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          const reason = data?.reason || res.status;
          throw new Error(data?.message || `Token request failed (${reason})`);
        }

        // 2. 建 Room（adaptiveStream 省頻寬、dynacast 依訂閱動態調層）
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: {
            resolution: { ...QUALITY_TO_PRESET[defaultQuality], frameRate: 30 },
            deviceId: joinOpts?.videoDeviceId,
          },
          audioCaptureDefaults: {
            deviceId: joinOpts?.audioDeviceId,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        roomRef.current = room;
        wireRoomEvents(room);

        // 3. 連線
        await room.connect(data.url || LIVEKIT_URL, data.token);

        // 4. 發佈本地音視訊（依角色 / opts；學生也要能發佈）
        const publishAudio = joinOpts?.publishAudio ?? true;
        const publishVideo = joinOpts?.publishVideo ?? true;
        if (publishAudio) {
          await room.localParticipant.setMicrophoneEnabled(true);
        }
        if (publishVideo) {
          await room.localParticipant.setCameraEnabled(true);
          // 本地預覽接到 localVideoRef
          const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
          if (camPub?.track && localVideoRef.current) {
            (camPub.track as LocalVideoTrack).attach(localVideoRef.current);
          }
        }

        setJoined(true);
        setAutoplayFailed(!room.canPlaybackAudio);
        rebuildRemoteUsers(room);
      } catch (e: any) {
        console.error('[LiveKit] join failed', e);
        setError(e?.message || '連線失敗');
        try { await roomRef.current?.disconnect(); } catch {}
        roomRef.current = null;
      } finally {
        setLoading(false);
        joiningRef.current = false;
      }
    },
    [channelName, defaultQuality, wireRoomEvents, rebuildRemoteUsers]
  );

  // ── leave ─────────────────────────────────────────────────────────────────
  const leave = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    setJoined(false);
    setRemoteUsers([]);
    trackWrapCache.current.clear();
    try {
      await room?.disconnect();
    } catch (e) {
      console.warn('[LiveKit] leave failed', e);
    }
  }, []);

  // 卸載時清理，避免遺留連線
  useEffect(() => {
    const cache = trackWrapCache.current;
    return () => {
      try { roomRef.current?.disconnect(); } catch {}
      roomRef.current = null;
      cache.clear();
    };
  }, []);

  // ── 控制 ────────────────────────────────────────────────────────────────────
  const setLocalAudioEnabled = useCallback(async (enabled: boolean, deviceId?: string) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      if (deviceId) await room.switchActiveDevice('audioinput', deviceId).catch(() => {});
      await room.localParticipant.setMicrophoneEnabled(enabled);
    } catch (e) {
      console.warn('[LiveKit] setLocalAudioEnabled failed', e);
    }
  }, []);

  const setLocalVideoEnabled = useCallback(async (enabled: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setCameraEnabled(enabled);
      if (enabled) {
        const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (camPub?.track && localVideoRef.current) {
          (camPub.track as LocalVideoTrack).attach(localVideoRef.current);
        }
      }
    } catch (e) {
      console.warn('[LiveKit] setLocalVideoEnabled failed', e);
    }
  }, []);

  const setVideoQuality = useCallback(async (q: VideoQuality) => {
    setCurrentQuality(q);
    const room = roomRef.current;
    if (!room) return;
    try {
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      const track = camPub?.track as LocalVideoTrack | undefined;
      if (track) {
        await track.restartTrack({ resolution: { ...QUALITY_TO_PRESET[q], frameRate: 30 } });
      }
    } catch (e) {
      console.warn('[LiveKit] setVideoQuality failed', e);
    }
  }, []);

  const setLowLatencyMode = useCallback((on: boolean) => {
    // LiveKit 預設就是低延遲 SFU；此旗標僅記錄狀態以維持介面相容。
    setIsLowLatencyMode(on);
  }, []);

  const setAudioOutputDevice = useCallback(async (deviceId: string | null) => {
    sinkIdRef.current = deviceId;
    setAudioOutputDeviceId(deviceId);
    const room = roomRef.current;
    if (!room || !deviceId) return;
    try {
      await room.switchActiveDevice('audiooutput', deviceId);
    } catch (e) {
      console.warn('[LiveKit] setAudioOutputDevice failed', e);
    }
  }, []);

  const triggerFix = useCallback(async () => {
    setFixStatus('fixing');
    try {
      const room = roomRef.current;
      if (room) {
        // 讓瀏覽器在使用者手勢下恢復音訊自動播放
        await room.startAudio().catch(() => {});
        setAutoplayFailed(!room.canPlaybackAudio);
        rebuildRemoteUsers(room);
      }
      setFixStatus('success');
      setTimeout(() => setFixStatus('idle'), 2000);
    } catch (e) {
      console.warn('[LiveKit] triggerFix failed', e);
      setFixStatus('error');
      setTimeout(() => setFixStatus('idle'), 2000);
    }
  }, [rebuildRemoteUsers]);

  // ── 設備列舉（與 Agora 版同一套 navigator API） ──────────────────────────────
  const checkAudioDevice = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return false;
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      return d.some((x) => x.kind === 'audioinput');
    } catch { return false; }
  }, []);

  const checkVideoDevice = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return false;
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      return d.some((x) => x.kind === 'videoinput');
    } catch { return false; }
  }, []);

  const checkDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return { hasAudioInput: false, hasVideoInput: false };
    }
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      return {
        hasAudioInput: d.some((x) => x.kind === 'audioinput'),
        hasVideoInput: d.some((x) => x.kind === 'videoinput'),
      };
    } catch {
      return { hasAudioInput: false, hasVideoInput: false };
    }
  }, []);

  const getAudioOutputDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return [] as Array<{ deviceId: string; label?: string }>;
    }
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      return d.filter((x) => x.kind === 'audiooutput').map((x) => ({ deviceId: x.deviceId, label: x.label }));
    } catch {
      return [] as Array<{ deviceId: string; label?: string }>;
    }
  }, []);

  return {
    // 狀態
    joined,
    loading,
    error,
    remoteUsers,
    whiteboardMeta: null as { uuid?: string; appId?: string; region?: string } | null,
    currentQuality,
    isLowLatencyMode,
    audioOutputDeviceId,
    // DOM refs
    localVideoRef,
    remoteVideoRef,
    whiteboardRef,
    // Troubleshoot
    fixStatus,
    triggerFix,
    autoplayFailed,
    // 控制
    join,
    leave,
    setLocalAudioEnabled,
    setLocalVideoEnabled,
    setVideoQuality,
    setLowLatencyMode,
    // 設備
    checkAudioDevice,
    checkVideoDevice,
    checkDevices,
    getAudioOutputDevices,
    setAudioOutputDevice,
  };
}
