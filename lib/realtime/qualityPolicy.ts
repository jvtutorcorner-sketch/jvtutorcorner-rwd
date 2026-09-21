// Pure adaptive-quality logic for the SFU media path. Agora auto-adjusts bitrate on a
// congested link; our SFU provider only had a manual `?vq=` control and would just
// freeze under packet loss. This decides the next quality rung from periodic getStats
// samples — no WebRTC/DOM here, so it is verified offline
// (scripts/verify-rtc-quality-policy.mjs). The provider applies the rung via
// RTCRtpSender.setParameters + track.enabled.
//
// Rule of thumb: degrade fast (protect the call), recover slowly (avoid oscillation).
// Audio is never dropped — the worst rung is audio-only, not "off".

export type QualityRung = 'high' | 'medium' | 'low' | 'audio-only';

/** Ordered best → worst. Index = severity. */
export const RUNGS: QualityRung[] = ['high', 'medium', 'low', 'audio-only'];

export interface StatsSample {
  /** Round-trip time in ms (from candidate-pair currentRoundTripTime × 1000). */
  rttMs: number;
  /** Fraction of packets lost since the last sample, 0..1. */
  packetLoss: number;
  /** availableOutgoingBitrate in bits/sec, if the browser reports it. */
  availableBitrate: number | null;
  /** outbound-rtp qualityLimitationReason. */
  limitation: 'none' | 'cpu' | 'bandwidth' | 'other';
  /** Freeze events since the last sample (framesEncoded stalls / freezeCount delta). */
  freezes: number;
}

export interface QualityConfig {
  /** Consecutive bad samples before dropping a rung. */
  downgradeAfter: number;
  /** Consecutive good samples before raising a rung. */
  upgradeAfter: number;
  /** Loss above this is "bad". */
  lossBad: number;
  /** Loss below this (plus low rtt) is "good" and allows recovery. */
  lossGood: number;
  rttBad: number;
  rttGood: number;
}

export const DEFAULT_QUALITY: QualityConfig = {
  downgradeAfter: 2,
  upgradeAfter: 15, // ~30s at a 2s sampling interval
  lossBad: 0.05,
  lossGood: 0.02,
  rttBad: 400,
  rttGood: 200,
};

export interface QualityState {
  rung: QualityRung;
  badStreak: number;
  goodStreak: number;
  /** true once auto-adaptation has overridden the user's manual pick. */
  auto: boolean;
}

export function initialQualityState(rung: QualityRung = 'high'): QualityState {
  return { rung, badStreak: 0, goodStreak: 0, auto: false };
}

function rungIndex(r: QualityRung): number {
  return RUNGS.indexOf(r);
}

/** Clamp so we never rise above the user's manual ceiling (`?vq=` / manual pick). */
function clampToCeiling(r: QualityRung, ceiling: QualityRung): QualityRung {
  return rungIndex(r) < rungIndex(ceiling) ? ceiling : r;
}

export function classifySample(s: StatsSample, cfg: QualityConfig = DEFAULT_QUALITY): 'bad' | 'good' | 'neutral' {
  const congested =
    s.limitation === 'bandwidth' ||
    s.packetLoss >= cfg.lossBad ||
    s.rttMs >= cfg.rttBad ||
    s.freezes > 0;
  if (congested) return 'bad';
  const clear = s.packetLoss <= cfg.lossGood && s.rttMs <= cfg.rttGood && s.limitation === 'none';
  return clear ? 'good' : 'neutral';
}

/**
 * Fold one stats sample into the quality state. Returns the (possibly unchanged) next
 * state and whether the rung changed so the caller can re-apply encoder parameters.
 */
export function nextQuality(
  prev: QualityState,
  sample: StatsSample,
  ceiling: QualityRung = 'high',
  cfg: QualityConfig = DEFAULT_QUALITY
): { state: QualityState; changed: boolean } {
  const verdict = classifySample(sample, cfg);
  const { rung } = prev;
  let { badStreak, goodStreak } = prev;
  let auto = prev.auto;

  if (verdict === 'bad') {
    badStreak += 1;
    goodStreak = 0;
  } else if (verdict === 'good') {
    goodStreak += 1;
    badStreak = 0;
  } else {
    badStreak = 0;
    goodStreak = 0;
  }

  let nextRung = rung;
  const idx = rungIndex(rung);

  if (badStreak >= cfg.downgradeAfter && idx < RUNGS.length - 1) {
    nextRung = RUNGS[idx + 1];
    badStreak = 0;
    auto = true;
  } else if (goodStreak >= cfg.upgradeAfter && idx > 0) {
    nextRung = RUNGS[idx - 1];
    goodStreak = 0;
    auto = true;
  }

  nextRung = clampToCeiling(nextRung, ceiling);
  const changed = nextRung !== rung;
  return { state: { rung: nextRung, badStreak, goodStreak, auto }, changed };
}

/** Encoder parameters for a rung: null bitrate/scale on audio-only means "disable video". */
export interface RungParams {
  video: boolean;
  maxBitrate: number | null;
  scaleResolutionDownBy: number;
}

export function rungParams(rung: QualityRung): RungParams {
  switch (rung) {
    case 'high':
      return { video: true, maxBitrate: 1_200_000, scaleResolutionDownBy: 1 };
    case 'medium':
      return { video: true, maxBitrate: 600_000, scaleResolutionDownBy: 1 };
    case 'low':
      return { video: true, maxBitrate: 250_000, scaleResolutionDownBy: 2 };
    case 'audio-only':
      return { video: false, maxBitrate: null, scaleResolutionDownBy: 1 };
  }
}
