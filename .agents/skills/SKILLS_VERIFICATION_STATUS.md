# Skill 驗證狀態追蹤 (Skills Verification Status)

此文件記錄所有 Skills 的驗證狀態、測試結果及架構對齐情況。

## 驗證狀態說明

- **✅ VERIFIED** - 已驗證，功能完整且測試通過
- **⚠️ PARTIAL** - 部分驗證，功能不完整或待補充測試
- **❌ UNVERIFIED** - 未驗證，尚未進行測試或待審核
- **🔄 IN-PROGRESS** - 驗證進行中

---

## Skill 驗證清單

### 1. auto-login
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`register_and_email_test` 1/1、`classroom_flow` 1/1
  - 2026-09-11 批次驗證：`classroom_flow` 1/1（自動登入 + 教室流程）
  - ✅ 支援 Teacher 角色自動登入
  - ✅ 支援 Student 角色自動登入
  - ✅ 環境變數讀取 (TEST_TEACHER_EMAIL, TEST_STUDENT_EMAIL)
  - ✅ Bypass Secret 驗證機制
- **已知問題**: 無
- **架構對齐**: ✅ 與 YAML frontmatter 一致

### 2. student-enrollment-flow
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`student_full_verification_responsive` 0/1
  - 2026-09-11 批次驗證：`student_enrollment_flow` 1/1（NEXT_PUBLIC_PAYMENT_MOCK_MODE=true、APP_ENV=local）
  - ✅ 自動登入整合
  - ✅ 點數餘額檢查
  - ✅ 點數購買流程 (/pricing → /pricing/checkout)
  - ✅ 課程報名流程
  - ✅ 模擬支付邏輯
  - ✅ paymentSuccessHandler 冪等性保證
- **已知問題**: 無
  - 響應式全流程在付款報名後 15 秒內未導向 `/student_courses`（`waitForURL`）；原因未確認，`student_enrollment_flow` 同批通過
- **架構對齐**: ✅ 與 Core Operational Flows 對齐

### 3. student-courses-page
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`student_courses_verification` 5/5
  - ✅ 進入教室按鈕時間驗證
  - ✅ 老師欄位資料檢查
  - ✅ 課程 ID 對應邏輯
  - ✅ 資料完整性驗證
- **已知問題**: 無
- **架構對齐**: ✅ 與 Core Entities 對齐

### 4. teacher-courses-page
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`teacher_courses_verification` 5/5
  - ✅ 學生資訊顯示
  - ✅ 進入教室按鈕功能
  - ✅ 時間驗證邏輯
  - ✅ 剩餘課程數/時間計算
- **已知問題**: 無
- **架構對齐**: ✅ 與 Teacher Profile 對齐

### 5. course-management-service
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`course_management_flow`：PHASE 1（老師建立課程）完成，於 PHASE 2（申請上架）逾時
  - ✅ 教師課程建立流程
  - ✅ 課程列表顯示
  - ⚠️ 管理員審核流程 (待完整驗證)
- **已知問題**: 
  - 整支流程受全域 60 秒 timeout 限制，dev 模式下 3 階段 UI 流程不足；spec 應設 `test.setTimeout`。另外 log 顯示「課程 ID」印出的是標題而非 id，後續查找可能因此失敗
  - 管理員審核頁面 (/admin/course-reviews) 待驗證完整性
- **架構對齐**: ⚠️ 部分對齐，待 schema 更新驗證

### 6. course-scheduling-reminders
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-04-22
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：未執行：只有手動步驟，且不得在本機觸發 `/api/cron/process-reminders`
  - 2026-09-11 批次驗證：未執行：只有手動步驟，且不得在本機觸發 `/api/cron/process-reminders`
  - ✅ 日曆顯示與色標標準化
  - ✅ 10 分鐘進場區間限制
  - ✅ 自動化 3 小時郵件提醒機制
  - ✅ 發信前認證狀態校驗
- **已知問題**: 無
- **架構對齊**: ✅ 已完成雙向對齊

### 7. admin-teacher-management
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-03-15
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`teacher_courses_verification` 5/5
  - ✅ 教師在職狀態管理 (/teachers/manage)
  - ⚠️ 教師教學資訊審核 (待實裝驗證)
- **已知問題**: 
  - TeacherReview 實體 pending 實裝，待驗證
- **架構對齐**: ⚠️ 部分對齐，TeacherReview 架構待確認

### 8. admin-order-management
- **狀態**: 🔄 IN-PROGRESS
- **驗證日期**: 2026-04-06
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：覆核：本 skill 沒有可執行的驗證指令，狀態不變
  - ✅ 管理後台（Admin Portal）操作功能
  - ✅ 方案排序與配置 UI
  - ✅ CSV 檔案匯出
  - ✅ 退款流程連動（參考 `purchase-refund-flow`）
- **已知問題**: 
  - 部分複雜篩選邏輯（如跨表搜尋）待優化。
- **架構對齊**: ✅ 對齊完成

### 9. course-alignment
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`course_alignment_verification` 1/1
  - ✅ /student_courses 對應驗證
  - ✅ /teacher_courses 對應驗證
  - ✅ 孤立訂單過濾機制
  - ✅ 訂單資料完整性檢查
- **已知問題**: 無
- **架構對齊**: ✅ 對齐完成

### 10. email-service-integration
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：補上 system header 後 `email_service_verification` 4/7：白名單阻擋、驗證信 bypass、格式錯誤 400 等權限與驗證邏輯通過
  - 2026-09-11 批次驗證：`register_and_email_test` 1/1（真實註冊並寄出驗證信，受 EMAIL_WHITELIST 限制）
  - 2026-09-11 批次驗證：`email_verification_flow` 1/1
  - 2026-09-11 批次驗證：`email_service_verification` 1/7：6 個案例 401（spec 過時，已補 system header，待重跑）
  - 2026-09-11 批次驗證：`e2e/email_link_base_url.spec.ts` 4/4 通過（實際寄信流程在第 5 批）
  - ✅ 支援 Gmail SMTP 與 Resend 雙供應商
  - ✅ AWS EventBridge + Lambda 任務調度架構
  - ✅ 基於實體認證狀態的動態白名單 (Whitelist)
  - ✅ 專屬驗證信 bypass 機制
- **已知問題**: 無
  - 實際寄信全部失敗（環境設定）：Gmail SMTP 回 `535 Username and Password not accepted`——`.env.local` 的 Gmail 憑證無效（需應用程式密碼或輪換）；Resend 帳號仍為測試網域，只能寄到帳號本人信箱，寄往其他地址回 550
  - 驗證事件日誌表不存在（`lib/email/emailVerificationLog.ts` 寫入回 ResourceNotFoundException），錯誤被吞掉
  - 「憑證缺失應回 503」案例得 500：兩種寄信方式都失敗時路由回 500 而非 503
  - `email_service_verification.spec.ts` 直接 POST `/api/workflows/gmail-send`／`resend-send`，bd85fe7 起需 admin 或 HMAC → 已加 `x-e2e-secret`
  - `RESEND_API_KEY` 未設定，Resend 案例無法驗證
