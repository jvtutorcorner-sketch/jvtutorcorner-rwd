import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { verifyClassroomAccess } from '@/lib/auth/classroomAccess';

// Server route to generate Agora RTC token for a given channelName and uid.
// Usage: GET /api/agora/token?channelName=room1&uid=123

// Cache for credentials (env lookup + format validation) — 5 minutes
let cachedCredentials: { appId: string; appCertificate: string; expires: number } | null = null;

async function getAgoraCredentials() {
  // Return cached credentials if still valid (cache for 5 minutes)
  if (cachedCredentials && Date.now() < cachedCredentials.expires) {
    console.log('[Agora] Using cached credentials');
    return cachedCredentials;
  }

  // First try environment variables (for local development and emergency fallback)
  const envAppId = process.env.AGORA_APP_ID;
  const envAppCertificate = process.env.AGORA_APP_CERTIFICATE;

  console.log('[Agora] Environment check:');
  console.log(`[Agora] AGORA_APP_ID: ${envAppId ? 'SET (' + envAppId.length + ' chars)' : 'NOT SET'}`);
  console.log(`[Agora] AGORA_APP_CERTIFICATE: ${envAppCertificate ? 'SET (' + envAppCertificate.length + ' chars)' : 'NOT SET'}`);

  // Allow direct environment variables for emergency cases
  if (envAppId && envAppCertificate &&
    envAppId !== 'USE_SSM' && envAppCertificate !== 'USE_SSM' &&
    envAppId.length === 32 && envAppCertificate.length === 32) {
    console.log('[Agora] Using credentials from environment variables');
    cachedCredentials = {
      appId: envAppId,
      appCertificate: envAppCertificate,
      expires: Date.now() + 5 * 60 * 1000 // 5 minutes
    };
    return cachedCredentials;
  }

  // 先前這裡有一組寫死在原始碼裡的 App ID / App Certificate 當「緊急 fallback」。
  // App Certificate 是簽發 RTC token 的祕密，寫進原始碼就等於公開（已進 git 歷史，
  // 需要在 Agora Console 輪替）。缺少環境變數時改為直接失敗，不再靜默使用外洩的憑證。
  throw new Error('Agora credentials are not configured (AGORA_APP_ID / AGORA_APP_CERTIFICATE)');
}

// Agora requires channel names ≤ 64 bytes (ASCII only from allowed charset)
function truncateChannelName(name: string): string {
  // Encode as UTF-8 and slice to 64 bytes, then decode safely
  const encoded = new TextEncoder().encode(name);
  if (encoded.length <= 64) return name;
  const sliced = encoded.slice(0, 64);
  return new TextDecoder().decode(sliced).replace(/\uFFFD/g, ''); // remove any broken chars at boundary
}

// 先前完全沒有 auth：任何人都能索取可加入任意頻道的 RTC token。
async function handleGet(req: AuthedRequest) {
  try {
    console.log('[Agora] Token request received');
    const url = new URL(req.url);
    const rawChannel = url.searchParams.get('channelName') || 'default-channel';
    const channelName = truncateChannelName(rawChannel);
    if (channelName !== rawChannel) {
      console.log(`[Agora] Channel name truncated from ${rawChannel.length} to ${channelName.length} chars`);
    }
    const uidParam = url.searchParams.get('uid') || '0';
    const uid = Number(uidParam) || 0;

    // 有帶 courseId 就驗證這位登入者確實是該堂課的參與者（老師或已報名/有授權的學生）。
    const courseId = url.searchParams.get('courseId');
    if (courseId) {
      const access = await verifyClassroomAccess(req.session, courseId);
      if (!access.granted) {
        console.warn(`[Agora] token denied for ${req.session.userId} on course ${courseId}: ${access.reason}`);
        return NextResponse.json({ error: 'Forbidden: no access to this course' }, { status: 403 });
      }
    }

    // Get Agora credentials securely
    const { appId, appCertificate } = await getAgoraCredentials();

    // Validate credential format (basic check)
    if (appId.length !== 32 || appCertificate.length !== 32) {
      console.error('[Agora] Invalid credential format detected');
      return NextResponse.json({
        error: 'Video conferencing service configuration error'
      }, { status: 503 });
    }

    // require the token helper (server-side)
    // @ts-ignore
    const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

    const expireSeconds = 60 * 60; // 1 hour
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeTs = currentTimestamp + expireSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      privilegeTs,
    );

    // Return appId (it's needed client-side and is not a secret)
    return NextResponse.json({
      appId,
      channelName,
      uid,
      token,
      expiresAt: privilegeTs
    });
  } catch (err: any) {
    console.error('[Agora] token route error:', err);
    return NextResponse.json({
      error: err.message || 'Failed to generate video conference token'
    }, { status: 500 });
  }
}

export const GET = withAuth(handleGet);
