# 推薦候選池接真實課程 — 任務文件(2026-09-25)

> 產出於 `feature/ai-live-teaching-3a`。與 `ai-feature-inventory-2026-09-22.md`(Part 2 Fix 14/15)、
> `branch-reconciliation.md`、`architecture-and-cost-plan-2026-09-21.md` 搭配閱讀。
>
> **一句話結論:程式碼層的「接真實課程」已完成(見下方 §0),剩下的全是「讓它在 prod 真的兌現」——
> 憑證、資料、埋點、上線,不是再寫接線。**

---

## §0 現況盤點:程式碼層已完成(分支內,未部署)

| 項目 | 位置 | 狀態 |
|---|---|---|
| 候選池改真實課程 | `app/api/recommendations/route.ts:48` `listPublishedCourses()` | ✅ 已接 |
| popularity 用真實報名數 | `lib/recommendationCandidates.ts:51` `computePopularity`(`seatsOccupied` 優先,`seatsLeft` 反推為 fallback,無訊號回中性 0.5) | ✅ 已改 |
| 與首頁同 id 空間、去重、過濾測試課 | `app/courses/_data.ts` `isTestCourse` + `listPublishedCourses` | ✅ 已接 |
| 前端消費並渲染 | `app/ClientHomePage.tsx:128`(受 `showRecommendations` 旗標控制) | ✅ 已接 |
| 離線單元測試 | `scripts/verify-recommendation-candidates.mjs` | ✅ 已有 |

**判讀**:在「有真實上架課程 + SSR 有 AWS 憑證」的環境,這條路已經會動。以下任務依「阻礙效益落地的程度」排序。

### 資料流(供理解阻塞點)

```
listPublishedCourses()                app/courses/_data.ts
  → DynamoDB Scan courses 表          ← [P0-1] Amplify SSR 無憑證則整段 catch
  → 過濾 isTestCourse / status!=上架   ← [P0-2] prod 無上架課則 published.length===0
  → decorateCoursesWithSeats()        ← [P0-3] 無 enrollments 則 seatsOccupied 缺→popularity 退化
  → 任一步空 → 退回 bundled data/courses(示範 5 筆)
        │
        ▼
toCourseCandidate + computePopularity   lib/recommendationCandidates.ts
        │
        ▼
generateRecommendations(interactions,…) lib/recommendationEngine.ts
  ↑ interactions 來自 user-interactions 表 ← [P1-4/5] 前端未埋點+prod 無表→永遠 cold-start
```

---

## §1 P0 — 讓 prod 候選池是「真實課程」而非 bundled 後備

> 這三項任一未解,prod 首頁推薦的仍是打包的示範課(`data/courses`)。

### P0-1 修 Amplify SSR 無 AWS 憑證 【最硬阻礙】
- **現況**:Amplify app `d26liopu593jfw` 的 `computeRoleArn` 未設 → 所有 SSR 端 DynamoDB 呼叫失敗 → `listPublicCourses` catch 後退回 bundled `COURSES`。此問題同時卡住其他所有 prod DynamoDB 讀取。
- **動作**:於 Amplify Console 設定 compute role(需 Console 權限)。
- **參考**:記憶 `project_amplify_ssr_no_aws_credentials.md`。
- **驗收**:prod `GET /api/recommendations` 回傳的 id 不再是 `data/courses` 的示範 id。
- **負責**:需 AWS Console 存取者(非本 session 可完成)。

### P0-2 prod 要有真實已上架課程
- **現況**:prod `courses` 表零真實上架課,`listPublishedCourses` 因 `published.length===0` 退回 bundled。
- **動作**:確認至少有老師課程通過審核 → `status=上架`(產品/營運前置,非工程)。
- **驗收**:prod `courses` 表存在 `status=上架` 且非測試課的真實資料。

### P0-3 確認 `seatsOccupied` 在 prod 有值
- **現況**:`decorateCoursesWithSeats`(`lib/seatAccounting.ts`)需讀 enrollments 才算得出報名數;無報名 → `computePopularity` 全回中性 0.5 → 熱門排序退化為原順序。
- **動作**:確認 enrollments 資料鏈通(依賴 P0-1 憑證)。
- **驗收**:`/api/recommendations` 的 `meta.popularity` 至少有非 null、非全 0.5 的值。

---

## §2 P1 — 讓「個人化」真的有訊號(否則永遠只是熱門排序)

### P1-4 前端埋點行為追蹤
- **現況**:`lib/trackingUtils.ts` 零 importer → `user-interactions` 表永遠空 → `generateRecommendations` 走 cold-start,「個人化」實為 popularity。
- **動作**:
  - 購買:在 `paymentSuccessHandler` 伺服端寫入 interaction。
  - 點擊:在 `CourseCard` onClick 送出(僅登入者)。
  - 注意盤點提到的 `interactionId` 碰撞會使 BatchWrite 整批失敗——同批多 tag 需給不同 id。
- **參考**:`ai-feature-inventory-2026-09-22.md` Part 2 Fix 15。
- **驗收**:登入者互動後,`user-interactions` 表有對應筆數;`meta.topTags` 反映其行為。

### P1-5 `user-interactions` 表登記進 schema + 建 prod 表
- **現況**:`route.ts` 讀 `jvtutorcorner-user-interactions`(env 可覆寫),但該表未在 `schema.mjs`。
- **動作**:登記進 `schema.mjs` → prod 建表。
- **驗收**:`fetchInteractionsFromDynamo` 不再靜默回空(無表時會走 catch → 空陣列)。

---

## §3 P2 — 開關與上線

### P2-6 決定 `showRecommendations` admin 預設值
- **現況**:元件預設 `true`(`ClientHomePage.tsx:42`),但 `/admin/settings` 的 homepage-settings 可能存為關閉。
- **動作**:確認上線時要開(產品決策)。

### P2-7 部署分支
- **現況**:`feature/ai-live-teaching-3a` 領先 main 24 commit、全數未部署;main↔integration 雙向分歧。
- **動作**:釐清合併路徑 → 部署。
- ⚠️ **注意部署事故教訓**:勿 force-merge integration 到 main(曾丟 15 commit + 破 build)。參見記憶 `project_homepage_redesign.md`。

---

## §4 驗收 / 回歸

### V-8 離線單元測試(可立即做,無需 AWS)
```bash
node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-recommendation-candidates.mjs
```
鎖定 `toCourseCandidate` 正規化與 `seatsOccupied`-first popularity。

**2026-09-25 執行結果:✅ 全數通過(18/18),程式碼層無回歸。**
> 結尾的 `Assertion failed: … src\win\async.c` / exit 127 是 Node 在 Windows 的 libuv teardown crash,
> 發生在所有斷言印出「全數通過」之後,屬環境雜訊、非測試失敗。

### V-9 prod smoke
- 登入者:`GET /api/recommendations?userId=<id>` → 回真實課程 id,`meta.topTags` 反映互動。
- 訪客:`POST /api/recommendations`(帶 `guestSeeds`) → 回真實課程 id。
- 確認 `meta.popularity` 非全 null / 全 0.5。

---

## 最短兌現路徑

```
P0-1 (Amplify 憑證) → P0-2 (有真實上架課) → P2-7 (部署)
```
這三步一到,首頁推薦即從「示範課」變「真實課依報名熱度排序」。
個人化(P1)可後補——在有互動資料前,推薦本就以 popularity 為主。
