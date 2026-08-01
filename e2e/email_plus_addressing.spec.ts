import { test, expect } from '@playwright/test';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../lib/dynamo';
import { getBaseEmail, isEmailWhitelisted } from '../lib/email/whitelist';

test.describe('Email Plus-Addressing / Sub-Addressing Support Tests', () => {
    
    test('getBaseEmail extracts base email correctly', () => {
        expect(getBaseEmail('myname+1@gmail.com')).toBe('myname@gmail.com');
        expect(getBaseEmail('myname+test+abc@gmail.com')).toBe('myname@gmail.com');
        expect(getBaseEmail('myname@gmail.com')).toBe('myname@gmail.com');
        expect(getBaseEmail('  myname+2@gmail.com  ')).toBe('myname@gmail.com');
        expect(getBaseEmail('invalid-email')).toBe('invalid-email');
        expect(getBaseEmail('')).toBe('');
    });

    test('isEmailWhitelisted matches sub-addressed email against whitelisted base address', async () => {
        const originalWhitelist = process.env.EMAIL_WHITELIST;
        try {
            // Set static whitelist with a base address and a domain
            process.env.EMAIL_WHITELIST = 'allowed@example.com,allowed+explicit@example.com,@jvtutorcorner.com';

            // 1. Check exact match
            expect(await isEmailWhitelisted('allowed@example.com')).toBe(true);

            // 2. Check sub-addressed matches base
            expect(await isEmailWhitelisted('allowed+1@example.com')).toBe(true);
            expect(await isEmailWhitelisted('allowed+suffix@example.com')).toBe(true);

            // 3. Check explicit whitelisted sub-address
            expect(await isEmailWhitelisted('allowed+explicit@example.com')).toBe(true);

            // 4. Check domain match with sub-addressed email
            expect(await isEmailWhitelisted('user+1@jvtutorcorner.com')).toBe(true);
            expect(await isEmailWhitelisted('another+test@jvtutorcorner.com')).toBe(true);

            // 5. Check blocked email
            expect(await isEmailWhitelisted('blocked@example.com')).toBe(false);
            expect(await isEmailWhitelisted('blocked+1@example.com')).toBe(false);

        } finally {
            process.env.EMAIL_WHITELIST = originalWhitelist;
        }
    });

    test('isEmailWhitelisted falls back to the registered-user lookup for addresses outside the static whitelist', async () => {
        // Profiles are keyed by roid_id (a UUID), so this path must resolve the
        // address through the EmailIndex GSI rather than a primary-key get.
        const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';
        const { Items } = await ddbDocClient.send(new ScanCommand({
            TableName: PROFILES_TABLE,
            ProjectionExpression: 'email',
            FilterExpression: 'attribute_exists(email)',
            Limit: 25,
        }));

        // Pick a plain address (no "+" tag) so the sub-addressed variant below
        // is guaranteed to resolve back to this same profile.
        const registeredEmail = Items
            ?.map(item => String(item.email || '').toLowerCase())
            .find(email => email.includes('@') && !email.includes('+'));
        test.skip(!registeredEmail, 'No plain-addressed profile available in the target table');

        const originalWhitelist = process.env.EMAIL_WHITELIST;
        try {
            // A static whitelist that deliberately excludes the registered address
            process.env.EMAIL_WHITELIST = 'nobody@example.com';

            expect(await isEmailWhitelisted(registeredEmail!)).toBe(true);
            // A sub-addressed variant resolves via its base address
            expect(await isEmailWhitelisted(registeredEmail!.replace('@', '+e2e@'))).toBe(true);
            // An unregistered address stays blocked
            expect(await isEmailWhitelisted('definitely-not-registered@example.org')).toBe(false);
        } finally {
            process.env.EMAIL_WHITELIST = originalWhitelist;
        }
    });
});
