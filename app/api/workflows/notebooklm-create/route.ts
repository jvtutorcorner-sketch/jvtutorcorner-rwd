import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * NotebookLM 文檔建立 API
 * 用於建立新的 NotebookLM 文檔
 */
export async function POST(req: NextRequest) {
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
}