- **架構對齊**: ✅ 已完成雙向對齊

### 11. ai-chat
- **狀態**: ❌ UNVERIFIED
- **驗證日期**: -
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`/api/ai-chat/dispatch` 權限 contract 修正後通過（匿名 401；登入後 catalog 200、空查詢 400）
  - ❌ AI 聊天室功能
  - ❌ Tool calling 整合
  - ❌ 多提供者支援 (Gemini/OpenAI)
- **已知問題**: 
  - `/api/ai-chat/dispatch` 已需登入（bd85fe7），但 `enterprise_general_security_contract.spec.ts` 仍以匿名斷言 200／400 → 2 個失敗；需更新 spec
  - 待 API 實裝驗證
- **架構對齊**: ❓ 待確認

### 12. payment-infrastructure
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-04-30
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：覆核：本 skill 沒有可執行的驗證指令；相關金流流程見 payment-flow-validation／payment-gateway-stripe-verification 的本次結果
  - ✅ 支付閘道整合架構 (Stripe/PayPal/LINE Pay/ECPay)
  - ✅ 訂單生命週期狀態機 (OSM)
  - ✅ Webhook 冪等性與安全性驗證
  - ✅ 環境配置統一 (lib/envConfig.ts)
  - ✅ paymentSuccessHandler 冪等性
- **已知問題**: 無
- **架構對齊**: ✅ 已完成

### 13. payment-flow-validation
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`point_purchase_real` skip：spec 判定目前設定未啟用任何真實閘道（STRIPE／PAYPAL）
  - 2026-09-11 批次驗證：`point_purchase_simulated` 修正 mock user 的 roid_id/id 後已能完成模擬付款並導回 /plans，但「點數購買紀錄」15 秒內仍無「已付款」列；原因未確認（可能是紀錄未標為 PAID，或 /plans 未列出點數套餐紀錄）
  - 2026-09-11 批次驗證：`point_purchase_simulated` 0/1
  - ✅ 點數與方案購買完整流程
  - ✅ 模擬與真實支付跳轉驗證
  - ✅ 支付後資產同步檢查
  - ✅ APP_ENV 環境配置統一
- **已知問題**: 無
  - 按下「模擬支付 (Demo)」後 30 秒內未導回 /plans 或 /pricing（`point_purchase_simulated.spec.ts:95`）；原因未確認（本批 `pricing_deduction` 走同一顆按鈕卻成功，可能是 spec 的等待條件或該帳號狀態）
- **架構對齊**: ✅ 對齊完成

### 14. payment-refund-orchestration
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`order_refund` 修正後 1/1（點數退回路徑）
  - 2026-09-11 批次驗證：`order_refund` 0/1：無法驗證（spec 過時，同 payment-restitution-logic）
  - ✅ 業務端退款流程編排
  - ✅ 資產扣回與狀態回滾邏輯
  - ✅ 串接 `payment-refund-gateway`
  - ✅ paymentSuccessHandler 冪等性配合
- **已知問題**: 無
  - 金流原路退回（`purchase_money_refund.spec.ts`）仍未建立
  - `order_refund.spec.ts` 以 email 當 `userId` 讀寫 `/api/points`，被本人檢查回 403
- **架構對齊**: ✅ 已完成

### 15. payment-refund-gateway
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-04-30
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：覆核：沒有可執行的測試；真實金流退款 API 不在本機驗證範圍
  - ✅ Stripe/PayPal 原路退款 API 調用
  - ✅ Webhook 退款事件監聽
  - ✅ 環境配置統一 (lib/envConfig.ts)
- **已知問題**: 無
- **架構對齊**: ✅ 對齊完成

### 16. payment-restitution-logic
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`/api/points` POST 已限制為 admin／system，測試的基準點數一律改走 x-e2e-secret
  - 2026-09-11 批次驗證：`order_refund` 修正後 1/1（改用 canonical id、system 身分設定基準點數、取用 /api/enroll 回傳的真實 id）：點數退回、報名改為 CANCELLED
  - 2026-09-11 批次驗證：`order_refund` 0/1：無法驗證（spec 過時）
  - ✅ 課程取消引發的點數返還
  - ✅ Enrollment 狀態同步
  - ✅ paymentSuccessHandler 冪等性配合
- **已知問題**: 無
  - 相關：`/api/points` POST 允許本人 add／set 自己點數（見 server-auth-guards）
  - `order_refund.spec.ts` 以 email 當 `userId` 讀寫 `/api/points`（L61／L65），被本人檢查回 403；需改用 canonical id 後重跑
- **架構對齊**: ✅ 對齊完成

### 17. payment-gateway-stripe-verification
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`stripe_payment_verification` 6/6（`QA_TEST_BASE_URL=http://localhost:3000`、`APP_ENV=local`、`sk_test_` 金鑰、未開模擬付款；含測試卡結帳與 admin 連線診斷）
  - ✅ Stripe 支付全流程測試
  - ✅ 管理員端服務連線診斷
  - ✅ 環境變數配置統一
  - ✅ APP_ENV 切換驗證
- **已知問題**: 無
- **架構對齊**: ✅ 已完成

### 18. payment-simulation-linepay
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`line_pay_simulated` skip
  - ✅ LINE Pay 模擬支付重定向
  - ✅ Confirm API 模擬邏輯
  - ✅ 環境配置統一 (lib/envConfig.ts)
- **已知問題**: 無
  - spec 判定「LINEPAY is not active in this environment」而略過：本機設定未啟用 LINE Pay（需在 /settings 或 app-integrations 啟用後重跑）
- **架構對齊**: ✅ 對齊完成

### 19. payment-fee-deduction-logic
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`pricing_deduction` 1/1（模擬付款後點數增加 = 套餐點數 − App 方案成本）
  - ✅ App 方案綁定扣點邏輯
  - ✅ 淨點數入帳計算
  - ✅ paymentSuccessHandler 冪等性保證
- **已知問題**: 無
- **架構對齊**: ✅ 對齊完成

### 20. payment-pricing-configuration
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`pricing_fixes_verification` 修正 Fix 9（system 身分 + finally 還原）後 10/10
  - 2026-09-11 批次驗證：`pricing_comprehensive` 1/1（含自動清理）
  - 2026-09-11 批次驗證：`pricing_fixes_verification` 9/10
  - ✅ /settings/pricing 全面功能驗證
  - ✅ 折扣方案與應用程式方案存儲
  - ✅ 環境配置統一 (lib/envConfig.ts)
- **已知問題**: 無
  - Fix 9 用未登入的 `request` fixture POST `/api/admin/pricing`（bd85fe7 起需 admin）→ 401；spec 過時
- **架構對齊**: ✅ 對齊完成

