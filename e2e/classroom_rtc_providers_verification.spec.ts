/**
 * 對應 skill: .agents/skills/classroom-rtc-providers/SKILL.md
 *
 * 教室影音／白板／信令供應商的 API contract。未設定的供應商必須回 503（而不是退回寫死的憑證或放行）；
 * 已設定時改驗授權與欄位檢查。授權白名單本身由 scripts/verify-realtime-sfu-guards.mjs 以純函式測試。
 *
 *   npx playwright test e2e/classroom_rtc_providers_verification.spec.ts --project=chromium
 */
import { test, type APIRequestContext } from '@playwright/test';
import { contractTitle, runContractCase, studentContext, type ContractCase } from './helpers/auth-helpers';

const CF_REALTIME = !!(process.env.CF_REALTIME_APP_ID && process.env.CF_REALTIME_APP_SECRET);
const LIVEKIT = !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
const SIGNALING = !!process.env.SIGNALING_TOKEN_SECRET;
const NETLESS = !!(process.env.NETLESS_SDK_TOKEN || (process.env.NETLESS_APP_ID && process.env.NETLESS_APP_SECRET));

test.describe('教室 RTC 供應商 Verification (classroom-rtc-providers)', () => {
  let student: APIRequestContext;

  test.beforeAll(async () => {
    student = (await studentContext()).request;
  });
  test.afterAll(async () => {
    await student?.dispose();
  });

  const cf = (configured: number | number[]) => (CF_REALTIME ? configured : 503);
  const CASES: ContractCase[] = [
    // LiveKit
    { who: 'G', method: 'POST', path: '/api/livekit/token', body: {}, expect: 401 },
    { who: 'S', method: 'POST', path: '/api/livekit/token', body: {}, expect: LIVEKIT ? [400, 404] : 503, note: LIVEKIT ? '已設定' : '未設定 → 503' },
    { who: 'G', method: 'POST', path: '/api/livekit/webhook', body: {}, expect: LIVEKIT ? 401 : 503, note: '無簽章' },

    // Cloudflare Realtime SFU
    { who: 'G', method: 'POST', path: '/api/realtime/session', body: {}, expect: 401 },
    { who: 'S', method: 'POST', path: '/api/realtime/session', body: {}, expect: cf(400), note: CF_REALTIME ? '缺 roomId' : '未設定 → 503' },
    { who: 'G', method: 'GET', path: '/api/realtime/room', expect: 401 },
    { who: 'S', method: 'GET', path: '/api/realtime/room', expect: cf(400) },
    { who: 'S', method: 'POST', path: '/api/realtime/room', body: {}, expect: cf(400) },
    { who: 'G', method: 'POST', path: '/api/realtime/tracks', body: {}, expect: 401 },
    { who: 'S', method: 'POST', path: '/api/realtime/tracks', body: {}, expect: cf(400) },
    { who: 'S', method: 'PUT', path: '/api/realtime/tracks', body: {}, expect: cf(400) },
    { who: 'S', method: 'PUT', path: '/api/realtime/renegotiate', body: {}, expect: cf(400) },

    // AWS API Gateway WebSocket 信令
    { who: 'G', method: 'POST', path: '/api/signaling/token', body: {}, expect: 401 },
    { who: 'S', method: 'POST', path: '/api/signaling/token', body: {}, expect: 400, note: '缺 channelName／userId' },
    {
      who: 'S', method: 'POST', path: '/api/signaling/token',
      body: { channelName: 'e2e-verification', userId: 'e2e-verification' },
      expect: SIGNALING ? 200 : 503, note: SIGNALING ? '已設定' : '未設定 → 503',
    },

    // Agora／Netless（現行）
    { who: 'G', method: 'GET', path: '/api/agora/token?channelName=e2e&courseId=e2e-nonexistent', expect: 401 },
    { who: 'S', method: 'GET', path: '/api/agora/token?channelName=e2e&courseId=e2e-nonexistent', expect: 403, note: '不是這堂課的參與者' },
    { who: 'G', method: 'GET', path: '/api/agora/rtm-token?userId=e2e', expect: 401 },
    { who: 'G', method: 'POST', path: '/api/netless/room', body: { courseId: 'e2e-nonexistent' }, expect: 401 },
    {
      who: 'S', method: 'POST', path: '/api/netless/room', body: { courseId: 'e2e-nonexistent' },
      expect: NETLESS ? 403 : 200, note: NETLESS ? '不是這堂課的參與者' : '未設定時回 mock room（已知缺口）',
    },
    { who: 'G', method: 'POST', path: '/api/whiteboard/room', body: {}, expect: 401 },
    { who: 'S', method: 'POST', path: '/api/whiteboard/room', body: {}, expect: [400, 500], note: 'App ID 格式錯誤時先 500' },
    { who: 'G', method: 'GET', path: '/api/whiteboard/state', expect: 401 },
    { who: 'G', method: 'POST', path: '/api/whiteboard/event', body: {}, expect: 401 },
  ];

  for (const c of CASES) {
    test(contractTitle(c), async ({ request }) => {
      await runContractCase(c, { guest: request, student });
    });
  }
});
