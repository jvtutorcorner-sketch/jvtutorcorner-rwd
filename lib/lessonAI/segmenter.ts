// lib/lessonAI/segmenter.ts
//
// The Segmenter: a PURE function that turns an ordered stream of lesson events
// into teaching segments. No DB / network / clock — it reads only `offsetSec` —
// so it is fully verified offline (scripts/verify-segmenter.mjs), mirroring
// lib/realtime/connectionPolicy.ts.
//
// Rules (architecture plan §3), highest priority first:
//   1. Teacher BOUNDARY markers cut a segment immediately (even a short one — an
//      explicit teacher decision beats the anti-fragmentation floor).
//   2. Teacher POINT markers (important_concept / student_question) only attach a
//      highlight to the current segment.
//   3. System boundaries: quiz_start cuts immediately; a whiteboard page-change/
//      clear cuts only if the teacher DWELLS on the new page ≥45s AND the segment
//      being closed is ≥90s (anti-fragmentation).
//   4. Time fallback: a segment longer than 15min is force-cut (soft boundary) so
//      a Timeline exists even with AI off and no teacher markers. Segments shorter
//      than 90s are never created by system/time boundaries.
//
// In Phase 3a the Segmenter runs once at finalize over the whole event list
// (single writer). Phase 3b moves it into a stream-consuming Lambda; the pure
// core here is unchanged, only its driver.

import {
  BOUNDARY_MARKERS,
  DWELL_SYSTEM_BOUNDARIES,
  IMMEDIATE_SYSTEM_BOUNDARIES,
  type DerivedSegment,
  type LessonEvent,
  type MarkerType,
} from './eventTypes';

export interface SegmenterOptions {
  /** Explicit lesson end (seconds). Defaults to the last event's offset. */
  lessonEndSec?: number;
  minSegmentSec?: number; // anti-fragmentation floor for system/time cuts
  maxSegmentSec?: number; // time-fallback soft cut
  pageDwellSec?: number; // dwell before a page-change counts as a boundary
}

export const DEFAULT_MIN_SEGMENT_SEC = 90;
export const DEFAULT_MAX_SEGMENT_SEC = 15 * 60;
export const DEFAULT_PAGE_DWELL_SEC = 45;

const CONFIDENCE: Record<string, number> = { marker: 1, system: 1, ai: 0.7, time: 0.5 };

/** Stable sort by offsetSec, then by a source-priority tiebreak (marker first). */
function sortEvents(events: LessonEvent[]): LessonEvent[] {
  const rank = (s: LessonEvent['source']) => (s === 'marker' ? 0 : s === 'system' ? 1 : s === 'ai' ? 2 : 3);
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.offsetSec - b.e.offsetSec || rank(a.e.source) - rank(b.e.source) || a.i - b.i)
    .map((x) => x.e);
}

/**
 * Look ahead from index `i` for the next event that could END the current page's
 * dwell (another dwell/immediate boundary, an end marker, or class_ended). Its
 * offset minus the page-change offset is the dwell. Falls back to lessonEnd.
 */
function dwellAfter(events: LessonEvent[], i: number, lessonEndSec: number): number {
  const here = events[i].offsetSec;
  for (let j = i + 1; j < events.length; j++) {
    const e = events[j];
    const isMarkerBoundary = e.source === 'marker' && BOUNDARY_MARKERS.has(e.type as MarkerType);
    const isSysBoundary =
      e.source === 'system' &&
      (IMMEDIATE_SYSTEM_BOUNDARIES.has(e.type as never) ||
        DWELL_SYSTEM_BOUNDARIES.has(e.type as never) ||
        e.type === 'class_ended');
    if (isMarkerBoundary || isSysBoundary) return e.offsetSec - here;
  }
  return lessonEndSec - here;
}

/**
 * Derive segments from an event stream. Always returns at least one segment (the
 * whole lesson) when there is any event or a positive lessonEndSec.
 */
