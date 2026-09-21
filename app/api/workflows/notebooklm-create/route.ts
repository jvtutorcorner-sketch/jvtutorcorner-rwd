import { NextResponse } from 'next/server';
import { withAdminOrHmac, type AuthedRequest } from '@/lib/auth/apiGuard';

export const runtime = 'nodejs';

/**
 * NotebookLM 文檔建立 API — 目前仍是 TODO/mock stub，尚未串接真正的 NotebookLM API。
 * 先前完全沒有 auth；即使現在只回傳假資料，仍鎖 admin/HMAC 以免之後補上真正實作時忘記加。
 */
export const POST = withAdminOrHmac('/api/workflows/notebooklm-create', async (req: AuthedRequest) => {
    try {
        const { title, content } = await req.json();

        if (!title) {
            return NextResponse.json({ ok: false, error: 'Title is required' }, { status: 400 });
        }

        if (!content) {
            return NextResponse.json({ ok: false, error: 'Content is required' }, { status: 400 });
        }

        // TODO: 實現 NotebookLM API 調用
        // 需要配置 NotebookLM API 金鑰和認證
        // 暫時返回模擬結果
        const result = {
            title,
            contentLength: content.length,
            documentId: `doc-${Date.now()}`,
            url: `https://notebooklm.example.com/docs/doc-${Date.now()}`,
            timestamp: new Date().toISOString(),
            status: 'created',
        };

        console.log('[notebooklm-create] Document created:', title);

        return NextResponse.json({
            ok: true,
            data: result,
        });
    } catch (error: any) {
        console.error('[notebooklm-create] error:', error);
        return NextResponse.json({
            ok: false,
            error: error?.message || 'NotebookLM document creation failed',
        }, { status: 500 });
    }
});
