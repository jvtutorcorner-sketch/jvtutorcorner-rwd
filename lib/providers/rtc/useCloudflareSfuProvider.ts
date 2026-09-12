'use client';

/**
 * Cloudflare Realtime SFU 的前端 provider（NEXT_PUBLIC_RTC_PROVIDER=cloudflare-sfu）。
 *
 * 回傳形狀與 useLiveKitProvider 完全相同，ClientClassroom 不用改：
 *   * remoteUsers[]：{ uid, hasVideo, hasAudio, videoTrack:{play(el),stop()}, audioTrack }
 *     uid = `${role}:${userId}`，與 LiveKit 的 identity 相同
 *   * 第一位遠端的視訊由 hook 自己接到 remoteVideoRef；遠端音訊由 hook 自己播放
 *   * join(opts) 收 { publishAudio, publishVideo, audioDeviceId, videoDeviceId }
 *   * 呼叫 join() 之前不建立任何連線（useRTC 會同時呼叫所有 provider 的 hook）
 *
 * 流程（全部經過 app/api/realtime/*，App Secret 不會進到瀏覽器）：
 *   1. POST /api/realtime/session  → 授權、建立 SFU session、拿到 TURN 憑證
 *   2. 建 RTCPeerConnection，本地麥克風／鏡頭以 sendonly transceiver 加入
 *   3. POST /api/realtime/tracks（local，帶 offer）→ 套用 SFU 的 answer
 *   4. 每 3 秒 GET /api/realtime/room，看到新的遠端軌道就拉：
 *      POST /api/realtime/tracks（remote）→ SFU 回 offer → 產生 answer → PUT /api/realtime/renegotiate
 *   5. 每 15 秒 POST /api/realtime/room 心跳；離開時帶 leaving:true
 *
 * 靜音／關鏡頭用 track.enabled = false，而不是 replaceTrack(null)：SFU 會回收 30 秒沒有
 * 媒體封包的軌道，停止送封包的話對方的畫面會在 30 秒後永久消失。
 *
 * 所有 SDP 協商都排進同一個佇列，避免推、拉、關閉同時進行時 offer/answer 交錯。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RTCProviderOptions, VideoQuality } from '../types';

const POLL_INTERVAL_MS = 3000;
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];

const QUALITY_TO_CONSTRAINTS: Record<VideoQuality, { width: number; height: number }> = {
  low: { width: 320, height: 180 },
  medium: { width: 640, height: 360 },
  high: { width: 1280, height: 720 },
  ultra: { width: 1920, height: 1080 },
};

type LocalTrackName = 'audio' | 'video';

interface MediaContext {
  sessionId: string;
  courseSessionId: string;
  role: 'teacher' | 'student' | 'admin';
}

interface RemoteParticipant {
  sessionId: string;
  identity: string;
  role: string;
  tracks: string[];
  joinedAt: string;
}

interface PulledTrack {
  sessionId: string;
  trackName: string;
  mid: string;
  track: MediaStreamTrack;
}

// ── Agora 形狀的 track 包裝 ────────────────────────────────────────────────────

interface AgoraLikeTrack {
  play: (el: HTMLElement | string) => void;
  stop: () => void;
  _track: MediaStreamTrack;
}

export interface AgoraLikeRemoteUser {
  uid: string;
  hasVideo: boolean;
  hasAudio: boolean;
  videoTrack: AgoraLikeTrack | null;
  audioTrack: AgoraLikeTrack | null;
}

function resolveElement(el: HTMLElement | string): HTMLElement | null {
  if (typeof el === 'string') return el ? document.getElementById(el) : null;
  return el ?? null;
}

function wrapVideoTrack(track: MediaStreamTrack): AgoraLikeTrack {
  let created: HTMLVideoElement | null = null;
  let attachedTo: HTMLMediaElement | null = null;
  return {
    _track: track,
    play: (el) => {
      try {
        const target = resolveElement(el);
        if (!target) return;
        const stream = new MediaStream([track]);
        if (target instanceof HTMLMediaElement) {
          target.srcObject = stream;
          attachedTo = target;
          target.play?.().catch(() => {});
          return;
        }
        // 容器 <div>：建一個 <video> 塞進去（RemoteParticipantVideo 的用法）
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true; // 聲音走 audioTrack
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.srcObject = stream;
        target.innerHTML = '';
        target.appendChild(video);
        created = video;
        video.play().catch(() => {});
      } catch (e) {
        console.warn('[CF-SFU] videoTrack.play failed', e);
      }
    },
    stop: () => {
      if (created) {
        created.srcObject = null;
        created.remove();
        created = null;
      }
      const src = attachedTo?.srcObject;
      if (attachedTo && src instanceof MediaStream && src.getTracks().includes(track)) {
        attachedTo.srcObject = null;
      }
      attachedTo = null;
    },
  };
}

function wrapAudioTrack(
  track: MediaStreamTrack,
  sinkIdRef: { current: string | null },
  onAutoplayBlocked: () => void
): AgoraLikeTrack {
  let el: HTMLAudioElement | null = null;
  return {
    _track: track,
    play: (target) => {
      try {
        const t = target ? resolveElement(target) : null;
        if (t instanceof HTMLMediaElement) {
          t.srcObject = new MediaStream([track]);
          t.play().catch(onAutoplayBlocked);
          return;
        }
        // 與 Agora 相同：遠端音訊自動播放，用一個隱藏的 <audio>
        if (!el) {
          el = document.createElement('audio');
          el.autoplay = true;
          el.style.display = 'none';
          el.srcObject = new MediaStream([track]);
          document.body.appendChild(el);
        }
        const sinkId = sinkIdRef.current;
        if (sinkId && typeof (el as any).setSinkId === 'function') {
          (el as any).setSinkId(sinkId).catch(() => {});
        }
        el.play().catch(onAutoplayBlocked);
      } catch (e) {
        console.warn('[CF-SFU] audioTrack.play failed', e);
      }
    },
    stop: () => {
      if (el) {
        el.srcObject = null;
        el.remove();
        el = null;
      }
    },
  };
}

async function api<T = any>(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  body?: unknown,
  opts?: { keepalive?: boolean }
): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    keepalive: opts?.keepalive,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.message || `${method} ${url} failed (${data?.reason || res.status})`);
  }
  return data as T;
}

async function getMicTrack(deviceId?: string): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  return stream.getAudioTracks()[0];
}

async function getCameraTrack(quality: VideoQuality, deviceId?: string): Promise<MediaStreamTrack> {
  const q = QUALITY_TO_CONSTRAINTS[quality];
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: q.width },
      height: { ideal: q.height },
      frameRate: { ideal: 30 },
    },
  });
  return stream.getVideoTracks()[0];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCloudflareSfuProvider(opts: RTCProviderOptions) {
  const { channelName, defaultQuality = 'high' } = opts;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const ctxRef = useRef<MediaContext | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const joiningRef = useRef(false);
  const lastJoinOptsRef = useRef<Parameters<typeof join>[0]>(undefined);

  const localTracksRef = useRef<Partial<Record<LocalTrackName, MediaStreamTrack>>>({});
  const transceiversRef = useRef<Partial<Record<LocalTrackName, RTCRtpTransceiver>>>({});
  const pulledRef = useRef<Map<string, PulledTrack>>(new Map());
  const participantsRef = useRef<RemoteParticipant[]>([]);
  // 以「sessionId/trackName」快取包裝物件，讓同一條軌道在多次 rebuild 間保持同一個參考，
  // 避免 RemoteParticipantVideo（effect deps [user, user.videoTrack]）反覆重接造成閃爍。
  const wrapCacheRef = useRef<Map<string, AgoraLikeTrack>>(new Map());
  const timersRef = useRef<{ poll?: ReturnType<typeof setInterval>; heartbeat?: ReturnType<typeof setInterval> }>({});
  const sinkIdRef = useRef<string | null>(null);
  const qualityRef = useRef<VideoQuality>(defaultQuality);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const whiteboardRef = useRef<HTMLDivElement | null>(null);

  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<AgoraLikeRemoteUser[]>([]);
  const [currentQuality, setCurrentQuality] = useState<VideoQuality>(defaultQuality);
  const [isLowLatencyMode, setIsLowLatencyMode] = useState(false);
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState<string | null>(null);
  const [fixStatus, setFixStatus] = useState<'idle' | 'fixing' | 'success' | 'error'>('idle');
  const [autoplayFailed, setAutoplayFailed] = useState(false);

  /** 把 SDP 協商排進同一個佇列：前一個做完（成功或失敗）才做下一個。 */
  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.then(fn, fn);
    queueRef.current = run.catch(() => undefined);
    return run;
  }, []);

  const attachLocalPreview = useCallback((track: MediaStreamTrack) => {
    const el = localVideoRef.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    el.muted = true;
    el.play().catch(() => {});
  }, []);

  // ── 從目前拉到的軌道重建 remoteUsers ─────────────────────────────────────────
  const rebuildRemoteUsers = useCallback(() => {
    const cache = wrapCacheRef.current;
    const live = new Set<string>();
    const users: AgoraLikeRemoteUser[] = [];

    for (const p of participantsRef.current) {
      let videoTrack: AgoraLikeTrack | null = null;
      let audioTrack: AgoraLikeTrack | null = null;
      for (const [key, pulled] of pulledRef.current) {
        if (pulled.sessionId !== p.sessionId) continue;
        live.add(key);
        let wrapped = cache.get(key);
        if (!wrapped || wrapped._track !== pulled.track) {
          wrapped?.stop();
          wrapped =
            pulled.trackName === 'video'
              ? wrapVideoTrack(pulled.track)
              : wrapAudioTrack(pulled.track, sinkIdRef, () => setAutoplayFailed(true));
          cache.set(key, wrapped);
        }
        if (pulled.trackName === 'video') videoTrack = wrapped;
        else audioTrack = wrapped;
      }
      if (videoTrack || audioTrack) {
        users.push({ uid: p.identity, hasVideo: !!videoTrack, hasAudio: !!audioTrack, videoTrack, audioTrack });
      }
    }

    // 已經不在的軌道：停止播放（移除隱藏的 <audio>）並清掉快取
    for (const key of Array.from(cache.keys())) {
      if (!live.has(key)) {
        cache.get(key)?.stop();
        cache.delete(key);
      }
    }

    setRemoteUsers(users);
    const first = users[0];
    if (first?.videoTrack && remoteVideoRef.current) first.videoTrack.play(remoteVideoRef.current);
    users.forEach((u) => u.audioTrack?.play(''));
  }, []);

  // ── 推本地軌道 ──────────────────────────────────────────────────────────────
  const publish = useCallback(async (tracks: Array<{ name: LocalTrackName; track: MediaStreamTrack }>) => {
    const ctx = ctxRef.current;
    const pc = pcRef.current;
    if (!ctx || !pc || tracks.length === 0) return;

    const added = tracks.map(({ name, track }) => {
      const tr = pc.addTransceiver(track, { direction: 'sendonly' });
      transceiversRef.current[name] = tr;
      return { name, tr };
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // mid 要在 setLocalDescription 之後才有值
    const res = await api('POST', '/api/realtime/tracks', {
      courseSessionId: ctx.courseSessionId,
      sessionId: ctx.sessionId,
      sessionDescription: { type: 'offer', sdp: offer.sdp },
      tracks: added.map(({ name, tr }) => ({ location: 'local', mid: tr.mid, trackName: name })),
    });
    if (res.sessionDescription) {
      await pc.setRemoteDescription(res.sessionDescription);
    }
  }, []);

  // ── 拉遠端軌道 ──────────────────────────────────────────────────────────────
  const pull = useCallback(async (wanted: Array<{ sessionId: string; trackName: string }>) => {
    const ctx = ctxRef.current;
    const pc = pcRef.current;
    if (!ctx || !pc || wanted.length === 0) return;

    const res = await api('POST', '/api/realtime/tracks', {
      courseSessionId: ctx.courseSessionId,
      sessionId: ctx.sessionId,
      tracks: wanted.map((w) => ({ location: 'remote', sessionId: w.sessionId, trackName: w.trackName })),
    });

    if (res.requiresImmediateRenegotiation && res.sessionDescription) {
      await pc.setRemoteDescription(res.sessionDescription);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await api('PUT', '/api/realtime/renegotiate', {
        courseSessionId: ctx.courseSessionId,
        sessionId: ctx.sessionId,
        sessionDescription: { type: 'answer', sdp: answer.sdp },
      });
    }

    const returned: any[] = Array.isArray(res.tracks) ? res.tracks : [];
    wanted.forEach((w, i) => {
      const t =
        returned.find((r) => r?.trackName === w.trackName && (r.sessionId ?? w.sessionId) === w.sessionId) ??
        returned[i];
      if (!t || t.errorCode || !t.mid) {
        console.warn('[CF-SFU] pull failed', w, t?.errorCode, t?.errorDescription);
        return;
      }
      const tr = pc.getTransceivers().find((x) => x.mid === t.mid);
      if (!tr?.receiver?.track) return;
      pulledRef.current.set(`${w.sessionId}/${w.trackName}`, {
        sessionId: w.sessionId,
        trackName: w.trackName,
        mid: t.mid,
        track: tr.receiver.track,
      });
    });
  }, []);

  // ── 與房間登錄同步：拉新的軌道、關掉離開者的軌道 ──────────────────────────────
  const syncRoom = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const data = await api<{ participants: RemoteParticipant[] }>(
      'GET',
      `/api/realtime/room?courseSessionId=${encodeURIComponent(ctx.courseSessionId)}&sessionId=${encodeURIComponent(ctx.sessionId)}`
    );
    const participants = Array.isArray(data.participants) ? data.participants : [];
    participantsRef.current = participants;

    const present = new Set<string>();
    const wanted: Array<{ sessionId: string; trackName: string }> = [];
    for (const p of participants) {
      for (const name of p.tracks) {
        const key = `${p.sessionId}/${name}`;
        present.add(key);
        if (!pulledRef.current.has(key)) wanted.push({ sessionId: p.sessionId, trackName: name });
      }
    }

    const gone = Array.from(pulledRef.current.entries()).filter(([key]) => !present.has(key));
    if (gone.length) {
      gone.forEach(([key]) => pulledRef.current.delete(key));
      // 對方已離開；SFU 30 秒後也會自動回收，這裡主動關閉只是早點釋放頻寬
      api('PUT', '/api/realtime/tracks', {
        courseSessionId: ctx.courseSessionId,
        sessionId: ctx.sessionId,
        tracks: gone.map(([, v]) => ({ mid: v.mid })),
        force: true,
      }).catch((e) => console.warn('[CF-SFU] close stale tracks failed', e));
    }

    if (wanted.length) await pull(wanted);
    rebuildRemoteUsers();
  }, [pull, rebuildRemoteUsers]);

  // ── 拆除（離開、卸載、加入失敗共用） ───────────────────────────────────────────
  const teardown = useCallback((notifyServer: boolean) => {
    if (timersRef.current.poll) clearInterval(timersRef.current.poll);
    if (timersRef.current.heartbeat) clearInterval(timersRef.current.heartbeat);
    timersRef.current = {};

    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (notifyServer && ctx) {
      // keepalive：關分頁時請求仍會送出
      api(
        'POST',
        '/api/realtime/room',
        { courseSessionId: ctx.courseSessionId, sessionId: ctx.sessionId, leaving: true },
        { keepalive: true }
      ).catch(() => {});
    }

    wrapCacheRef.current.forEach((w) => w.stop());
    wrapCacheRef.current.clear();
    pulledRef.current.clear();
    participantsRef.current = [];
    Object.values(localTracksRef.current).forEach((t) => t?.stop());
    localTracksRef.current = {};
    transceiversRef.current = {};
    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;
    queueRef.current = Promise.resolve();
  }, []);

  // ── join ────────────────────────────────────────────────────────────────────
  const join = useCallback(
    async (joinOpts?: {
      publishAudio?: boolean;
      publishVideo?: boolean;
      audioDeviceId?: string;
      videoDeviceId?: string;
    }) => {
      if (joiningRef.current || pcRef.current) return;
      joiningRef.current = true;
      lastJoinOptsRef.current = joinOpts;
      setLoading(true);
      setError(null);

      try {
        // 1. 授權 + 建立 SFU session + TURN 憑證
        const s = await api<{
          sessionId: string;
          courseSessionId: string;
          role: MediaContext['role'];
          iceServers?: RTCIceServer[];
          heartbeatIntervalSec?: number;
        }>('POST', '/api/realtime/session', { roomId: channelName });
        ctxRef.current = { sessionId: s.sessionId, courseSessionId: s.courseSessionId, role: s.role };

        // 2. PeerConnection
        const pc = new RTCPeerConnection({
          iceServers: s.iceServers?.length ? s.iceServers : FALLBACK_ICE_SERVERS,
          bundlePolicy: 'max-bundle',
        });
        pcRef.current = pc;
        pc.addEventListener('connectionstatechange', () => {
          if (pc.connectionState === 'connected') setError(null);
          if (pc.connectionState === 'disconnected') setError('網路不穩，重新連線中…');
          if (pc.connectionState === 'failed') setError('連線中斷，請按「修復」重新連線');
        });

        // 3. 發佈本地音視訊（觀察者只看不推）
        const canPublish = s.role !== 'admin';
        const toPublish: Array<{ name: LocalTrackName; track: MediaStreamTrack }> = [];
        if (canPublish && (joinOpts?.publishAudio ?? true)) {
          const t = await getMicTrack(joinOpts?.audioDeviceId);
          localTracksRef.current.audio = t;
          toPublish.push({ name: 'audio', track: t });
        }
        if (canPublish && (joinOpts?.publishVideo ?? true)) {
          const t = await getCameraTrack(qualityRef.current, joinOpts?.videoDeviceId);
          localTracksRef.current.video = t;
          toPublish.push({ name: 'video', track: t });
          attachLocalPreview(t);
        }
        if (toPublish.length) await enqueue(() => publish(toPublish));

        setJoined(true);

        // 4. 拉現有參與者，之後定期同步
        await enqueue(() => syncRoom());
        timersRef.current.poll = setInterval(() => {
          enqueue(() => syncRoom()).catch((e) => console.warn('[CF-SFU] room sync failed', e));
        }, POLL_INTERVAL_MS);

        // 5. 心跳
        const ctx = ctxRef.current;
        timersRef.current.heartbeat = setInterval(() => {
          if (!ctx) return;
          api('POST', '/api/realtime/room', { courseSessionId: ctx.courseSessionId, sessionId: ctx.sessionId }).catch(
            (e) => console.warn('[CF-SFU] heartbeat failed', e)
          );
        }, (s.heartbeatIntervalSec || 15) * 1000);
      } catch (e: any) {
        console.error('[CF-SFU] join failed', e);
        setError(e?.message || '連線失敗');
        teardown(true);
        setJoined(false);
      } finally {
        setLoading(false);
        joiningRef.current = false;
      }
    },
    [channelName, enqueue, publish, syncRoom, teardown, attachLocalPreview]
  );

  // ── leave ─────────────────────────────────────────────────────────────────
  const leave = useCallback(async () => {
    teardown(true);
    setJoined(false);
    setRemoteUsers([]);
  }, [teardown]);

  // 卸載或關分頁時送出離開，避免對方等到心跳逾時才看到人離開
  useEffect(() => {
    const onPageHide = () => {
      if (ctxRef.current) teardown(true);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      teardown(true);
    };
  }, [teardown]);

  // ── 控制 ────────────────────────────────────────────────────────────────────
  const setLocalAudioEnabled = useCallback(
    async (enabled: boolean, deviceId?: string) => {
      const ctx = ctxRef.current;
      if (!ctx || ctx.role === 'admin') return;
      try {
        const current = localTracksRef.current.audio;
        if (enabled && (deviceId || !current)) {
          const next = await getMicTrack(deviceId);
          const tr = transceiversRef.current.audio;
          if (tr) {
            await tr.sender.replaceTrack(next); // 換裝置不需要重新協商
            current?.stop();
            localTracksRef.current.audio = next;
          } else {
            localTracksRef.current.audio = next;
            await enqueue(() => publish([{ name: 'audio', track: next }]));
          }
          return;
        }
        if (current) current.enabled = enabled;
      } catch (e) {
        console.warn('[CF-SFU] setLocalAudioEnabled failed', e);
      }
    },
    [enqueue, publish]
  );

  const setLocalVideoEnabled = useCallback(
    async (enabled: boolean) => {
      const ctx = ctxRef.current;
      if (!ctx || ctx.role === 'admin') return;
      try {
        const current = localTracksRef.current.video;
        if (!current) {
          if (!enabled) return;
          const next = await getCameraTrack(qualityRef.current);
          localTracksRef.current.video = next;
          attachLocalPreview(next);
          await enqueue(() => publish([{ name: 'video', track: next }]));
          return;
        }
        current.enabled = enabled;
        if (enabled) attachLocalPreview(current);
      } catch (e) {
        console.warn('[CF-SFU] setLocalVideoEnabled failed', e);
      }
    },
    [enqueue, publish, attachLocalPreview]
  );

  const setVideoQuality = useCallback(async (q: VideoQuality) => {
    qualityRef.current = q;
    setCurrentQuality(q);
    const track = localTracksRef.current.video;
    if (!track) return;
    const c = QUALITY_TO_CONSTRAINTS[q];
    try {
      await track.applyConstraints({ width: { ideal: c.width }, height: { ideal: c.height }, frameRate: { ideal: 30 } });
    } catch (e) {
      console.warn('[CF-SFU] setVideoQuality failed', e);
    }
  }, []);

  const setLowLatencyMode = useCallback((on: boolean) => {
    // SFU 本身就是低延遲轉發；此旗標僅記錄狀態以維持介面相容。
    setIsLowLatencyMode(on);
  }, []);

  const setAudioOutputDevice = useCallback(
    async (deviceId: string | null) => {
      sinkIdRef.current = deviceId;
      setAudioOutputDeviceId(deviceId);
      rebuildRemoteUsers(); // 包裝物件在 play 時套用 sinkId
    },
    [rebuildRemoteUsers]
  );

  const triggerFix = useCallback(async () => {
    setFixStatus('fixing');
    try {
      const pc = pcRef.current;
      if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) {
        // 連線已斷：整個重新加入（會拿到新的 SFU session，舊的由心跳逾時收掉）
        teardown(true);
        setJoined(false);
        await join(lastJoinOptsRef.current);
      } else {
        // 多半是瀏覽器擋了自動播放：在使用者手勢下重新播放
        setAutoplayFailed(false);
        rebuildRemoteUsers();
      }
      setFixStatus('success');
      setTimeout(() => setFixStatus('idle'), 2000);
    } catch (e) {
      console.warn('[CF-SFU] triggerFix failed', e);
      setFixStatus('error');
      setTimeout(() => setFixStatus('idle'), 2000);
    }
  }, [teardown, join, rebuildRemoteUsers]);

  // ── 設備列舉（與其他 provider 同一套 navigator API） ─────────────────────────
  const checkAudioDevice = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return false;
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      return d.some((x) => x.kind === 'audioinput');
    } catch {
      return false;
    }
  }, []);

  const checkVideoDevice = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return false;
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      return d.some((x) => x.kind === 'videoinput');
    } catch {
      return false;
    }
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
