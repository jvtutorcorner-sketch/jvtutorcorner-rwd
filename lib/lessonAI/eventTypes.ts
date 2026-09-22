// lib/lessonAI/eventTypes.ts
//
// The teaching-event vocabulary shared by the marker UI, the /api/lessons/*
// routes, the Segmenter and (Phase 3b) the L1 detector. Type keys are stable
// English identifiers; the classroom UI maps them to Chinese labels.
//
// Signal priority (architecture plan §3, high → low): teacher marker > system
// event > AI semantic event > time fallback. The Segmenter encodes that here via
// the boundary classification helpers.

/** Where an event came from — also its trust/priority tier. */
export type EventSource = 'marker' | 'system' | 'ai' | 'time';

/** The six teacher markers (zero AI cost, always available). */
export type MarkerType =
  | 'important_concept' // point: highlight, does NOT cut a segment
  | 'start_new_topic' // boundary: cut here
  | 'start_exercise' // boundary
  | 'student_question' // point
  | 'start_quiz' // boundary
  | 'end_segment'; // boundary: explicitly close the current segment

export const MARKER_TYPES: readonly MarkerType[] = [
  'important_concept',
  'start_new_topic',
  'start_exercise',
  'student_question',
  'start_quiz',
  'end_segment',
] as const;

/** Boundary markers cut a segment the instant the teacher presses them. */
export const BOUNDARY_MARKERS: ReadonlySet<MarkerType> = new Set([
  'start_new_topic',
  'start_exercise',
  'start_quiz',
  'end_segment',
]);

/** Point markers only attach a highlight to the current segment. */
export const POINT_MARKERS: ReadonlySet<MarkerType> = new Set(['important_concept', 'student_question']);

export function isMarkerType(v: unknown): v is MarkerType {
  return typeof v === 'string' && (MARKER_TYPES as readonly string[]).includes(v);
}

/** Client-reported system events (no AI). */
export type SystemEventType =
  | 'class_started'
  | 'class_ended'
  | 'whiteboard_page_change' // dwell-gated boundary candidate
  | 'whiteboard_clear' // dwell-gated boundary candidate
  | 'screenshare_start'
  | 'screenshare_stop'
  | 'quiz_start' // immediate boundary
  | 'quiz_complete'
  | 'tick'; // 60s heartbeat — drives the time fallback when AI is off

export const SYSTEM_EVENT_TYPES: readonly SystemEventType[] = [
  'class_started',
  'class_ended',
  'whiteboard_page_change',
  'whiteboard_clear',
  'screenshare_start',
  'screenshare_stop',
  'quiz_start',
  'quiz_complete',
  'tick',
] as const;

export function isSystemEventType(v: unknown): v is SystemEventType {
  return typeof v === 'string' && (SYSTEM_EVENT_TYPES as readonly string[]).includes(v);
}

/** System events that immediately open a new segment (no dwell needed). */
export const IMMEDIATE_SYSTEM_BOUNDARIES: ReadonlySet<SystemEventType> = new Set(['quiz_start']);

/** System events whose page-change becomes a boundary only after enough dwell. */
export const DWELL_SYSTEM_BOUNDARIES: ReadonlySet<SystemEventType> = new Set([
  'whiteboard_page_change',
  'whiteboard_clear',
]);

/**
 * The canonical event the Segmenter consumes. `offsetSec` (seconds from the
 * lesson start) is the Segmenter's single clock — it never reads wall time. `ts`
 * is the wall-clock ms used only to build the storage sort key.
 */
export interface LessonEvent {
  eventId: string;
  source: EventSource;
  type: MarkerType | SystemEventType | string;
  offsetSec: number;
  ts?: number;
  confidence?: number; // AI events; markers/system are certain (1)
  actorRole?: 'teacher' | 'student' | 'assistant' | 'system';
  track?: 'teacher' | 'student';
  note?: string;
  payload?: Record<string, unknown>;
}

/**
 * A segment derived by the Segmenter. `endSec` is null while the segment is
 * still open (only the last one, mid-lesson). Pedagogically meaningful events
 * (markers, AI events, quiz/screenshare) are attached for the Timeline; ticks
 * and structural whiteboard events are consumed for the clock/boundary only.
 */
export interface DerivedSegment {
  seq: number;
  startSec: number;
  endSec: number | null;
  boundarySource: EventSource;
  boundaryType?: string; // the marker/system type that opened this segment
  confidence: number; // 1 marker/system, model confidence for ai, 0.5 for time
  events: LessonEvent[];
  closed: boolean;
  /** Pedagogical labels — set by a teacher edit (3a) or L2 analysis (3b). */
  topic?: string;
  objective?: string;
}

/** Events worth showing on the Timeline (vs. structural clock/boundary noise). */
export function isAttachableEvent(e: LessonEvent): boolean {
  if (e.source === 'marker' || e.source === 'ai') return true;
  return (
    e.type === 'quiz_start' ||
    e.type === 'quiz_complete' ||
    e.type === 'screenshare_start' ||
    e.type === 'screenshare_stop'
  );
}
