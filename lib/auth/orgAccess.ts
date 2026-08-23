// lib/auth/orgAccess.ts
// 組織範圍的授權判斷 — Session 本身不帶 orgId/isOrgAdmin，任何「這個人能不能動組織 X」
// 的判斷都需要另外查 profile。集中寫在這裡，避免散落在每個 organizations/org-units/
// licenses route 各自查一次。

import { NextResponse } from 'next/server';
import type { AuthedRequest } from './apiGuard';
import { getProfileById } from '@/lib/profilesService';
import type { ProfileB2B } from '@/lib/types/b2b';
import { getOrgUnitById, getDescendantUnits } from '@/lib/orgUnitService';

export type OrgActor = {
  session: AuthedRequest['session'];
  profile: ProfileB2B | null;
  /** role === 'admin' (一般系統管理員) 或 'system'（E2E bypass / HMAC 內部服務身分） */
  isSystemAdmin: boolean;
  isOrgAdmin: boolean;
  orgId: string | null;
  /** 部門管理員：只能管理 deptAdminUnitId 與其子部門，範圍以外一律 403。 */
  isDeptAdmin: boolean;
  deptAdminUnitId: string | null;
  /** deptAdminUnitId 本身的 path（供子樹比對用）；非部門管理員或找不到單位時為 null。 */
  deptAdminUnitPath: string | null;
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

  const isDeptAdmin = !isSystemAdmin && profile?.isOrgAdmin !== true && profile?.isDeptAdmin === true && !!profile?.deptAdminUnitId;

  // 只有真正的部門管理員才多查一次單位路徑（給 path prefix 比對用）；一般成員/組織管理員
  // 不用付這個額外查詢的成本。
  let deptAdminUnitPath: string | null = null;
  if (isDeptAdmin && profile?.deptAdminUnitId) {
    const unit = await getOrgUnitById(profile.deptAdminUnitId);
    // 單位若已被刪除，視同沒有部門範圍——不能讓一個懸空的 deptAdminUnitId 意外變成全組織通行。
    if (unit && unit.orgId === profile.orgId) {
      deptAdminUnitPath = unit.path;
    }
  }

  const actor: OrgActor = {
    session,
    profile,
    isSystemAdmin,
    isOrgAdmin: profile?.isOrgAdmin === true,
    orgId: profile?.orgId ?? null,
    isDeptAdmin: isDeptAdmin && deptAdminUnitPath !== null,
    deptAdminUnitId: isDeptAdmin && deptAdminUnitPath !== null ? profile!.deptAdminUnitId! : null,
    deptAdminUnitPath
  };

  (req as any)[ACTOR_CACHE_KEY] = actor;
  return actor;
}

/** 部門管理員範圍內（含自己）的所有 orgUnit id。非部門管理員回傳 null（代表「不限縮範圍」）。 */
export async function resolveDeptScopeUnitIds(actor: OrgActor): Promise<Set<string> | null> {
  if (!actor.isDeptAdmin || !actor.deptAdminUnitId) return null;
  const descendants = await getDescendantUnits(actor.deptAdminUnitId);
  return new Set([actor.deptAdminUnitId, ...descendants.map((u) => u.id)]);
}

/** 目標 orgUnit 是否在部門管理員的範圍內（自己或子孫）。只用 path prefix，不用額外查詢。 */
function isUnitWithinDeptScope(actor: OrgActor, unit: { id: string; path: string }): boolean {
  if (!actor.isDeptAdmin || !actor.deptAdminUnitId || !actor.deptAdminUnitPath) return false;
  return unit.id === actor.deptAdminUnitId || unit.path.startsWith(`${actor.deptAdminUnitPath}/`);
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
 * 跟 requireOrgAccess 一樣，但額外放行「範圍涵蓋整個組織讀寫入口」的部門管理員——這類路由
 * （成員清單、加入成員等）本來就是以 org 為單位掛號的，實際的部門邊界要在 route handler 內
 * 用 resolveDeptScopeUnitIds() 對每筆資料再做一次列級過濾，這裡只負責「能不能進門」。
 * 'system' 層級（計費相關）一律不放行部門管理員。
 */
export async function requireOrgOrDeptAccess(
  req: AuthedRequest,
  orgId: string,
  level: OrgAccessLevel
): Promise<OrgGuardResult> {
  const base = await requireOrgAccess(req, orgId, level);
  if (base.ok) return base;

  if (level === 'system') return base;

  const actor = await resolveOrgActor(req);
  if (actor.isDeptAdmin && actor.orgId === orgId) {
    return { ok: true, actor };
  }

  return base;
}

/**
 * 特定 orgUnit 的讀寫權限：系統管理員全權；組織管理員可管所有本組織單位；部門管理員只能管
 * 自己與子孫單位；其餘一律 403。呼叫方通常已經查過這個 unit（要驗證它存在），直接把物件傳
 * 進來，避免重複查一次。
 */
export async function requireOrgUnitAccess(
  req: AuthedRequest,
  orgUnit: { id: string; orgId: string; path: string },
  level: 'read' | 'write'
): Promise<OrgGuardResult> {
  const base = await requireOrgAccess(req, orgUnit.orgId, level);
  if (base.ok) return base;

  const actor = await resolveOrgActor(req);
  if (actor.orgId === orgUnit.orgId && isUnitWithinDeptScope(actor, orgUnit)) {
    return { ok: true, actor };
  }

  return base;
}
