import { test, expect } from '@playwright/test';
import { resolveEmailLinkBaseUrl } from '../lib/email/verificationService';

const PRODUCTION_BASE_URL = 'https://www.jvtutorcorner.com';

test.describe('Email Link Base URL Resolution', () => {

    let originalBaseUrl: string | undefined;
    let originalOverride: string | undefined;

    test.beforeEach(() => {
        originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
        originalOverride = process.env.EMAIL_LINK_BASE_URL;
        delete process.env.EMAIL_LINK_BASE_URL;
    });

    test.afterEach(() => {
        if (originalBaseUrl === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
        else process.env.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
        if (originalOverride === undefined) delete process.env.EMAIL_LINK_BASE_URL;
        else process.env.EMAIL_LINK_BASE_URL = originalOverride;
    });

    test('loopback addresses never reach an email link', () => {
        for (const loopback of [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'https://app.localhost',
        ]) {
            process.env.NEXT_PUBLIC_BASE_URL = loopback;
            expect(resolveEmailLinkBaseUrl()).toBe(PRODUCTION_BASE_URL);
        }
    });

    test('a real configured host is used as-is', () => {
        process.env.NEXT_PUBLIC_BASE_URL = 'https://www.jvtutorcorner.com';
        expect(resolveEmailLinkBaseUrl()).toBe('https://www.jvtutorcorner.com');

        process.env.NEXT_PUBLIC_BASE_URL = 'https://staging.jvtutorcorner.com/';
        expect(resolveEmailLinkBaseUrl()).toBe('https://staging.jvtutorcorner.com');
    });

    test('missing configuration falls back to production', () => {
        delete process.env.NEXT_PUBLIC_BASE_URL;
        expect(resolveEmailLinkBaseUrl()).toBe(PRODUCTION_BASE_URL);
    });

    test('EMAIL_LINK_BASE_URL overrides everything, including with a loopback host', () => {
        process.env.NEXT_PUBLIC_BASE_URL = 'https://www.jvtutorcorner.com';
        process.env.EMAIL_LINK_BASE_URL = 'http://localhost:3000/';
        expect(resolveEmailLinkBaseUrl()).toBe('http://localhost:3000');
    });
});
