// lib/realtime/registry.ts
//
// 房間登錄：誰在這堂課的哪個 SFU session、發佈了哪些軌道、最後一次心跳是什麼時候。
// 存在 course-sessions 表的 `sfuSessions` 欄位（map，key = SFU sessionId）。
//
// Realtime SFU 沒有房間與參與者的概念，也沒有伺服器事件——這份登錄就是「誰在場」的伺服器真相：
//   * 加入時間：代理路由在 sessions/new 成功後寫入（伺服器時間）
//   * 發佈的軌道：代理路由在 tracks/new（local）成功後寫入
//   * 離開：前端明確離開時寫 leftAt；否則由 lastSeenAt 逾時推論
// 對方要拉誰的軌道，一律從這裡查，不採信瀏覽器互傳的 sessionId。
//
// 讀取端的篩選邏輯是純函式，放在 participants.ts。

import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { COURSE_SESSIONS_TABLE } from '@/lib/courseSessionService';
import type { SfuSessionEntry } from './participants';

export { identityFor, activeParticipants } from './participants';
export type { SfuSessionEntry, SfuParticipantRole, ActiveParticipant } from './participants';

function ignoreMissing(err: any) {
  if (err?.name !== 'ConditionalCheckFailedException') throw err;
}

export async function registerSfuSession(
  courseSessionId: string,
  sfuSessionId: string,
  entry: SfuSessionEntry
): Promise<void> {
  const now = new Date().toISOString();
  // 先確保 map 存在，再寫入這個 session 的 key（與 recordPresenceEvent 相同的兩段式寫法）
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: COURSE_SESSIONS_TABLE,
      Key: { id: courseSessionId },
      UpdateExpression: 'SET sfuSessions = if_not_exists(sfuSessions, :empty), updatedAt = :now',
      ExpressionAttributeValues: { ':empty': {}, ':now': now },
      ConditionExpression: 'attribute_exists(id)',
    })
  );
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: COURSE_SESSIONS_TABLE,
      Key: { id: courseSessionId },
      UpdateExpression: 'SET sfuSessions.#sid = :entry, updatedAt = :now',
      ExpressionAttributeNames: { '#sid': sfuSessionId },
      ExpressionAttributeValues: { ':entry': entry, ':now': now },
      ConditionExpression: 'attribute_exists(id)',
    })
  );
}

export async function setSfuTracks(
  courseSessionId: string,
  sfuSessionId: string,
  trackNames: string[]
): Promise<void> {
  if (trackNames.length === 0) return;
  const now = new Date().toISOString();
  const names: Record<string, string> = { '#sid': sfuSessionId };
  const sets = trackNames.map((t, i) => {
    names[`#t${i}`] = t;
    return `sfuSessions.#sid.tracks.#t${i} = :now`;
  });
  await ddbDocClient
    .send(
      new UpdateCommand({
        TableName: COURSE_SESSIONS_TABLE,
        Key: { id: courseSessionId },
        UpdateExpression: `SET ${sets.join(', ')}, sfuSessions.#sid.lastSeenAt = :now, updatedAt = :now`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: { ':now': now },
        ConditionExpression: 'attribute_exists(sfuSessions.#sid)',
      })
    )
    .catch(ignoreMissing);
}

export async function touchSfuSession(courseSessionId: string, sfuSessionId: string): Promise<void> {
  const now = new Date().toISOString();
  await ddbDocClient
    .send(
      new UpdateCommand({
        TableName: COURSE_SESSIONS_TABLE,
        Key: { id: courseSessionId },
        UpdateExpression: 'SET sfuSessions.#sid.lastSeenAt = :now',
        ExpressionAttributeNames: { '#sid': sfuSessionId },
        ExpressionAttributeValues: { ':now': now },
        ConditionExpression: 'attribute_exists(sfuSessions.#sid)',
      })
    )
    .catch(ignoreMissing);
}

export async function markSfuSessionLeft(courseSessionId: string, sfuSessionId: string): Promise<string> {
  const now = new Date().toISOString();
  await ddbDocClient
    .send(
      new UpdateCommand({
        TableName: COURSE_SESSIONS_TABLE,
        Key: { id: courseSessionId },
        UpdateExpression:
          'SET sfuSessions.#sid.leftAt = if_not_exists(sfuSessions.#sid.leftAt, :now), updatedAt = :now',
        ExpressionAttributeNames: { '#sid': sfuSessionId },
        ExpressionAttributeValues: { ':now': now },
        ConditionExpression: 'attribute_exists(sfuSessions.#sid)',
      })
    )
    .catch(ignoreMissing);
  return now;
}
