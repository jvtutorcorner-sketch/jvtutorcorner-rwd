// app/api/agora/token/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

const APP_ID = process.env.AGORA_APP_ID!;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE!;
const TOKEN_EXPIRE_SECONDS = 60 * 60; // 1 小時

export async function GET(req: NextRequest) {
  try {
    if (!APP_ID || !APP_CERTIFICATE) {
      return NextResponse.json(
        { error: 'AGORA_APP_ID or AGORA_APP_CERTIFICATE not set' },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(req.url);
    const channelName = searchParams.get('channelName');
    const uidParam = searchParams.get('uid') ?? '0';

    if (!channelName) {
      return NextResponse.json(
        { error: 'Missing channelName' },
        { status: 400 },
      );
    }

    const uid = Number.isNaN(Number(uidParam)) ? 0 : Number(uidParam);
    const currentTs = Math.floor(Date.now() / 1000);
    const expireTs = currentTs + TOKEN_EXPIRE_SECONDS;

    // 老師 / 學生都用 PUBLISHER，這樣雙方都可以開麥跟鏡頭
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      expireTs,
    );

    return NextResponse.json({
      appId: APP_ID,
      channelName,
      uid,
      token,
      expireAt: expireTs,
    });
  } catch (err) {
    console.error('Error generating Agora token:', err);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 },
    );
  }
}
