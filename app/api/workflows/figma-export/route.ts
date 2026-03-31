import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Figma 設計匯出 API
 * 用於從 Figma 導出設計資源或元件
 */
export async function POST(req: NextRequest) {
    try {
        const { fileKey, format = 'json' } = await req.json();

        if (!fileKey) {
            return NextResponse.json({ ok: false, error: 'File Key is required' }, { status: 400 });
        }

        const validFormats = ['json', 'svg', 'png'];
        if (!validFormats.includes(format)) {
            return NextResponse.json({ 
                ok: false, 
                error: `Invalid format. Allowed: ${validFormats.join(', ')}` 
            }, { status: 400 });
        }

        // TODO: 實現 Figma API 調用
        // 需要配置 Figma API 金鑰和認證
        // 暫時返回模擬結果
        const result = {
            fileKey,
            format,
            exportId: `export-${Date.now()}`,
            status: 'exported',
            url: `https://figma.example.com/file/${fileKey}`,
            timestamp: new Date().toISOString(),
        };

        console.log('[figma-export] Export completed:', fileKey, 'as', format);

        return NextResponse.json({
            ok: true,
            data: result,
        });
    } catch (error: any) {
        console.error('[figma-export] error:', error);
        return NextResponse.json({
            ok: false,
            error: error?.message || 'Figma export failed',
        }, { status: 500 });
    }
}
