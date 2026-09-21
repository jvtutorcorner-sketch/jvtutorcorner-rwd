import { NextResponse } from 'next/server';
import { withAdminOrHmac, type AuthedRequest } from '@/lib/auth/apiGuard';

export const runtime = 'nodejs';

/**
 * Context7 文檔檢索 API
 * 用於從 Context7 MCP 服務中查詢特定庫的文檔
 * 只有 workflow 引擎（HMAC 簽名）或 admin session 能呼叫 —— 先前完全沒有 auth。
 */
export const POST = withAdminOrHmac('/api/workflows/context7-retrieve', async (req: AuthedRequest) => {
    try {
        const { query, libraryId } = await req.json();

        if (!query) {
            return NextResponse.json({ ok: false, error: 'Query is required' }, { status: 400 });
        }

        if (!libraryId) {
            return NextResponse.json({ ok: false, error: 'Library ID is required' }, { status: 400 });
        }

        // TODO: 實現 Context7 MCP 調用
        // 這裡應該調用 Context7 相關的 MCP 端點或 API
        // 暫時返回模擬結果
        const result = {
            query,
            libraryId,
            results: [
                {
                    title: 'Sample Documentation',
                    content: `Found ${query} in ${libraryId}`,
                    url: '#',
                }
            ],
            timestamp: new Date().toISOString(),
        };

        return NextResponse.json({
            ok: true,
            data: result,
        });
    } catch (error: any) {
        console.error('[context7-retrieve] error:', error);
        return NextResponse.json({
            ok: false,
            error: error?.message || 'Context7 retrieval failed',
        }, { status: 500 });
    }
});
