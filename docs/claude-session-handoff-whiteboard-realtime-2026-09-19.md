# JV Tutor Corner — 教室即時白板 知識庫交接（2026-09-19）

> 給下一個 Claude:讀完這份就能 100% 銜接。全部改動**尚未 commit**。本機測試環境仍在跑。先讀「§0 立即須知」再往下。

---

## §0 立即須知（環境與硬性限制）

- **平台**:Next.js 16 (App Router, SSR/Lambda on Amplify)、DynamoDB、S3。Windows 開發機,PowerShell 主、Git Bash 可用。
- **`.env.local` 是「正式環境設定」**:內含 `APP_ENV=production` 與**正式 AWS 憑證**。本機跑任何東西都要覆寫成 local:`APP_ENV=local NEXT_PUBLIC_PAYMENT_MOCK_MODE=true DISABLE_RATE_LIMIT=true`。
- **本機 dev server**:用 `.claude/launch.json` 的 **`next-dev-e2e-3005`** 設定(port **3005**,已內建上面三個 + `NEXT_PUBLIC_USE_AGORA_WHITEBOARD=false` + 白板測試旗標)。用 `preview_start`(MCP)啟動,**不要用 Bash 跑 dev server**。
  - ⚠ **port 3000 是別的專案(`D:\akade-point`)**,不要用;jvtutorcorner 一律用 3005,並顯式設 `NEXT_PUBLIC_BASE_URL=http://localhost:3005`(否則 Playwright 的 `reuseExistingServer` 會誤連 akade-point)。
- **規則**:未經指示**不要 commit / push**;對正式環境的壓測、寫入、金流、email 需**逐次取得同意**;不要 bulk-cleanup 正式資料;保留 Agora(只是回退);保留各檔原本換行(多為 CRLF)。
- **測試帳號**:`autoLogin(page, email, pwd, bypassSecret)`(`e2e/helpers/whiteboard_helpers.ts`);憑證由 `getTestConfig()`(`e2e/test_data/whiteboard_test_data.ts`)從 `.env.local` 讀(`TEST_TEACHER_*`/`TEST_STUDENT_*`/`LOGIN_BYPASS_SECRET`)。本機示範帳號:teacher `lin@test.com`、student `pro@test.com`。
- **bash 保留字雷**:e2e 用環境變數 **`WB_GROUPS`**,不是 `GROUPS`(bash 內建唯讀變數,`GROUPS=N` 前綴傳不進 process)。

---

## §1 這個 Session 在做什麼(主線)

目標:讓「教室即時白板」的畫筆同步**像 Agora 一樣順、又不把資料庫塞爆**,並找出 MVP 上線後**成本可預測**的架構。

本專案白板有三種模式(由 `NEXT_PUBLIC_USE_AGORA_WHITEBOARD` 選):
- **Agora/Netless**(=true,正式環境現況):付費 SDK,順但貴。
- **Canvas 自繪白板**(=false → `components/EnhancedWhiteboard.tsx`):本 session 的主角。
- SSE demo 頁(`/admin/whiteboard_*`,只是控制台)。

Session 的演進(每一步都是使用者逐步要求):
1. 用 canvas 白板、3 組師生、開瀏覽器測畫筆同步 → 發現**根本不同步**。
2. 找出並修好同步 bug(SSE 傳輸壞掉 → 改走 DynamoDB 輪詢)。
3. 比較 Netless vs canvas vs Render-WS 成本;實測 DynamoDB 寫入成本。
4. 「像 Agora、別塞 DB」→ 做 **B 單一快照模型**。
5. 「用 UDP 讓 canvas 順」→ 做 **WebRTC DataChannel(P2P/UDP)** POC。
6. 1~5 組、加大畫筆、headed、10 組壓測 + 與 Agora 比較差異。
7. **補齊與 Agora 的差距**(NAT/丟包/角色/晚進/重連/訊令/接教室)——← **目前完成到這裡**。

---

## §2 關鍵技術結論(踩過的坑 = 別再踩)

