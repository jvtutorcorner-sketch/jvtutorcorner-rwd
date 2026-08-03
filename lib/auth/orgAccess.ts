// lib/auth/orgAccess.ts
// 組織範圍的授權判斷 — Session 本身不帶 orgId/isOrgAdmin，任何「這個人能不能動組織 X」
// 的判斷都需要另外查 profile。集中寫在這裡，避免散落在每個 organizations/org-units/
// licenses route 各自查一次。

import { NextResponse } from 'next/server';
import type { AuthedRequest } from './apiGuard';
import { getProfileById } from '@/lib/profilesService';
import type { ProfileB2B } from '@/lib/types/b2b';

export type OrgActor = {
  session: AuthedRequest['session'];
  profile: ProfileB2B | null;
  /** role === 'admin' (一般系統管理員) 或 'system'（E2E bypass / HMAC 內部服務身分） */
  isSystemAdmin: boolean;
  isOrgAdmin: boolean;
  orgId: string | null;
};

/**
 * 'read'/'write'：系統管理員或該組織的組織管理員皆可。
 * 'system'：僅系統管理員（建立組織、刪除組織、變更方案/席次上限等計費行為）。
 */
export type OrgAccessLevel = 'read' | 'write' | 'system';

export type OrgGuardResult =
  | { ok: true; actor: OrgActor }
  | { ok: false; response: NextResponse };

const ACTOR_CACHE_KEY = '__orgActor';

/**
 * 解析目前請求者的組織身分。單一 request 內重複呼叫只會查一次 profile（cache 在 req 上）。
 */
export async function resolveOrgActor(req: AuthedRequest): Promise<OrgActor> {
  const cached = (req as any)[ACTOR_CACHE_KEY] as OrgActor | undefined;
  if (cached) return cached;

  const session = req.session;
  const isSystemAdmin = session.role === 'admin' || session.role === 'system';

  // 系統管理員 / E2E bypass 不一定有對應的 profile 記錄，且不需要查— 一律全權。
  const profile = isSystemAdmin ? null : ((await getProfileById(session.userId)) as ProfileB2B | null);

  const actor: OrgActor = {
    session,
    profile,
    isSystemAdmin,
    isOrgAdmin: profile?.isOrgAdmin === true,
    orgId: profile?.orgId ?? null
  };

  (req as any)[ACTOR_CACHE_KEY] = actor;
  return actor;
}

function forbidden(message: string): OrgGuardResult {
  return { ok: false, response: NextResponse.json({ ok: false, error: message }, { status: 403 }) };
}

/** 僅系統管理員可通過（建立/刪除組織、方案與席次上限等計費欄位）。 */
export async function requireSystemAdmin(req: AuthedRequest): Promise<OrgGuardResult> {
  const actor = await resolveOrgActor(req);
  if (!actor.isSystemAdmin) {
    return forbidden('Forbidden: requires system administrator');
  }
  return { ok: true, actor };
}

/**
 * 系統管理員全權；組織管理員（profile.isOrgAdmin && profile.orgId === orgId）可讀寫自己組織；
 * 其他登入者一律 403（不透露組織是否存在）。
 */
export async function requireOrgAccess(
  req: AuthedRequest,
  orgId: string,
  level: OrgAccessLevel
): Promise<OrgGuardResult> {
  if (!orgId) {
    return { ok: false, response: NextResponse.json({ ok: false, error: 'orgId is required' }, { status: 400 }) };
  }

  const actor = await resolveOrgActor(req);

  if (actor.isSystemAdmin) {
    return { ok: true, actor };
  }

  if (level === 'system') {
    return forbidden('Forbidden: requires system administrator');
  }

  if (actor.isOrgAdmin && actor.orgId === orgId) {
    return { ok: true, actor };
  }

  return forbidden('Forbidden: you do not have access to this organization');
}
