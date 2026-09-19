/**
 * Shared building blocks for self-registration (POST /api/register) and the enterprise
 * CSV batch registration (POST /api/register/batch).
 *
 * Both routes must produce byte-for-byte the same profile record (whitelisted fields,
 * scrypt password hash, email-verification bookkeeping), so the record is built here
 * once. Relative imports only — scripts/verify-register-batch.mjs loads this module
 * under plain Node with a fake DynamoDB.
 */

import { randomUUID } from 'crypto';

import { hashPassword } from './auth/password';
import { generateVerificationToken } from './email/verificationService';
import { findProfileByEmail } from './profilesService';
import { getOrganizationById } from './organizationService';
import { getOrgUnitById } from './orgUnitService';
import { createNewMembersWithLicenses, type CreatedMember } from './orgMembershipService';

/** Roles a person may give themselves. admin / dept_admin / custom roles are granted, never self-selected. */
export const SELF_REGISTRATION_ROLES = ['student', 'teacher'] as const;

/**
 * Plans a new account may start on — the NT$0 tiers only ('basic' is the legacy
 * synonym of 'free', 'viewer' is the register page's default). Paid plans are
 * applied by the payment flow (lib/paymentSuccessHandler.ts), never by a form field.
 */
export const SELF_REGISTRATION_PLANS = ['free', 'basic', 'viewer'];

/** Profile fields a registration form may populate. Everything else is server-owned. */
export const PROFILE_TEXT_FIELDS = [
  'firstName', 'lastName', 'nickname', 'name', 'birthdate', 'gender', 'country',
  'timezone', 'bio', 'createdAtUtc', 'createdAtLocal', 'updatedAtLocal',
];

export function resolveSelfRegistrationRole(raw: unknown): string | null {
  const role = raw === undefined || raw === null || raw === '' ? 'student' : String(raw);
  return (SELF_REGISTRATION_ROLES as readonly string[]).includes(role) ? role : null;
}

export function pickProfileFields(body: Record<string, unknown>): Record<string, string | boolean> {
  const fields: Record<string, string | boolean> = {};
  for (const field of PROFILE_TEXT_FIELDS) {
    const value = body[field];
    if (typeof value === 'string' && value.trim()) {
      fields[field] = value.trim().slice(0, field === 'bio' ? 500 : 200);
    }
  }
  if (typeof body.termsAccepted === 'boolean') fields.termsAccepted = body.termsAccepted;
  return fields;
}

export interface NewProfileRecord {
  id: string;
  profile: Record<string, unknown> & { id: string };
  verificationToken: string;
  verificationExpires: string;
}

/**
 * The profile record a registration writes. It is never B2B at this point: org fields
 * (orgId/licenseId/isB2B=true) are only ever written by orgMembershipService in the same
 * transaction that consumes the seat, so a profile with isB2B=true always holds a seat.
 */
export function buildNewProfileRecord(opts: {
  email: string;
  password: string;
  role: string;
  plan: string | null;
  fields: Record<string, string | boolean>;
}): NewProfileRecord {
  const verificationToken = generateVerificationToken();
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
  // Server-generated primary key. roid_id mirrors it (the rest of the app reads
  // `roid_id || id`); client-supplied ids are ignored.
  const id = randomUUID();
  const nowIso = new Date().toISOString();
  const profile = {
    ...opts.fields,
    id,
    roid_id: id,
    email: opts.email,
    role: opts.role,
    password: hashPassword(opts.password),
    plan: opts.plan,
    isB2B: false,
    emailVerified: false,
    verificationToken,
    verificationExpires,
    // Initialize verification tracking fields
    emailVerificationStatus: 'pending',
    emailVerificationAttempts: 0,
    emailVerificationResendCount: 0,
    createdAt: nowIso,
    updatedAtUtc: nowIso,
  };
  return { id, profile, verificationToken, verificationExpires };
}

/** Never echo the password hash or the email-verification token. */
export function toPublicProfile(profile: Record<string, unknown>) {
  const publicProfile = { ...profile };
  delete publicProfile.password;
  delete publicProfile.verificationToken;
  return publicProfile;
}

export function isValidEmailShape(email: string): boolean {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email);
}

export function emailMatchesOrgDomain(email: string, domain?: string | null): boolean {
  if (!domain) return true;
  const normalizedDomain = domain.replace(/^@/, '').toLowerCase();
  return email.endsWith(`@${normalizedDomain}`);
}

/**
 * Is this email free to register? `lookup_failed` is returned instead of throwing so
 * each caller picks fail-open (single registration, historical behavior) or fail-closed (batch).
 */
export async function checkEmailAvailability(email: string): Promise<'available' | 'taken' | 'lookup_failed'> {
  try {
    return (await findProfileByEmail(email)) ? 'taken' : 'available';
  } catch (e) {
    console.warn('[registerProfile] email lookup failed', (e as any)?.message || e);
    return 'lookup_failed';
  }
}

// ==========================================
// Batch registration (enterprise CSV import)
// ==========================================

/** Hard cap per request. ≤ 49 rows is a single DynamoDB transaction (see createNewMembersWithLicenses). */
export const BATCH_MAX_ROWS = 200;

export const BATCH_REQUIRED_FIELDS = ['email', 'password', 'firstName', 'lastName', 'role', 'birthdate', 'gender', 'country'] as const;

export interface BatchRowError {
  index: number;
  email?: string;
  errors: string[];
}

export interface BatchCreatedMember extends CreatedMember {
  email: string;
  role: string;
  verificationToken: string;
  verificationExpires: string;
  profile: Record<string, unknown>;
}

