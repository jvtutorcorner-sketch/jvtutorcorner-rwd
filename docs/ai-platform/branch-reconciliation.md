# 分支收斂盤點(Phase 0a-1,唯讀)

> 產出於 2026-09-21。**本文件不執行任何 merge**;僅盤點 `main` ↔ `integration/b2b-security-merge` ↔ `stash@{0}` 的差異,並提出建議的合併批次順序,交由使用者確認。
> 對應計畫:`docs/ai-platform/architecture-and-cost-plan-2026-09-21.md` §13 Phase 0a、§14 工單 0a-1…0a-9。

## 0. 關鍵事實:這是**雙向**分歧,不是「integration 領先」

- 合併基準(merge-base):`d1f22d4 fix(i18n): wire up translations on the create-account and enterprise registration pages`。
- `git rev-list --left-right --count main...integration` = **main 領先 18 / 落後 21**。
- `git diff --stat main integration` = **559 檔、+52,968 / −20,430 行**。這是大型合併,必須逐批、每批綠燈、不 force。
- 兩邊各有一版首頁改版且動到幾乎相同的檔案與行數:main `bf6b39c` vs integration `e9fa8ea`(both 動 `app/ClientHomePage.tsx` 799 行、`components/CourseCard.tsx` 132 行…)。memory 記載「首頁改版已上 main(bf6b39c)」→ **以 main 的首頁為準**,integration 的 e9fa8ea 視為較早的平行版本,合併時取 main 側。

因此**不能**把 integration 整支合進 main(會回退 main 的 /apps 重構與首頁),也不能把 main 整支合進 integration。策略:**以 main 為基底,從 integration 挑出 main 缺少的地基能力,逐批 cherry-pick / 移植**,首頁與 /apps 衝突一律取 main。

## 1. main 有、integration 沒有(這些**不可被回退**)

main 落後 integration 的 18 個 commit,全是 /apps 整合重構(Phase 0–5)、email 診斷、首頁修補:

```
9c436f8 fix(auth): verify-email redirect must use external origin, not req.url
c347f49 / 1250a72 / 94000f4  fix(apps): wrap useSearchParams pages in Suspense（解 build）
36e7b74 docs(apps): Phase 5 — registry, skill docs & e2e
abf2dcf feat(apps): Phase 4 — DB-backed AI Skills, Platform Agents & catalog admin
2c903ed feat(apps): Phase 3 — schema-driven marketplace UI
3c4f455 feat(integrations): Phase 2 — /api/integrations API + consumers
7e9710c feat(integrations): Phase 1 — provider registry, store, new tables & migration
0edaf79 feat(apps): Phase 0 — secure app-integrations API（止血明文金鑰外洩）
38d01c4 / 7f645f7 / 1dec4e9  email 驗證診斷
5eb52b9 / b5e1f91 / bf6b39c  首頁 Hero carousel / 改版
51d36aa / c34fbe1  build 韌性、profile lookup 不 throw
```

→ 收斂後這些必須全部留在 main。integration 對 `lib/integrations/*`、`app/apps/*`、首頁的任何改動,合併時**取 main 側**。

## 2. integration 有、main 沒有(地基能力,本規劃要用)

main 領先數字的另一面 = main 缺這 21 個 commit 的能力。按主題分組(即建議的合併批次):

| 批次 | integration commits | 帶進來的關鍵檔(main 皆無) | 本規劃用途 |
|---|---|---|---|
| **B1 安全地基** | `bd85fe7` API auth hardening + classroom/whiteboard guards、`3948934` org-unit GSI null-key + auth、`05430d8` untrack 憑證備份 | `lib/auth/{classroomAccess,pageGuard,courseOwnership,internalFetch}.ts`、Agora token 路由守門、`stripTabId` 修正 | Day 0 熱修的完整版;§16 token 敞口、classroom access |
| **B2 schema/setup-db** | `12c668d` repair B2B/B2C data、(schema DSL 相關) | `scripts/lib/schema.mjs`、`scripts/verify-schema.mjs`、`scripts/repair-b2b-data.mjs`、`scripts/create-rate-limit-table.mjs` | §8 新表都靠 schema DSL + `setup-db --only=` |
| **B3 課程 Session + 結算** | `40b3b02` release escrow on Agora class end、`841d3f3` refund 審核流程、`7406e28` seat licences、`7cc64dc` enterprise console | `lib/courseSessionService.ts`、`lib/types/courseSession.ts`、`lib/{enrollmentService,seatAccounting,plans,teacherIdentity}.ts`、`app/api/classroom/complete/route.ts` | §1 Cost Meter 的 RTC 用量來源;§7 escrow 抽成;§8 Session 實體 |
| **B4 rate limit + 帳號狀態** | `8b1c00d` rate limiting + account status | `lib/rateLimit.ts`、`lib/identity.ts` | §16 AI 成本失控緩解;0b-6 建表 |
| **B5 RTC / SFU** | `7881bcb` Cloudflare Realtime SFU 第 4 個 provider、`ab042cc` unify S3/R2 storage | `lib/providers/rtc/useCloudflareSfuProvider.ts`、`lib/realtime/{config,sfuApi,guard,validate,participants,registry}.ts`、`app/api/realtime/*`、LiveKit 全套 | §5/§13 Phase 1 RTC 遷移 |
| **B6 MVP 文件/測試** | `2e41ccd` MVP spec + full-journey helpers、`3bbcb61` 測試批次、`bc307d0` SEO/permissions、`25f411b` admin user mgmt、`4dffce8` CI blocking、amplify credential 系列(`34093a7`/`0c7012a`/`df90e35`) | `docs/MVP.md`、e2e helpers、CI 設定 | 驗收基準、CI 綠燈門檻 |