### 21. points-escrow
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`points-escrow-edge-cases-simple` 修正後 7/7：基準點數改用 canonical id + system 身分，escrow release／refund 以 system 身分呼叫（先前這些步驟 403 但被 spec 降為警告）
  - 2026-09-11 批次驗證：修正後 `points-escrow-edge-cases-fixed` 6/6、`points-escrow-quick-release` 1/1（canonical id；escrow release／refund 以 system 身分呼叫，因 `/api/points-escrow` POST 為 withAdmin）
  - 2026-09-11 批次驗證：`admin-teacher-escrow` 修正狀態標籤後 4/4
  - 2026-09-11 批次驗證：`points-escrow-classroom-flow` 1/1（完整教室流程後 escrow 釋放）
  - 2026-09-11 批次驗證：`points-escrow-midway-exit` 1/1（COURSE_DURATION_MINUTES=1、TEACHER_STAY_MINUTES=1）
  - 2026-09-11 批次驗證：`points-escrow-quick-release` 0/1（spec 過時，同 edge-cases-fixed：以 email 設定學生點數被 403）
  - 2026-09-11 批次驗證：`points-escrow-release` 8/8、`points-escrow-edge-cases-simple` 7/7
  - 2026-09-11 批次驗證：`points-escrow-edge-cases-fixed` 0/6（spec 過時，見已知缺口）
  - 2026-09-11 批次驗證：`admin-teacher-escrow` 3/4
  - ✅ 報名時點數扣除與暫存
  - ✅ 課程完成時點數釋放
  - ✅ 課程取消時點數回退
  - ✅ paymentSuccessHandler 冪等性保證
- **已知問題**: 無
  - `points-escrow-edge-cases-fixed.spec.ts` 以 email 當 `userId` 呼叫 `/api/points`（L96／L108）；點數表以 canonical id（`roid_id || id`）為 key，bd85fe7 的本人檢查因此回 403。需改用登入回傳的 canonical id
  - `admin-teacher-escrow.spec.ts` L146 的合法狀態仍是「等待釋放」，UI 已改為「課程進行中」（篩選選項：已入帳／課程進行中／已退款／全部）→ spec 過時
  - `/teacher-escrow` 第一頁 100 列中包含舊壓測殘留（`E2E 自動驗證課程-*`、`group N-student`）
- **架構對齊**: ✅ 對齊完成

### 22. b2b-core-modules
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-12
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：修正 `lib/orgUnitService.ts` 的 null parentId 後：`verify-b2b-access-orgunits` 34/34（建立根部門、搬移到根層級）、`verify-b2c-b2b-course-access` 18/18、`verify-b2b-seat-membership` 37/37
  - 2026-09-11 批次驗證：`verify-b2c-b2b-course-access` 修正後 18/18：腳本改為先建立帶 `orgId` 的會員 profile 再發席位，並新增「有席位但非該組織成員 → 拒絕」反向案例（12c668d 規則）
  - 2026-09-11 批次驗證：`verify-b2b-seat-membership` 37/37
  - 2026-09-11 批次驗證：`verify-b2c-b2b-course-access` 14/17
  - 2026-09-11 批次驗證：`verify-b2b-access-orgunits` 建立根部門失敗後中止（各腳本皆完成 cleanup）
  - ✅ 席次/授權 CRUD 與成員增刪（licenseService、orgMembershipService，含併發搶席次）
  - ✅ orgAccess 授權範圍守門（系統管理員／組織管理員兩層）
  - ✅ 組織單位階層與 moveOrgUnit 原子性（orgUnitService，含併發移動、路徑修復）
  - ✅ B2C/B2B 共用課程存取閘門 accessControl.ts（含優先順序驗證）
- **已知問題**:
  - （已修正 2026-09-12）根部門不再寫入 `parentId: null`；`moveOrgUnit` 移到根層級時改為 `REMOVE parentId`，不再 SET null
  - **app 缺陷**：`lib/orgUnitService.ts:119` 以 `parentId: input.parentId || null` 寫入根部門，正式表 GSI `byParentId` 拒絕 null 鍵值（`Type mismatch for Index Key parentId Expected: S Actual: NULL`）→ 正式環境無法建立根部門。修法同 12c668d 的其他 GSI：根部門省略 `parentId` 欄位
  - `verify-b2c-b2b-course-access` 的 3 個 B2B 席位正向案例失敗：12c668d 起 `lib/accessControl.ts` 要求席位的 `orgId` 等於使用者 profile 的 `orgId`，但腳本只建立 license、未建立帶 `orgId` 的會員 profile → 腳本過時
  - 過程中發現並修復 5 個問題：`orgMembershipService.ts` 的 `plan` 保留字未加別名、`orgId` GSI key 誤用 `SET...=:null`、`accessControl.ts` B2C 分支欄位名對不上真實 schema（`studentID`/`courseID` vs 實際的 `userId`/`courseId`）、正式環境 Licenses 表缺少 `byUserId` GSI（已補上）、複驗時發現併發下 `TransactionConflict` 沒被當成可重試的暫時性衝突而洩漏成原始 AWS 錯誤訊息（連續 5 次重現率 100%，已加重試 wrapper 修復，見 b2b-core-modules SKILL.md）
  - dept_admin 子部門範圍限制未實作，不在本技能範圍
- **架構對齊**: ✅ 對齊完成

### 23. b2b-admin-ui-flow
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-12
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`b2b_admin_ui_flow` 1/1、`b2b_dept_admin_ui_flow` 1/1（升級對象改為學生）、`b2b_audit_log_viewer_ui_flow` 1/1、`b2b_license_panel_ui_flow` 1/1
  - 2026-09-11 批次驗證：修正後 `b2b_admin_ui_flow` 1/1（建立組織 → 巢狀部門 → 成員到席次上限 → 移除）
  - 2026-09-11 批次驗證：`b2b_audit_log_viewer_ui_flow` 1/1、`b2b_license_panel_ui_flow` 1/1
  - 2026-09-11 批次驗證：`b2b_admin_ui_flow` 0/1：部門「工程部」未出現
  - ✅ 真實瀏覽器（headed）走過建組織 → 建部門並巢狀 → 加入成員到席次上限 → 移除成員的完整流程
  - ✅ 席次已滿時 UI 正確 disable 輸入框並顯示提示訊息
  - ✅ 測試自身的清理邏輯（透過 API 直接刪除，不透過 UI）
- **已知問題**:
  - `b2b_admin_ui_flow`／`b2b_dept_admin_ui_flow` 建立部門失敗：`lib/orgUnitService.ts` 寫入 `parentId: null` 到 GSI `byParentId`（app 缺陷，見 b2b-core-modules）
  - 撰寫過程中發現測試自身的清理 bug：用了不帶 session cookie 的獨立 `request` fixture 打 DELETE API，得到 401 但 Playwright 不會 throw，清理靜默失敗，正式環境累積了 3 筆殘留測試組織（已手動清除）。已改用 `page.context().request` 並檢查 `.ok()` 修正
  - 不重複 `b2b-core-modules` 已覆蓋的併發/邊界案例，只示範常見使用者路徑
- **架構對齊**: ✅ 對齊完成

