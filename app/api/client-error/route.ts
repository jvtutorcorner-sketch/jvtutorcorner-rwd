import { NextResponse } from 'next/server';
import { keyLog } from '@/lib/keyLogger';

/**
 * app/error.tsx / app/global-error.tsx 是 Client Component，不能直接 import
 * lib/keyLogger.ts（內含 AWS SDK，僅能在伺服器端執行），因此透過這支
 * 輕量 API route 轉發到 DynamoDB 結構化日誌。
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = typeof body?.message === 'string' ? body.message.slice(0, 500) : 'unknown error';
    const digest = typeof body?.digest === 'string' ? body.digest.slice(0, 100) : undefined;
    const pathname = typeof body?.pathname === 'string' ? body.pathname.slice(0, 200) : undefined;

    await keyLog.error({
      category: 'api_error',
      action: 'client_render_error',
      summary: message,
      source: pathname,
      metadata: digest ? { digest } : undefined,
    });
  } catch {
    // 錯誤上報本身失敗不應影響使用者體驗，安靜吞掉即可
  }

  return NextResponse.json({ ok: true });
}
