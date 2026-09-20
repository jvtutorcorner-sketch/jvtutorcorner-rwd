import { test, expect, request as playwrightRequest } from '@playwright/test';

/**
 * /apps integrations API — 授權與資訊外洩防護
 *
 * 驗證重構後的整合 API：
 * 1. 未登入呼叫（無 session、無 e2e bypass）→ 新舊端點皆 401。
 * 2. 只允許的方法通過（POST-only 端點的 GET → 405）。
 * 3. 公開的 payment-methods 端點回 200，且回應不含 config / secret / key 等敏感欄位。
 *
 * 這支測試不需要任何帳號或 bypass secret —— 它刻意以「匿名」身分呼叫。
 */

const BASE_URL = process.env.QA_TEST_BASE_URL || 'http://localhost:3000';

test.describe('integrations API 授權防護', () => {
    test('未登入的寫入與讀取一律被拒 (401)', async () => {
        // 全新 context：不帶任何 cookie / storageState
        const api = await playwrightRequest.newContext({ baseURL: BASE_URL });

        const unauthorized = [
            { method: 'get', url: '/api/integrations' },
            { method: 'post', url: '/api/integrations', data: { type: 'TELEGRAM', config: { botToken: 'x' } } },
            { method: 'get', url: '/api/integrations/some-id' },
            { method: 'put', url: '/api/integrations/some-id', data: { name: 'x' } },
            { method: 'delete', url: '/api/integrations/some-id' },
            { method: 'patch', url: '/api/integrations/some-id/status', data: { status: 'INACTIVE' } },
            { method: 'post', url: '/api/integrations/some-id/default' },
            { method: 'post', url: '/api/integrations/test', data: { type: 'TELEGRAM', config: { botToken: 'x' } } },
            { method: 'get', url: '/api/admin/ai-skills' },
            { method: 'get', url: '/api/admin/platform-agents' },
            { method: 'get', url: '/api/admin/integrations/catalog' },
            // 舊相容 shim 也必須受保護
            { method: 'get', url: '/api/app-integrations' },
            { method: 'post', url: '/api/app-integrations', data: { type: 'TELEGRAM', config: {} } },
        ];

        for (const r of unauthorized) {
            const res = await (api as any)[r.method](r.url, r.data ? { data: r.data } : undefined);
            expect(res.status(), `${r.method.toUpperCase()} ${r.url} 應為 401`).toBe(401);
        }
        await api.dispose();
    });

    test('POST-only 端點的 GET 回 405', async () => {
        const api = await playwrightRequest.newContext({ baseURL: BASE_URL });
        for (const url of ['/api/integrations/test', '/api/integrations/some-id/test']) {
            const res = await api.get(url);
            expect(res.status(), `GET ${url} 應為 405`).toBe(405);
        }
        await api.dispose();
    });

    test('公開 payment-methods 端點只回類型、不外洩機密', async () => {
        const api = await playwrightRequest.newContext({ baseURL: BASE_URL });
        const res = await api.get('/api/integrations/public/payment-methods');
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(Array.isArray(body.types)).toBe(true);
        const raw = JSON.stringify(body).toLowerCase();
        expect(raw).not.toContain('config');
        expect(raw).not.toContain('secret');
        expect(raw).not.toContain('apikey');
        expect(raw).not.toContain('"name"');
        await api.dispose();
    });
});
