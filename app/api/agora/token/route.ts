import { NextResponse } from 'next/server';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

// Server route to generate Agora RTC token for a given channelName and uid.
// Usage: GET /api/agora/token?channelName=room1&uid=123

// Cache for credentials to avoid repeated SSM calls
let cachedCredentials: { appId: string; appCertificate: string; expires: number } | null = null;

async function getAgoraCredentials() {
  // Return cached credentials if still valid (cache for 5 minutes)
  if (cachedCredentials && Date.now() < cachedCredentials.expires) {
    return cachedCredentials;
  }

  // First try environment variables (for local development)
  const envAppId = process.env.AGORA_APP_ID;
  const envAppCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (envAppId && envAppCertificate) {
    cachedCredentials = {
      appId: envAppId,
      appCertificate: envAppCertificate,
      expires: Date.now() + 5 * 60 * 1000 // 5 minutes
    };
    return cachedCredentials;
  }

  // For production, fetch from AWS Systems Manager Parameter Store
  try {
    const ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'us-east-1' });

    const [appIdParam, appCertParam] = await Promise.all([
      ssmClient.send(new GetParameterCommand({
        Name: '/jvtutorcorner/agora/app_id',
        WithDecryption: true
      })),
      ssmClient.send(new GetParameterCommand({
        Name: '/jvtutorcorner/agora/app_certificate',
        WithDecryption: true
      }))
    ]);

    const appId = appIdParam.Parameter?.Value;
    const appCertificate = appCertParam.Parameter?.Value;

    if (!appId || !appCertificate) {
      throw new Error('Credentials not found in Parameter Store');
    }

    cachedCredentials = {
      appId,
      appCertificate,
      expires: Date.now() + 5 * 60 * 1000 // 5 minutes
    };

    return cachedCredentials;
  } catch (error) {
    console.error('Failed to fetch Agora credentials:', error);
    throw new Error('Video conferencing service is temporarily unavailable');
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const channelName = url.searchParams.get('channelName') || 'default-channel';
    const uidParam = url.searchParams.get('uid') || '0';
    const uid = Number(uidParam) || 0;

    // Get Agora credentials securely
    const { appId, appCertificate } = await getAgoraCredentials();

    // Validate credential format (basic check)
    if (appId.length !== 32 || appCertificate.length !== 32) {
      console.error('Invalid Agora credential format');
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

    console.log(`Generating Agora token for channel: ${channelName}, uid: ${uid}`);

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
