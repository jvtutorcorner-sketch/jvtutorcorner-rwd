/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // 確保 white-web-sdk 被正確編譯
  transpilePackages: ['white-web-sdk'],

  // ★★★ 關鍵修復：強制將 Build Time 的變數注入到 Runtime ★★★
  env: {
    AGORA_WHITEBOARD_APP_ID: process.env.AGORA_WHITEBOARD_APP_ID,
    AGORA_WHITEBOARD_AK: process.env.AGORA_WHITEBOARD_AK,
    AGORA_WHITEBOARD_SK: process.env.AGORA_WHITEBOARD_SK,
    NETLESS_SDK_TOKEN: process.env.NETLESS_SDK_TOKEN,
    NETLESS_APP_ID: process.env.NETLESS_APP_ID,
    // 其他需要的後端變數...
    AGORA_APP_ID: process.env.AGORA_APP_ID,
    AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE,
    // Feature Flag default to true (Amplify might miss .env.local)
    NEXT_PUBLIC_USE_AGORA_WHITEBOARD: process.env.NEXT_PUBLIC_USE_AGORA_WHITEBOARD || 'true',
  },
};

export default nextConfig;