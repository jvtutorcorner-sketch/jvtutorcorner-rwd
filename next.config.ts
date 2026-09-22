import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// Avoid creating `standalone` output on Windows because some traced
// filenames include characters (e.g. `node:async_hooks`) that are
// invalid on Windows filesystems and cause copy errors (EINVAL).
const isWindows = process.platform === 'win32';

/**
 * 正式環境必須存在的機密。
 *
 * 過去這些變數在 `env` 區塊帶有硬編碼 fallback（已進版控），
 * 導致線上漏設時會靜默改用公開已知字串——偽造 HMAC 即可取得 role:'system'。
 * 現在改為：缺少就讓 build 失敗，把靜默降級變成大聲失敗。
 */
const REQUIRED_PRODUCTION_SECRETS = [
  'SESSION_SECRET',
  'API_HMAC_SECRET',
] as const;

/** 曾經進過版控、已作廢的預設值。若線上仍在使用代表尚未輪換。 */
const REVOKED_SECRET_VALUES = new Set([
  'jv_session_secret_change_in_production_2024',
  'jv_hmac_secret_change_in_production_2024',
]);

function assertRequiredSecrets(enforce: boolean) {
  const missing = REQUIRED_PRODUCTION_SECRETS.filter((key) => !process.env[key]);
  const revoked = REQUIRED_PRODUCTION_SECRETS.filter(
    (key) => process.env[key] && REVOKED_SECRET_VALUES.has(process.env[key] as string)
  );

  if (missing.length === 0 && revoked.length === 0) return;

  const problems = [
    ...missing.map((k) => `  - ${k} 未設定`),
    ...revoked.map((k) => `  - ${k} 仍在使用已洩漏並作廢的預設值，必須輪換`),
  ].join('\n');

  const message =
    `[next.config] 環境機密檢查未通過：\n${problems}\n` +
    `請在 Amplify 環境變數（或本機 .env.local）中設定為隨機且未曾進版控的值。`;

  if (enforce) {
    throw new Error(message);
  }
  // 本機 `next dev` 只警告：這道防線的目的是「不要把洩漏的機密送上線」，
  // 擋住開發者的 dev server 並不會達成該目的，只會逼人把檢查拿掉。
  console.warn(`⚠️  ${message}`);
}

