// lib/lessonAI/lessonStore.ts
//
// DynamoDB access for the Phase 3 lesson tables (lesson-events, lesson-segments).
// Server-only. The pure Segmenter (segmenter.ts) never touches this — callers
// read events here, run the Segmenter, then write segments here.
//
// Tables (scripts/lib/schema.mjs):
//   lesson-events    PK sessionId, SK sk=`${paddedTs}#${eventId}` (chronological)
//   lesson-segments  PK sessionId, SK seq (zero-padded), GSI byCourseId

import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import type { DerivedSegment, LessonEvent } from './eventTypes';

export const LESSON_EVENTS_TABLE =
  process.env.DYNAMODB_TABLE_LESSON_EVENTS || 'jvtutorcorner-lesson-events';
export const LESSON_SEGMENTS_TABLE =
  process.env.DYNAMODB_TABLE_LESSON_SEGMENTS || 'jvtutorcorner-lesson-segments';

/** Max epoch-ms width (year ~5138) — padded so lexical sk order == chronological. */
const TS_WIDTH = 15;
const padTs = (ts: number) => String(Math.max(0, Math.floor(ts))).padStart(TS_WIDTH, '0');
const padSeq = (seq: number) => String(Math.max(0, Math.floor(seq))).padStart(6, '0');

export interface StoredLessonEvent extends LessonEvent {
  sessionId: string;
  sk: string;
  courseId?: string;
  createdBy?: string;
}

export function eventSortKey(ts: number, eventId: string): string {
  return `${padTs(ts)}#${eventId}`;
}

/**
 * Append one event. Idempotent on (ts, eventId): a client that retries with the
 * SAME event object (same eventId + ts) re-writes the same sk and the
 * conditional no-op swallows it. The caller must reuse the event object on retry.
 */
export async function appendLessonEvent(
  sessionId: string,
  event: LessonEvent,
  extra?: { courseId?: string; createdBy?: string }
): Promise<StoredLessonEvent> {
  const ts = event.ts ?? Date.now();
  const item: StoredLessonEvent = {
    ...event,
    ts,
    sessionId,
    sk: eventSortKey(ts, event.eventId),
    ...(extra?.courseId ? { courseId: extra.courseId } : {}),
    ...(extra?.createdBy ? { createdBy: extra.createdBy } : {}),
  };
  try {
    await ddbDocClient.send(
      new PutCommand({
        TableName: LESSON_EVENTS_TABLE,
        Item: item,
        ConditionExpression: 'attribute_not_exists(sk)',
      })
    );
  } catch (err: any) {
    if (err?.name !== 'ConditionalCheckFailedException') throw err;
  }
  return item;
}

/** Append a batch of events (sequential Put so each keeps its idempotency check). */
export async function appendLessonEvents(
  sessionId: string,
  events: LessonEvent[],
  extra?: { courseId?: string; createdBy?: string }
): Promise<StoredLessonEvent[]> {
  const out: StoredLessonEvent[] = [];
  for (const e of events) out.push(await appendLessonEvent(sessionId, e, extra));
  return out;
}

/**
 * List a lesson's events in chronological order. `sinceSk` (exclusive) supports
 * the Copilot / Timeline "?since=" poll.
 */
export async function listLessonEvents(
  sessionId: string,
  opts?: { sinceSk?: string; limit?: number }
): Promise<StoredLessonEvent[]> {
  if (!sessionId) return [];
  const items: StoredLessonEvent[] = [];
  let exclusiveStartKey: any = undefined;
  const useSince = opts?.sinceSk && opts.sinceSk.length > 0;
  do {
    const res: any = await ddbDocClient.send(
      new QueryCommand({
        TableName: LESSON_EVENTS_TABLE,
        KeyConditionExpression: useSince ? 'sessionId = :s AND sk > :since' : 'sessionId = :s',
        ExpressionAttributeValues: useSince
          ? { ':s': sessionId, ':since': opts!.sinceSk }
          : { ':s': sessionId },
        ScanIndexForward: true,
        ...(opts?.limit ? { Limit: opts.limit } : {}),
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      })
    );
    items.push(...((res.Items || []) as StoredLessonEvent[]));
    exclusiveStartKey = res.LastEvaluatedKey;
    if (opts?.limit && items.length >= opts.limit) return items.slice(0, opts.limit);
  } while (exclusiveStartKey);
  return items;
}

