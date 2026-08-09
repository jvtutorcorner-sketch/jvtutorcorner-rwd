# B2B / B2C / Shared 架構邊界與共用層

> 本文件提供技術架構視角；完整的功能模組、每層證據、測試檔案與缺口請以 [B2B / B2C / Shared 模組總覽與驗證分類](./b2b-b2c-module-matrix.md) 為準。
>
> 最近盤點：2026-08-08。模組矩陣：`node scripts/audit-enterprise-general-module-matrix.mjs`。

## 1. 架構邊界

### B2C 一般功能

一般帳號以個人 Profile 為中心，角色為 `student`、`teacher` 或 `admin`。學生使用個人方案與點數購買課程；老師建立與管理自己的課程，平台管理員負責審核、訂單與營運。

主要實作位置：

| 層 | 代表檔案／資料 |
|---|---|
| UI | `app/login/**`、`app/courses/**`、`app/student_courses/page.tsx`、`app/teacher_courses/page.tsx`、`app/admin/**` |
| API | `app/api/register/route.ts`、`app/api/login/route.ts`、`app/api/courses/**`、`app/api/enroll/route.ts`、`app/api/orders/**` |
| Service | `lib/auth/sessionManager.ts`、`lib/accessControl.ts`、`lib/paymentSuccessHandler.ts`、`lib/pointsEscrow.ts` |
| Data | `Profile`、課程、訂單、點數與 escrow 資料表；具體表名以 `lib/*Storage.ts` 與 CloudFormation 為準 |

### B2B 企業功能

B2B 在個人 Profile 之上增加 Organization、OrgUnit 與 License 關聯。企業不是單純把 `plan` 換成另一個字串，而是以組織席次、部門範圍與租戶邊界作為授權基礎。

主要資料模型：

| 模型 | 重要欄位／責任 |
|---|---|
| `Organization` | 公司名稱、網域、`planTier`、`maxSeats`／`usedSeats`、billing 欄位、合約週期 |
| `OrgUnit` | `organizationId`、`parentId`、`path`、`level`，支援階層部門 |
| `License` | 組織、成員、狀態、可選課程範圍與到期時間 |
| `ProfileB2B` | `orgId`、`orgUnitId`、`isB2B`、`isOrgAdmin`、`licenseId` 等企業關聯 |

主要實作位置：

| 層 | 代表檔案／資料 |
|---|---|
| UI | `app/login/register_enterprise/page.tsx`、`app/admin/organizations/page.tsx`、`components/org/**` |
| API | `app/api/organizations/**`、`app/api/org-units/**`、`app/api/licenses/**`、`app/api/auth/google/**` |
| Service | `lib/organizationService.ts`、`lib/orgUnitService.ts`、`lib/licenseService.ts`、`lib/orgMembershipService.ts`、`lib/auth/orgAccess.ts` |
| Data | `lib/types/b2b.ts`、Organizations／OrgUnits／Licenses／AuditLog DynamoDB tables |

## 2. B2B / B2C 核心差異

| 面向 | B2C | B2B |
|---|---|---|
| 帳號單位 | 個人 Profile | Organization → OrgUnit → 成員 |
| 註冊 | 個人註冊、Email 驗證、問卷 | 企業註冊、網域、CSV 匯入、企業 SSO |
| 授權 | 個人方案、購課、點數 | License、席次、課程限制、組織／部門範圍 |
| 角色 | `student`／`teacher`／`admin` | 基本角色再疊加 `isOrgAdmin`、`dept_admin` 與 `orgUnitId` |
| 資料邊界 | 以本人／資源 owner 為主 | 必須同時檢查 `organizationId`、部門範圍與資源 owner |
| 課程進入 | 已購買或其他個人權限 | 有效 License 或 B2C 購課，統一由 `lib/accessControl.ts` 判斷 |
| 計費 | 個人 Stripe／PayPal／LINE Pay／ECPay | 組織帳單、席次計價、合約、發票與 webhook；目前尚未完成 |
| 管理介面 | 個人課程、訂單、老師與平台後台 | 組織、部門、成員、席次；`dept_admin` UI 與細粒度流程仍不足 |