const nextConfig: any = {
  output: isWindows ? undefined : 'standalone',
  // /api/i18n 於 runtime 讀 process.cwd()/locales/*.json，standalone 的 tracing
  // 不會自動帶上這些檔案。
  outputFileTracingIncludes: {
    '/api/i18n': ['./locales/**/*.json'],
  },
  reactStrictMode: false,
  reactCompiler: true,
  // 確保 white-web-sdk 被正確編譯
  transpilePackages: ['white-web-sdk'],
  // 確保啟用壓縮
  compress: true,
  // 禁用不必要的 header
  poweredByHeader: false,
  
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'drive.google.com', pathname: '**' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', pathname: '**' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: '**.googleusercontent.com' },
      // R2 公開網域（STORAGE_PUBLIC_BASE_URL），見 lib/s3.ts
      ...(process.env.STORAGE_PUBLIC_BASE_URL
        ? [{ protocol: 'https' as const, hostname: new URL(process.env.STORAGE_PUBLIC_BASE_URL).hostname }]
        : []),
    ]
  },

  typescript: {
    // 保持 false。導入 tenantId 這類跨檔案的型別變更時，
    // 編譯器是唯一能標出漏改呼叫點的工具——關掉它等於自廢武功。
    ignoreBuildErrors: false,
  },

  experimental: {
    // 啟用 Webpack 記憶體優化，顯著降低開發模式下的記憶體消耗
    webpackMemoryOptimizations: true,
  },

  // ★★★ 關鍵修復：強制將 Build Time 的變數注入到 Runtime ★★★
  //
  // ⚠️ 安全警告：此區塊的值會被 Next.js 在 build 時「行內展開」。
  //    任何 client component 只要寫下 `process.env.<KEY>`，該值就會被打包進
  //    瀏覽器可讀的 JS。因此這裡：
  //      1. 一律不得填入硬編碼的預設機密（缺少就該讓 build 失敗，見下方 assertRequiredSecrets）
  //      2. AWS 憑證是暫時例外（見下方 CI_AWS_* 說明），只能由伺服器端程式讀取
  //      3. 一律不得為機密建立 NEXT_PUBLIC_* 別名
  //    新增項目前請先確認該值可否公開；`npm run check:bundle-secrets` 會在 build 後驗證。
  env: {
    AGORA_WHITEBOARD_APP_ID: process.env.AGORA_WHITEBOARD_APP_ID,
    AGORA_WHITEBOARD_AK: process.env.AGORA_WHITEBOARD_AK,
    AGORA_WHITEBOARD_SK: process.env.AGORA_WHITEBOARD_SK,
    NETLESS_SDK_TOKEN: process.env.NETLESS_SDK_TOKEN,
    NETLESS_APP_ID: process.env.NETLESS_APP_ID,
    // 其他需要的後端變數...
    AGORA_APP_ID: process.env.AGORA_APP_ID,
    AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE,
    LOGIN_BYPASS_SECRET: process.env.LOGIN_BYPASS_SECRET,
    // ✂ 已移除 NEXT_PUBLIC_LOGIN_BYPASS_SECRET：
    //   bypass secret 一旦帶 NEXT_PUBLIC_ 前綴即等同公開，
    //   而 apiGuard 的 x-e2e-secret 會直接發出 role:'system' 的 session。
    //   E2E 測試改由 Playwright 從 .env.local 讀 LOGIN_BYPASS_SECRET（已支援）。
    QA_CAPTCHA_BYPASS: process.env.QA_CAPTCHA_BYPASS,
    // Feature Flag default to true (Amplify might miss .env.local)
    NEXT_PUBLIC_USE_AGORA_WHITEBOARD: process.env.NEXT_PUBLIC_USE_AGORA_WHITEBOARD || 'true',
    // Amplify 主控台的環境變數只在 build 階段可見，SSR 執行期讀不到；
    // 此 App 未綁定 Compute IAM Role，所以憑證必須在 build 時行內展開。
    // 只可由伺服器端程式讀取；client component 引用會把金鑰打包進瀏覽器（check:bundle-secrets 會擋）。
    // 綁定 Compute Role 後應再移除這三行。
    CI_AWS_ACCESS_KEY_ID: process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
    CI_AWS_SECRET_ACCESS_KEY: process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    CI_AWS_SESSION_TOKEN: process.env.CI_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN,
    CI_AWS_REGION: process.env.CI_AWS_REGION || process.env.AWS_REGION,
    CI_AWS_S3_BUCKET_NAME: process.env.CI_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME,
    // S3 相容物件儲存（Cloudflare R2）。未設定 STORAGE_S3_ENDPOINT 時 lib/s3.ts 維持使用 AWS S3。
    // R2 無法使用 Amplify SSR 的 IAM Role，所以跟上面「不放 AWS 憑證」的原則不同，這組金鑰必須
    // 帶進執行期；STORAGE_SECRET_ACCESS_KEY 已列入 scripts/check-bundle-secrets.mjs 的檢查清單。
    // 長期應改為執行期從 SSM 讀取（見 docs/hybrid-architecture-plan.md Phase 0）。
    STORAGE_S3_ENDPOINT: process.env.STORAGE_S3_ENDPOINT,
    STORAGE_S3_REGION: process.env.STORAGE_S3_REGION,
    STORAGE_BUCKET: process.env.STORAGE_BUCKET,
    STORAGE_ACCESS_KEY_ID: process.env.STORAGE_ACCESS_KEY_ID,
    STORAGE_SECRET_ACCESS_KEY: process.env.STORAGE_SECRET_ACCESS_KEY,
    STORAGE_PUBLIC_BASE_URL: process.env.STORAGE_PUBLIC_BASE_URL,
    // Cloudflare Realtime SFU（NEXT_PUBLIC_RTC_PROVIDER=cloudflare-sfu，見 lib/realtime/config.ts）。
    // 兩個 secret 已列入 scripts/check-bundle-secrets.mjs；只有 app/api/realtime/* 在伺服器端讀取。
    CF_REALTIME_APP_ID: process.env.CF_REALTIME_APP_ID,
    CF_REALTIME_APP_SECRET: process.env.CF_REALTIME_APP_SECRET,
    CF_TURN_KEY_ID: process.env.CF_TURN_KEY_ID,
    CF_TURN_KEY_API_TOKEN: process.env.CF_TURN_KEY_API_TOKEN,
    REALTIME_HEARTBEAT_TIMEOUT_SEC: process.env.REALTIME_HEARTBEAT_TIMEOUT_SEC,
    // DynamoDB table names used by server APIs
    DYNAMODB_TABLE_COURSES: process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses',
    DYNAMODB_TABLE_TEACHERS: process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers',
    DYNAMODB_TABLE_ENROLLMENTS: process.env.DYNAMODB_TABLE_ENROLLMENTS || 'jvtutorcorner-enrollments',
    DYNAMODB_TABLE_ORDERS: process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders',
    DYNAMODB_TABLE_POINTS_ESCROW: process.env.DYNAMODB_TABLE_POINTS_ESCROW || 'jvtutorcorner-points-escrow',
    DYNAMODB_TABLE_ROLES: process.env.DYNAMODB_TABLE_ROLES || 'jvtutorcorner-roles',
    DYNAMODB_TABLE_PAGE_PERMISSIONS: process.env.DYNAMODB_TABLE_PAGE_PERMISSIONS || 'jvtutorcorner-page-permissions',
    DYNAMODB_TABLE_WHITEBOARD_PERMISSIONS: process.env.DYNAMODB_TABLE_WHITEBOARD_PERMISSIONS || 'jvtutorcorner-whiteboard-permissions',
    DYNAMODB_TABLE_AGORA_LOGS: process.env.DYNAMODB_TABLE_AGORA_LOGS || 'jvtutorcorner-agora-logs',
    DYNAMODB_TABLE_CALENDAR_REMINDERS: process.env.DYNAMODB_TABLE_CALENDAR_REMINDERS || 'jvtutorcorner-calendar-reminders',
    // Platform reconciliation (integration/b2b-security-merge): new tables.
    DYNAMODB_TABLE_COURSE_SESSIONS: process.env.DYNAMODB_TABLE_COURSE_SESSIONS || 'jvtutorcorner-course-sessions',
    DYNAMODB_TABLE_CLASS_SUMMARIES: process.env.DYNAMODB_TABLE_CLASS_SUMMARIES || 'jvtutorcorner-class-summaries',
    DYNAMODB_TABLE_ORGANIZATIONS: process.env.DYNAMODB_TABLE_ORGANIZATIONS || 'jvtutorcorner-organizations',
    DYNAMODB_TABLE_ORG_UNITS: process.env.DYNAMODB_TABLE_ORG_UNITS || 'jvtutorcorner-org-units',
    DYNAMODB_TABLE_LICENSES: process.env.DYNAMODB_TABLE_LICENSES || 'jvtutorcorner-licenses',
    DYNAMODB_TABLE_ORG_INVOICES: process.env.DYNAMODB_TABLE_ORG_INVOICES || 'jvtutorcorner-org-invoices',
    // Billing foundation (Phase 0b): point ledger + AI/RTC cost meter.
    DYNAMODB_TABLE_POINT_TRANSACTIONS: process.env.DYNAMODB_TABLE_POINT_TRANSACTIONS || 'jvtutorcorner-point-transactions',
    DYNAMODB_TABLE_AI_USAGE_LEDGER: process.env.DYNAMODB_TABLE_AI_USAGE_LEDGER || 'jvtutorcorner-ai-usage-ledger',
    DYNAMODB_TABLE_COST_ROLLUPS: process.env.DYNAMODB_TABLE_COST_ROLLUPS || 'jvtutorcorner-cost-rollups',
    DYNAMODB_TABLE_AI_FEATURE_CONFIG: process.env.DYNAMODB_TABLE_AI_FEATURE_CONFIG || 'jvtutorcorner-ai-feature-config',
    // AI live teaching (Phase 3): lesson events + derived segments.
    DYNAMODB_TABLE_LESSON_EVENTS: process.env.DYNAMODB_TABLE_LESSON_EVENTS || 'jvtutorcorner-lesson-events',
    DYNAMODB_TABLE_LESSON_SEGMENTS: process.env.DYNAMODB_TABLE_LESSON_SEGMENTS || 'jvtutorcorner-lesson-segments',
    // Phase 3b: client gate for the (inert) recording-consent UI. Unset = off.
    // Recording ALSO needs the server flag CLASS_SUMMARY_ENABLED + both-party
    // consent before anything is captured.
    NEXT_PUBLIC_CLASS_SUMMARY_ENABLED: process.env.NEXT_PUBLIC_CLASS_SUMMARY_ENABLED || '',
    // Auth & HMAC Secrets
    // ⚠️ 絕對不要在此加上 `|| '<字串>'` 的 fallback：
    //    偽造的 HMAC 會讓 withAnyAuth 直接發出 role:'system' 的 session（等同完整後台權限）。
    //    缺少時應由 assertRequiredSecrets() 讓 build 失敗，而非靜默使用已進版控的公開字串。
    SESSION_SECRET: process.env.SESSION_SECRET,
    API_HMAC_SECRET: process.env.API_HMAC_SECRET,
    // Missing DynamoDB Tables
    DYNAMODB_TABLE_SESSIONS: process.env.DYNAMODB_TABLE_SESSIONS || 'jvtutorcorner-sessions',
    DYNAMODB_TABLE_PLAN_UPGRADES: process.env.DYNAMODB_TABLE_PLAN_UPGRADES || 'jvtutorcorner-plan-upgrades',
    DYNAMODB_TABLE_USER_POINTS: process.env.DYNAMODB_TABLE_USER_POINTS || 'jvtutorcorner-user-points',
    DYNAMODB_TABLE_PROFILES: process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles',
    AWS_REGION: process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1',
    AMPLIFY_REGION: process.env.AMPLIFY_REGION,
  }
};

/**
 * 以 phase 函式形式匯出，才能分辨「正式建置」與「本機 dev server」。
 * 機密檢查只在 production build 階段硬性失敗——
 * 那是產出物被送上線的唯一時機點。
 */
export default (phase: string) => {
  assertRequiredSecrets(phase === PHASE_PRODUCTION_BUILD);
  return nextConfig;
};