1. **Canvas 白板的同步在 localhost/dev 原本是壞的**。原因:client 在非正式環境走 SSE(`/api/whiteboard/stream`);但 **Next.js 每個 route module 各自獨立記憶體**,`POST /api/whiteboard/event` 與 SSE stream 的 `broadcastToUuid()`/`clients` map **不是同一份** → SSE 只送一次 init-state,之後的筆畫永遠推不到。正式環境沒事是因為它走**輪詢 `/api/whiteboard/state`(讀 DynamoDB)**。修法:localhost 也改走輪詢(`components/EnhancedWhiteboard.tsx` 的 `usePolling` 加上 localhost)。
2. **DynamoDB 寫入放大(實測)**:舊模型把所有筆畫塞一個 item,每次 `stroke-update` 重寫整塊 → **WCU = item 大小(≈0.68KB/筆)**;76 筆時每次寫 52 WCU,總量 O(N²)。實測每畫 1 筆約 6 次寫 + 每次先強一致讀。→ 不清空的大板成本會失控(@50 堂/日 可從 ~$30 飆到 ~$225/月)。
3. **成本對照(每堂 50 分、2 人,估算)**:Netless ~$0.38/堂(付費 SDK,線性可預測);Canvas+DynamoDB ~$0.02–0.15/堂(**二次成長、不可預測**);Render-WS+Yjs ~固定月費(最可預測)。**白板不是成本大頭,Agora 影音(RTC)才佔 ~93%**。
4. **「像 Agora」的正解 = 傳輸與儲存分離**:即時筆畫走即時通道(不落 DB),DB 只留一份「當前板面快照」。瀏覽器不能開原生 UDP,唯一的 UDP 路徑是 **WebRTC DataChannel**(TURN 時退 TCP)。
5. **Agora vs 我們的 P2P DataChannel 差異**:Agora = 託管中繼網路(SD-RTN),任何網路都通、可 1 對多、零維運、但付費;我們 = P2P 直連,1 對 1 最省最順,但需 STUN/TURN 穿 NAT、1 對多要換 SFU、維運自扛。**10 組 headed 崩潰是單機開 20 視窗的資源上限,不是傳輸上限**(headless 10 組全過)——真實環境每人各自裝置,不會擠一台。
6. **自己踩的握手坑**:把 signaling mailbox 從 atomic `list_append` 改成 read-modify-write + 「新 offer 重置」→ **併發丟 ICE candidate、握手訊息被刪 → DataChannel 開不起來**。已改回 atomic append。
7. **e2e 坑**:Playwright 手動建的 `browser.newContext()` 不會自動關,累積的 context 會**拖垮下一個測試的 WebRTC 握手** → 一定要 `afterEach` 關閉。

---

## §3 目前架構(canvas 白板即時同步)

三層傳輸,**由上往下自動回退**(全部 `NEXT_PUBLIC_WHITEBOARD_RTC=1` 才啟用 RTC 層;未設定則行為同以前):

```
[即時] WebRTC DataChannel (P2P/UDP)  ← 主路徑,筆畫不進 DB
          │ 開不起來 / 未連上
[近即時] DynamoDB 單一快照 (只有 offerer 寫,~5s 一次)  ← 重整/晚進/冷啟動回退
          │
[回退]  /api/whiteboard/state 輪詢 (自適應 400ms→2.5s，DataChannel 開通時暫停)
```

- **雙 DataChannel**:`wb-ctl`(可靠有序:stroke-start、**最終** stroke-update(`final:true`)、undo/redo/clear/set-page、state)、`wb-pts`(不可靠、`maxRetransmits:0`:繪製中的**增量點**,丟包不重傳,最終筆畫修復缺口)。
- **角色選舉**:老師 offer;同角色以 id 字典序 → 不會雙方都 offer。
- **晚進**:`wb-ctl` 開通時要 `request-state`,對方以 `chunkState` 分塊回,依 id 合併(保留本地未同步筆畫)。
- **重連**:`pc.connectionState` failed/disconnected(>5s)→ 指數退避重握手;`seen` 集合跨重連保留,避免重放舊 offer。
- **訊令**:
  - **教室**:走既有 RTM(`useSignaling`)的 `custom` 訊息,`ClientClassroom` 以 `wbRtcSignal` 接入(不動型別聯集)。
  - **Demo/dev**:DB mailbox `/api/whiteboard/signal`(atomic append、10 分 TTL、`since`、非 demo channel 需 `verifyClassroomAccess`)。
- **ICE/TURN**:`GET /api/whiteboard/ice` 重用 `lib/realtime/sfuApi.ts` 的 `generateIceServers`(Cloudflare TURN,和 SFU 共用 1TB 免費);未設 CF TURN 退回 Cloudflare STUN。

---

## §4 檔案清單(本 session 改動,全部未 commit)

