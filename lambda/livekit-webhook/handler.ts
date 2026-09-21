// lambda/livekit-webhook/handler.ts
//
// 獨立 Lambda 版本的 LiveKit webhook 端點（API Gateway HTTP API，公開路由、無 authorizer，
// 由 LiveKit 簽章驗證取代身分驗證）。與 app/api/livekit/webhook/route.ts 共用
// lib/livekit/webhookHandler。適合把 webhook 與主站 compute 分離、獨立擴縮 / 獨立告警。
//
// 部署（repo 根目錄）：
//   npx esbuild lambda/livekit-webhook/handler.ts \
//     --bundle --platform=node --target=node20 --format=cjs \
//     --outfile=dist/livekit-webhook/index.js --alias:@=. --external:@aws-sdk/*
//
// Lambda：nodejs20.x / handler=index.handler / timeout 15s / memory 256MB
//   env: LIVEKIT_API_KEY / LIVEKIT_API_SECRET / DYNAMODB_TABLE_*
//   IAM: dynamodb Get/Query/UpdateItem on course-sessions, enrollments, points-escrow,
//        user-points, profiles（releaseEscrow 會加老師點數）
//
// API Gateway：POST /livekit/webhook（payload format 2.0，關閉 authorizer）
//   把此 URL 設進 LiveKit webhook.urls 與 SSM /jvtutorcorner/livekit/webhook-url。
//
// 重要：API Gateway 對非 base64 的 body 會原樣帶入 event.body；簽章要對「原始字串」驗，
// 所以這裡直接用 event.body（必要時 base64 解碼），不先 JSON.parse。

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getLiveKitConfig, LiveKitConfigError } from '@/lib/livekit/config';
import { verifyWebhook, handleWebhookEvent } from '@/lib/livekit/webhookHandler';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const;

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

/** 從 event 取原始 body 字串（API Gateway 可能 base64 編碼）。 */
function rawBody(event: APIGatewayProxyEventV2): string {
  if (!event.body) return '';
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
}

/** header 名稱大小寫不定，統一小寫查找。 */
function header(event: APIGatewayProxyEventV2, name: string): string | undefined {
  const h = event.headers || {};
  const lower = name.toLowerCase();
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === lower) return h[k];
  }
  return undefined;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    getLiveKitConfig();
  } catch (err) {
    if (err instanceof LiveKitConfigError) {
      console.error('[livekit-webhook-lambda]', err.message);
      return json(503, { ok: false, reason: 'LIVEKIT_NOT_CONFIGURED' });
    }
    throw err;
  }

  let parsed;
  try {
    parsed = await verifyWebhook(rawBody(event), header(event, 'authorization'));
  } catch (err) {
    console.warn('[livekit-webhook-lambda] signature verification failed:', (err as Error)?.message);
    return json(401, { ok: false, reason: 'INVALID_SIGNATURE' });
  }

  try {
    const result = await handleWebhookEvent(parsed);
    return json(200, { ok: true, ...result });
  } catch (err) {
    console.error('[livekit-webhook-lambda] handler error', err);
    return json(500, { ok: false, reason: 'INTERNAL' });
  }
}