### 24. b2b-enterprise-registration
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-12
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：修正後 `verify-b2b-enterprise-registration` 24/24、`b2b_enterprise_registration_ui_flow` 1/1
  - 2026-09-11 批次驗證：修正「名／姓」欄位定位後 `b2b_enterprise_registration_ui_flow` 1/1（單筆註冊 + CSV 批次匯入，spec 自行清理）
  - 2026-09-11 批次驗證：`b2b_enterprise_registration_ui_flow` 0/1：找不到「First Name」欄位（註冊頁標籤已在地化 → spec 過時，修正中）
  - 2026-09-11 批次驗證：`verify-b2b-enterprise-registration`：建立根部門時中止
  - ✅ `/api/organizations/public` 公開組織清單（含網域過濾、席次計算）
  - ✅ `/api/register` orgId 分支：網域檢查、席次前置檢查、teacher 角色額外建 Teachers 記錄
  - ✅ 併發搶最後幾個席次下的原子性 rollback（輸家不留殘留 profile）
  - ✅ 真實瀏覽器單筆註冊 + CSV 批次匯入全流程
- **已知問題**:
  - 同 `byParentId` null 鍵值缺陷：企業註冊流程在正式環境無法建立根部門
  - 過程中發現並修復 4 個問題：CSV 批次匯入完全沒帶驗證碼欄位（100% 不能用）、`PermissionGuard` 把匿名訪客誤判成 student 角色導致整頁對真實訪客不可達（改頁面權限設定修復，未動 `PermissionGuard.tsx` 邏輯）、`/api/register` 回傳的 profile 是指派組織前的舊快照、`lib/profilesService.ts` 的 `findProfileByEmail` 對查無資料的情況拋錯而非回傳 null（影響 login/forgot-password/create-user/license-assign/member-add 等多處）
  - 順帶發現 `POST /api/admin/settings` 完全沒有認證保護，任何人都能改頁面權限矩陣——獨立的安全問題，不在本技能範圍
- **架構對齊**: ✅ 對齊完成

### 25. b2b-http-license-routes
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-12
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：修正 null parentId 並把 dept_admin 升級對象改為學生後，`verify-b2b-http-routes` 92/92、`b2b_license_panel_ui_flow` 1/1
  - 2026-09-11 批次驗證：`b2b_license_panel_ui_flow` 1/1
  - 2026-09-11 批次驗證：`verify-b2b-http-routes`：`POST /api/org-units` 建立根部門回 500 後腳本中止（已 cleanup）
  - ✅ HTTP route 層本身（`withAuth`/`requireOrgAccess`/`requireSystemAdmin` 串接、request 驗證、狀態碼）——涵蓋 `organizations`、`org-units`、`licenses` 三組共 10 個 route 檔案，86 個斷言
  - ✅ system admin / org admin / plain member 三種真實身分在 HTTP 層的授權分層行為
  - ✅ audit log 實際落地驗證（`organization.create`/`delete.soft`/`delete.hard`、`license.assign`/`unassign`）
  - ✅ 授權管理 UI（`OrgLicensesPanel.tsx`）：批次核發 → 指派 → 取消指派 → 撤銷全流程（headed 瀏覽器）
- **已知問題**:
  - `verify-b2b-http-routes` 以 API 建立的 `DeptAdminTestUnit` 部門未在清理時刪除（本次已手動刪除）
  - 被 `lib/orgUnitService.ts` 的 `parentId: null` 寫入 GSI `byParentId` 缺陷擋下（見 b2b-core-modules）
  - 過程中發現並修復 3 個問題：正式環境 `jvtutorcorner-audit-logs` 資料表從未部署（稽核寫入全部靜默失敗，已建表）、`licenseService.createLicense` 對 `byUserId` GSI key 寫入 `NULL` 導致核發庫存授權必定 500（已修復為省略欄位）、核發上限誤把 `revoked`/`expired` 歷史記錄永久算進配額造成「席次外洩」（已修復為只算 usedSeats + pending）
  - `GET /api/organizations` 與 `GET /api/organizations/[id]` 的授權寬鬆度不一致（前者任何組織成員可讀，後者要求 isOrgAdmin）——記錄但未修復，需要產品判斷該收緊哪一端
- **架構對齊**: ✅ 對齊完成

### 26. learning-content-analysis
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：修正匿名造訪（改為先登入，並新增「匿名被導向 /login」案例）後 `learning_content_analysis` 10/10（1 skip：問卷提交表未建立，基礎設施）
  - 2026-09-11 批次驗證：`learning_content_analysis` 5/10（API 拒絕匿名、415、413、未購課 403 等通過）
  - ✅ 已由商品／藥品辨識改為教材、講義、題目、圖表、投影片與手寫筆記的內容分析
  - ✅ 已對齊 `app/learning-content/page.tsx`、`app/api/learning-content-analysis/route.ts` 與 `lib/learningContentAnalysis.ts`
  - ✅ 已補教材內容標記規範、訓練腳本與學習問卷入口
  - ✅ `e2e/learning_content_analysis.spec.ts` 已驗證新入口、舊路由 redirect、匿名 API 拒絕與舊掃描 API 不得匿名使用
- **已知缺口**:
  - 4 個案例以匿名身分造訪 `/learning-content`、`/medicine-product` 等頁面，bd85fe7 起 `app/learning-content/layout.tsx` 需登入 → 被導向 `/login?reason=learning_content_no_session`；舊路由 redirect 本身正常，spec 需先登入
  - 1 skip：問卷提交表未建立（BLOCKED，基礎設施）
  - 真實 AI provider contract、教材 PDF pipeline、分析結果持久化與完整課程 fixture 尚未完成
- **架構對齊**: ✅ 對齊完成

---

### 27. api-performance-testing
- **狀態**: ❌ UNVERIFIED
- **驗證日期**: -
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：未執行：本機未安裝 k6
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
- **已知缺口**:
  - 見 SKILL.md 故障排除
- **架構對齊**: ⚠️ 待確認

---

### 28. api-registry-management
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`node scripts/inspect_apis.mjs` 掃到 162 支路由並重新產生 `docs/api_registry.md`
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
- **已知缺口**:
  - 見 SKILL.md 故障排除
- **架構對齊**: ⚠️ 待確認

---

### 29. attendance-checkin-qr
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：PermissionGuard 修正後票券頁 SSR 已含 QR `<svg>`，該步驟通過
  - 2026-09-11 批次驗證：`attendance_checkin_qr` 0/1：訂單與票券建立成功，票券頁回 200 且含課程標題
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
  - 測試：`e2e/attendance_checkin_qr.spec.ts`