## 3. B2B / B2C / Shared 跨層驗證規格

每個模組都要按照下列順序驗證，不可只測 UI：

1. **Data**：資料模型、索引、原子性與狀態轉移。
2. **Service**：商業規則、owner、組織／部門範圍與外部 provider。
3. **API**：request validation、session、role、HMAC、status code、錯誤格式。
4. **UI**：入口、表單、成功／失敗／空資料／loading 狀態與導覽。
5. **Boundary**：匿名、student、teacher、admin、org admin、dept admin、Org A／Org B。
6. **Regression**：正常流程、拒絕流程、重複請求、過期／撤銷、外部服務失敗與 cleanup。

### B2B 必驗邊界

- Organization A 的管理員不能讀寫 Organization B。
- `dept_admin` 只能管理自己的 `orgUnitId` 與子部門，不能操作兄弟部門。
- License 達到 `maxSeats` 時，新增成員必須原子失敗且回復已寫入資料。
- License 被撤銷或過期後，教材、白板與教室 access gate 必須立即拒絕。
- Google SSO 必須驗證 code、state、nonce、issuer、audience、email_verified 與企業網域。
- 企業帳單必須與個人付款分開，不能因為 B2C payment route 存在就宣稱 B2B billing 完成。

### B2C 必驗邊界

- Profile、訂單、點數與課程只能由本人或符合角色的管理員操作。
- 老師 A 不能修改或刪除老師 B 的課程。
- 未購課程或無有效企業 License 不能讀教材、白板或取得教室 token。
- 退款、取消與 escrow release 必須冪等，不能重複增加點數或釋放教師資產。
- 公開頁可訪問不代表 mutation API 可匿名呼叫；GET、POST、PATCH、DELETE 要分別檢查。

## 4. 目前模組狀態

目前矩陣共 32 個模組、57 個 API domain、無未映射 domain：

| 狀態 | 數量 | 解讀 |
|---|---:|---|
| `COVERED` | 14 | 主要程式層與可執行測試均有證據 |
| `PARTIAL` | 16 | 有主流程，但仍缺某些層、角色、錯誤或外部 provider 測試 |
| `BLOCKED` | 1 | 跨租戶需要 `tenantId` 與真實 SSO fixture |
| `UNTESTED` | 0 | 目前列入矩陣的模組都有至少一個專用靜態或 E2E 證據 |
| `NOT_IMPLEMENTED` | 1 | 企業帳單只有資料欄位，沒有完整 route／service／流程 |

目前最重要的架構缺口：

1. B2B 跨租戶隔離尚未具備 `SessionPayload.tenantId` 與可用 Org A／Org B fixture。
2. `dept_admin` 的 API guard 已有，但沒有能設定角色與部門的完整 UI／資料流程。
3. Google SSO 的安全拒絕測試已有，成功登入 E2E 仍受真實 Google credentials 阻塞。
4. B2B billing、發票、續約與 webhook 尚未實作。
5. 老師審核、課程審核、後台操作、AI workflow、整合、排程與教學內容影像分析仍有不同程度的測試缺口。

## 5. 文件、API 與測試同步規則

- 功能新增或移動時，先更新 [模組總覽](./b2b-b2c-module-matrix.md) 的分組、層級證據、API domain 與測試檔案。
- 新增或修改 `app/api/**/route.ts` 後執行 `node scripts/inspect_apis.mjs`，同步更新 [API registry](./api_registry.md)。
- 靜態覆蓋稽核：

  ```bash
  npm run test:audit-coverage
  npm run test:audit-module-matrix
  ```

- Critical 模組是否仍有缺口：

  ```bash
  npm run test:audit-module-matrix:strict
  ```

- `strict` 目前預期會失敗，因為 critical 模組仍有 `PARTIAL`、`BLOCKED` 或 `NOT_IMPLEMENTED`；這是目前產品狀態的反映。
- 涉及 DynamoDB、真實金流、Google SSO、外部 AI、LINE／Make 或 headed browser 的測試，必須先確認目標環境與資料清理策略。
