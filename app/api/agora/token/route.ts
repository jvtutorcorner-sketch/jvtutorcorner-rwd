import { NextResponse } from 'next/server';

// Server route to generate Agora RTC token for a given channelName and uid.
// Usage: GET /api/agora/token?channelName=room1&uid=123

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const channelName = url.searchParams.get('channelName') || 'default-channel';
    const uidParam = url.searchParams.get('uid') || '0';
    const uid = Number(uidParam) || 0;

    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCertificate) {
      return NextResponse.json({ error: 'AGORA_APP_ID or AGORA_APP_CERTIFICATE not set' }, { status: 500 });
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

    return NextResponse.json({ appId, channelName, uid, token, expiresAt: privilegeTs });
  } catch (err: any) {
    console.error('[Agora] token route error:', err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