> 注意 `5e6120e merge: integrate fix/b2b-data-structure` 是 integration 內部的 merge commit,cherry-pick 時要挑其帶入的實檔,不是挑 merge 本身。

## 3. 只在 `stash@{0}` 的(WIP,未成 commit)

`stash@{0}: WIP on integration/b2b-security-merge`(即 e9fa8ea 之上的工作)含:
- `components/EnhancedWhiteboard.tsx` 的 WebRTC DataChannel wiring(7 處 `rtcRole`/`WHITEBOARD_RTC`)
- `app/classroom/ClientClassroom.tsx` 的白板 RTC 接線
- 部分 `lib/realtime/*`、`lib/pointsEscrow.ts` 的 TransactWrite 版本、`app/api/classroom/ready` 的 members-map 修正

→ 這些是 main 工作樹上「untracked 但無法編譯」那批檔的**相依另一半**。B5/B3 合併後,再從 stash 取這部分(0a 最後一批)。

## 4. main 工作樹現有 untracked 檔的處置

`git status` 顯示大量 untracked(`app/rtc-harness`、`lib/realtime/ice.ts`、`app/api/realtime/{ice,telemetry}`、`lib/whiteboard/rtcProtocol.ts`、`app/api/whiteboard/{ice,signal}`、`lib/classSummary/*`、`app/api/class-summaries/*` 等)。這些 import 不到相依(相依在 integration/stash),**目前無法編譯**。
處置:0a-2 先開 `backup/main-2026-09-21` 保底 → 這些 untracked 檔**先不 commit 進 main**,等對應批次(B5 帶入 `lib/realtime/{config,sfuApi}`、B3 帶入 courseSession)合併後,untracked 檔的相依補齊,再連同一起 commit;無法補齊相依的(如純 demo `app/whiteboard-demo`)另議去留。

## 5. 建議合併順序(每批出口 = `npx tsc --noEmit`(app+e2e)、`next build`、對應 `verify-*.mjs` 全綠;不 force)

```
0a-2  開 backup/main-2026-09-21;盤點 untracked
B1 安全地基      → 含 Day 0 熱修的完整版(token 守門、classroomAccess、stripTabId)
B2 schema/setup-db → schema.mjs + verify-schema + repair(prod 建表用 --only=,逐次徵得同意)
B3 Session+結算   → courseSessionService + classroom/complete + escrow(release on end)
B4 rate limit     → rateLimit + identity + account status
B5 RTC/SFU        → useCloudflareSfuProvider + lib/realtime/* + storage 統一
                    (補齊 main untracked 的 lib/realtime/ice.ts 等相依)
B6 MVP 文件/測試   → MVP.md + e2e helpers + CI blocking
stash 白板 RTC     → EnhancedWhiteboard/ClientClassroom DataChannel wiring + pointsEscrow TransactWrite
0a-9 補守門        → PATCH /api/orders/[orderId]、/api/points-escrow、/api/chat、/api/translate、
                    /api/classroom/session;x-e2e-secret bypass 限 APP_ENV=local
```

衝突處理原則:`lib/integrations/*`、`app/apps/*`、首頁(`app/ClientHomePage.tsx`、`app/page.tsx`、`components/{CourseCard,TeacherCard,Header,Footer}.tsx`)**一律取 main 側**;地基邏輯取 integration 側。每批合併後跑一次 e2e classroom canary 與現有 verify 腳本。

## 6. 待使用者確認的決策

1. 合併批次順序是否照上表(B1→…→stash→0a-9)?或有特定能力要提前?
2. integration 的首頁 `e9fa8ea` 確認捨棄、以 main `bf6b39c` 為準?(memory 已如此記載,但請最終確認)
3. `app/whiteboard-demo`、`app/rtc-harness` 這類 dev/demo 頁,補齊相依後**保留**(利於後續 RTC 驗證矩陣)還是移除?
4. prod 建表(rate-limits、class-summaries 等)要在 B2/B4 當批做,還是集中到 0b-6 一次做?(皆需逐次徵得同意)