- **已知缺口**:
  - 首次掃碼報到回 500：正式帳號不存在 `jvtutorcorner-attendance` 表（DescribeTable → ResourceNotFoundException），`/api/attendance/checkin` 寫入時失敗。需先部署該表（本 skill 已註明為前置條件），屬基礎設施缺口
  - 根因（調查確認）：票券頁 SSR HTML 沒有 `<svg>` 是因為 `app/layout.tsx` 的 `<PermissionGuard>` 在伺服器端回傳 null（bd85fe7），不是 qrcode.react 的問題 → app 缺陷
  - 票券頁的伺服器 HTML 不含 `<svg>`：`components/TicketQrCode.tsx`（`QRCodeSVG`）在 SSR 時未輸出 QR，原因未確認，可能為 app 缺陷；後續的掃碼報到步驟因此未執行
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 30. b2b-tenant-isolation
- **狀態**: 🔄 SCAFFOLD
- **驗證日期**: -
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：dept_admin 升級規則：只允許學生（`lib/orgMembershipService.ts` setMemberDeptAdmin），腳本與 UI spec 已對齊
  - 2026-09-11 批次驗證：修正後 `verify-b2b-dept-admin-scope` 28/28（腳本改為以學生升級，並新增「老師不可升為 dept_admin」反向案例；清理順序改為先刪成員 profile 再刪部門）、`b2b_dept_admin_scope.spec.ts` 7/7
  - 2026-09-11 批次驗證：`b2b_dept_admin_scope.spec.ts` 1 fail + 6 skip（serial 模式，第一個案例建立部門時即因 `byParentId` null 鍵值失敗）
  - 2026-09-11 批次驗證：`verify-b2b-dept-admin-scope` 在建立根部門時失敗（同 b2b-core-modules 的 `byParentId` null 鍵值缺陷），scope 斷言未執行
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
  - 測試：`e2e/b2b_dept_admin_scope.spec.ts`
- **已知缺口**:
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 31. b2c-verification
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：PermissionGuard 修正後 `b2c_verification` 8/15：M3.2（訪客可在初始 HTML 看到課程詳情）與 M2.1 通過；剩 M1.2／M1.4／M1.5／M1.6（頁面 title、/courses 列表非 SSR、no-store 快取）為獨立的 SEO 缺陷；3 skip 為 M4
  - 2026-09-11 批次驗證：修正 `registerUserAndVerifyLogin` 空殼後 M2.1（訪客→註冊→購點→報名→進教室）通過；`b2c_verification` 7/15（5 個 M1／M3.2 為已知 SSR／SEO 缺陷，3 skip 為 M4）
  - 2026-09-11 批次驗證：`b2c_verification` 6/15（3 skip：M4 依設計略過，待 tenantId 階段 2）
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
  - 測試：`e2e/b2c_verification.spec.ts`
  - 測試：`e2e/cleanup-test-data.spec.ts`
- **已知缺口**:
  - M2.1 會挑第一門可用課程，與其他 spec 同批執行時可能挑到剛建立、沒有點數費用的測試課程（本次挑到「E3 課程（10 點）」→ 400「此課程未設定點數費用」）；應排除 `test-*` 課程或固定使用專屬 fixture
  - M1.4／M3.2 的直接原因是 `app/layout.tsx` 的 `<PermissionGuard>` 讓 SSR HTML 不含頁面內容（bd85fe7）
  - M2.1 的 401：`e2e/helpers/homepage-helpers.ts` 的 `registerUserAndVerifyLogin` 自 37d12fb 起是空殼（不註冊也不登入），已改寫為真的 API 註冊＋登入並回傳 canonical id
  - M1.2／M1.4／M1.5／M1.6／M3.2：SEO 與 CDN 快取缺陷（公開頁共用 root title、課程內容非 SSR、公開頁 `no-store`）——依本 skill 指示不調降門檻，屬已知架構缺陷
  - M2.1：註冊後以 helper 回傳的 userId 查 `/api/points` 得 403，表示 session.userId 與該 id 不一致；需確認是 spec helper 取錯 id 還是註冊／登入 id 不一致（`app/api/register/route.ts` 正由另一個 session 修改中）
  - 見 SKILL.md 故障排除
- **架構對齊**: ⚠️ 待確認

---

### 32. big-data-collection
- **狀態**: ❌ UNVERIFIED
- **驗證日期**: -
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：透過 `recommendation_onboarding` 驗證 survey seeds API（Suite A 通過）
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
  - 測試：`e2e/navbar_verification.spec.ts`
  - 測試：`e2e/recommendation_onboarding.spec.ts`
- **已知缺口**:
  - 見 SKILL.md 故障排除
- **架構對齊**: ⚠️ 待確認

---

### 33. classroom-ready
- **狀態**: ❌ UNVERIFIED
- **驗證日期**: 2026-04-12
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：未執行：唯一的 spec（`e2e/quick-sync-test.spec.ts`）寫死 https://www.jvtutorcorner.com，不能在本機安全執行
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
  - 測試：`e2e/quick-sync-test.spec.ts`
- **已知缺口**:
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 34. classroom-room
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`classroom/05_wait_pdf_upload` 1/1
  - 2026-09-11 批次驗證：`classroom/06_room_pdf_sync_countdown` 1/3
  - 2026-09-11 批次驗證：`classroom/07_room_pdf_sync_stress`（3 組）0/3
  - 2026-09-11 批次驗證：`classroom_room_verification` 1/1
  - 2026-09-11 批次驗證：`classroom_flow` 1/1（師生雙端同步進入教室）
  - 2026-09-11 批次驗證：`verify_remaining_time` 0/1：建課 helper 先回 `Course lookup failed ... 404`，改走子程序後老師課表仍找不到該課程；原因未確認
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
  - 測試：`e2e/classroom/06_room_pdf_sync_countdown.spec.ts`
  - 測試：`e2e/classroom/05_wait_pdf_upload.spec.ts`
  - 測試：`e2e/classroom/07_room_pdf_sync_stress.spec.ts`
- **已知缺口**:
  - 06 的單頁／多頁 PDF 案例都卡在 `goToWaitRoomDirect`：學生以 API 備援直接導向等待頁後，30 秒內網址未變成 `/classroom/wait`（spec L309），原因未確認
  - 07 三組皆 `room_not_ready`：Netless room 停在 `phase: Init, writable: false`，只在並行時發生
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 35. classroom-room-whiteboard-sync
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`classroom_room_whiteboard_sync` smoke／standard 2/3
  - 2026-09-11 批次驗證：`classroom/04_load_escalation`（3 組）0/3 同步
  - 2026-09-11 批次驗證：`classroom/01_canary` 4/4（單一 session 6 階段檢查點）
  - 2026-09-11 批次驗證：`classroom/02_sync_quality` 1/1（5 次繪圖探針 + 離線重連）
  - 2026-09-11 批次驗證：`classroom/00_preflight` 7/7（系統健康閘道）
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
  - 測試：`e2e/classroom/00_preflight.spec.ts`
  - 測試：`e2e/classroom/01_canary.spec.ts`
  - 測試：`e2e/classroom/02_sync_quality.spec.ts`
- **已知缺口**:
  - 多組並行時白板同步失敗：3 組都完成報名並進入教室，但皆在 whiteboard_sync 階段失敗；單一 session 的 canary 4/4 與 sync_quality 1/1 通過 → 只在並行下發生，原因未確認（本機同時 6 個瀏覽器 + dev server 負載，或 Netless 並行限制）
  - `[standard] Simulate disconnection and reconnection` 在模擬老師離線後 300 秒逾時，原因未確認
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 36. classroom-wait
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`wait-page-redirect` 改用 domcontentloaded 後 1/1；`classroom_wait_verification` 1/1
  - 2026-09-11 批次驗證：`classroom_wait_verification` 1/1
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
- **已知缺口**:
  - `wait-page-redirect.spec.ts` 以 networkidle 等待持續輪詢的頁面而逾時（見上）；另外它只寫入 localStorage 偽造登入，bd85fe7 起需真實 session
  - `e2e/wait-page-redirect.spec.ts` 在 `waitForLoadState('networkidle')` 逾時（40 秒）：等待頁持續輪詢，networkidle 不會發生；測試寫法需改為等待特定元素
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 37. classroom-wait-device-permissions
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`classroom-wait-device-permissions` 8/8（fake media devices）
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
  - 測試：`e2e/classroom-wait-device-permissions.spec.ts`
