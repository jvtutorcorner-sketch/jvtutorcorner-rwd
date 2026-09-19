import { listLicensesByUser, toEpochSeconds } from '@/lib/licenseService';
import { getOrganizationById } from '@/lib/organizationService';
import {
    ACTIVE_ENROLLMENT_STATUSES,
    listEnrollmentsByUser,
    type EnrollmentRecord,
} from '@/lib/enrollmentService';
import { getProfileById } from '@/lib/profilesService';
import type { License, Organization } from '@/lib/types/b2b';

export interface AccessResult {
    granted: boolean;
    reason?: string;
    source?: 'B2C' | 'B2B_SEAT' | 'ADMIN_OVERRIDE';
}

// The client appends a per-tab suffix only to CURSOR identities built from an
// email or a bare role (see ClientClassroom.tsx: `${email}_${tabId}` and
// `${role}_${tabId}`, tabId = 8 chars of [a-z0-9]). Those are the only two
// shapes stripTabId must undo.
const ROLE_CURSOR_PREFIXES = new Set(['teacher', 'student', 'assistant', 'observer']);

/**
 * Strips the tabId suffix appended by the client for cursor uniqueness.
 * e.g. "email@domain.com_abc123" -> "email@domain.com"
 *      "teacher_abc123"          -> "teacher"
 *
 * IMPORTANT: canonical account ids contain underscores that are NOT tab
 * separators (e.g. "u_1776606536043"). Stripping at the last underscore
 * unconditionally truncated those to "u", so verifyCourseAccess looked up the
 * wrong userId on the byUserId GSI and denied genuinely enrolled students with
 * "No active enrollment found" (403 on /api/agora/token, /api/agora/session and
 * /api/whiteboard/room). We therefore only strip a suffix when the remaining
 * base is an email or a bare role — the only ids the client actually tab-suffixes.
 */
export function stripTabId(userId: string): string {
    const lastUnderscore = userId.lastIndexOf('_');
    if (lastUnderscore <= 0) return userId;

    const base = userId.substring(0, lastUnderscore);

    // "email@domain.com_abc123" -> strip only if the base still looks like an email.
    if (base.includes('@')) {
        return base;
    }

    // "teacher_abc123" / "student_abc123" -> bare-role cursor id.
    if (ROLE_CURSOR_PREFIXES.has(base)) {
        return base;
    }

    // Anything else (canonical ids like "u_1776606536043", slugs like
    // "teacher-demo2") has no client tab suffix — leave it untouched.
    return userId;
}

/**
 * An access-granting enrollment the user PAID for (or was granted by an admin).
 *
 * Rows with sourceType 'B2B_SEAT' are deliberately ignored: app/api/enroll/seat
 * writes them so a seat student's class shows up in /student_courses, but the
 * access decision for a seat belongs to the license. If such a row granted access
 * here on its own, revoking or expiring the license (or removing the member from
 * the org) would leave the row granting access forever. Seat rows therefore fall
 * through to findValidSeatLicense.
 */
export async function findPurchasedEnrollment(
    userId: string,
    courseId: string
): Promise<EnrollmentRecord | null> {
    if (!userId || !courseId) return null;

    const rows = await listEnrollmentsByUser(userId, {
        statuses: ACTIVE_ENROLLMENT_STATUSES,
    });

    return rows.find((r) => r.courseId === courseId && r.sourceType !== 'B2B_SEAT') || null;
}

export interface ValidSeat {
    license: License;
    profile: any;
    org: Organization;
}

/**
 * The seat (license) that currently entitles this user to this course, or null.
 *
 * A seat is valid when ALL of these hold:
 *   - license.status === 'active'
 *   - license.courseId is empty (org-wide seat) or equals courseId
 *   - expiresAt is absent, or parses to a time in the future
 *   - license.orgId is the org the user is CURRENTLY a member of (profile.orgId)
 *   - that organisation's status is 'active' or 'trial'
 *
 * This is the single definition of "valid seat" — verifyCourseAccess, the seat
 * enrollment route and the LiveKit join authorisation all go through it.
 * Infrastructure errors propagate; callers decide whether to fail closed.
 */
export async function findValidSeatLicense(userId: string, courseId: string): Promise<ValidSeat | null> {
    if (!userId || !courseId) return null;

    // A license with no courseId is an org-wide seat (grants any course); one with
    // courseId set is scoped to that specific course.
    const licenses = await listLicensesByUser(userId);
    const now = Math.floor(Date.now() / 1000);
    const candidates = licenses.filter((lic) => {
        if (lic.status !== 'active') return false;
        if (lic.courseId && lic.courseId !== courseId) return false;
        if (lic.expiresAt === undefined || lic.expiresAt === null) return true;
        // Rows written by the old PATCH path stored an ISO string here; a raw
        // `string > number` comparison is always false and silently expired them.
        // An unparseable value fails closed.
        let expiry: number | null = null;
        try { expiry = toEpochSeconds(lic.expiresAt as any); } catch { expiry = null; }
        return expiry !== null && expiry > now;
    });

    if (candidates.length === 0) return null;

    // The license must belong to the org the user is currently a member of.
    // A license left active after its holder was removed (drift from before
    // removeMemberFromOrg revoked every license) must not keep granting access.
    const profile: any = await getProfileById(userId);
    const memberOrgId = profile?.orgId || null;
    if (!memberOrgId) return null;

    for (const lic of candidates) {
        if (lic.orgId !== memberOrgId) continue;
        const org = await getOrganizationById(lic.orgId);
        if (org && (org.status === 'active' || org.status === 'trial')) {
            return { license: lic, profile, org };
        }
    }
    return null;
}

/**
 * Verified if a user has access to a specific course.
 * B2C: an active purchased enrollment. B2B: a valid seat license.
 */
export async function verifyCourseAccess(userId: string, courseId: string): Promise<AccessResult> {
    if (!userId || !courseId) {
        return { granted: false, reason: 'Missing userId or courseId' };
    }

    const cleanUserId = stripTabId(userId);

    try {
        // 1. Check B2C Enrollments (Direct Purchase)
        //
        // This was a full-table ScanCommand with a FilterExpression. Beyond reading
        // every tenant's rows to answer one user's question, a filtered Scan is not
        // a reliable membership test: DynamoDB applies any page limit to items
        // SCANNED, not items matched, and a Scan that exhausts its budget returns a
        // partial page plus LastEvaluatedKey rather than an error. The single-page
        // call below it therefore answered "no enrollment" for a genuinely enrolled
        // student once the table grew past one scan page — a paid student locked
        // out of their own course, non-deterministically.
        //
        // findPurchasedEnrollment Queries the byUserId GSI and pages to exhaustion.
        //
        // Seat-created enrollment rows (sourceType 'B2B_SEAT', written by
        // app/api/enroll/seat) are skipped there and must NOT grant access on their
        // own — revoking the license has to remove access. They fall through to the
        // license check below.
        const enrollment = await findPurchasedEnrollment(cleanUserId, courseId);

        if (enrollment) {
            return { granted: true, source: 'B2C' };
        }

        // 2. Check B2B Seats (license-based access)
        const seat = await findValidSeatLicense(cleanUserId, courseId);
        if (seat) {
            return { granted: true, source: 'B2B_SEAT' };
        }

        return { granted: false, reason: 'No active enrollment found' };

    } catch (error: any) {
        console.error('[verifyCourseAccess] Error checking access:', error);
        // Fail closed
        return { granted: false, reason: `Internal error: ${error.message}` };
    }
}
