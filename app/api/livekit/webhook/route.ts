// app/api/livekit/webhook/route.ts
//
// POST /api/livekit/webhook
// LiveKit server 的事件回呼端點（room_started / participant_joined / participant_left / room_finished）。
//
// 認證靠 LiveKit 的簽章（Authorization header + WebhookReceiver 用 api_key/secret 驗），
// 所以「不」套 withAuth —— 呼叫方是 LiveKit server，不是登入使用者。
//
// 重要：必須讀「原始 body 字串」來驗簽，不能先 JSON.parse。
//
// 設定：把此 URL（https://<app>/api/livekit/webhook）寫進 LiveKit server 設定的
// webhook.urls，並更新 SSM /jvtutorcorner/livekit/webhook-url 後重啟容器。

import { NextResponse } from 'next/server';
import { getLiveKitConfig, LiveKitConfigError } from '@/lib/livekit/config';
import { verifyWebhook, handleWebhookEvent } from '@/lib/livekit/webhookHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Config 檢查（缺 env 時明確回 503，而不是驗簽時丟不明錯誤）
  try {
    getLiveKitConfig();
  } catch (err) {
    if (err instanceof LiveKitConfigError) {
      console.error('[livekit/webhook]', err.message);
      return NextResponse.json({ ok: false, reason: 'LIVEKIT_NOT_CONFIGURED' }, { status: 503 });
    }
    throw err;
  }

  const rawBody = await req.text();
  const authHeader = req.headers.get('authorization') || undefined;

  let event;
  try {
    event = await verifyWebhook(rawBody, authHeader);
  } catch (err) {
    // 簽章不符 / 過期 → 401。不要洩漏細節。
    console.warn('[livekit/webhook] signature verification failed:', (err as Error)?.message);
    return NextResponse.json({ ok: false, reason: 'INVALID_SIGNATURE' }, { status: 401 });
  }

  try {
    const result = await handleWebhookEvent(event);
    // 一律回 200，避免 LiveKit 對「已知但不需動作」的事件無限重送。
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // 真正的基礎設施錯誤（DynamoDB 掛了）→ 回 500，讓 LiveKit 重送。
    console.error('[livekit/webhook] handler error', err);
    return NextResponse.json({ ok: false, reason: 'INTERNAL' }, { status: 500 });
  }
}
