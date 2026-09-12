// lib/auth/accountStatus.ts
// 帳號狀態（停權 / 封鎖）判斷與異動。
//
// Profile 上的欄位：
//   accountStatus: 'active' | 'suspended' | 'banned'   （缺少視為 active，舊資料不用回填）
//   suspendedReason / suspendedAt / suspendedBy / suspendedUntil
//
// suspended = 暫時停權，可設到期時間（suspendedUntil）過了自動恢復；
// banned    = 永久封鎖，只有管理員手動解除。
//
// 執行點：
//   1. /api/login、Google / LINE callback — 停權帳號拒絕登入
//   2. 管理員停權時同步刪除該使用者所有 session（lib/auth/sessionManager deleteSessionsForUser），
//      讓已登入的裝置立刻失效，不用等 24 小時 session 過期。

import { ddbDocClient } from '@/lib/dynamo';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { PROFILES_TABLE, getProfileById, findProfilesByEmail } from '@/lib/profilesService';
import { deleteSessionsForUser } from '@/lib/auth/sessionManager';
import { writeAuditLog } from '@/lib/auditLogService';

export type AccountStatus = 'active' | 'suspended' | 'banned';

export const ACCOUNT_STATUSES: AccountStatus[] = ['active', 'suspended', 'banned'];

export interface AccountBlock {
  status: Exclude<AccountStatus, 'active'>;
  reason?: string;
  until?: string;
}

/**
 * 回傳 null 代表可以登入；否則回傳封鎖資訊。
 * suspendedUntil 已過期的暫時停權視為 active（不在這裡回寫，登入流程不需要多一次寫入）。
 */
export function getAccountBlock(profile: any): AccountBlock | null {
  if (!profile) return null;
  const status = profile.accountStatus as AccountStatus | undefined;
  if (!status || status === 'active') return null;

  if (status === 'suspended' && profile.suspendedUntil) {
    const until = Date.parse(profile.suspendedUntil);
    if (!Number.isNaN(until) && until <= Date.now()) return null;
  }

  return {
    status,
    reason: profile.suspendedReason || undefined,
    until: status === 'suspended' ? profile.suspendedUntil || undefined : undefined,
  };
}

export interface SetAccountStatusInput {
  profileId: string;
  status: AccountStatus;
  reason?: string;
  /** ISO 字串；只對 suspended 有意義 */
  until?: string | null;
  actorId: string;
}

/**
 * 變更帳號狀態並寫稽核紀錄。停權／封鎖時會順手踢掉所有 session。
 */
export async function setAccountStatus(input: SetAccountStatusInput) {
  const { profileId, status, reason, until, actorId } = input;
  if (!ACCOUNT_STATUSES.includes(status)) {
    throw new Error(`Invalid account status: ${status}`);
  }

  const profile = await getProfileById(profileId);
  if (!profile) throw new Error('Profile not found');

  // 資料裡存在同一個 email 有多筆 profile 的舊帳號，而登入是「用 email 查第一筆」。
  // 只停權管理員點到的那一筆，登入可能撿到另一筆繞過去 —— 所以同 email 的 profile 一律一起處理。
  // （LINE 帳號的 email 是 line_<uid>@line.local 佔位值，每個 uid 唯一，不會誤傷。）
  const targets: any[] = [profile];
  if (profile.email) {
    const siblings = await findProfilesByEmail(profile.email);
    for (const s of siblings) {
      if (s?.id && !targets.some(t => t.id === s.id)) targets.push(s);
    }
  }

  const now = new Date().toISOString();

  for (const target of targets) {
    // Dynamo 主鍵是 id；roid_id 與 id 通常相同，但保險起見用 target.id。
    const key = { id: target.id };
    if (status === 'active') {
      await ddbDocClient.send(new UpdateCommand({
        TableName: PROFILES_TABLE,
        Key: key,
        UpdateExpression:
          'SET accountStatus = :s, updatedAtUtc = :now REMOVE suspendedReason, suspendedAt, suspendedBy, suspendedUntil',
        ExpressionAttributeValues: { ':s': 'active', ':now': now },
      }));
    } else {
      const values: Record<string, unknown> = {
        ':s': status,
        ':now': now,
        ':reason': reason || '',
        ':by': actorId,
      };
      let expr = 'SET accountStatus = :s, updatedAtUtc = :now, suspendedAt = :now, suspendedReason = :reason, suspendedBy = :by';
      if (status === 'suspended' && until) {
        expr += ', suspendedUntil = :until';
        values[':until'] = until;
      } else {
        expr += ' REMOVE suspendedUntil';
      }
      await ddbDocClient.send(new UpdateCommand({
        TableName: PROFILES_TABLE,
        Key: key,
        UpdateExpression: expr,
        ExpressionAttributeValues: values,
      }));
    }
  }

  let revokedSessions = 0;
  if (status !== 'active') {
    // session.userId 可能是 id 或 roid_id（舊資料兩者可能不同），兩種都清。
    const ids = new Set<string>();
    for (const t of targets) {
      if (t.id) ids.add(t.id);
      if (t.roid_id) ids.add(t.roid_id);
    }
    for (const uid of ids) {
      revokedSessions += await deleteSessionsForUser(uid);
    }
  }

  const affectedProfileIds = targets.map(t => t.id);
  await writeAuditLog({
    actorId,
    action: `account.status.${status}`,
    targetType: 'profile',
    targetId: profile.id,
    metadata: { email: profile.email, reason: reason || null, until: until || null, revokedSessions, affectedProfileIds },
  });

  return { profileId: profile.id, status, revokedSessions, affectedProfileIds };
}
