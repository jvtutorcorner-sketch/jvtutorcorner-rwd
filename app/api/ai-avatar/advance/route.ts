// app/api/ai-avatar/advance/route.ts
// 前端每隔幾秒呼叫一次，把 pipeline 往下推進一步；本身不保存任何狀態，
// 目前進度完全由前端傳回的 ttsId / lipsyncId 決定（避免另外接資料庫）。
import { NextResponse } from 'next/server';
import { extractTokenFromRequest, getSession } from '@/lib/auth/sessionManager';
import { createLipsyncPrediction, extractAudioUrl, extractVideoUrl, getPrediction } from '@/lib/replicate/aiAvatarPipeline';

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
  const ttsId = typeof body?.ttsId === 'string' ? body.ttsId : '';
  const lipsyncId = typeof body?.lipsyncId === 'string' ? body.lipsyncId : '';
  const photoDataUrl = typeof body?.photoDataUrl === 'string' ? body.photoDataUrl : '';

  if (!ttsId) {
    return NextResponse.json({ error: '缺少 ttsId' }, { status: 400 });
  }

  try {
    // 第二階段：已經在做口型同步影片，檢查它的進度
    if (lipsyncId) {
      const lipsync = await getPrediction(lipsyncId);
      if (lipsync.status === 'succeeded') {
        const videoUrl = extractVideoUrl(lipsync.output);
        if (!videoUrl) return NextResponse.json({ stage: 'error', error: '影片生成完成但找不到輸出網址' }, { status: 500 });
        return NextResponse.json({ stage: 'done', videoUrl });
      }
      if (lipsync.status === 'failed' || lipsync.status === 'canceled') {
        return NextResponse.json({ stage: 'error', error: `虛擬人影片生成失敗：${JSON.stringify(lipsync.error)}` }, { status: 500 });
      }
      return NextResponse.json({ stage: 'lipsync_processing', status: lipsync.status });
    }

    // 第一階段：配音是否完成，完成後接著啟動口型同步
    const tts = await getPrediction(ttsId);
    if (tts.status === 'failed' || tts.status === 'canceled') {
      return NextResponse.json({ stage: 'error', error: `配音生成失敗：${JSON.stringify(tts.error)}` }, { status: 500 });
    }
    if (tts.status !== 'succeeded') {
      return NextResponse.json({ stage: 'tts_processing', status: tts.status });
    }

    const audioUrl = extractAudioUrl(tts.output);
    if (!audioUrl) {
      return NextResponse.json({ stage: 'error', error: '配音完成但找不到輸出網址' }, { status: 500 });
    }
    if (!photoDataUrl.startsWith('data:image/')) {
      return NextResponse.json({ stage: 'error', error: '配音已完成，但缺少大頭照無法繼續' }, { status: 400 });
    }

    const lipsync = await createLipsyncPrediction(photoDataUrl, audioUrl);
    return NextResponse.json({ stage: 'lipsync_started', lipsyncId: lipsync.id, status: lipsync.status });
  } catch (err) {
    return NextResponse.json({ stage: 'error', error: err instanceof Error ? err.message : '未知錯誤' }, { status: 500 });
  }
}
