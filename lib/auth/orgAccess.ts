// lib/auth/orgAccess.ts
// 組織範圍的授權判斷 — Session 本身不帶 orgId/isOrgAdmin，任何「這個人能不能動組織 X」
// 的判斷都需要另外查 profile。集中寫在這裡，避免散落在每個 organizations/org-units/
// licenses route 各自查一次。

import { NextResponse } from 'next/server';
import type { AuthedRequest } from './apiGuard';
import { getProfileById } from '@/lib/profilesService';
import type { ProfileB2B, OrgUnit } from '@/lib/types/b2b';
import orgUnitService from '@/lib/orgUnitService';

export type OrgActor = {
  session: AuthedRequest['session'];
  profile: ProfileB2B | null;
  /** role === 'admin' (一般系統管理員) 或 'system'（E2E bypass / HMAC 內部服務身分） */
  isSystemAdmin: boolean;
  isOrgAdmin: boolean;
  orgId: string | null;
  /** profile.role === 'dept_admin'：只能管自己 orgUnitId 子樹，見 requireOrgUnitAccess。 */
  isDeptAdmin: boolean;
  /** dept_admin 自己所屬（管理）的 orgUnit id；一般成員也會有 orgUnitId 但不代表有管理權。 */
  orgUnitId: string | null;
  /** 快取：dept_admin 自己那個 orgUnit 的完整記錄（含 path），第一次用到才查。 */
  _deptAdminUnit?: OrgUnit | null;
  /** 快取：dept_admin 子樹（自己 + 所有 descendant）的 unit id 集合，第一次用到才查。 */
  _deptAdminScopeIds?: Set<string>;
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
    orgId: profile?.orgId ?? null,
    isDeptAdmin: profile?.role === 'dept_admin',
    orgUnitId: profile?.orgUnitId ?? null
  };

  (req as any)[ACTOR_CACHE_KEY] = actor;
  return actor;
}

/** dept_admin 自己那個 orgUnit 的完整記錄（含 path）；非 dept_admin 或缺 orgUnitId 回傳 null。 */
async function getDeptAdminUnit(actor: OrgActor): Promise<OrgUnit | null> {
  if (!actor.isDeptAdmin || !actor.orgUnitId) return null;
  if (actor._deptAdminUnit !== undefined) return actor._deptAdminUnit;
  const unit = await orgUnitService.getOrgUnitById(actor.orgUnitId);
  actor._deptAdminUnit = unit;
  return unit;
}

/**
 * dept_admin 管轄範圍內的 orgUnit id 集合（自己 + 所有子孫）。用於一次性過濾成員/單位清單，
 * 避免對清單裡每一筆都各查一次 path。非 dept_admin 回傳 null（呼叫端應改用組織層級判斷）。
 */
async function getDeptAdminScopeUnitIds(actor: OrgActor): Promise<Set<string> | null> {
  if (!actor.isDeptAdmin || !actor.orgUnitId) return null;
  if (actor._deptAdminScopeIds) return actor._deptAdminScopeIds;
  const ownUnit = await getDeptAdminUnit(actor);
  if (!ownUnit) {
    actor._deptAdminScopeIds = new Set();
    return actor._deptAdminScopeIds;
  }
  const descendants = await orgUnitService.getDescendantUnits(ownUnit.id);
  const ids = new Set<string>([ownUnit.id, ...descendants.map((u) => u.id)]);
  actor._deptAdminScopeIds = ids;
  return ids;
}

/** targetUnit 是否等於或位於 unit 的子樹（同組織前提由呼叫端先確認）。 */
function isUnitWithinPath(rootPath: string, targetPath: string): boolean {
  return targetPath === rootPath || targetPath.startsWith(`${rootPath}/`);
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

/**
 * OrgUnit 範圍授權：系統管理員與該組織的 isOrgAdmin 全權（涵蓋整個組織的任何 unit）；
 * dept_admin 只能讀寫「自己 orgUnitId 子樹」內的 unit（含自己那個 unit）；其餘一律 403。
 * 沒有 'system' 等級 —— org unit 本身沒有計費類欄位需要更高權限。
 */
export async function requireOrgUnitAccess(
  req: AuthedRequest,
  targetUnit: Pick<OrgUnit, 'id' | 'orgId' | 'path'>,
  level: 'read' | 'write'
): Promise<OrgGuardResult> {
  const actor = await resolveOrgActor(req);

  if (actor.isSystemAdmin) {
    return { ok: true, actor };
  }

  if (actor.isOrgAdmin && actor.orgId === targetUnit.orgId) {
    return { ok: true, actor };
  }

  if (actor.isDeptAdmin && actor.orgId === targetUnit.orgId) {
    const ownUnit = await getDeptAdminUnit(actor);
    if (ownUnit && isUnitWithinPath(ownUnit.path, targetUnit.path)) {
      return { ok: true, actor };
    }
  }

  return forbidden('Forbidden: you do not have access to this org unit');
}

/**
 * 依 actor 權限過濾一份 orgUnit 清單：系統管理員/該組織的 isOrgAdmin 拿到完整清單；
 * dept_admin 只拿到自己子樹內的 unit；其他人一律空陣列（呼叫端應該在更早就 403，這裡是保底）。
 */
export async function filterOrgUnitsForActor(actor: OrgActor, units: OrgUnit[]): Promise<OrgUnit[]> {
  if (actor.isSystemAdmin) return units;
  if (units.length === 0) return units;
  const orgId = units[0].orgId;
  if (actor.isOrgAdmin && actor.orgId === orgId) return units;
  if (actor.isDeptAdmin && actor.orgId === orgId) {
    const ownUnit = await getDeptAdminUnit(actor);
    if (!ownUnit) return [];
    return units.filter((u) => isUnitWithinPath(ownUnit.path, u.path));
  }
  return [];
}

/**
 * 組織成員範圍授權：系統管理員/該組織 isOrgAdmin 對組織內任何成員全權；
 * dept_admin 只能動「orgUnitId 落在自己子樹內」的成員 —— 不隸屬任何部門
 * （orgUnitId 為 null/undefined）的成員一律視為不在 dept_admin 範圍內。
 */
export async function requireMemberScopeAccess(
  req: AuthedRequest,
  orgId: string,
  memberOrgUnitId: string | null | undefined
): Promise<OrgGuardResult> {
  const orgGuard = await requireOrgAccess(req, orgId, 'write');
  if (orgGuard.ok) return orgGuard;

  const actor = await resolveOrgActor(req);
  if (actor.isDeptAdmin && actor.orgId === orgId && memberOrgUnitId) {
    const scopeIds = await getDeptAdminScopeUnitIds(actor);
    if (scopeIds && scopeIds.has(memberOrgUnitId)) {
      return { ok: true, actor };
    }
  }

  return forbidden('Forbidden: this member is outside your department scope');
}

/** 依 actor 權限過濾成員清單（同 filterOrgUnitsForActor 的邏輯，套用在 profile.orgUnitId 上）。 */
export async function filterMembersForActor<T extends { orgUnitId?: string | null }>(
  actor: OrgActor,
  orgId: string,
  members: T[]
): Promise<T[]> {
  if (actor.isSystemAdmin) return members;
  if (actor.isOrgAdmin && actor.orgId === orgId) return members;
  if (actor.isDeptAdmin && actor.orgId === orgId) {
    const scopeIds = await getDeptAdminScopeUnitIds(actor);
    if (!scopeIds) return [];
    return members.filter((m) => m.orgUnitId && scopeIds.has(m.orgUnitId));
  }
  return [];
}