export type BatchRegisterResult =
  | { ok: true; created: BatchCreatedMember[] }
  | { ok: false; status: number; code: string; message: string; rowErrors?: BatchRowError[]; leftBehind?: CreatedMember[] };

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Validate every row up front, then create all members with all-or-nothing semantics.
 * Nothing is written unless every row is valid, no email is already registered, and the
 * org has enough free seats for the whole batch.
 */
export async function registerMembersBatch(opts: {
  orgId: string;
  orgUnitId?: string | null;
  rows: unknown[];
  chunkSize?: number;
}): Promise<BatchRegisterResult> {
  const { orgId } = opts;
  const orgUnitId = opts.orgUnitId || null;
  const rows = opts.rows;

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, status: 400, code: 'batch_empty', message: 'rows required' };
  }
  if (rows.length > BATCH_MAX_ROWS) {
    return { ok: false, status: 400, code: 'batch_too_large', message: `at most ${BATCH_MAX_ROWS} rows per import` };
  }

  const org = await getOrganizationById(orgId);
  if (!org) return { ok: false, status: 400, code: 'org_invalid', message: '無效的組織' };
  if (org.status !== 'active' && org.status !== 'trial') {
    return { ok: false, status: 400, code: 'org_inactive', message: '此組織目前無法接受新成員註冊' };
  }
  if (orgUnitId) {
    const unit = await getOrgUnitById(orgUnitId);
    if (!unit || unit.orgId !== orgId || unit.status === 'archived') {
      return { ok: false, status: 400, code: 'org_unit_invalid', message: '無效的組織單位' };
    }
  }

  // ── Row validation (pure) ──
  const rowErrors: BatchRowError[] = [];
  const normalized: Array<{ email: string; password: string; role: string; fields: Record<string, string | boolean> }> = [];
  const seenEmails = new Map<string, number>();
  rows.forEach((raw, index) => {
    const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const errors: string[] = [];
    for (const field of BATCH_REQUIRED_FIELDS) {
      if (typeof row[field] !== 'string' || !(row[field] as string).trim()) errors.push(`missing_${field}`);
    }
    const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
    if (email) {
      if (!isValidEmailShape(email)) errors.push('email_invalid');
      else if (!emailMatchesOrgDomain(email, org.domain)) errors.push('email_domain_mismatch');
      const firstIndex = seenEmails.get(email);
      if (firstIndex !== undefined) errors.push('email_duplicate_in_batch');
      else seenEmails.set(email, index);
    }
    const role = typeof row.role === 'string' && row.role.trim() ? resolveSelfRegistrationRole(row.role.trim()) : null;
    if (typeof row.role === 'string' && row.role.trim() && !role) errors.push('role_invalid');
    if (typeof row.bio === 'string' && row.bio.length > 500) errors.push('bio_too_long');
    if (typeof row.password === 'string' && row.password.length > 200) errors.push('password_too_long');

    if (errors.length > 0) {
      rowErrors.push({ index, email: email || undefined, errors });
    } else {
      normalized.push({ email, password: row.password as string, role: role as string, fields: pickProfileFields({ ...row, termsAccepted: true }) });
    }
  });

  if (rows.length > org.maxSeats - org.usedSeats) {
    return {
      ok: false,
      status: 409,
      code: 'not_enough_seats',
      message: `組織席次不足：需要 ${rows.length}，剩餘 ${Math.max(0, org.maxSeats - org.usedSeats)}`,
      rowErrors: rowErrors.length ? rowErrors : undefined,
    };
  }

  // ── Existing accounts (fail closed: an unknown answer rejects the batch) ──
  if (rowErrors.length === 0) {
    const availability = await mapWithConcurrency(normalized, 8, (r) => checkEmailAvailability(r.email));
    availability.forEach((state, i) => {
      if (state === 'available') return;
      rowErrors.push({
        index: i, // normalized === rows when there were no row errors
        email: normalized[i].email,
        errors: [state === 'taken' ? 'email_already_registered' : 'email_lookup_failed'],
      });
    });
  }

  if (rowErrors.length > 0) {
    return { ok: false, status: 400, code: 'batch_validation_failed', message: 'batch validation failed', rowErrors };
  }

  // ── Build records (same builder as single registration; B2B members have no personal plan) ──
  const records = normalized.map((r) => ({
    input: r,
    record: buildNewProfileRecord({ email: r.email, password: r.password, role: r.role, plan: null, fields: r.fields }),
  }));

  const result = await createNewMembersWithLicenses({
    orgId,
    orgUnitId,
    profiles: records.map((r) => r.record.profile),
    assignedBy: 'csv-batch-registration',
    chunkSize: opts.chunkSize,
  });

  if (!result.ok) {
    const conflict = /席次|already|已存在|conflict/i.test(result.error);
    return {
      ok: false,
      status: result.rolledBack ? (conflict ? 409 : 500) : 500,
      code: result.rolledBack ? 'batch_rolled_back' : 'batch_partial',
      message: result.error,
      leftBehind: result.rolledBack ? undefined : result.leftBehind,
    };
  }

  const byProfileId = new Map(result.created.map((c) => [c.profileId, c]));
  return {
    ok: true,
    created: records.map(({ input, record }) => ({
      profileId: record.id,
      licenseId: byProfileId.get(record.id)?.licenseId as string,
      email: input.email,
      role: input.role,
      verificationToken: record.verificationToken,
      verificationExpires: record.verificationExpires,
      profile: record.profile,
    })),
  };
}