**新增**
| 檔案 | 作用 |
|---|---|
| `lib/whiteboard/rtcProtocol.ts` | 純邏輯(可離線測):`electOfferer`、`encodePointsDelta`/`applyPointsDelta`、`chunkState`/`assembleState`、`mergeStateById`、`reduceMailbox`、常數 `CTL_LABEL`/`PTS_LABEL` |
| `scripts/verify-whiteboard-rtc.mjs` | rtcProtocol 離線驗證(18/18)。跑法見 §6 |
| `app/api/whiteboard/ice/route.ts` | `GET`,回 iceServers(TURN→STUN 回退),`withAuth` |
| `app/api/whiteboard/signal/route.ts` | WebRTC signaling mailbox(demo/dev 回退;已加固) |
| `app/whiteboard-demo/page.tsx` | 免登入報名的白板 demo 頁(`?channel=&role=&both=1`) |
| `e2e/whiteboard-demo/canvas_demo.spec.ts` | e2e:N 組同步 + 晚進 + 重連 |
| `lib/whiteboardStrokes.ts` | append-only 每筆一 item 的存取(POC,量測用,現未啟用) |
| `scripts/create-whiteboard-strokes-poc-table.mjs` | 建 append-only POC 表(`jvtutorcorner-whiteboard-strokes`,已建、未用、可刪) |
| `scripts/spike-centrifugo/` | Centrifugo Phase-1 spike(見 §7) |

**修改**
| 檔案 | 改了什麼 |
|---|---|
| `components/EnhancedWhiteboard.tsx` | 傳輸修正(SSE→輪詢)、自適應輪詢、單一快照(`snapshot` 事件)、**WebRTC DataChannel 傳輸**、共用 `applyRemoteEvent`、測試 hook `window.__wb_setTool/__wb_setWidth/__wb_clear/__wb_strokeCount/__wb_rtc_debug`。新 props:`rtcRole`、`rtcSelfId`、`rtcSignal`(export `type WbRtcSignal`) |
| `app/api/whiteboard/event/route.ts` | 新增 `snapshot` 事件 → `saveWhiteboardState` 覆寫單一 item |
| `app/api/whiteboard/state/route.ts` | 支援 append-only 讀(POC,旗標關時走原路) |
| `lib/whiteboardService.ts` | `WB_CAP_LOG=1` 時記錄各 DynamoDB op 的實測 ConsumedCapacity |
| `app/classroom/ClientClassroom.tsx` | 建 `wbRtcSignal`(RTM `custom`),把 `rtcRole`/`rtcSelfId=presenceId`/`rtcSignal` 傳給 `<EnhancedWhiteboard>` |
| `.claude/launch.json` | 新增 `next-dev-e2e-3005` 設定 |

**旗標(build-time / server env)**
- `NEXT_PUBLIC_WHITEBOARD_RTC=1` 開 WebRTC 傳輸;`NEXT_PUBLIC_WHITEBOARD_SNAPSHOT=1` 開單一快照;`NEXT_PUBLIC_WHITEBOARD_RTC_FORCE_RELAY=1` 強制走 TURN relay(驗證用);`WB_CAP_LOG=1` 記錄 DynamoDB 容量;`NEXT_PUBLIC_WHITEBOARD_TRANSPORT=sse` 才會走(壞的)SSE。

---

## §5 EnhancedWhiteboard.tsx 內部邏輯(給要改的人)

- **`postEventToServer(event)`**:RTC 開通 → `wb-pts` 送增量(非 final 的 stroke-update)、其餘走 `wb-ctl`;只有 offerer 排一次快照。RTC 未開 → 若 SNAPSHOT 模式排快照,否則 POST `/api/whiteboard/event`。
- **`applyRemoteEvent(data, reply?, opts?)`**(放在 `applyRemoteEventRef`,BC/SSE/DataChannel 共用):處理 setColor/setTool/setWidth/set-page/pdf-set/**pts**/stroke-start/stroke-update/undo/redo/clear/request-state/state。`opts.mergeById` 用於 RTC 晚進的 state 合併。
- **RTC useEffect**(deps: `RTC_MODE, channelName, useNetlessWhiteboard, rtcRole, rtcSelfId, rtcSignal`):`start()` 內做 getIce → new pc → hello 廣播 → `electOfferer` → offerer 建雙通道 + offer → 收 answer/candidate → 開通。`scheduleReconnect()` 指數退避。`window.__wb_rtc_debug.drop()` 測試用。
- **輪詢 `tick`**:RTC 開通時跳過 `fetchAndApply`(省 DB 讀)。
- **快照 `scheduleSnapshotRef`**:節流 + trailing;RTC 模式 `MAXWAIT=5000ms`,否則 1500ms。
- 重要 ref:`dcRef`(wb-ctl,=「RTC 是否 live」)、`dcPtsRef`(wb-pts)、`sentPointsRef`(每筆已送點數)、`isOffererRef`、`strokesRef`(單一真實來源)、`drawIncremental`(增量畫)。

---

## §6 如何跑 / 驗證(精確指令)

