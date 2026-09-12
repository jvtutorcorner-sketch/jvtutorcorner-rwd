import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

/**
 * 只服務「本機開發時寫到 .uploads/whiteboard 的 PDF」。
 *
 * whiteboard/pdf 只有在物件儲存不可用時才會把 PDF 寫到本機並產生指向這裡的網址；
 * 正式環境（Lambda 檔案系統唯讀）不會走到那條路。教材 PDF 的正式讀取一律經過需要登入的
 * /api/whiteboard/pdf（依 s3Key 從物件儲存讀）。
 *
 * 這支路由沒有登入保護，所以刻意「不」加上物件儲存的 fallback——否則 whiteboard/ 下的
 * 教材 PDF 只要猜到 key 就能匿名下載。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const filePath = resolvedParams.path.join('/');
    const uploadsDir = path.resolve(process.cwd(), '.uploads', 'whiteboard');
    const fullPath = path.resolve(uploadsDir, filePath);

    // 先前是 path.join + startsWith(uploadsDir)，少了路徑分隔字元：
    // `../whiteboard-x/a` 會解析到同層的 .uploads/whiteboard-x 並通過檢查。
    if (fullPath === uploadsDir || !fullPath.startsWith(uploadsDir + path.sep)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Read file
    const fileBuffer = fs.readFileSync(fullPath);

    // Determine content type based on file extension
    const ext = path.extname(fullPath).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.json') contentType = 'application/json';

    // Return file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      },
    });
  } catch (error) {
    console.error('[Uploads API] Error serving file:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
