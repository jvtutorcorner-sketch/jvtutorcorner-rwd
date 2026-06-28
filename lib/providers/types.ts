'use client';

/**
 * Provider abstraction interfaces for the three Agora-backed services.
 * Each interface has an Agora implementation (default) and one or more
 * alternative implementations that can be activated via env vars:
 *
 *   NEXT_PUBLIC_SIGNALING_PROVIDER=agora-rtm | aws-apigw-ws
 *   NEXT_PUBLIC_RTC_PROVIDER=agora | chime | livekit
 *   NEXT_PUBLIC_WHITEBOARD_PROVIDER=netless | tldraw
 *
 * All defaults point to Agora — no env change = identical behaviour to today.
 */

import type { RefObject } from 'react';

// ─── Signaling (RTM) ──────────────────────────────────────────────────────────

export type SignalingMessageType =
  | 'wb-uuid-sync'
  | 'request-wb-uuid'
  | 'ready-state-update'
  | 'pdf-available'
  | 'page-change'
  | 'request-page-state'
  | 'ping'
  | 'custom';

export interface SignalingMessage {
  type: SignalingMessageType;
  payload: Record<string, unknown>;
  senderId: string;
  timestamp: number;
  seq?: number;
}

export type SignalingMessageHandler = (msg: SignalingMessage) => void;

export interface ISignalingProvider {
  connected: boolean;
  connectionState: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
  sendMessage: (type: SignalingMessageType, payload: Record<string, unknown>) => Promise<boolean>;
  disconnect: () => Promise<void>;
}

export interface SignalingProviderOptions {
  channelName: string;
  userId: string;
  enabled?: boolean;
  onMessage?: SignalingMessageHandler;
  onConnectionChange?: (state: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
}

// ─── RTC (Video/Audio) ────────────────────────────────────────────────────────

export type VideoQuality = 'low' | 'medium' | 'high' | 'ultra';
export type FixStatus = 'idle' | 'fixing' | 'success' | 'error';
export type ClassroomRole = 'teacher' | 'student';

export interface IRTCProvider {
  // State
  joined: boolean;
  loading: boolean;
  error: string | null;
  remoteUsers: unknown[];
  whiteboardMeta: { uuid?: string; appId?: string; region?: string } | null;
  currentQuality: VideoQuality;
  isLowLatencyMode: boolean;
  audioOutputDeviceId: string | null;
  // DOM refs
  localVideoRef: RefObject<HTMLVideoElement | null>;
  remoteVideoRef: RefObject<HTMLVideoElement | null>;
  whiteboardRef: RefObject<HTMLDivElement | null>;
  // Troubleshoot
  fixStatus: FixStatus;
  triggerFix: () => Promise<void>;
  // Controls
  join: () => Promise<void>;
  leave: () => Promise<void>;
  setLocalAudioEnabled: (enabled: boolean, deviceId?: string) => Promise<void>;
  setLocalVideoEnabled: (enabled: boolean) => Promise<void>;
  setVideoQuality: (q: VideoQuality) => Promise<void>;
  setLowLatencyMode: (on: boolean) => void;
  // Device helpers
  checkAudioDevice: () => Promise<boolean>;
  checkVideoDevice: () => Promise<boolean>;
  checkDevices: () => Promise<{ hasAudioInput: boolean; hasVideoInput: boolean }>;
  getAudioOutputDevices: () => Promise<Array<{ deviceId: string; label?: string }>>;
  setAudioOutputDevice: (deviceId: string | null) => Promise<void>;
}

export interface RTCProviderOptions {
  channelName: string;
  role: ClassroomRole;
  isOneOnOne?: boolean;
  defaultQuality?: VideoQuality;
}

// ─── Whiteboard ───────────────────────────────────────────────────────────────

export interface WhiteboardRoomData {
  uuid: string;
  roomToken: string;
  appIdentifier: string;
  region: string;
  userId: string;
}

export interface IWhiteboardBoardRef {
  insertPDF: (url: string, title?: string) => Promise<{ scenePath: string; pageCount: number; durationMs: number }>;
  leave: () => Promise<void>;
  getState: () => {
    activeTool: string;
    activeColor: number[];
    currentPage: number;
    totalPages: number;
    phase: string;
    viewMode: string;
  } | null;
  setTool: (tool: 'pencil' | 'eraser' | 'selector') => void;
  setColor: (color: number[]) => void;
  clearScene: () => void;
  clearPDF: () => void;
  forceFix: () => void;
  prevPage: () => void;
  nextPage: () => void;
}

export interface IWhiteboardProvider {
  isActive: boolean;
  roomData: WhiteboardRoomData | null;
  isMounted: boolean;
  isReady: boolean;
  hasError: boolean;
  hasTimeout: boolean;
  boardRef: RefObject<IWhiteboardBoardRef | null>;
  initRoom: () => Promise<void>;
  retryInit: () => void;
}

export interface WhiteboardProviderOptions {
  userId: string;
  channelName: string;
  courseId: string;
  orderId?: string;
  role: ClassroomRole;
  enabled?: boolean;
  effectiveWhiteboardUuid?: string | null;
}
