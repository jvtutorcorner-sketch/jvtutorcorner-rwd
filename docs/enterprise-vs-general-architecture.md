# 企業版（B2B）架構規劃 vs 一般（B2C）架構

本文整理 JVTutorCorner 專案內目前「一般個人會員」與「企業／B2B 組織」兩套架構的現況，並比較兩者差異。企業版目前仍屬**規劃中／部分落地**的狀態（詳見第 4 節缺口清單），與已完整上線的一般會員流程不同。

---

## 1. 一般（B2C／個人）架構 —— 現行、完整上線

| 項目 | 內容 |
|---|---|
| 註冊入口 | [app/login/register/page.tsx](../app/login/register/page.tsx) |
| 使用者資料模型 | `Profile`（單一扁平結構，見 [lib/profilesService.ts](../lib/profilesService.ts)） |
| 角色 | `student` \| `teacher` \| `admin`，個人單一帳號對應單一角色 |
| 方案／計價 | 個人訂閱方案 `basic` / `pro` / `elite` / `viewer`（[lib/mockAuth.ts](../lib/mockAuth.ts)），依月計費 |
| 金流 | Stripe、PayPal、LINE Pay、ECPay，個人單筆／訂閱扣款 |
| 點數系統 | Points + Points Escrow（教師端暫存機制） |
| 註冊流程特色 | 個人問卷（Onboarding Questionnaire）→ 推薦系統（MMR + TagScore） |
| 管理介面 | `app/admin/*`（訂單、退款、教師審核、訂閱設定…） |

## 2. 企業（B2B）架構規劃 —— 資料層已建，介面／流程未完全串接

| 項目 | 內容 |
|---|---|
| 註冊入口 | [app/login/register_enterprise/page.tsx](../app/login/register_enterprise/page.tsx)（含 CSV 批次匯入成員功能） |
| 核心資料模型 | 定義於 [lib/types/b2b.ts](../lib/types/b2b.ts)：`Organization`、`OrgUnit`、`License`、`ProfileB2B` |
| 組織帳號 | `Organization`：公司名稱、網域自動加入、`planTier`（starter/business/enterprise）、`maxSeats`/`usedSeats` 席次、帳單週期、合約起訖 |
| 組織單位 | `OrgUnit`：階層式結構（`parentId` + `path` + `level`），支援樹狀部門／群組管理，服務層見 [lib/orgUnitService.ts](../lib/orgUnitService.ts)（含 `buildOrgTree`、`moveOrgUnit` 等） |
| 使用者關聯 | `ProfileB2B` 在既有 `Profile` 上擴充 `orgId` / `orgUnitId` / `isB2B` / `isOrgAdmin` / `licenseId`，個人方案 `plan` 對 B2B 使用者為 `null`，改由組織席次（License）授權 |
| 席次授權 | `License`：綁定 `organizationId` + `userId`，狀態 `active/revoked/expired/pending`，可選綁定特定課程 |
| 後端 API | [app/api/organizations/route.ts](../app/api/organizations/route.ts)、`[id]/route.ts`；[app/api/org-units/route.ts](../app/api/org-units/route.ts)、`[id]/route.ts`、`[id]/move/route.ts` |
| 資料庫 | DynamoDB：[cloudformation/dynamodb-b2b-tables.yml](../cloudformation/dynamodb-b2b-tables.yml)（Organizations、Licenses 表）、[cloudformation/dynamodb-org-units-table.yml](../cloudformation/dynamodb-org-units-table.yml)（OrgUnits 表，含 orgId+path 的 GSI） |

## 3. 差異比較表

| 面向 | 一般（B2C） | 企業（B2B） |
|---|---|---|
| 帳號單位 | 個人 | 組織（Organization）→ 部門（OrgUnit）→ 成員 |
| 註冊方式 | 單人自助註冊 + 問卷 | 單人註冊表單 **或** CSV 批次匯入多筆成員 |
| 授權模式 | 個人訂閱方案（basic/pro/elite） | 組織購買席次（License），依 `maxSeats` 分配給成員 |
| 計費對象 | 個人信用卡／第三方支付單筆或訂閱扣款 | 組織層級 `billingEmail`、合約週期（月/年/客製） |
| 權限層級 | 單一角色（student/teacher/admin） | 角色之外再疊加 `isOrgAdmin`、`orgUnitId` 範圍權限 |
| 資料隔離 | 無跨帳號結構 | 依 `orgId`／`orgUnitId` 階層做多租戶（multi-tenant）隔離 |
| 管理介面 | `app/admin/*` 齊全（訂單、教師審核、退款…） | **尚無**對應的 `app/admin` 組織管理頁面 |
| 導覽／串接 | Header、Menu 皆有連結，流程完整 | 註冊頁未被任何導覽或其他頁面連結（孤立路由） |
| API 權限保護 | 已接 `apiGuard`／session 驗證 | `organizations`、`org-units` 路由的權限檢查仍是註解 `// TODO: Check if user is org admin` 尚未啟用 |

## 4. 現況缺口（規劃 vs 已完成）

1. **未串接導覽**：`register_enterprise` 頁面沒有被任何連結指到（`grep` 全專案找不到 `register_enterprise` 的引用），一般使用者無法從網站上找到入口。
2. **API 未加權限守門**：`app/api/organizations/route.ts`、`app/api/org-units/route.ts` 內的管理員／組織管理員驗證仍是註解掉的 TODO，目前形同無權限保護。
3. **無管理後台頁面**：`app/admin/*` 底下沒有組織／部門／席次管理的頁面，目前只能靠 API 或腳本操作。
4. **無對應金流／帳單流程**：B2C 已有完整訂閱與金流串接，B2B 的 `Organization.billingCycle` / `contractStartDate` 等欄位目前只是資料欄位，尚未接上實際扣款或發票流程。
5. **CSV 匯入的成員後續流程未知**：`register_enterprise` 可匯入 CSV 建立多筆成員，但這些成員如何分配到 `OrgUnit`、如何綁定 `License`，目前程式碼中未見完整銜接。

## 5. 小結

專案內「一般會員」是完整可上線的 B2C 流程；「企業／B2B」則已經把**資料模型、DynamoDB 表結構、後端 CRUD API、註冊表單**都建好了，屬於架構規劃且部分程式碼已完成，但**權限保護、管理介面、導覽入口、金流串接**這幾塊還沒補齊，尚不能視為可對外上線的功能。
