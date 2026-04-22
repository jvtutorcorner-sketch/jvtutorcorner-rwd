import { ddbDocClient } from '@/lib/dynamo';

/**
 * Email Whitelist Utility
 * 
 * This utility provides a mechanism to restrict outbound emails to a specific 
 * set of allowed recipients or domains. This is particularly useful in 
 * development, testing, or high-security environments.
 * 
 * It now also supports dynamic whitelisting via email verification status in the database.
 */

export async function isEmailWhitelisted(email: string): Promise<boolean> {
    const whitelist = process.env.EMAIL_WHITELIST;
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Check static whitelist environment variable
    if (whitelist && whitelist !== '*') {
        const domain = normalizedEmail.split('@')[1];
        const allowedEntries = whitelist.split(',').map(entry => entry.trim().toLowerCase());

        for (const entry of allowedEntries) {
            // Exact match
            if (entry === normalizedEmail) return true;

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
        const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
        const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';
        
        const res = await ddbDocClient.send(new GetCommand({
            TableName: PROFILES_TABLE,
            Key: { id: normalizedEmail } // In this system, id is equal to email
        }));

        if (res.Item) {
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