**啟動 dev server(canvas 模式 + RTC)**:用 MCP `preview_start` 跑 `next-dev-e2e-3005`(已含 `NEXT_PUBLIC_WHITEBOARD_RTC=1` + `SNAPSHOT=1` + `WB_CAP_LOG=1`)。等 `curl -s -o /dev/null -w '%{http_code}' http://localhost:3005/` 回 200。

**型別 / 離線 / lint**:
```bash
npx tsc --noEmit -p tsconfig.json          # app,期望 0
npx tsc --noEmit -p tsconfig.e2e.json      # e2e,期望 0
node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-whiteboard-rtc.mjs   # 18/18
npm run lint:ci                            # 0 errors(警告 ≤ 上限)
```

**e2e(headless;WB_GROUPS 不是 GROUPS)**:
```bash
WB_GROUPS=5 HEADLESS=true DEMO_DURATION_SEC=18 \
  NEXT_PUBLIC_BASE_URL=http://localhost:3005 APP_ENV=local \
  npx playwright test e2e/whiteboard-demo/canvas_demo.spec.ts --project=chromium
```
含三個測試:N 組同步、晚進、重連。旋鈕:`DEMO_STROKE_WIDTH`、`DEMO_STROKE_POINTS`、`DEMO_STROKE_GAP_MS`、`DEMO_DURATION_SEC`、`DEMO_LOG_CONSOLE=1`(印 `[WB RTC]`)。目視版:`HEADLESS=false WB_GROUPS=3`(≤5 組;更多會撞單機視窗上限,用 headless)。

**目前實測結果(本機、localhost loopback、headless)**:
- 5 組全部雙向開通、13/13 同步、有墨;晚進恢復板面;重連恢復(studentOpens=2)——**3/3 pass**。
- 1~5 組先前逐組驗證同步全過;延遲 0–1ms(loopback,非真實網路)。
- `WB_CAP_LOG` 證實 RTC 開通後每房只有 ~1 次快照寫入 / 4–5 秒(offerer),筆畫不進 DB。

**ICE 路由**:已登入 cookie `GET /api/whiteboard/ice` → 未設 CF TURN 回 Cloudflare STUN;有設回含 `turn:` 的 iceServers。

---

## §7 更早的 session 成果(已完成,供背景)

- **course-sessions `byStatus` GSI**:已在正式環境建立(ACTIVE),表目前 0 筆(`createCourseSession` 零呼叫者)。`setup-db.mjs` 加了 `--only`/`--dry-run`;**正式環境絕不可跑裸 `setup-db`**(enrollments/courses 還缺 4 個索引,舊程式會寫 null 鍵)。詳見 `docs/classroom-concurrency-handoff-2026-09-15.md` §15。
- **Centrifugo Phase-1 spike**:`scripts/spike-centrifugo/`,3/3 全過(跨實例 presence、leave 2–5ms、fan-out p95 3–5ms)。結論:Phase 1 信令/presence 採 Centrifugo,估省 1.5–2 人週。handoff §16。
- **架構計畫全文**:`C:\Users\Attlie\.claude\plans\3-5-redis-parsed-phoenix.md`(Render 常駐服務 + Redis + WS + Cloudflare SFU + tldraw/Hocuspocus;附錄 A 索引、附錄 B 開源評估)。本次 RTC 補齊計畫:`C:\Users\Attlie\.claude\plans\ancient-swimming-hejlsberg.md`。
- 本次白板 RTC 細節另見 `docs/classroom-concurrency-handoff-2026-09-15.md` §17。

---

## §8 目前狀態與下一步

**狀態**:上述全部**未 commit**;dev server(:3005)仍開著測試旗標;`jvtutorcorner-whiteboard-strokes`(append-only POC 表)已建、未用;`test-results/` 有一些失敗截圖(headed 20 視窗崩潰、握手修復前的殘留)。

**建議下一步(擇一,等使用者指示)**:
- (a) **收尾**:關 dev server、拿掉量測旗標(`WB_CAP_LOG`)、刪 append-only POC 表、清 `test-results/`。
- (b) **分批 commit**:傳輸修正 / 自適應輪詢 / 單一快照 / WebRTC DataChannel + signaling + ICE / e2e。
- (c) **更接近真實網路的驗證**:設 CF TURN 憑證,`NEXT_PUBLIC_WHITEBOARD_RTC_FORCE_RELAY=1` 跑一組,量真實 RTT 與 relay 佔比;真實斷網的重連最壞值。
- (d) **接續架構計畫**:Phase 1(Centrifugo/Render WS)或 Phase 2(Cloudflare SFU 影音 + escrow 結算)。

**尚未做(明確不在本次範圍)**:1 對多(需 SFU)、錄影、移除 Agora、把 canvas 白板設為正式環境預設(仍是 Netless)。

**commit 屬名**(若使用者要求 commit):
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
