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

  // For production, fetch from AWS Systems Manager Parameter Store
  console.log('[Agora] Attempting to fetch credentials from AWS SSM Parameter Store...');
  try {
    const region = process.env.AWS_REGION || 'us-east-1';
    console.log(`[Agora] Using AWS region: ${region}`);

    const ssmClient = new SSMClient({ region });

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
      console.error('[Agora] SSM parameters found but values are empty');
      throw new Error('Agora credentials not configured in Parameter Store');
    }

    console.log('[Agora] Successfully retrieved credentials from SSM');
    cachedCredentials = {
      appId,
      appCertificate,
      expires: Date.now() + 5 * 60 * 1000 // 5 minutes
    };

    return cachedCredentials;
  } catch (error: any) {
    console.error('[Agora] Failed to fetch credentials from SSM:', error.message);

    // If SSM fails and we have USE_SSM placeholders, this is expected in production
    if (envAppId === 'USE_SSM' || envAppCertificate === 'USE_SSM') {
      console.error('[Agora] SSM access failed. Please ensure:');
      console.error('[Agora] 1. SSM parameters /jvtutorcorner/agora/app_id and /jvtutorcorner/agora/app_certificate exist');
      console.error('[Agora] 2. Amplify has proper IAM permissions to access SSM');
      console.error('[Agora] 3. AWS_REGION environment variable is set correctly');
      throw new Error('Video conferencing service is not configured. Please contact administrator.');
    }

    // If neither env vars nor SSM work, throw a generic error
    throw new Error('Video conferencing service is temporarily unavailable');
  }
}

export async function GET(req: Request) {
  try {
    console.log('[Agora] Token request received');
    const url = new URL(req.url);
    const channelName = url.searchParams.get('channelName') || 'default-channel';
    const uidParam = url.searchParams.get('uid') || '0';
    const uid = Number(uidParam) || 0;

    console.log(`[Agora] Request params: channelName=${channelName}, uid=${uid}`);

    // Get Agora credentials securely
    const { appId, appCertificate } = await getAgoraCredentials();

    console.log(`[Agora] Retrieved credentials: appId length=${appId.length}, appCertificate length=${appCertificate.length}`);

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
