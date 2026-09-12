import { NextResponse } from 'next/server';
import { withAdminOrHmac, type AuthedRequest } from '@/lib/auth/apiGuard';

export const runtime = 'nodejs';

/**
 * Figma 設計匯出 API — 目前仍是 TODO/mock stub，尚未串接真正的 Figma API。
 * 先前完全沒有 auth；即使現在只回傳假資料，仍鎖 admin/HMAC 以免之後補上真正實作時忘記加。
 */
export const POST = withAdminOrHmac('/api/workflows/figma-export', async (req: AuthedRequest) => {
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
});
