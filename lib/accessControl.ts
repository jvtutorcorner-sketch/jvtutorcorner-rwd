import { listLicensesByUser, toEpochSeconds } from '@/lib/licenseService';
import { getOrganizationById } from '@/lib/organizationService';
import { findActiveEnrollment } from '@/lib/enrollmentService';
import { getProfileById } from '@/lib/profilesService';

export interface AccessResult {
    granted: boolean;
    reason?: string;
    source?: 'B2C' | 'B2B_SEAT' | 'ADMIN_OVERRIDE';
}

/**
 * Strips the tabId suffix appended by the client for cursor uniqueness.
 * e.g. "email@domain.com_abc123" -> "email@domain.com"
 *      "teacher_abc123" -> "teacher"
 */
export function stripTabId(userId: string): string {
    const atIndex = userId.indexOf('@');
    if (atIndex !== -1) {
        const afterAt = userId.substring(atIndex);
        const lastUnderscore = afterAt.lastIndexOf('_');
        if (lastUnderscore !== -1) {
            return userId.substring(0, atIndex + lastUnderscore);
        }
    } else {
        const lastUnderscore = userId.lastIndexOf('_');
        if (lastUnderscore !== -1) {
            return userId.substring(0, lastUnderscore);
        }
    }
    return userId;
}

/**
 * Verified if a user has access to a specific course.
 * Currently checks for active B2C enrollments.
 * Future-proofed for B2B logic.
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
        // findActiveEnrollment Queries the byUserId GSI and pages to exhaustion.
        //
        // NOTE for whoever adds seat-based enrollment rows: an enrollment created from
        // a license must NOT grant access here on its own, or revoking the license
        // would leave the row granting access forever. Today no code writes such rows
        // (app/api/enroll only records purchases), so every active row is a purchase.
        const enrollment = await findActiveEnrollment(cleanUserId, courseId);

        if (enrollment) {
            return { granted: true, source: 'B2C' };
        }

        // 2. Check B2B Seats (license-based access)
        // A license with no courseId is an org-wide seat (grants any course); one with
        // courseId set is scoped to that specific course.
        const licenses = await listLicensesByUser(cleanUserId);
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

        if (candidates.length > 0) {
            // The license must belong to the org the user is currently a member of.
            // A license left active after its holder was removed (drift from before
            // removeMemberFromOrg revoked every license) must not keep granting access.
            const profile: any = await getProfileById(cleanUserId);
            const memberOrgId = profile?.orgId || null;
            for (const lic of candidates) {
                if (!memberOrgId || lic.orgId !== memberOrgId) continue;
                const org = await getOrganizationById(lic.orgId);
                if (org && (org.status === 'active' || org.status === 'trial')) {
                    return { granted: true, source: 'B2B_SEAT' };
                }
            }
        }

        return { granted: false, reason: 'No active enrollment found' };

    } catch (error: any) {
        console.error('[verifyCourseAccess] Error checking access:', error);
        // Fail closed
        return { granted: false, reason: `Internal error: ${error.message}` };
    }
}
