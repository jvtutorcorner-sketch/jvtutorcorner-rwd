import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Ensure this route is not cached

export async function GET() {
  // Get all environment variable keys
  const envKeys = Object.keys(process.env).sort();

  // Specific check for the problematic variable
  // We check for existence and non-empty string
  const agoraAppId = process.env.AGORA_WHITEBOARD_APP_ID;
  const isAgoraAppIdPresent = typeof agoraAppId === 'string' && agoraAppId.length > 0;

  return NextResponse.json({
    status: 'success',
    timestamp: new Date().toISOString(),
    checks: {
      AGORA_WHITEBOARD_APP_ID: isAgoraAppIdPresent 
        ? `Present (length: ${agoraAppId.length})` 
        : 'Missing or Empty',
      NODE_ENV: process.env.NODE_ENV
    },
    // filter sensitive keys just in case, though we are only returning keys
    availableEnvKeys: envKeys
  });
}
