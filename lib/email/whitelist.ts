import { ddbDocClient } from '@/lib/dynamo';
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Email Whitelist Utility
 * 
 * This utility provides a mechanism to restrict outbound emails to a specific 
 * set of allowed recipients or domains. This is particularly useful in 
 * development, testing, or high-security environments.
 * 
 * It now also supports dynamic whitelisting via email verification status in the database.
 */

/**
 * Helper to get the base email by removing the sub-addressing suffix (e.g., "+1", "+2", etc.)
 * e.g., "myname+1@gmail.com" -> "myname@gmail.com"
 */
export function getBaseEmail(email: string): string {
    const trimmed = email.trim();
    const parts = trimmed.split('@');
    if (parts.length !== 2) return trimmed;
    const [local, domain] = parts;
    const baseLocal = local.split('+')[0];
    return `${baseLocal}@${domain}`;
}

/**
 * Checks whether an email belongs to a registered profile.
 *
 * Profiles are keyed by `roid_id` (a UUID), not by email, so the lookup goes
 * through the EmailIndex GSI. Falls back to a scan when the GSI is unavailable
 * (e.g. a local table created before the index was added).
 */
async function isRegisteredEmail(email: string): Promise<boolean> {
    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';

    try {
        const res: any = await ddbDocClient.send(new QueryCommand({
            TableName: PROFILES_TABLE,
            IndexName: 'EmailIndex',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': email },
            Limit: 1,
        }));
        return (res?.Count ?? 0) > 0;
    } catch (err) {
        console.warn('[Whitelist] EmailIndex query failed, trying scan fallback...', (err as any)?.message || err);
        try {
            // No Limit here: in a Scan it caps items *evaluated* before the
            // filter is applied, so it would truncate away real matches.
            const res: any = await ddbDocClient.send(new ScanCommand({
                TableName: PROFILES_TABLE,
                FilterExpression: 'email = :email',
                ExpressionAttributeValues: { ':email': email },
            }));
            return (res?.Count ?? 0) > 0;
        } catch (scanErr) {
            console.error('[Whitelist] Profile scan fallback failed:', (scanErr as any)?.message || scanErr);
            return false;
        }
    }
}

export async function isEmailWhitelisted(email: string): Promise<boolean> {
    const whitelist = process.env.EMAIL_WHITELIST;
    const rawNormalized = email.trim().toLowerCase();
    const baseEmail = getBaseEmail(rawNormalized);

    // 1. Check static whitelist environment variable
    if (whitelist && whitelist !== '*') {
        const domain = baseEmail.split('@')[1];
        const allowedEntries = whitelist.split(',').map(entry => entry.trim().toLowerCase());

        for (const entry of allowedEntries) {
            const entryBase = getBaseEmail(entry);
            // Check if base email matches, or if raw matches
            if (entry === rawNormalized || entryBase === baseEmail) return true;

            // Domain match (e.g., "@jvtutorcorner.com" or "jvtutorcorner.com")
            if (entry.startsWith('@')) {
                if (entry === `@${domain}`) return true;
            } else if (entry === domain) {
                return true;
            }
        }
    } else if (!whitelist || whitelist === '*') {
        // If whitelist is not set or wildcard, allow all by default
        return true;
    }

    // 2. Check dynamic whitelist (Registered Users)
    // If the email is not in the static whitelist, check if the user exists in the system database.
    // This allows sending to any registered user regardless of their domain.
    try {
        // First check actual registered email (with + suffix if any)
        if (await isRegisteredEmail(rawNormalized)) {
            return true;
        }

        // If not found, also check base email
        if (baseEmail !== rawNormalized && await isRegisteredEmail(baseEmail)) {
            return true;
        }
    } catch (err) {
        console.error('[Whitelist] Database registration check failed:', err);
    }

    return false;
}

/**
 * Validates multiple emails and returns only whitelisted ones
 */
export async function filterWhitelistedEmails(emails: string[]): Promise<string[]> {
    const results = await Promise.all(emails.map(email => isEmailWhitelisted(email)));
    return emails.filter((_, index) => results[index]);
}