export interface StoredLessonSegment extends Omit<DerivedSegment, 'seq'> {
  sessionId: string;
  seq: string; // zero-padded SK (lexical == chronological)
  index: number; // the numeric DerivedSegment.seq, for display
  courseId: string;
  startTime: string; // ISO — byCourseId range key (never null)
  editedBy?: string;
  updatedAt: string;
}

/**
 * Overwrite a lesson's derived segments. The Segmenter is deterministic, so the
 * finalize path just replaces the set. Uses BatchWrite in chunks of 25.
 *
 * A teacher-edited segment (editedBy set) keeps its edited topic/objective across
 * a re-finalize: this reads the current rows and preserves those fields.
 */
export async function putLessonSegments(
  sessionId: string,
  courseId: string,
  lessonStartIso: string,
  segments: DerivedSegment[]
): Promise<StoredLessonSegment[]> {
  const now = new Date().toISOString();
  const startMs = Date.parse(lessonStartIso) || Date.now();

  const prior = new Map((await listLessonSegments(sessionId)).map((r) => [r.seq, r]));

  const rows: StoredLessonSegment[] = segments.map((s) => {
    const seq = padSeq(s.seq);
    const edited = prior.get(seq)?.editedBy ? prior.get(seq) : undefined;
    return {
      sessionId,
      seq,
      index: s.seq,
      courseId,
      // Absolute start (lesson start + offset) — stable, non-null byCourseId range key.
      startTime: new Date(startMs + s.startSec * 1000).toISOString(),
      startSec: s.startSec,
      endSec: s.endSec,
      boundarySource: s.boundarySource,
      boundaryType: s.boundaryType,
      confidence: s.confidence,
      events: s.events,
      closed: s.closed,
      // Preserve a teacher edit through re-finalize.
      ...(edited?.topic !== undefined ? { topic: edited.topic } : {}),
      ...(edited?.objective !== undefined ? { objective: edited.objective } : {}),
      ...(edited?.editedBy ? { editedBy: edited.editedBy } : {}),
      updatedAt: now,
    } as StoredLessonSegment;
  });

  for (let i = 0; i < rows.length; i += 25) {
    const chunk = rows.slice(i, i + 25);
    await ddbDocClient.send(
      new BatchWriteCommand({
        RequestItems: { [LESSON_SEGMENTS_TABLE]: chunk.map((Item) => ({ PutRequest: { Item } })) },
      })
    );
  }
  return rows;
}

/** Read a lesson's segments in order (seq ascending). */
export async function listLessonSegments(sessionId: string): Promise<StoredLessonSegment[]> {
  if (!sessionId) return [];
  const items: StoredLessonSegment[] = [];
  let exclusiveStartKey: any = undefined;
  do {
    const res: any = await ddbDocClient.send(
      new QueryCommand({
        TableName: LESSON_SEGMENTS_TABLE,
        KeyConditionExpression: 'sessionId = :s',
        ExpressionAttributeValues: { ':s': sessionId },
        ScanIndexForward: true,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      })
    );
    items.push(...((res.Items || []) as StoredLessonSegment[]));
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

/**
 * Teacher post-class edit of one segment (merge/split/rename). Only the
 * human-editable fields; the Segmenter never overwrites an edited segment's
 * topic/objective on a re-finalize (callers should guard on `editedBy`).
 */
export async function updateLessonSegment(
  sessionId: string,
  seq: string,
  patch: { topic?: string; objective?: string; startSec?: number; endSec?: number },
  editedBy: string
): Promise<StoredLessonSegment | null> {
  const sets: string[] = ['editedBy = :by', 'updatedAt = :now'];
  const values: Record<string, any> = { ':by': editedBy, ':now': new Date().toISOString() };
  const names: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    sets.push(`#${k} = :${k}`);
    names[`#${k}`] = k;
    values[`:${k}`] = v;
  }
  const res = await ddbDocClient.send(
    new UpdateCommand({
      TableName: LESSON_SEGMENTS_TABLE,
      Key: { sessionId, seq },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(sessionId)',
      ReturnValues: 'ALL_NEW',
    })
  );
  return (res.Attributes as StoredLessonSegment) || null;
}
