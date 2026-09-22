// lib/lessonAI/finalize.ts
//
// Turn a lesson's stored events into stored segments by running the pure
// Segmenter. Called at class end (app/api/classroom/complete) and on demand
// (POST /api/lessons/[sessionId]/finalize). Zero AI cost — it only reads markers,
// system events and time ticks, so it runs whether or not AI is enabled.

import { listLessonEvents, putLessonSegments } from './lessonStore';
import { segmentLesson } from './segmenter';

export interface FinalizeInput {
  sessionId: string;
  courseId: string;
  lessonStartIso: string; // scheduled/actual start
  lessonEndIso?: string; // scheduled end — a floor for lessonEndSec
}

export interface FinalizeResult {
  segments: number;
  skipped?: 'no-events';
}

export async function finalizeLessonSegments(input: FinalizeInput): Promise<FinalizeResult> {
  const events = await listLessonEvents(input.sessionId);
  if (events.length === 0) return { segments: 0, skipped: 'no-events' };

  const startMs = Date.parse(input.lessonStartIso) || 0;
  const endMs = input.lessonEndIso ? Date.parse(input.lessonEndIso) : NaN;
  const lastOffset = events.reduce((m, e) => Math.max(m, e.offsetSec || 0), 0);
  const schedSec = Number.isFinite(endMs) && startMs ? Math.max(0, (endMs - startMs) / 1000) : 0;
  // Cover both a class that ran long (lastOffset) and one that ended abruptly
  // without a class_ended event (schedSec).
  const lessonEndSec = Math.max(lastOffset, schedSec);

  const segments = segmentLesson(events, { lessonEndSec });
  await putLessonSegments(input.sessionId, input.courseId, input.lessonStartIso, segments);
  return { segments: segments.length };
}