- **已知缺口**:
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 38. email-notification-testing
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：修正後 `email_hybrid_schema` 7/8（註冊改走 API；唯一失敗為冷卻期 429，因本次以 `DISABLE_RATE_LIMIT=true` 執行）
  - 2026-09-11 批次驗證：`register_and_email_test` 1/1、`email_hybrid_schema` 5/8
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
  - 測試：`e2e/register_and_email_test.spec.ts`
- **已知缺口**:
  - `email_hybrid_schema` 2 個註冊案例找不到 `input[name="captcha"]`（註冊頁驗證碼欄位只剩 placeholder）→ spec 過時
  - 冷卻期案例預期 429 得 200：本次以 `DISABLE_RATE_LIMIT=true` 執行，屬環境因素
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 39. enterprise-general-test-coverage
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`enterprise_general_security_contract` 修正後 34/34
  - 2026-09-11 批次驗證：`audit-enterprise-general-test-coverage.mjs` 與 `audit-enterprise-general-module-matrix.mjs --json` 執行成功：15 COVERED／19 PARTIAL／1 BLOCKED／1 NOT_IMPLEMENTED，未對應 API 群組 0
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
  - 測試：`e2e/b2c_verification.spec.ts`
- **已知缺口**:
  - `enterprise_general_security_contract.spec.ts` 有 2 個過時斷言（AI dispatch 匿名存取）
  - module matrix 的 email-notifications 引用不存在的 `lib/emailService.ts`（HEAD 即如此）
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 40. env-check
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`check-bundle-secrets`（以 `node --env-file=.env.local` 載入實際值）比對 12 個機密 + 5 組字面樣式，133 個 client bundle 檔案中未發現機密
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
- **已知缺口**:
  - `npm run build` 被 `next.config` 的機密檢查擋下：`.env.local` 的 `SESSION_SECRET`、`API_HMAC_SECRET` 仍是已洩漏並作廢的預設值，需輪換（本次用暫時隨機值覆蓋 process env 完成 build，未修改 .env.local）
  - `npm run check:bundle-secrets` 不會自動載入 `.env.local`，直接執行時多數機密顯示「未設定因而未檢查」；需 `node --env-file=.env.local scripts/check-bundle-secrets.mjs`
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 41. homepage-verification
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：PermissionGuard 修正後 `homepage_verification` 27/27（含 9.1 首屏載入）
  - 2026-09-11 批次驗證：`homepage_verification` 26/27
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
  - 測試：`e2e/homepage_verification.spec.ts`
- **已知缺口**:
  - 9.1 首屏載入 21.9 秒（門檻 3 秒）：在 `next dev` 首次編譯下量測，屬環境因素；需在 production build 下重量
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 42. image-analysis
- **狀態**: ❌ UNVERIFIED
- **驗證日期**: -
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：未執行：`analyze-image.js` 需要付費的視覺模型 API，未納入本次批次
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
- **已知缺口**:
  - 見 SKILL.md 故障排除
- **架構對齊**: ⚠️ 待確認

---

### 43. materials-pdf-preview
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：PermissionGuard 修正後，訪客課程頁的 SSR HTML 已含「請先」登入提示
  - 2026-09-11 批次驗證：`materials_pdf_preview`：教師上傳教材並寫入課程紀錄成功
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
  - 測試：`e2e/materials_pdf_preview.spec.ts`
- **已知缺口**:
  - **app 缺陷（資訊外洩）**：`/courses/[id]` 把整筆課程資料（含 `materials` 陣列的檔名、大小與完整 S3 key `course-materials/<courseId>/<timestamp>_<file>`）序列化進 RSC payload，未登入訪客在頁面原始碼即可看到。預覽 API 仍有報名檢查，但檔名與儲存路徑已外露；應在 server component 端移除 `materials`（或只傳筆數）再交給 client
  - 根因（調查確認）：(1) 同 PermissionGuard 讓課程頁 SSR HTML 為空；(2) `components/MaterialsPreviewSection.tsx` 沒有任何地方 import，`app/courses/[id]/page.tsx` 從未加入本 skill 描述的三態教材區塊 → 功能未完成（app 缺陷）
  - 訪客開啟 `/courses/{id}` 時伺服器 HTML 不含「請先」登入提示（`materials_pdf_preview.spec.ts` 訪客段）；可能是提示改由 client 端渲染或文字改由 i18n 提供，原因未確認
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 44. navbar-verification
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：修正選擇器後學生／老師註冊皆成功；2 個案例在執行期自行 skip：「註冊後導覽列未呈現自動登入」
  - 2026-09-11 批次驗證：`navbar_verification` 0/2
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
  - 測試：`e2e/navbar_verification.spec.ts`
- **已知缺口**:
  - 註冊流程現在結束於 Email 驗證卡片、不再自動登入（`app/login/register/page.tsx`），本 skill 描述的「註冊後自動登入」已不是現行產品行為，需更新 skill 或 spec 的預期
  - `selectOption('select:has-text("請選擇身份")', { label: 'Student' })` 找不到選項：註冊頁選項改為 `value=student／teacher`、文字由 i18n 提供；「First Name」標籤也已在地化 → spec 過時
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 45. product-detection-ml
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：同 learning-content-analysis：10/10（1 skip，基礎設施）
  - 2026-09-11 批次驗證：同 learning-content-analysis：`learning_content_analysis` 5/10
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
- **已知缺口**:
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 46. recommendation-onboarding
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：修正後 `recommendation_onboarding` 11/11（3 skip：閒置抽屜設計上略過；問卷抽屜受 `NEXT_PUBLIC_ENABLE_ONBOARDING_QUESTIONNAIRE` 關閉；註冊後問卷已被移除 → fixme）
  - 2026-09-11 批次驗證：`recommendation_onboarding` 10/13（1 skip：閒置抽屜需 3 分鐘計時，設計上略過）
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
  - 測試：`e2e/recommendation_onboarding.spec.ts`
- **已知缺口**:
  - 3 個訪客／註冊後問卷案例失敗：spec 找的「建立帳號獲得更精準推薦」「為你精選的課程」已在 7d0bb91（2026-04-08 首頁改版）移除；需依新首頁更新 spec 或確認推薦區塊是否仍應顯示
  - 見 SKILL.md 故障排除
- **架構對齊**: ✅ 對齊完成

---

### 47. workflow
- **狀態**: ❌ UNVERIFIED
- **驗證日期**: -
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：覆核：CI／commit 規範型 skill，無本機驗證指令
  - 2026-09-11 補登至本表，未重新驗證；驗證細節見 SKILL.md
