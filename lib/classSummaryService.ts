// DynamoDB access for AI class summaries. Table: jvtutorcorner-class-summaries
// (schema in scripts/lib/schema.mjs). The pure state machine + id derivation live in
// lib/classSummary/summaryLogic.ts; this file is the persistence + conditional-write
// layer (idempotent create, atomic claim, status transitions).

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import type { ClassSummaryRow, ConsentRecord, SummaryJson, SummaryStatus } from '@/lib/classSummary/types';
import { MAX_SUMMARY_ATTEMPTS } from '@/lib/classSummary/summaryLogic';

const TABLE = process.env.DYNAMODB_TABLE_CLASS_SUMMARIES || 'jvtutorcorner-class-summaries';

export async function getClassSummary(summaryId: string): Promise<ClassSummaryRow | null> {
  const { Item } = await ddbDocClient.send(new GetCommand({ TableName: TABLE, Key: { summaryId } }));
  return (Item as ClassSummaryRow) || null;
}

export async function getClassSummaryByOrder(orderId: string): Promise<ClassSummaryRow | null> {
  const res = await ddbDocClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'byOrderId',
      KeyConditionExpression: 'orderId = :o',
      ExpressionAttributeValues: { ':o': orderId },
      ScanIndexForward: false,
      Limit: 1,
    })
  );
  return (res.Items?.[0] as ClassSummaryRow) || null;
}

/**
 * Create the RECORDING row when a class opens with recording enabled. Idempotent: a
 * second caller for the same summaryId is a no-op (attribute_not_exists guard).
 */
export async function ensureRecordingRow(row: {
  summaryId: string;
  courseId: string;
  orderId: string;
  teacherId: string;
  studentId?: string;
  consent: ConsentRecord[];
  recordingEnabled: boolean;
}): Promise<void> {
  const now = Date.now();
  const item: ClassSummaryRow = {
    ...row,
    status: 'RECORDING',
    audioKeys: [],
    boardKeys: [],
    attempts: 0,
    createdAt: new Date(now).toISOString(),
    updatedAt: now,
  };
  try {
    await ddbDocClient.send(
      new PutCommand({ TableName: TABLE, Item: item, ConditionExpression: 'attribute_not_exists(summaryId)' })
    );
  } catch (err: any) {
    if (err?.name !== 'ConditionalCheckFailedException') throw err;
  }
}

/** Append a participant's consent record and (when declined) disable recording. */
export async function addConsent(summaryId: string, consent: ConsentRecord): Promise<void> {
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { summaryId },
      UpdateExpression:
        'SET consent = list_append(if_not_exists(consent, :empty), :c), updatedAt = :t' +
        (consent.agreed ? '' : ', recordingEnabled = :false'),
      ExpressionAttributeValues: {
        ':c': [consent],
        ':empty': [],
        ':t': Date.now(),
        ...(consent.agreed ? {} : { ':false': false }),
      },
    })
  );
}

export async function appendAudioKey(summaryId: string, key: string): Promise<void> {
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { summaryId },
      UpdateExpression: 'SET audioKeys = list_append(if_not_exists(audioKeys, :empty), :k), updatedAt = :t',
      ExpressionAttributeValues: { ':k': [key], ':empty': [], ':t': Date.now() },
    })
  );
}

export async function setBoardArtifacts(summaryId: string, boardKeys: string[], pdfKey?: string): Promise<void> {
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { summaryId },
      UpdateExpression: 'SET boardKeys = :b, updatedAt = :t' + (pdfKey ? ', pdfKey = :p' : ''),
      ExpressionAttributeValues: { ':b': boardKeys, ':t': Date.now(), ...(pdfKey ? { ':p': pdfKey } : {}) },
    })
  );
}

/** RECORDING → PENDING when the class ends. Only transitions from RECORDING (idempotent). */
export async function markClassEnded(summaryId: string): Promise<boolean> {
  try {
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { summaryId },
        UpdateExpression: 'SET #s = :pending, updatedAt = :t',
        ConditionExpression: '#s = :recording',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':pending': 'PENDING', ':recording': 'RECORDING', ':t': Date.now() },
      })
    );
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

/** Atomically claim a PENDING row for a worker: PENDING → PROCESSING, attempts += 1. */
export async function claimForProcessing(summaryId: string): Promise<boolean> {
  try {
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { summaryId },
        UpdateExpression: 'SET #s = :proc, attempts = if_not_exists(attempts, :zero) + :one, updatedAt = :t',
        ConditionExpression: '#s = :pending',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':proc': 'PROCESSING', ':pending': 'PENDING', ':zero': 0, ':one': 1, ':t': Date.now() },
      })
    );
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

export async function markReady(
  summaryId: string,
  summary: SummaryJson,
  meta: { transcriptKey?: string; model?: string; costTokens?: number }
): Promise<void> {
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { summaryId },
      UpdateExpression:
        'SET #s = :ready, summary = :sum, updatedAt = :t' +
        (meta.transcriptKey ? ', transcriptKey = :tk' : '') +
        (meta.model ? ', model = :m' : '') +
        (meta.costTokens != null ? ', costTokens = :c' : ''),
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':ready': 'READY',
        ':sum': summary,
        ':t': Date.now(),
        ...(meta.transcriptKey ? { ':tk': meta.transcriptKey } : {}),
        ...(meta.model ? { ':m': meta.model } : {}),
        ...(meta.costTokens != null ? { ':c': meta.costTokens } : {}),
      },
    })
  );
}

/** PROCESSING → PENDING (retry) or FAILED (budget exhausted), based on current attempts. */
export async function markAttemptFailed(summaryId: string, attempts: number): Promise<SummaryStatus> {
  const next: SummaryStatus = attempts >= MAX_SUMMARY_ATTEMPTS ? 'FAILED' : 'PENDING';
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { summaryId },
      UpdateExpression: 'SET #s = :n, updatedAt = :t',
      ConditionExpression: '#s = :proc',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':n': next, ':proc': 'PROCESSING', ':t': Date.now() },
    })
  );
  return next;
}

export async function markSkipped(summaryId: string): Promise<void> {
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { summaryId },
      UpdateExpression: 'SET #s = :skip, updatedAt = :t',
      ConditionExpression: '#s <> :ready',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':skip': 'SKIPPED', ':ready': 'READY', ':t': Date.now() },
    })
  ).catch((err: any) => {
    if (err?.name !== 'ConditionalCheckFailedException') throw err;
  });
}

/** Oldest-first PENDING rows for the background worker. */
export async function listPending(limit = 10): Promise<ClassSummaryRow[]> {
  const res = await ddbDocClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'byStatus',
      KeyConditionExpression: '#s = :pending',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':pending': 'PENDING' },
      ScanIndexForward: true,
      Limit: limit,
    })
  );
  return (res.Items as ClassSummaryRow[]) || [];
}
