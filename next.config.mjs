/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // 建議暫時關閉
  // ★★★ 這一行是救命符，一定要加 ★★★
  transpilePackages: ['white-web-sdk'],
};

export default nextConfig;