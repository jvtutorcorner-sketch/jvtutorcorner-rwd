export interface LineLoginConfig {
  channelId: string;
  channelSecret: string;
  redirectUri: string;
}

export function getLineLoginConfig(): LineLoginConfig {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  const redirectUri = process.env.LINE_LOGIN_REDIRECT_URI;

  if (!channelId || !channelSecret || !redirectUri) {
    throw new Error(
      'LINE Login not configured. Set LINE_LOGIN_CHANNEL_ID, LINE_LOGIN_CHANNEL_SECRET, LINE_LOGIN_REDIRECT_URI.'
    );
  }

  return { channelId, channelSecret, redirectUri };
}
