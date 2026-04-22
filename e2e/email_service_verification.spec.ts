import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const CRON_SECRET = process.env.CRON_SECRET || 'test-secret';
const TEST_RECIPIENT = process.env.NEXT_PUBLIC_TEST_EMAIL || 'admin@jvtutorcorner.com';
const BLOCKED_RECIPIENT = 'blocked-user@unknown-domain.com';

/**
 * Email Service Verification Suite
 * 
 * This suite verifies the core email delivery infrastructure, including:
 * 1. Provider Connectivity (Gmail SMTP & Resend)
 * 2. Security (Whitelist & Purpose Bypass)
 * 3. Configuration Resolution (Env vs DynamoDB)
 */
test.describe('Email Service Integration', () => {

  test.describe('Gmail SMTP Provider', () => {

    test('should successfully send an email to a whitelisted recipient', async ({ request }) => {
      const response = await request.post('/api/workflows/gmail-send', {
        data: {
          to: TEST_RECIPIENT,
          subject: '[Playwright Test] Gmail SMTP Success',
          body: 'This is a test email from Playwright to verify Gmail SMTP functionality.',
          purpose: 'test'
        }
      });

      const body = await response.json();
      
      // If credentials are not configured, we expect 503
      if (response.status() === 503) {
        console.warn('Skipping test assertion as Gmail credentials are not configured in environment.');
        return;
      }

      expect(response.status()).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.messageId).toBeDefined();
    });

    test('should block sending to a non-whitelisted recipient', async ({ request }) => {
      const response = await request.post('/api/workflows/gmail-send', {
        data: {
          to: BLOCKED_RECIPIENT,
          subject: '[Playwright Test] Should be blocked',
          body: 'This should not be delivered.',
          purpose: 'test'
        }
      });

      const body = await response.json();
      expect(response.status()).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.code).toBe('WHITELIST_BLOCKED');
    });

    test('should allow bypass via "verification" purpose even if not in whitelist', async ({ request }) => {
      // Note: In a real scenario, this might still be blocked if the provider checks the domain,
      // but the API logic should allow it past the whitelist check.
      const response = await request.post('/api/workflows/gmail-send', {
        data: {
          to: 'new-user-test@random.com',
          subject: '[Playwright Test] Verification Bypass',
          body: 'Your verification code is 123456',
          purpose: 'verification'
        }
      });

      const body = await response.json();
      
      if (response.status() === 503) return; // Skip if no creds

      // We expect it to TRY sending (200 or 500 if SMTP fails, but NOT 403)
      expect(response.status()).not.toBe(403);
    });

    test('should return 400 for invalid email format', async ({ request }) => {
      const response = await request.post('/api/workflows/gmail-send', {
        data: {
          to: 'invalid-email',
          subject: 'Test',
          body: 'Test'
        }
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe('Resend Provider', () => {

    test('should successfully send an email via Resend SMTP', async ({ request }) => {
      const response = await request.post('/api/workflows/resend-send', {
        data: {
          to: TEST_RECIPIENT,
          subject: '[Playwright Test] Resend SMTP Success',
          body: 'This is a test email from Playwright to verify Resend SMTP functionality.',
          purpose: 'test'
        }
      });

      const body = await response.json();
      
      if (response.status() === 503) {
        console.warn('Skipping test assertion as Resend credentials are not configured.');
        return;
      }

      expect(response.status()).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.messageId).toBeDefined();
    });

    test('should block non-whitelisted recipients on Resend', async ({ request }) => {
      const response = await request.post('/api/workflows/resend-send', {
        data: {
          to: BLOCKED_RECIPIENT,
          subject: '[Playwright Test] Resend Blocked',
          body: 'Blocked',
          purpose: 'test'
        }
      });

      const body = await response.json();
      expect(response.status()).toBe(403);
      expect(body.ok).toBe(false);
    });
  });

  test.describe('Configuration Resolution', () => {
    // This tests if the system correctly identifies missing credentials
    test('should return 503 when credentials are missing or invalid (Simulation)', async ({ request }) => {
        // We can't easily mock env vars in Playwright request tests without a dedicated mock endpoint,
        // but we can verify the error message structure.
        const response = await request.post('/api/workflows/gmail-send', {
            data: {
                to: TEST_RECIPIENT,
                subject: 'Ping',
                body: 'Ping'
            }
        });
        
        const body = await response.json();
        if (response.status() === 503) {
            expect(body.error).toContain('not configured');
        } else {
            expect(body.ok).toBe(true);
        }
    });
  });

});