- **已知缺口**:
  - 見 SKILL.md 故障排除
- **架構對齊**: ⚠️ 待確認

---

### 48. server-auth-guards
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：PermissionGuard 修正後回歸：`server_auth_guards_verification` 26/26、`homepage_verification` 27/27
  - 2026-09-11 批次驗證：修正 PermissionGuard 的 SSR 問題：修正前所有頁面 SSR HTML 的 `<main>` 為 0，修正後 `/`、`/courses`、課程詳情頁皆有 `<main>`，`/courses` 含 `<h1>`；瀏覽器實測無 hydration 警告
  - 2026-09-11 批次驗證：`/api/points` 修正後回歸：`server_auth_guards_verification` 26/26（含 3 個新點數案例）、`order_refund` 1/1、`points-escrow-edge-cases-fixed` 6/6、`points-escrow-quick-release` 1/1
  - 2026-09-11 批次驗證：修正 `POST /api/points` 漏洞：非 admin／system 一律 403（先前本人可 add／set 自己點數）；新增 3 個回歸案例
  - 2026-09-11 批次驗證：修正過時斷言後 `enterprise_general_security_contract` 34/34（AI dispatch：匿名 401、system 身分 catalog 200／空查詢 400）
  - 2026-09-11 批次驗證：`server_auth_guards_verification` 23/23；`enterprise_general_security_contract` 31/33（2 個失敗是過時斷言，見已知缺口）
  - apiGuard 家族 G/S/SYS 與偽造 cookie、錯誤 bypass header
  - HMAC 正向簽章、query／body 竄改、時間戳過期與超前
  - 頁面守衛（接受 dev 模式 200 + 重導向標記）、middleware no-store、登出後 session 失效
  - `e2e/server_auth_guards_verification.spec.ts` 全數通過
- **已知缺口**:
  - **app 缺陷（嚴重）**：`app/api/points/route.ts:54-56` 的 POST 對本人放行所有 action（add／deduct／set），任何已登入學生都能把自己的點數設成任意值。前端與 lib 沒有任何程式碼 POST 此路由（伺服器流程直接呼叫 `lib/pointsStorage.ts`），可直接限制為 admin／system（或 `withAdminOrHmac`）
  - **app 缺陷**：bd85fe7 在 `app/layout.tsx` 以 `<PermissionGuard>` 包住 `<main>`；元件初始 `checking = true` 時回傳 null（`components/auth/PermissionGuard.tsx`），伺服器端永遠不渲染頁面內容 → 所有頁面的 SSR HTML 只有 header／footer。PermissionGuard 本身註明只做顯示、不是安全邊界
  - `enterprise_general_security_contract.spec.ts` L119／L127 仍預期匿名呼叫 `/api/ai-chat/dispatch` 回 200／400；bd85fe7 已刻意改為 `withAuth`（實際 401）。spec 過時，路由正確
  - LINE webhook `x-simulation` 可跳過簽章
  - whiteboard/stream SSE 未驗證
  - make-* 手寫守衛對錯誤角色回 401
- **架構對齊**: ✅ 對齊完成

---

### 49. object-storage-uploads
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`object_storage_uploads_verification` 28/28（含路徑穿越）
  - carousel／avatar／whiteboard／materials 上傳與 presign 的 G/S/T/SYS contract
  - 代理讀取的路徑穿越（400／403）且不洩漏檔案內容
  - `e2e/object_storage_uploads_verification.spec.ts` 全數通過
- **已知缺口**:
  - uploads/carousel 缺檔回 500（avatar 回 404）
  - R2 分支需要 Cloudflare 憑證，未在本機驗證
- **架構對齊**: ✅ 對齊完成

---

### 50. classroom-rtc-providers
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`classroom_rtc_providers_verification` 24/24
  - 2026-09-11 批次驗證：phase1 信令：dual-browser 7/7、ws 10/10、token API 6/7（1 skip：缺 `SIGNALING_TOKEN_SECRET`）
  - LiveKit／Cloudflare SFU／信令／Agora／Netless token API 的授權與「未設定 → 503」
  - `scripts/verify-realtime-sfu-guards.mjs` 19 項
  - `e2e/classroom_rtc_providers_verification.spec.ts` 全數通過
- **已知缺口**:
  - Cloudflare SFU 已設定分支與實際雙向連線待驗證（需憑證）
  - netless/room 未設定時先回 mock room
  - whiteboard/room 在欄位驗證前回 500
- **架構對齊**: ✅ 對齊完成

---

### 51. cloud-hybrid-architecture
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：Phase 0：client bundle 無機密（見 env-check）
  - 2026-09-11 批次驗證：Phase B：`verify-realtime-sfu-guards.mjs` 19/19
  - 文件型：成本比較與混合架構各階段驗收清單
- **已知缺口**:
  - Phase A（R2）與 Phase B（Cloudflare SFU 實際連線）需要 Cloudflare 憑證，未驗證
  - 無自動化測試；狀態依子技能而定
- **架構對齊**: ✅ 對齊完成

---

### 52. abuse-prevention
- **狀態**: ❌ UNVERIFIED
- **驗證日期**: -
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：未執行：無自動化測試；本次所有批次以 `DISABLE_RATE_LIMIT=true` 執行，限流行為未驗證（email_hybrid 的冷卻期 429 案例因此失敗）
  - 文件型：帳號停權、DynamoDB 速率限制、Email 驗證強制
- **已知缺口**:
  - 無自動化測試
  - 速率限制表不存在時 fail-open
  - forgot-password 可列舉帳號且先重設密碼再寄信
- **架構對齊**: ✅ 對齊完成

---

### 53. workflow-engine
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`workflow_engine_verification` 43/43
  - workflows CRUD 與 10 支 action node 的 G 401／S 403／SYS 400
  - http-request 只允許 http(s)
  - `e2e/workflow_engine_verification.spec.ts` 全數通過
- **已知缺口**:
  - 多數 node 的實際外部呼叫未驗證
- **架構對齊**: ✅ 對齊完成

---

### 54. scheduled-jobs
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`scheduled_jobs_verification` 5/5（CRON_SECRET 已設定，未 skip）
  - daily-report status 的 G/S 拒絕
  - 錯誤的 CRON_SECRET（Bearer／x-cron-token）被拒
  - `e2e/scheduled_jobs_verification.spec.ts` 全數通過
- **已知缺口**:
  - process-reminders 非 production 不拒絕
  - daily-report 未設 CRON_SECRET 時開放
  - status GET 匿名回傳報表
- **架構對齊**: ✅ 對齊完成

---

### 55. roles-page-permissions
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`roles_page_permissions_verification` 15/15
  - roles／settings／apps permissions 的 G/S/SYS 與格式錯誤 400
  - roles GET 不含敏感欄位
  - 頁面權限頁與 /apps 的頁面守衛
  - `e2e/roles_page_permissions_verification.spec.ts` 全數通過
- **已知缺口**:
  - 無
- **架構對齊**: ✅ 對齊完成

---

