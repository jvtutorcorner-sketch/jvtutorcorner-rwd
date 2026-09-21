// Append-only whiteboard stroke store (POC).
//
// The default model keeps ALL strokes in one DynamoDB item and rewrites the whole
// item on every stroke add/update, so each write costs WCU ∝ board size (measured
// ≈0.68 KB/stroke → 52 WCU/write at 76 strokes) and total cost grows ~O(N²).
//
// Here each stroke is its own small item under (roomId HASH, sk=strokeId RANGE),
// so appendStroke = one PutItem and updateStrokePoints = one UpdateItem of a
// ~1 KB item → ~1 WCU EACH, independent of how many strokes are on the board.
// Read-back is a single Query on roomId. Gated by WB_APPEND_ONLY at the call sites.

import { ddbDocClient } from './dynamo';
import { PutCommand, UpdateCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.WHITEBOARD_STROKES_TABLE || 'jvtutorcorner-whiteboard-strokes';
const TTL_SECONDS = 60 * 60 * 24; // 24h, matches the legacy table

const WB_CAP_LOG = process.env.WB_CAP_LOG === '1';
function logCap(op: string, cc: any, extra?: Record<string, unknown>) {
  if (!WB_CAP_LOG) return;
  try {
    console.log(
      `[WBCAP] op=${op} cu=${cc?.CapacityUnits ?? '?'}` + (extra ? ' ' + JSON.stringify(extra) : '')
    );
  } catch {
    /* ignore */
  }
}

/** One PutItem of a small per-stroke item → ~1 WCU regardless of board size. */
export async function appendStroke(roomId: string, stroke: any): Promise<void> {
  const now = Date.now();
  const resp = await ddbDocClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        roomId,
        sk: String(stroke?.id ?? `${now}`),
        seq: Number(stroke?.timestamp ?? now),
        page: stroke?.page ?? 1,
        points: stroke?.points ?? [],
        color: stroke?.stroke ?? '#000000',
        strokeWidth: stroke?.strokeWidth ?? 2,
        mode: stroke?.mode ?? 'draw',
        origin: stroke?.origin ?? null,
        updatedAt: now,
        ttl: Math.floor(now / 1000) + TTL_SECONDS,
      },
      ReturnConsumedCapacity: 'TOTAL',
    })
  );
  logCap('append-start', resp.ConsumedCapacity, { roomId, sk: stroke?.id });
}

/** One UpdateItem of a single stroke item → ~1 WCU regardless of board size. */
export async function updateStrokePoints(roomId: string, strokeId: string, points: number[]): Promise<void> {
  const now = Date.now();
  const resp = await ddbDocClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { roomId, sk: String(strokeId) },
      UpdateExpression: 'SET #p = :p, updatedAt = :now',
      ExpressionAttributeNames: { '#p': 'points' },
      ExpressionAttributeValues: { ':p': points, ':now': now },
      ReturnConsumedCapacity: 'TOTAL',
    })
  );
  logCap('append-update', resp.ConsumedCapacity, { roomId, sk: strokeId });
}

/** Read-back: one Query on the partition; reconstruct the ordered strokes array. */
export async function listStrokes(roomId: string): Promise<any[]> {
  const items: any[] = [];
  let ExclusiveStartKey: any = undefined;
  let readCu = 0;
  do {
    const resp = await ddbDocClient.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'roomId = :r',
        ExpressionAttributeValues: { ':r': roomId },
        ReturnConsumedCapacity: 'TOTAL',
      })
    );
    for (const it of resp.Items ?? []) items.push(it);
    readCu += resp.ConsumedCapacity?.CapacityUnits ?? 0;
    ExclusiveStartKey = resp.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  logCap('append-list', { CapacityUnits: readCu }, { roomId, strokes: items.length });
  return items
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .map((it) => ({
      id: it.sk,
      page: it.page,
      points: it.points ?? [],
      stroke: it.color ?? '#000000',
      strokeWidth: it.strokeWidth ?? 2,
      mode: it.mode ?? 'draw',
      timestamp: it.seq,
      updatedAt: it.updatedAt ?? it.seq,
      origin: it.origin ?? undefined,
    }));
}

/** Clear = delete every stroke item for the room (rare op). */
export async function clearStrokes(roomId: string): Promise<void> {
  let ExclusiveStartKey: any = undefined;
  const keys: Array<{ roomId: string; sk: string }> = [];
  do {
    const resp = await ddbDocClient.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'roomId = :r',
        ExpressionAttributeValues: { ':r': roomId },
        ProjectionExpression: 'roomId, sk',
      })
    );
    for (const it of resp.Items ?? []) keys.push({ roomId: it.roomId, sk: it.sk });
    ExclusiveStartKey = resp.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    await ddbDocClient.send(
      new BatchWriteCommand({
        RequestItems: { [TABLE]: chunk.map((k) => ({ DeleteRequest: { Key: k } })) },
      })
    );
  }
}
