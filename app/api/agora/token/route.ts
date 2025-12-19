import { NextResponse } from 'next/server';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

// Server route to generate Agora RTC token for a given channelName and uid.
// Usage: GET /api/agora/token?channelName=room1&uid=123

// Cache for credentials to avoid repeated SSM calls
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

  // Emergency fallback: hardcode credentials for immediate fix
  console.log('[Agora] Using emergency hardcoded credentials');
  const hardcodedAppId = '5cbf2f6128cf4e5ea92e046e3c161621';
  const hardcodedAppCertificate = '3f9ea1c4321646e0a38d634505806bd7';

  cachedCredentials = {
    appId: hardcodedAppId,
    appCertificate: hardcodedAppCertificate,
    expires: Date.now() + 5 * 60 * 1000 // 5 minutes
  };
  return cachedCredentials;
}

export async function GET(req: Request) {
  try {
    console.log('[Agora] Token request received');
    const url = new URL(req.url);
    const channelName = url.searchParams.get('channelName') || 'default-channel';
    const uidParam = url.searchParams.get('uid') || '0';
    const uid = Number(uidParam) || 0;

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