### 56. app-integrations-line-make
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`app_integrations_line_make_verification` 24/24
  - app-integrations／line／make-* 的權限 contract
  - make-webhook 非 JSON body 被拒
  - `e2e/app_integrations_line_make_verification.spec.ts` 全數通過
- **已知缺口**:
  - LINE webhook `x-simulation` 可跳過簽章；debug GET 未驗證
  - make-webhook 未設 secret 時不驗簽章
  - make-sync?health=true 匿名外呼
- **架構對齊**: ✅ 對齊完成

---

### 57. subscriptions-plan-upgrades
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`subscriptions_plan_upgrades_verification` 19/19（含 HMAC 正向案例）
  - 不能替別人建單、不能自己設 PAID、只看得到自己的單
  - HMAC 簽章的 PATCH PAID 被接受（對不存在的單回 404）
  - `e2e/subscriptions_plan_upgrades_verification.spec.ts` 全數通過
- **已知缺口**:
  - 無
- **架構對齊**: ✅ 對齊完成

---

### 58. admin-observability
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`verify-b2b-audit-log-viewer` 12/12
  - 2026-09-11 批次驗證：`admin_observability_verification` 14/14
  - audit-logs／key-logs／agora-logs 的 G/S/SYS
  - agora 遙測空 body 400
  - `e2e/admin_observability_verification.spec.ts` 全數通過
- **已知缺口**:
  - agora 遙測與 client-error 匿名寫入 DynamoDB
  - keyLogger 查詢把排序鍵放進 FilterExpression，錯誤被吞掉
  - 本機沒有 Agora 日誌表時 agora-logs 回 500
- **架構對齊**: ✅ 對齊完成

---

### 59. knowledge-base-rag
- **狀態**: ❌ UNVERIFIED
- **驗證日期**: -
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`workflow_engine_verification` 的 qdrant-knowledge-base 權限 contract 3/3；實際檢索仍因 Qdrant 未部署無法驗證
  - 權限 contract 由 workflow-engine 的 spec 涵蓋（qdrant-knowledge-base node）
- **已知缺口**:
  - Qdrant 未部署，檢索流程未驗證
- **架構對齊**: ⚠️ 待確認

---

### 60. auth-sso
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`auth_sso_verification` 13/13
  - login／forgot-password／resend-verification 缺欄位 400、logout 冪等
  - verify-email 缺參數導回錯誤頁
  - LINE Login 拒絕授權／state 不符／缺 code 都不發 session
  - `e2e/auth_sso_verification.spec.ts` 全數通過
- **已知缺口**:
  - line-login/session DELETE 只清 cookie
  - forgot-password 可列舉帳號
- **架構對齊**: ✅ 對齊完成

---

### 61. db-ops-migrations
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`npm run db:verify:template` 無漂移
  - 2026-09-11 批次驗證：`npm run db:verify`（唯讀比對正式帳號）執行成功
  - `npm run db:verify:template` 可在本機比對範本
- **已知缺口**:
  - 正式帳號缺 4 個 GSI：`jvtutorcorner-enrollments` 的 byCourseId／byOrderId／byOrgId、`jvtutorcorner-courses` 的 byTeacherId；需先部署「GSI 鍵值不寫 null」的修正再跑 `node scripts/setup-db.mjs`（本次未執行，屬基礎設施變更）
  - 實際帳號比對需要 AWS 憑證
- **架構對齊**: ✅ 對齊完成

---

### 62. i18n-localization
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`homepage_verification` 的「1. 語言切換驗證」全數通過
  - 三個語系 key 數一致（各 928）
  - 語言切換由 `e2e/homepage_verification.spec.ts` 涵蓋
- **已知缺口**:
  - key 一致性檢查未進 CI
- **架構對齊**: ✅ 對齊完成

---

### 63. skill-tooling
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-09-11
- **最後更新**: 2026-09-11
- **驗證項目**:
  - 2026-09-11 批次驗證：`npm run skills:validate` 63/63 通過、0 警告；`update-skill-status.js` 正常產生摘要
  - `npm run skills:validate` 0 errors／0 warnings
  - 修正 update-skill-status.js 對含連字號 key 的解析
- **已知缺口**:
  - verify-skills CI 的 update-status job 在 workflow_dispatch 下永不執行
- **架構對齊**: ✅ 對齊完成

---

## 未納入 Skill 的區域

以下頁面／端點刻意沒有獨立 skill（2026-09-11 盤點）：

| 路徑 | 理由 |
|---|---|
| `app/redeem` | 兌換頁面，流程單純，點數相關行為由 points-escrow 等技能涵蓋 |
| `app/testimony` | 靜態見證頁，沒有伺服器端邏輯 |
| `app/products` | 舊商品頁，產品方向已改為教材分析（learning-content-analysis） |
| `app/cyberbiz-affiliate-report` | 內部使用的外部聯盟報表 |
| `app/medicine-survey-settings` | 舊藥品問卷設定，已不在產品方向內 |
| `app/my-courses` | 與 student-courses-page 重疊 |
| `app/test-phase1` | Phase 1 信令測試頁，由 classroom-rtc-providers 的 phase1 spec 使用 |
| `app/api/speed-test` | 等待室網速檢查，由 classroom-wait 間接涵蓋 |

---

## 驗證流程與更新指南

### 新建或更新 Skill 時

1. **建立/編輯 SKILL.md**：在 YAML frontmatter 中添加 `metadata` 欄位
   ```yaml
   ---
   name: skill-name
   description: '...'
   argument-hint: '...'
   metadata:
     verified-status: ✅ VERIFIED | ⚠️ PARTIAL | ❌ UNVERIFIED | 🔄 IN-PROGRESS
     last-verified-date: YYYY-MM-DD
     architecture-aligned: true | false
   ---
   ```
   
   > 注意：不支援直接在 frontmatter 中添加 `verified-status`、`last-verified-date`、`architecture-aligned` 欄位。
   > 必須使用 `metadata` 欄位進行嵌套，才能通過驗證。

2. **更新此文件**：新增或修改對應的 Skill 項目

3. **提交變更**：一併提交 SKILL.md 及此狀態文件

### 架構變動時

1. **偵測變動**：monitor `schema.graphql` 或 `architecture_overview.md` 的改動
2. **標記受影響的 Skills**：更新相關 Skill 的 `verified-status` 為 `⚠️ PARTIAL` 或 `🔄 IN-PROGRESS`
3. **驗證與同步**：執行對應 Skill 的測試並更新此文件
4. **完成標記**：恢復為 `✅ VERIFIED` 或保持其他狀態

### 驗證流程檢查清單

- [ ] 功能測試通過 (E2E 或手動)
- [ ] 依賴的架構實體已實裝
- [ ] API 端點正確且穩定
- [ ] SKILL.md 文件完整
- [ ] 無已知的 blocker issues

---

## 搜尋與過濾

- **已驗證且可用**: `✅ VERIFIED`
- **待驗證**: `❌ UNVERIFIED` / `🔄 IN-PROGRESS`
- **需要注意**: `⚠️ PARTIAL`
- **架構不同步**: `architecture-aligned: false`

---

## 維護者

- 最後更新者: AI Assistant
- 最後更新時間: 2026-04-30
