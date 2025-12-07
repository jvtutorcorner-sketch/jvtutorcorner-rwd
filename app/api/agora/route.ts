
import { RtcTokenBuilder, RtcRole } from "agora-access-token";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { channelName } = await request.json();

  if (!channelName) {
    return NextResponse.json(
      { error: "channelName is required" },
      { status: 400 }
    );
  }

  const appID = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  const role = RtcRole.PUBLISHER;
  const uid = 0;
  const expirationTimeInSeconds = 3600;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  if (!appID || !appCertificate) {
    return NextResponse.json(
      { error: "Agora credentials are not set in .env.local" },
      { status: 500 }
    );
  }

  const token = RtcTokenBuilder.buildTokenWithUid(
    appID,
    appCertificate,
    channelName,
    uid,
    role,
    privilegeExpiredTs
  );

  return NextResponse.json({ token });
}
