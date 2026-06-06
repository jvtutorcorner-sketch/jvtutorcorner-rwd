import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const ENROLLMENTS_TABLE = process.env.ENROLLMENTS_TABLE || 'jvtutorcorner-enrollments';
// Future B2B Tables
// const ORGANIZATION_LICENSES_TABLE = ...
// const USER_SEATS_TABLE = ...

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
        // optimizing with query if GSI exists, currently using Scan for safety based on loose schema knowledge
        // TODO: Switch to QueryCommand if GSI byStudent exists and is reliable
        const params = {
            TableName: ENROLLMENTS_TABLE,
            FilterExpression: 'studentID = :uid AND courseID = :cid AND #status IN (:s1, :s2)',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':uid': cleanUserId,
                ':cid': courseId,
                ':s1': 'PAID',
                ':s2': 'ACTIVE'
            }
        };

        const result = await ddbDocClient.send(new ScanCommand(params));

        if (result.Items && result.Items.length > 0) {
            return { granted: true, source: 'B2C' };
        }

        // 2. (Future) Check B2B Seats
        // const seat = await checkUserSeat(userId, courseId);
        // if (seat) return { granted: true, source: 'B2B_SEAT' };

        return { granted: false, reason: 'No active enrollment found' };

    } catch (error: any) {
        console.error('[verifyCourseAccess] Error checking access:', error);
        // Fail closed
        return { granted: false, reason: `Internal error: ${error.message}` };
    }
}
