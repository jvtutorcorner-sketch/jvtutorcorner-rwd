# B2B 授權範圍 (orgAccess) 與組織單位階層 (orgUnitService) — 手動測試步驟

驗證範圍：`lib/auth/orgAccess.ts`（`requireOrgAccess`/`requireSystemAdmin`，保護 `app/api/organizations/**`、`app/api/org-units/**` 全部路由的授權判斷）與 `lib/orgUnitService.ts`（組織單位階層、`moveOrgUnit` 的交易原子性）。這兩個模組都是 `32c5977 feat(b2b)` commit message 裡明確點名的 Core Fix。

> 對應自動化腳本：[scripts/verify-b2b-access-orgunits.mjs](../scripts/verify-b2b-access-orgunits.mjs)
> 另兩個 B2B 核心模組（席次/授權、成員增刪）見：[docs/b2b-seat-membership-manual-test-guide.md](./b2b-seat-membership-manual-test-guide.md)

## 已知範圍限制：dept_admin 子部門範圍尚未實作

`.agents/skills/b2b-tenant-isolation/SKILL.md` 的 M2「dept_admin 限本部門」描述的 `apiGuard scope:'orgUnit'` 機制**在程式碼中不存在**：`lib/auth/apiGuard.ts` 沒有 `scope` 參數，`lib/auth/orgAccess.ts` 只查 `profile.isOrgAdmin` 與 `profile.orgId`，完全不讀 `orgUnitId`。目前只有「系統管理員」與「組織管理員（僅限本組織）」兩層授權是真的實作，本文件與自動化腳本都只驗證這兩層。若之後真的實作了 dept_admin 子部門範圍限制，才需要回頭補這塊的測試。

## 前置準備

同 [b2b-seat-membership-manual-test-guide.md](./b2b-seat-membership-manual-test-guide.md#前置準備)：`.env.local` 目前指向正式環境 AWS 帳號，測試建立的組織/組織單位務必清理；管理員帳號 `ADMIN_EMAIL=admin@jvtutorcorner.com` / `ADMIN_PASSWORD=123456`。

## 自動化腳本

```bash
node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2b-access-orgunits.mjs
```

腳本分兩段：

**orgAccess**（直接呼叫 `requireOrgAccess`/`requireSystemAdmin`，不需要真的登入）：
- 系統管理員對任何組織的 `read`/`write`/`system` 級別一律放行
- 組織管理員只能 `read`/`write` **自己的**組織；同組織的 `system` 級別（計費/席次上限等）仍是 403
- 組織管理員對別的組織一律 403（不透露該組織是否存在）
- **一般成員（非組織管理員）對自己所屬組織的 `read` 也是 403** —— 只認 `isOrgAdmin`，不認單純隸屬關係，容易被誤改壞
- `orgId` 缺漏 → 400

**orgUnitService**（實際寫入 DynamoDB 的組織單位表）：
- 建立 root/child/grandchild 三層，`path`/`level` 正確
- 用別組織的 `parentId` 建立子單位 → 拒絕
- `moveOrgUnit` 擋自我移動、擋移到自己子孫底下、擋跨組織移動
- 單純移動（無子孫）與帶子孫的移動都正確更新 `path`（用字串切片而非 `replace`，確認子孫路徑不會被誤傷）
- 併發對同一個單位發兩個不同目標的移動，恰好一個成功（`#path = :expectedOldPath` 樂觀鎖）
- `deleteOrgUnit` 硬刪除在有子單位時被擋、軟刪除（封存）與清空子單位後硬刪除都正確
- `repairOrgUnitPaths` 能把手動弄髒的 `path` 修回正確值

## 手動 UI 測試步驟

### A. 建立組織單位階層

1. 登入管理員，進 `/admin/organizations`，建一個測試組織（或沿用既有測試組織）。
2. 點進組織詳情頁 → 「組織單位」分頁。
3. 用「（頂層）新增部門於」下拉 + 「新部門名稱」欄位建立一個根部門（例如 `工程部`），送出。
4. 把下拉切到剛建立的根部門，再建一個子部門（例如 `後端組`），確認樹狀畫面用縮排顯示出巢狀關係。
5. 在子部門底下再建一個孫部門，確認三層縮排都正確。

### B. 移動：正常情境 + 伺服器端防護（UI 不會出現的選項）

1. 對「後端組」點「移動」，下拉選單「選擇新的上層部門」——確認清單裡**不會出現**「後端組」自己或它的子部門（元件本身用 `!isDescendant` 過濾掉了，所以移到自己子孫底下這條防護在 UI 上根本點不到）。
2. 選一個合法的新上層（例如把「後端組」搬到另一個根部門底下），確認送出後樹狀結構立刻反映新位置，且原本掛在「後端組」下的孫部門也跟著一起搬動、路徑正確。
3. **要驗證伺服器端真的擋住「移到自己子孫底下」**，UI 沒有入口，需直接呼叫 API：
   ```
   POST /api/org-units/<後端組的id>/move
   Body: { "newParentId": "<後端組底下某個孫部門的 id>" }
   ```
   預期仍然回傳錯誤（400/500，訊息含 "Cannot move unit to its own descendant"），不能因為 UI 擋掉了就假設 API 本身也一定有擋。

### C. 封存與刪除

1. 對一個還有子部門的部門按「封存」——應該成功（封存不檢查子部門）。
2. 對同一個（有子部門）部門直接呼叫刪除 API 的硬刪除路徑（若前端沒有硬刪除按鈕，用 `DELETE /api/org-units/<id>?hard=true` 或請工程確認實際參數名），預期被拒絕，訊息類似「還有 N 個子單位不能硬刪除」。
3. 先刪除/封存所有子部門，再刪除父部門，應該成功。

### D. 授權範圍（orgAccess，沒有專屬 UI，靠角色切換驗證）

準備三個測試身分：A 組織的組織管理員、A 組織的一般成員（非管理員）、B 組織的組織管理員。

1. 用 **A 組織管理員** 登入，開啟 A 組織的 `/admin/organizations/<A的id>`，確認能看到成員/組織單位分頁且能操作。
2. 同一個 A 組織管理員，改開 B 組織的 `/admin/organizations/<B的id>`（或直接呼叫 `GET /api/organizations/<B的id>`）—— 預期 403。
3. 用 **A 組織一般成員**（`isOrgAdmin=false`）登入，嘗試開啟 A 組織自己的 `/admin/organizations/<A的id>` —— 預期同樣是 403（這是目前程式碼的真實行為，一般成員完全不能經由這組 API 讀取組織資訊，即使是自己所屬的組織）。
4. 用 **A 組織管理員** 嘗試呼叫任何計費/席次上限相關的操作（`level: 'system'` 的操作，例如變更 `maxSeats`）—— 預期 403，即使是自己的組織，也只有系統管理員能動。
5. 不用測 dept_admin 子部門範圍 —— 目前沒有實作，測了也沒有意義。

## 清理

- UI 建立的測試組織單位：從葉節點開始刪（有子單位擋硬刪除），最後刪組織本身。
- 自動化腳本建立的資料：腳本自帶清理，不需手動處理，除非腳本中途被強制中斷（開頭會印出 orgA/orgB 的 id，可用 `scripts/describe-table.ts` 或 AWS Console 手動確認/清除）。
