# B2B 席次 (Seat) 與成員管理 — 手動測試步驟

驗證範圍：`lib/licenseService.ts`（授權/席次記錄 CRUD）與 `lib/orgMembershipService.ts`（指派/移除成員的跨表交易）。這兩個模組是 `32c5977 feat(b2b)` 的核心，也是 `7dd3400 fix(data-integrity)` 修正「移除成員未還原方案」問題的所在地。

> 對應自動化腳本：[scripts/verify-b2b-seat-membership.mjs](../scripts/verify-b2b-seat-membership.mjs)

## 本次驗證發現並已修復的問題

在寫自動化腳本跑第一輪時，發現 `lib/orgMembershipService.ts` 有兩個先前未被任何測試覆蓋到的 bug，**目前已修復**：

1. **`assignMemberWithLicense` / `removeMemberFromOrg` 的 UpdateExpression 直接寫 `plan = :xxx`**，未替 `plan` 建立 `ExpressionAttributeNames` 別名。`plan` 是 DynamoDB 保留字，導致這兩個函式呼叫**必定會丟出 `ValidationException`** —— 換句話說，正式環境的「指派成員」與「移除成員」在這次修復前是完全壞掉的。
2. **`removeMemberFromOrg` 對 `orgId` 用 `SET orgId = :null`**，但 `orgId` 是 Profiles 表 `byOrgId` GSI 的 key attribute，DynamoDB 不允許把 GSI key 屬性 `SET` 成 NULL 型別（會丟 `Type mismatch for Index Key orgId Expected: S Actual: NULL`），必須改用 `REMOVE orgId`（與 `licenseService.revokeLicense` 對 `userId` 的既有處理方式一致）。

手動測試時請特別留意「加入成員」與「移除成員」兩個操作本身是否成功送出（先前這兩個操作在畫面上會直接顯示錯誤訊息或 500），而不只是驗證資料是否正確。

## 前置準備

1. `.env.local` 需要有以下三個表格變數（`DYNAMODB_TABLE_PROFILES` 與 `DYNAMODB_TABLE_LICENSES` 原本缺漏，已補上）：
   ```
   DYNAMODB_TABLE_ORGANIZATIONS=jvtutorcorner-organizations
   DYNAMODB_TABLE_PROFILES=jvtutorcorner-profiles
   DYNAMODB_TABLE_LICENSES=jvtutorcorner-licenses
   ```
2. **注意：`.env.local` 目前指向的是正式環境 AWS 帳號**（見檔案開頭註解「正式環境的壓力測試配置」）。無論跑自動化腳本或手動操作，建立的測試組織/成員都會寫進正式資料庫 —— 測完務必依下方「清理」步驟刪除。
3. 用管理員帳號登入：`ADMIN_EMAIL=admin@jvtutorcorner.com` / `ADMIN_PASSWORD=123456`（`.env.local` 已有，也可用 `auto-login` skill 的 bypass 機制）。

## 自動化腳本（涵蓋 M1～M4 的資料正確性）

```bash
node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2b-seat-membership.mjs
```

腳本會建立一個 `maxSeats=2` 的測試組織，依序驗證：
- 依序指派到席次上限、第 3 個指派被拒絕且不留下部分寫入
- **併發指派**（5 個 profile 同時搶 2 個席次）下 `usedSeats` 精準停在 2，不會因競態超額
- 移除成員後：`usedSeats` 遞減、授權變 `revoked`、`orgId/licenseId` 清空、**`plan` 還原為 `'free'`**
- 移除「已無有效授權」的邊界案例不會把 `usedSeats` 打到負值

腳本結束時會在 `finally` 區塊 hard-delete 自己建立的組織/授權/profile，正常結束不會留下殘留資料。若跑到一半被中斷（Ctrl+C／斷線），畫面一開始就會印出組織 id，需自行用 `scripts/describe-table.ts` 或 AWS Console 手動清除。

## 手動 UI 測試步驟

### A. 建立測試組織並設定席次上限

1. 登入管理員後前往 `/admin/organizations`。
2. 點「+ 建立組織」，填入名稱（建議帶時間戳記，例如 `QA-Verify-<timestamp>`）、`maxSeats` 填 `2`、`billingEmail` 隨意填一個測試信箱，送出。
3. 確認清單中新組織的席次顯示為 `0 / 2`。

### B. 指派成員到席次上限，驗證超額被擋

1. 點進剛建立的組織 → 切到「成員」分頁。
2. 準備 2～3 個既有測試學員帳號（例如用 `auto-login` skill 建立的測試學生，或任一非 B2B 的既有帳號）的 email。
3. 在「以 Email 加入現有使用者」欄位輸入第 1 個 email，點「+ 加入成員」→ 應該成功，畫面席次變成 `1 / 2`。
4. 重複加入第 2 個 → 席次變成 `2 / 2`，此時輸入框應自動被 disable，並顯示「席次已滿（2/2），請先釋放或提高席次上限」。
5. 嘗試再加入第 3 個 email（若 UI 已 disable 輸入框，可改用 API 直接測：`POST /api/organizations/[id]/members` body `{ "email": "third@test.com" }`）→ 應回傳 `409` 與訊息「組織席次已滿」，且成員清單、席次數字都不變。

### C. 移除成員：驗證席次釋放、授權撤銷、方案還原

1. 在成員清單中對其中一位成員點「移除」。
2. 確認：
   - 該筆列從成員清單消失，席次變回 `1 / 2`。
   - 切到「授權」分頁，該成員原本的授權記錄狀態應變成 `revoked`。
   - 用該被移除成員的帳號登入（或查看其 profile / `/pricing` 頁面的目前方案狀態）：`plan` 應該是 `'free'`，**不是 `null`**——這是 `7dd3400` 修的問題，若又倒退回 `null`，該用戶會卡在「既非企業成員、也沒有 B2C 方案」的狀態。
3. 確認被移除成員不再能存取原本靠 B2B 席次授權的課程（`403`）。

### D. 併發搶席次（選用，UI 較難精準模擬）

UI 手動測試很難精確重現競態條件，這塊建議直接信任自動化腳本的第 2 段測試。若要人工感受一下，可以開兩個瀏覽器分頁同時對最後 1 個空席次按「+ 加入成員」，預期只有一個成功、另一個收到「席次已滿」或交易衝突錯誤，`usedSeats` 不應該變成負數或超過 `maxSeats`。

## 清理

- UI 建立的測試組織：回到 `/admin/organizations` 清單，用封存/刪除功能移除（若沒有刪除按鈕，直接呼叫 `DELETE` API 或請工程協助用 `organizationService.deleteOrganization(id, true)` 硬刪）。
- 自動化腳本建立的資料：腳本自帶清理，不需手動處理，除非腳本中途被強制中斷。