export function segmentLesson(input: LessonEvent[], options: SegmenterOptions = {}): DerivedSegment[] {
  const minSeg = options.minSegmentSec ?? DEFAULT_MIN_SEGMENT_SEC;
  const maxSeg = options.maxSegmentSec ?? DEFAULT_MAX_SEGMENT_SEC;
  const dwellNeeded = options.pageDwellSec ?? DEFAULT_PAGE_DWELL_SEC;

  const events = sortEvents(input);
  const lastOffset = events.length ? events[events.length - 1].offsetSec : 0;
  const lessonEndSec = Math.max(options.lessonEndSec ?? lastOffset, 0);

  const segments: DerivedSegment[] = [];
  let seq = 0;
  const open = (startSec: number, source: DerivedSegment['boundarySource'], boundaryType?: string): DerivedSegment => {
    const s: DerivedSegment = {
      seq: seq++,
      startSec: Math.max(0, startSec),
      endSec: null,
      boundarySource: source,
      boundaryType,
      confidence: CONFIDENCE[source] ?? 1,
      events: [],
      closed: false,
    };
    segments.push(s);
    return s;
  };
  const current = () => segments[segments.length - 1];
  const close = (at: number) => {
    const c = current();
    if (c && c.endSec === null) {
      c.endSec = Math.max(c.startSec, at);
      c.closed = true;
    }
  };

  // Segment 0 opens at the lesson start (offset 0), regardless of the first event.
  open(0, 'time', 'lesson_start');
  let ended = false;

  const insertTimeCutsUpTo = (offset: number) => {
    // Force a soft boundary whenever the open segment exceeds maxSeg.
    while (current() && offset - current().startSec >= maxSeg) {
      const cutAt = current().startSec + maxSeg;
      close(cutAt);
      open(cutAt, 'time', 'time_fallback');
    }
  };

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    insertTimeCutsUpTo(e.offsetSec);

    if (e.source === 'marker') {
      const m = e.type as MarkerType;
      if (BOUNDARY_MARKERS.has(m)) {
        close(e.offsetSec);
        // end_segment closes without necessarily starting new pedagogy, but a
        // lesson always has an open tail until class_ended, so open a fresh one.
        // Keep the boundary marker (note/payload) on the segment it opens.
        open(e.offsetSec, 'marker', m).events.push(e);
      } else {
        // Point marker (important_concept / student_question): highlight only.
        current().events.push(e);
      }
      continue;
    }

    if (e.source === 'system') {
      const t = e.type as string;
      if (t === 'class_ended') {
        close(e.offsetSec);
        ended = true;
        break;
      }
      if (IMMEDIATE_SYSTEM_BOUNDARIES.has(t as never)) {
        close(e.offsetSec);
        open(e.offsetSec, 'system', t).events.push(e);
        continue;
      }
      if (DWELL_SYSTEM_BOUNDARIES.has(t as never)) {
        const segLen = e.offsetSec - current().startSec;
        const dwell = dwellAfter(events, i, lessonEndSec);
        if (dwell >= dwellNeeded && segLen >= minSeg) {
          close(e.offsetSec);
          open(e.offsetSec, 'system', t);
        }
        continue;
      }
      // screenshare / quiz_complete: pedagogically notable, attach without cutting.
      if (t === 'screenshare_start' || t === 'screenshare_stop' || t === 'quiz_complete') {
        current().events.push(e);
      }
      // tick and everything else: clock only, no boundary, no attach.
      continue;
    }

    if (e.source === 'ai') {
      // Phase 3b: AI boundaries need hysteresis; in 3a they only attach. Kept here
      // so the same pure core handles them once L1 lands.
      current().events.push(e);
      continue;
    }
  }

  // class_ended already closed the lesson at its real end; only extend to
  // lessonEndSec when the class never reported an explicit end.
  if (!ended) {
    insertTimeCutsUpTo(lessonEndSec);
    close(lessonEndSec);
  }

  // Drop any zero-length non-first segment (e.g. a boundary marker exactly at
  // lesson end): a zero-duration span is never meaningful on a Timeline. Segment
  // 0 is kept even when empty so an event-less lesson still has one segment.
  return segments.filter((s, idx) => !(idx > 0 && s.startSec === s.endSec));
}
