import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';

/**
 * /api/agora/rtm-token
 * Generates an Agora RTM token for the given userId.
 * Agora RTM 2.x tokens use the same AppId/AppCertificate as RTC,
 * but are built with RtmTokenBuilder.
 *
 * GET /api/agora/rtm-token?userId=<uid>
 */

// Reuse the same in-memory credential cache as the RTC token route
let cachedCredentials: { appId: string; appCertificate: string; expires: number } | null = null;

async function getAgoraCredentials() {
  if (cachedCredentials && Date.now() < cachedCredentials.expires) {
    return cachedCredentials;
  }

  const envAppId = process.env.AGORA_APP_ID;
  const envAppCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (
    envAppId && envAppCertificate &&
    envAppId !== 'USE_SSM' && envAppCertificate !== 'USE_SSM' &&
    envAppId.length === 32 && envAppCertificate.length === 32
  ) {
    cachedCredentials = {
      appId: envAppId,
      appCertificate: envAppCertificate,
      expires: Date.now() + 5 * 60 * 1000,
    };
    return cachedCredentials;
  }

  // 先前這裡跟 /api/agora/token 一樣，缺環境變數時會退回一組寫死在原始碼裡的
  // App ID / App Certificate。App Certificate 是簽發 token 的祕密，已進 git 歷史，
  // 需要在 Agora Console 輪替。現在缺少時直接失敗，不再使用外洩的憑證。
  throw new Error('Agora credentials are not configured (AGORA_APP_ID / AGORA_APP_CERTIFICATE)');
}

// 先前完全沒有 auth：任何人都能索取任意 userId 的 RTM token。
async function handleGet(req: AuthedRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'anonymous';

    const { appId, appCertificate } = await getAgoraCredentials();

    if (appId.length !== 32 || appCertificate.length !== 32) {
      return NextResponse.json({ error: 'Invalid Agora credentials' }, { status: 503 });
    }

    const expireSeconds = 60 * 60; // 1 hour
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expireSeconds;

    // agora-access-token v2 exposes RtmTokenBuilder for RTM tokens
    // @ts-ignore
    const { RtmTokenBuilder, RtmRole } = require('agora-access-token');

    const token = RtmTokenBuilder.buildToken(
      appId,
      appCertificate,
      userId,
      RtmRole.Rtm_User,
      privilegeExpiredTs,
    );

    return NextResponse.json({
      appId,
      userId,
      token,
      expiresAt: privilegeExpiredTs,
    });
  } catch (err: any) {
    console.error('[Agora RTM] rtm-token route error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate RTM token' },
      { status: 500 },
    );
  }
}

export const GET = withAuth(handleGet);
