// Pure decision logic for keeping a non-Agora WebRTC connection alive. Agora's SDK
// self-heals (ICE restart, rejoin, backoff); the Cloudflare SFU provider had none of
// that — `disconnected` waited forever and `failed` needed a human to click "Fix".
//
// This module owns *what to do next* given the current RTCPeerConnection state and how
// long we've been trying, with zero DOM/network/timer dependencies so it is fully
// verifiable offline (scripts/verify-rtc-connection-policy.mjs). The provider owns the
// *effects* (restartIce, teardown+join, timers) and feeds observations in.

export type PcState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

/** What the provider should do in response to an observation. */
export type ConnectionAction =
  | { type: 'none' }
  | { type: 'ice-restart' } // renegotiate in place, keep the SFU session
  | { type: 'rejoin' } // full teardown + join (new SFU session), with backoff
  | { type: 'give-up' }; // hand off to the Agora fallback (A4)

export interface PolicyConfig {
  /** Grace before acting on a transient `disconnected` (ms). */
  disconnectedGraceMs: number;
  /** How long an ICE restart may run before we escalate to a full rejoin (ms). */
  iceRestartTimeoutMs: number;
  /** Consecutive ICE-restart failures before escalating to rejoin. */
  maxIceRestarts: number;
  /** Consecutive rejoin failures before giving up (→ Agora fallback). */
  maxRejoins: number;
  /** Whether the transport supports client-initiated ICE restart. When false the
   *  machine skips straight to rejoin (Cloudflare support is verified with real creds). */
  iceRestartSupported: boolean;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export const DEFAULT_POLICY: PolicyConfig = {
  disconnectedGraceMs: 3000,
  iceRestartTimeoutMs: 10000,
  maxIceRestarts: 2,
  maxRejoins: 3,
  iceRestartSupported: true,
  backoffBaseMs: 1000,
  backoffMaxMs: 30000,
};

export interface PolicyState {
  phase: 'stable' | 'recovering' | 'dead';
  iceRestarts: number;
  rejoins: number;
  /** epoch ms when the current recovery attempt started; null when stable. */
  attemptStartedAt: number | null;
  lastAction: ConnectionAction['type'] | null;
}

export function initialPolicyState(): PolicyState {
  return { phase: 'stable', iceRestarts: 0, rejoins: 0, attemptStartedAt: null, lastAction: null };
}

/** Exponential backoff for the Nth (0-based) rejoin attempt. */
export function backoffDelay(attempt: number, cfg: PolicyConfig = DEFAULT_POLICY): number {
  const raw = cfg.backoffBaseMs * 2 ** Math.max(0, attempt);
  return Math.min(cfg.backoffMaxMs, raw);
}

export interface Observation {
  pcState: PcState;
  now: number;
  /** Set when the current recovery attempt (ice-restart or rejoin) has resolved. */
  attemptResult?: 'success' | 'failure';
}

/**
 * Given the previous state and an observation, decide the next state + action.
 * Deterministic and side-effect free.
 */
export function nextConnectionAction(
  prev: PolicyState,
  obs: Observation,
  cfg: PolicyConfig = DEFAULT_POLICY
): { state: PolicyState; action: ConnectionAction } {
  const state: PolicyState = { ...prev };

  // A healthy connection resets all recovery counters.
  if (obs.pcState === 'connected') {
    return {
      state: { phase: 'stable', iceRestarts: 0, rejoins: 0, attemptStartedAt: null, lastAction: null },
      action: { type: 'none' },
    };
  }

  if (state.phase === 'dead') return { state, action: { type: 'none' } };

  // Resolve an in-flight recovery attempt.
  if (state.phase === 'recovering' && obs.attemptResult) {
    if (obs.attemptResult === 'success') {
      // The pc will report 'connected' shortly; stay recovering until it does, but
      // don't launch another action this tick.
      return { state, action: { type: 'none' } };
    }
    // failure → escalate below by falling through with the failed attempt counted.
  }

  const escalate = (): { state: PolicyState; action: ConnectionAction } => {
    // Prefer ICE restart while we have budget and the transport supports it.
    if (cfg.iceRestartSupported && state.iceRestarts < cfg.maxIceRestarts) {
      return {
        state: { ...state, phase: 'recovering', iceRestarts: state.iceRestarts + 1, attemptStartedAt: obs.now, lastAction: 'ice-restart' },
        action: { type: 'ice-restart' },
      };
    }
    if (state.rejoins < cfg.maxRejoins) {
      return {
        state: { ...state, phase: 'recovering', rejoins: state.rejoins + 1, attemptStartedAt: obs.now, lastAction: 'rejoin' },
        action: { type: 'rejoin' },
      };
    }
    return { state: { ...state, phase: 'dead', lastAction: 'give-up' }, action: { type: 'give-up' } };
  };

  // A hard failure escalates immediately.
  if (obs.pcState === 'failed' || obs.pcState === 'closed') return escalate();

  // A recovery attempt that failed (resolved above) escalates immediately.
  if (state.phase === 'recovering' && obs.attemptResult === 'failure') return escalate();

  // An ICE restart that never came back within the timeout escalates.
  if (
    state.phase === 'recovering' &&
    state.lastAction === 'ice-restart' &&
    state.attemptStartedAt != null &&
    obs.now - state.attemptStartedAt >= cfg.iceRestartTimeoutMs
  ) {
    return escalate();
  }

  // `disconnected` is often transient; wait out the grace, then escalate.
  if (obs.pcState === 'disconnected') {
    if (state.phase === 'stable') {
      return { state: { ...state, phase: 'recovering', attemptStartedAt: obs.now, lastAction: null }, action: { type: 'none' } };
    }
    if (state.attemptStartedAt != null && obs.now - state.attemptStartedAt >= cfg.disconnectedGraceMs && state.lastAction == null) {
      return escalate();
    }
  }

  return { state, action: { type: 'none' } };
}
