import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

export const runtime = 'nodejs';

/**
 * 檔案匯出 API
 * 用於生成並保存各種格式的檔案（JSON、CSV、XML）
 */
export async function POST(req: NextRequest) {
    try {
        const { format = 'json', fileName, dataField } = await req.json();

        if (!fileName) {
            return NextResponse.json({ ok: false, error: 'File name is required' }, { status: 400 });
        }

        if (!dataField) {
            return NextResponse.json({ ok: false, error: 'Data field is required' }, { status: 400 });
        }

        const validFormats = ['json', 'csv', 'xml'];
        if (!validFormats.includes(format)) {
            return NextResponse.json({ 
                ok: false, 
                error: `Invalid format. Allowed: ${validFormats.join(', ')}` 
            }, { status: 400 });
        }

        // TODO: 實現檔案生成邏輯
        // 這裡應該根據 dataField 和格式選項生成相應的檔案內容
        let fileContent = '';
        let contentType = 'application/json';
        let fileExtension = format;

        // 模擬數據（實際應該來自 dataField）
        const mockData = [
            { id: 1, name: 'Item 1', value: 100 },
            { id: 2, name: 'Item 2', value: 200 },
        ];

        switch (format) {
            case 'json':
                fileContent = JSON.stringify(mockData, null, 2);
                contentType = 'application/json';
                break;
            case 'csv':
                const headers = Object.keys(mockData[0]).join(',');
                const rows = mockData.map(item => 
                    Object.values(item).join(',')
                ).join('\n');
                fileContent = `${headers}\n${rows}`;
                contentType = 'text/csv';
                break;
            case 'xml':
                fileContent = '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n';
                mockData.forEach(item => {
                    fileContent += '  <item>\n';
                    Object.entries(item).forEach(([key, value]) => {
                        fileContent += `    <${key}>${value}</${key}>\n`;
                    });
                    fileContent += '  </item>\n';
                });
                fileContent += '</root>';
                contentType = 'application/xml';
                break;
        }

        const result = {
            fileName,
            format,
            contentType,
            size: fileContent.length,
            timestamp: new Date().toISOString(),
            exportId: `export-${Date.now()}`,
            status: 'exported',
            preview: fileContent.substring(0, 200), // 預覽前 200 字符
        };

        console.log('[export-file] File exported:', fileName);

        return NextResponse.json({
            ok: true,
            data: result,
        });
    } catch (error: any) {
        console.error('[export-file] error:', error);
        return NextResponse.json({
            ok: false,
            error: error?.message || 'File export failed',
        }, { status: 500 });
    }
}
