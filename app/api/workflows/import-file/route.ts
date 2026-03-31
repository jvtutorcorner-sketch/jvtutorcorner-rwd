import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * 檔案匯入 API
 * 用於解析上傳的檔案內容（JSON、CSV、XML、TXT）
 */
export async function POST(req: NextRequest) {
    try {
        const { fileContent, fileName, fileType = 'json' } = await req.json();

        if (!fileContent) {
            return NextResponse.json({ ok: false, error: 'File content is required' }, { status: 400 });
        }

        const validTypes = ['json', 'csv', 'xml', 'txt'];
        if (!validTypes.includes(fileType)) {
            return NextResponse.json({ 
                ok: false, 
                error: `Invalid file type. Allowed: ${validTypes.join(', ')}` 
            }, { status: 400 });
        }

        try {
            let parsedContent: any = fileContent;

            // 根據檔案類型解析內容
            switch (fileType) {
                case 'json':
                    parsedContent = JSON.parse(fileContent);
                    break;
                case 'csv':
                    // 簡單的 CSV 解析：分割行和列
                    const lines = fileContent.split('\n').filter((line: string) => line.trim());
                    const headers = lines[0].split(',').map((h: string) => h.trim());
                    const rows = lines.slice(1).map((line: string) => {
                        const values = line.split(',').map((v: string) => v.trim());
                        return headers.reduce((obj: any, header: string, idx: number) => {
                            obj[header] = values[idx];
                            return obj;
                        }, {} as any);
                    });
                    parsedContent = rows;
                    break;
                case 'xml':
                    // 簡單的 XML 處理：保留原始內容
                    parsedContent = { raw: fileContent, format: 'xml' };
                    break;
                case 'txt':
                    parsedContent = fileContent.split('\n');
                    break;
            }

            const result = {
                fileName,
                fileType,
                size: fileContent.length,
                timestamp: new Date().toISOString(),
                data: parsedContent,
                status: 'imported',
            };

            console.log('[import-file] File imported:', fileName);

            return NextResponse.json({
                ok: true,
                data: result,
            });
        } catch (parseError: any) {
            return NextResponse.json({
                ok: false,
                error: `Failed to parse file: ${parseError.message}`,
            }, { status: 400 });
        }
    } catch (error: any) {
        console.error('[import-file] error:', error);
        return NextResponse.json({
            ok: false,
            error: error?.message || 'File import failed',
        }, { status: 500 });
    }
}

