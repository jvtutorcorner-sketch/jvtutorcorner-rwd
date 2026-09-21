---
name: classroom-rtc-providers
description: '教室影音、信令、白板供應商抽象（Agora、LiveKit、Cloudflare Realtime SFU、AWS API Gateway WebSocket、Netless、tldraw）與其 token／session API 的授權與設定檢查。Use when: switching NEXT_PUBLIC_RTC_PROVIDER, touching lib/providers/*, lib/livekit/*, lib/realtime/*, or debugging classroom connection/token errors.'
argument-hint: '描述要切換或除錯的供應商，例如：改用 Cloudflare SFU、LiveKit token 503'
metadata:
  verified-status: '⚠️ PARTIAL'
  last-verified-date: '2026-09-11'
  architecture-aligned: true
  related-skills: [classroom-room, classroom-room-whiteboard-sync, classroom-wait, cloud-hybrid-architecture, server-auth-guards]
---

# 教室 RTC 供應商 (Classroom RTC Providers)

教室頁面不直接呼叫任何 SDK，而是透過 `lib/providers/*` 的 hook 取得統一介面；以環境變數切換實作。**Agora 是現行正式路徑，其他供應商都是備援或實驗，預設關閉。**

## 切換開關

| 功能 | 開關 | 實作 |
|---|---|---|
| 影音 | `NEXT_PUBLIC_RTC_PROVIDER` = `agora`（預設）／`livekit`／`cloudflare-sfu`／`chime` | [lib/providers/rtc/useRTC.ts](../../../lib/providers/rtc/useRTC.ts) |
| 信令 | `NEXT_PUBLIC_SIGNALING_PROVIDER` | [lib/providers/signaling/useSignaling.ts](../../../lib/providers/signaling/useSignaling.ts) |
| 白板 | `NEXT_PUBLIC_WHITEBOARD_PROVIDER` | [lib/providers/whiteboard/useWhiteboardProvider.ts](../../../lib/providers/whiteboard/useWhiteboardProvider.ts) |

## 伺服器端 API

| 端點 | 授權 | 未設定時 |
|---|---|---|
| `GET /api/agora/token`、`/api/agora/rtm-token` | 登入 + 該堂課參與者 | 丟出錯誤（**不再**退回寫死的憑證） |
| `POST /api/livekit/token` | 登入 + [lib/livekit/authorizeJoin.ts](../../../lib/livekit/authorizeJoin.ts) | 503 |
| `POST /api/livekit/webhook` | LiveKit 簽章 | 503 |
| `POST /api/realtime/session`、`/tracks`、`PUT /renegotiate`、`GET/POST /room` | 登入 + 綁定本人的 SFU session（[lib/realtime/guard.ts](../../../lib/realtime/guard.ts)） | 503 |
| `POST /api/signaling/token` | 登入 | 503 |
| `POST /api/netless/room` | 登入 + 課程參與者 | 回 mock room（已知缺口） |

### Cloudflare Realtime SFU（Phase B）

- 伺服器代理 Cloudflare API（`https://rtc.live.cloudflare.com/v1/apps/:appId`），app secret 永不送到瀏覽器。
- [lib/realtime/validate.ts](../../../lib/realtime/validate.ts) 只允許 `trackName` 為 `audio`／`video`，並檢查 session id 格式；[lib/realtime/participants.ts](../../../lib/realtime/participants.ts) 依身分去重、排除 admin、已離開與心跳逾時（45 秒）的參與者。
- 參與者的 SFU session 記在課程 session 的 `sfuSessions` map（[lib/realtime/registry.ts](../../../lib/realtime/registry.ts)），client 每 15 秒心跳。
- 靜音用 `track.enabled = false`，不要停掉 track——Cloudflare 會回收 30 秒沒有封包的軌道。
- TURN：設定 `CF_TURN_KEY_ID`／`CF_TURN_KEY_API_TOKEN` 時動態產生 ICE servers，否則只有 STUN。

完整規劃與驗收清單見 [docs/hybrid-architecture-plan.md](../../../docs/hybrid-architecture-plan.md) §6。

## 相關檔案

