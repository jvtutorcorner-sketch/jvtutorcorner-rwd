// app/api/ai-avatar/generate/route.ts
// 啟動 AI 虛擬人試作影片的第一階段：文字腳本 -> 配音（TTS）
import { NextResponse } from 'next/server';
import { extractTokenFromRequest, getSession } from '@/lib/auth/sessionManager';
import { createTtsPrediction, MAX_SCRIPT_LENGTH } from '@/lib/replicate/aiAvatarPipeline';

async function requireAdmin(req: Request) {
  const token = extractTokenFromRequest(req);
  if (!token) return null;
  const session = await getSession(token);
  if (session?.role !== 'admin') return null;
  return session;
}

export async function POST(req: Request) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const script = typeof body?.script === 'string' ? body.script.trim() : '';
  const photoDataUrl = typeof body?.photoDataUrl === 'string' ? body.photoDataUrl : '';

  if (!script) {
    return NextResponse.json({ error: '請輸入腳本文字' }, { status: 400 });
  }
  if (script.length > MAX_SCRIPT_LENGTH) {
    return NextResponse.json({ error: `腳本請控制在 ${MAX_SCRIPT_LENGTH} 字以內（避免超過1分鐘）` }, { status: 400 });
  }
  if (!photoDataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: '請上傳一張大頭照' }, { status: 400 });
  }

  try {
    const prediction = await createTtsPrediction(script);
    return NextResponse.json({ ttsId: prediction.id, status: prediction.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '啟動配音生成失敗' }, { status: 500 });
  }
}
