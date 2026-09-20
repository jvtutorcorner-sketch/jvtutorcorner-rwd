// lib/integrations/clientApi.ts
//
// 前端呼叫整合 API 的統一入口。集中處理 401（session 過期）→ 導向登入頁，
// 讓各元件不必各自處理。同源請求會自動帶上 HttpOnly session cookie。

export interface ApiError extends Error {
    status: number;
    body?: any;
}

function redirectToLogin() {
    if (typeof window !== 'undefined') {
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?returnTo=${returnTo}`;
    }
}

async function request<T = any>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
        credentials: 'same-origin',
    });
    if (res.status === 401) {
        redirectToLogin();
        const err = new Error('登入已過期，請重新登入') as ApiError;
        err.status = 401;
        throw err;
    }
    let body: any = null;
    try { body = await res.json(); } catch { /* no body */ }
    if (!res.ok || (body && body.ok === false)) {
        const err = new Error(body?.error || `請求失敗 (${res.status})`) as ApiError;
        err.status = res.status;
        err.body = body;
        throw err;
    }
    return body as T;
}

// ── 目錄 ──────────────────────────────────────────
export interface CatalogProvider {
    type: string;
    category: string;
    defaults: { label: string; desc: string; icon: string; badge: string; sortOrder: number; visible: boolean };
    fields: any[];
    hint?: string;
    capabilities: { testConnection?: boolean; multiInstance?: boolean; customScript?: boolean; toolPanels?: string[] };
    hasWebhook?: boolean;
    deprecated?: boolean;
}
export interface CatalogCategory { id: string; label: string; sortOrder: number }

export async function fetchCatalog(): Promise<{ categories: CatalogCategory[]; providers: CatalogProvider[] }> {
    const data = await request('/api/integrations/catalog');
    return { categories: data.categories || [], providers: data.providers || [] };
}

// ── 連線 ──────────────────────────────────────────
export interface ConnectionView {
    integrationId: string;
    type: string;
    category?: string;
    name: string;
    status: 'ACTIVE' | 'INACTIVE';
    isDefault?: boolean;
    config?: Record<string, any>;
    secretsSet?: string[];
    customScript?: string;
    scriptEnabled?: boolean;
    lastTestedAt?: string;
    lastTestStatus?: 'OK' | 'FAIL';
    lastTestMessage?: string;
    createdAt?: string;
    updatedAt?: string;
}

export async function listConnections(params: { type?: string; category?: string } = {}): Promise<ConnectionView[]> {
    const qs = new URLSearchParams();
    if (params.type) qs.set('type', params.type);
    if (params.category) qs.set('category', params.category);
    const data = await request(`/api/integrations${qs.toString() ? `?${qs}` : ''}`);
    return data.data || [];
}

export async function getConnection(id: string): Promise<ConnectionView> {
    const data = await request(`/api/integrations/${id}`);
    return data.integration;
}

export async function createConnection(input: { type: string; name?: string; config: Record<string, any>; status?: string; customScript?: string; scriptEnabled?: boolean }): Promise<ConnectionView> {
    const data = await request('/api/integrations', { method: 'POST', body: JSON.stringify(input) });
    return data.integration;
}

export async function updateConnection(id: string, patch: { name?: string; config?: Record<string, any>; status?: string; customScript?: string | null; scriptEnabled?: boolean }): Promise<ConnectionView> {
    const data = await request(`/api/integrations/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
    return data.integration;
}

export async function deleteConnection(id: string): Promise<void> {
    await request(`/api/integrations/${id}`, { method: 'DELETE' });
}

export async function setConnectionStatus(id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<ConnectionView> {
    const data = await request(`/api/integrations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    return data.integration;
}

export async function setConnectionDefault(id: string): Promise<ConnectionView> {
    const data = await request(`/api/integrations/${id}/default`, { method: 'POST' });
    return data.integration;
}

export interface TestResult { success: boolean; message: string; details?: any }

/** 測試已儲存的連線（可帶未儲存的 configOverrides） */
export async function testConnection(id: string, opts: { configOverrides?: Record<string, any>; prompt?: string; emailTest?: any; testParams?: any } = {}): Promise<TestResult> {
    const data = await request(`/api/integrations/${id}/test`, { method: 'POST', body: JSON.stringify(opts) });
    return data.result;
}

/** 建立前測試（尚未儲存） */
export async function testNewConnection(type: string, config: Record<string, any>, opts: { prompt?: string; emailTest?: any; testParams?: any } = {}): Promise<TestResult> {
    const data = await request('/api/integrations/test', { method: 'POST', body: JSON.stringify({ type, config, ...opts }) });
    return data.result;
}