- 影音：[lib/providers/rtc/useAgoraRTCProvider.ts](../../../lib/providers/rtc/useAgoraRTCProvider.ts)、[lib/providers/rtc/useLiveKitProvider.ts](../../../lib/providers/rtc/useLiveKitProvider.ts)、[lib/providers/rtc/useCloudflareSfuProvider.ts](../../../lib/providers/rtc/useCloudflareSfuProvider.ts)、[lib/providers/rtc/useChimeProvider.ts](../../../lib/providers/rtc/useChimeProvider.ts)
- 信令：[lib/providers/signaling/useAgoraRTMProvider.ts](../../../lib/providers/signaling/useAgoraRTMProvider.ts)、[lib/providers/signaling/useAwsApigwSignaling.ts](../../../lib/providers/signaling/useAwsApigwSignaling.ts)
- 白板：[lib/providers/whiteboard/useNetlessWhiteboard.ts](../../../lib/providers/whiteboard/useNetlessWhiteboard.ts)、[lib/providers/whiteboard/useTldrawWhiteboard.ts](../../../lib/providers/whiteboard/useTldrawWhiteboard.ts)
- LiveKit：[lib/livekit/config.ts](../../../lib/livekit/config.ts)、[lib/livekit/token.ts](../../../lib/livekit/token.ts)、[lib/livekit/webhookHandler.ts](../../../lib/livekit/webhookHandler.ts)、[docs/livekit-migration/](../../../docs/livekit-migration/)、[cloudformation/livekit-ec2.yml](../../../cloudformation/livekit-ec2.yml)
- Cloudflare SFU：[lib/realtime/config.ts](../../../lib/realtime/config.ts)、[lib/realtime/sfuApi.ts](../../../lib/realtime/sfuApi.ts)、[app/api/realtime/](../../../app/api/realtime/)
- 出席欄位：[lib/types/courseSession.ts](../../../lib/types/courseSession.ts)
- 測試：[e2e/classroom_rtc_providers_verification.spec.ts](../../../e2e/classroom_rtc_providers_verification.spec.ts)、[scripts/verify-realtime-sfu-guards.mjs](../../../scripts/verify-realtime-sfu-guards.mjs)、[e2e/signaling/](../../../e2e/signaling/)（搭配 [playwright.phase1.config.ts](../../../playwright.phase1.config.ts)）

## 測試指令

```bash
# 授權 contract（未設定的供應商必須回 503）
npx playwright test e2e/classroom_rtc_providers_verification.spec.ts --project=chromium

# Cloudflare SFU 的驗證／授權純函式（19 項）
node scripts/verify-realtime-sfu-guards.mjs

# AWS WebSocket 信令 Phase 1
npx playwright test --config=playwright.phase1.config.ts
```

## 環境驗證 (Environment Validation)

- Agora：`AGORA_APP_ID`、`AGORA_APP_CERTIFICATE`
- LiveKit：`LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`（另有 `LIVEKIT_EARLY_JOIN_*`／`LIVEKIT_GRACE_*`／`LIVEKIT_MAX_TTL_*` 時間窗，Cloudflare SFU 共用）
- Cloudflare SFU：`CF_REALTIME_APP_ID`、`CF_REALTIME_APP_SECRET`；TURN 選用 `CF_TURN_KEY_ID`、`CF_TURN_KEY_API_TOKEN`
- 信令：`SIGNALING_TOKEN_SECRET`、`NEXT_PUBLIC_SIGNALING_WS_URL`
- Netless：`NETLESS_SDK_TOKEN` 或 `NETLESS_APP_ID` + `NETLESS_APP_SECRET`

`CF_REALTIME_APP_SECRET`、`CF_TURN_KEY_API_TOKEN` 已列入 `npm run check:bundle-secrets`。

## 故障排除

- **Cloudflare SFU 對方畫面約 30 秒後消失**：有人用 `track.stop()` 靜音，改用 `enabled = false`。
- **SFU 呼叫偶發 429**：每個 session 每秒 50 次上限；檢查是否在迴圈中 renegotiate。
- **LiveKit token 503**：三個 `LIVEKIT_*` 變數缺一不可。
- **待驗證**：本機沒有 Cloudflare 憑證，SFU 的「已設定」分支（400／200）與實際雙向連線尚未驗證，因此狀態為 PARTIAL。
- **已知缺口**：`/api/netless/room` 未設定時先回 mock room，才做課程檢查；`/api/whiteboard/room` 的 App ID 格式錯誤會在欄位驗證前回 500。

## 相關技能

- [classroom-room](../classroom-room/SKILL.md)、[classroom-room-whiteboard-sync](../classroom-room-whiteboard-sync/SKILL.md)、[classroom-wait](../classroom-wait/SKILL.md)
- [cloud-hybrid-architecture](../cloud-hybrid-architecture/SKILL.md)：為什麼要換 SFU、成本比較。
