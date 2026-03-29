import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    try {
        const { url, method = 'GET', headers: customHeaders = {}, body } = await req.json();

        if (!url) {
            return NextResponse.json({ ok: false, error: 'URL is required' }, { status: 400 });
        }

        // Basic URL validation - must be http/https
        if (!/^https?:\/\//.test(url)) {
            return NextResponse.json({ ok: false, error: 'URL must start with http:// or https://' }, { status: 400 });
        }

        const startTime = Date.now();

        const fetchOptions: RequestInit = {
            method: method.toUpperCase(),
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'JVTutorCorner-Workflow/1.0',
                ...customHeaders,
            },
            signal: AbortSignal.timeout(15000), // 15s timeout
        };

        if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
            fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);
        const elapsed = Date.now() - startTime;

        let data: any;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        return NextResponse.json({
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            elapsed,
            data,
            headers: Object.fromEntries(response.headers.entries()),
        });
    } catch (error: any) {
        return NextResponse.json({
            ok: false,
            error: error?.message || 'Request failed',
            code: error?.code,
        }, { status: 500 });
    }
}
