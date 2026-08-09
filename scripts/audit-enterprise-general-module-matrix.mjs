#!/usr/bin/env node

/**
 * Module-level architecture and test-coverage inventory.
 *
 * Unlike the feature-level audit, this reports layer coverage for every
 * product module: UI, API, service/data model, and executable tests. It is
 * deliberately static and read-only so it can run without AWS credentials or
 * a running web server.
 *
 * Usage:
 *   node scripts/audit-enterprise-general-module-matrix.mjs
 *   node scripts/audit-enterprise-general-module-matrix.mjs --json
 *   node scripts/audit-enterprise-general-module-matrix.mjs --strict
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = new Set(process.argv.slice(2));

const p = (relativePath, layer) => ({ path: relativePath, layer });

const modules = [
  {
    id: 'b2b-enterprise-registration', audience: 'B2B', name: '企業註冊／公開組織／CSV', critical: true,
    evidence: [p('app/login/register_enterprise/page.tsx', 'ui'), p('app/api/register/route.ts', 'api'), p('app/api/organizations/public/route.ts', 'api'), p('lib/organizationService.ts', 'service')],
    tests: ['scripts/verify-b2b-enterprise-registration.mjs', 'e2e/b2b_enterprise_registration_ui_flow.spec.ts'],
    apiGroups: ['register', 'organizations'],
  },
  {
    id: 'b2b-organizations', audience: 'B2B', name: '組織管理／成員管理／HTTP 權限', critical: true,
    evidence: [p('app/admin/organizations/page.tsx', 'ui'), p('app/api/organizations/route.ts', 'api'), p('app/api/organizations/[id]/route.ts', 'api'), p('app/api/organizations/[id]/members/route.ts', 'api'), p('lib/organizationService.ts', 'service'), p('lib/types/b2b.ts', 'data')],
    tests: ['scripts/verify-b2b-http-routes.mjs', 'e2e/b2b_admin_ui_flow.spec.ts'],
    apiGroups: ['organizations'],
  },
  {
    id: 'b2b-org-units', audience: 'B2B', name: '部門／OrgUnit 階層／移動／刪除', critical: true,
    evidence: [p('components/org/OrgUnitTreePanel.tsx', 'ui'), p('app/api/org-units/route.ts', 'api'), p('app/api/org-units/[id]/route.ts', 'api'), p('app/api/org-units/[id]/move/route.ts', 'api'), p('lib/orgUnitService.ts', 'service'), p('lib/types/b2b.ts', 'data')],
    tests: ['scripts/verify-b2b-access-orgunits.mjs', 'scripts/verify-b2b-http-routes.mjs', 'e2e/b2b_admin_ui_flow.spec.ts'],
    apiGroups: ['org-units'],
  },
  {
    id: 'b2b-seats-licenses', audience: 'B2B', name: 'Seat／License／成員指派撤銷', critical: true,
    evidence: [p('components/org/OrgLicensesPanel.tsx', 'ui'), p('app/api/licenses/route.ts', 'api'), p('app/api/licenses/[id]/route.ts', 'api'), p('app/api/licenses/[id]/assign/route.ts', 'api'), p('lib/licenseService.ts', 'service'), p('lib/orgMembershipService.ts', 'service'), p('lib/types/b2b.ts', 'data')],
    tests: ['scripts/verify-b2b-seat-membership.mjs', 'scripts/verify-b2b-http-routes.mjs', 'e2e/b2b_license_panel_ui_flow.spec.ts'],
    apiGroups: ['licenses'],
  },
  {
    id: 'b2b-access-gate', audience: 'B2B/B2C', name: '共用課程存取閘門', critical: true,
    evidence: [p('lib/accessControl.ts', 'service'), p('app/api/courses/[id]/materials/preview/route.ts', 'api'), p('app/api/whiteboard/room/route.ts', 'api'), p('lib/licenseService.ts', 'data')],
    tests: ['scripts/verify-b2c-b2b-course-access.mjs'],
    apiGroups: ['courses', 'whiteboard'],
  },
  {
    id: 'b2b-audit-log', audience: 'B2B', name: '稽核紀錄／Audit log', critical: true,
    evidence: [p('lib/auditLogService.ts', 'service'), p('cloudformation/dynamodb-audit-log-table.yml', 'data'), p('app/api/organizations/route.ts', 'api'), p('app/api/licenses/[id]/assign/route.ts', 'api')],
    tests: ['scripts/verify-b2b-http-routes.mjs'],
    apiGroups: ['organizations', 'licenses'],
  },
  {
    id: 'b2b-dept-admin-scope', audience: 'B2B', name: 'dept_admin 部門／子部門範圍', critical: true,
    evidence: [p('lib/auth/orgAccess.ts', 'service'), p('app/api/org-units/route.ts', 'api'), p('app/api/org-units/[id]/route.ts', 'api'), p('app/api/org-units/[id]/move/route.ts', 'api'), p('app/api/organizations/[id]/members/route.ts', 'api'), p('app/admin/layout.tsx', 'ui')],
    tests: ['scripts/verify-b2b-dept-admin-scope.mjs'],
    apiGroups: ['organizations', 'org-units', 'licenses', 'admin'],
    forcedStatus: 'PARTIAL', note: 'API 層已實作（requireOrgUnitAccess/requireMemberScopeAccess，18 項腳本斷言通過）；缺 dept_admin 專屬 UI 頁面與 e2e/b2b_dept_admin_scope.spec.ts（目前產品沒有任何管理介面能把某個成員設成 dept_admin + 指定 orgUnitId，只能用腳本直接呼叫 guard 函式驗證）。',
  },
  {
    id: 'b2b-tenant-isolation', audience: 'B2B/B2C', name: '跨租戶隔離／Org A-B／DSAR', critical: true,
    evidence: [p('lib/auth/sessionManager.ts', 'service'), p('lib/auth/orgAccess.ts', 'service'), p('lib/types/b2b.ts', 'data')],
    tests: [],
    apiGroups: ['auth', 'organizations', 'courses', 'orders', 'profile'],
    forcedStatus: 'BLOCKED', note: 'SessionPayload 尚無 tenantId，亦無真實 Google SSO fixture。',
  },
  {
    id: 'b2b-google-sso', audience: 'B2B', name: 'Google SSO／企業網域白名單', critical: true,
    evidence: [p('lib/auth/googleSSO.ts', 'service'), p('app/api/auth/google/start/route.ts', 'api'), p('app/api/auth/callback/google/route.ts', 'api'), p('app/login/page.tsx', 'ui')],
    tests: ['e2e/enterprise_general_security_contract.spec.ts'],
    apiGroups: ['auth'],
    forcedStatus: 'PARTIAL', note: '已實作真正的 authorization code exchange + id_token 簽章/issuer/audience/nonce/email_verified 驗證 + state cookie CSRF 防護 + 網域白名單（見 lib/auth/googleSSO.ts），偽造 code/state 一定會被拒絕（見 e2e 測試）。仍是 BLOCKED for 完整成功路徑 E2E：環境沒有真的 GOOGLE_CLIENT_ID/SECRET，無法對真實 Google 帳號跑過一次完整登入。',
  },
  {
    id: 'b2b-billing', audience: 'B2B', name: '企業帳單／合約／續約／發票', critical: true,
    evidence: [p('lib/types/b2b.ts', 'data'), p('app/api/organizations/route.ts', 'api')],
    tests: [],
    apiGroups: ['organizations', 'payments', 'stripe'],
    forcedStatus: 'NOT_IMPLEMENTED', note: '目前只有 Organization billing 欄位，沒有組織層級 billing route。',
  },
  {
    id: 'b2c-auth-account', audience: 'B2C', name: '註冊／登入／Session／Profile／密碼', critical: true,
    evidence: [p('app/login/page.tsx', 'ui'), p('app/login/register/page.tsx', 'ui'), p('app/api/register/route.ts', 'api'), p('app/api/login/route.ts', 'api'), p('app/api/auth/me/route.ts', 'api'), p('app/api/logout/route.ts', 'api'), p('app/api/profile/route.ts', 'api'), p('app/api/forgot-password/route.ts', 'api'), p('lib/auth/sessionManager.ts', 'service'), p('lib/profilesService.ts', 'data')],
    tests: ['e2e/email_verification_flow.spec.ts', 'e2e/navbar_verification.spec.ts', 'e2e/enterprise_general_security_contract.spec.ts'],
    apiGroups: ['login', 'logout', 'register', 'auth', 'profile', 'forgot-password', 'captcha'],
    forcedStatus: 'PARTIAL', note: '有 UI 與匿名邊界測試，但仍缺完整 auth API contract 與已登入 profile 角色測試。',
  },
  {
    id: 'b2c-public-catalog', audience: 'B2C', name: '公開頁／課程目錄／老師目錄／SEO', critical: true,
    evidence: [p('app/page.tsx', 'ui'), p('app/courses/page.tsx', 'ui'), p('app/courses/[id]/page.tsx', 'ui'), p('app/teachers/page.tsx', 'ui'), p('app/api/courses/route.ts', 'api'), p('app/api/teachers/route.ts', 'api'), p('middleware.ts', 'service')],
    tests: ['e2e/b2c_verification.spec.ts', 'e2e/homepage_verification.spec.ts'],
    apiGroups: ['courses', 'teachers', 'carousel', 'i18n'],
    forcedStatus: 'PARTIAL', note: 'SEO metadata、cache、robots/sitemap 仍有已知缺口。',
  },
  {
    id: 'b2c-enrollment-learning', audience: 'B2C', name: '課程報名／學生課程／學習進度', critical: true,
    evidence: [p('app/student_courses/page.tsx', 'ui'), p('app/my-courses/page.tsx', 'ui'), p('app/api/enroll/route.ts', 'api'), p('app/api/courses/[id]/route.ts', 'api'), p('lib/accessControl.ts', 'service')],
    tests: ['e2e/student_enrollment_flow.spec.ts', 'e2e/student_courses_verification.spec.ts', 'e2e/course_alignment_verification.spec.ts'],
    apiGroups: ['enroll', 'courses'],
  },
  {
    id: 'b2c-teacher-course', audience: 'B2C', name: '老師課程建立／編修／學生資訊', critical: true,
    evidence: [p('app/teacher_courses/page.tsx', 'ui'), p('app/courses_manage/page.tsx', 'ui'), p('app/api/courses/route.ts', 'api'), p('app/api/teachers/route.ts', 'api'), p('lib/teacherVisibility.ts', 'service'), p('lib/auth/courseOwnership.ts', 'service')],
    tests: ['e2e/teacher_courses_verification.spec.ts', 'e2e/course_management_flow.spec.ts', 'e2e/course_alignment_verification.spec.ts', 'e2e/enterprise_general_security_contract.spec.ts', 'scripts/verify-course-ownership-scope.mjs'],
    apiGroups: ['courses', 'teachers'],
    forcedStatus: 'PARTIAL', note: 'courses POST/PATCH/DELETE 已加上 withAuth + teacher-ownership 守門（見 lib/auth/courseOwnership.ts，只有課程擁有者或 admin 能改/刪，teacherId 只有 admin 能重新指派）；越權案例（老師 B 改老師 A 的課）現由 scripts/verify-course-ownership-scope.mjs 直接驗證 canManageCourse（8 項斷言通過）。仍缺走真實 HTTP session 的角色矩陣 E2E（目前該層只驗證匿名一定被拒）。',
  },
  {
    id: 'b2c-payments-pricing', audience: 'B2C', name: '方案／點數購買／多金流', critical: true,
    evidence: [p('app/pricing/page.tsx', 'ui'), p('app/api/stripe/checkout/route.ts', 'api'), p('app/api/paypal/create-order/route.ts', 'api'), p('app/api/linepay/checkout/route.ts', 'api'), p('app/api/ecpay/checkout/route.ts', 'api'), p('lib/paymentSuccessHandler.ts', 'service'), p('lib/pricingService.ts', 'service')],
    tests: ['e2e/stripe_payment_verification.spec.ts', 'e2e/line_pay_simulated.spec.ts', 'e2e/point_purchase_simulated.spec.ts', 'e2e/point_purchase_real.spec.ts', 'e2e/pricing_comprehensive.spec.ts'],
    apiGroups: ['stripe', 'paypal', 'linepay', 'ecpay', 'payments', 'plan-upgrades'],
  },
  {
    id: 'b2c-orders-refunds', audience: 'B2C', name: '訂單查詢／退款／點數回復', critical: true,
    evidence: [p('app/orders/page.tsx', 'ui'), p('app/refunds/page.tsx', 'ui'), p('app/api/orders/route.ts', 'api'), p('app/api/orders/[orderId]/route.ts', 'api'), p('lib/paymentSuccessHandler.ts', 'service')],
    tests: ['e2e/order_refund.spec.ts', 'e2e/stripe_payment_verification.spec.ts'],
    apiGroups: ['orders', 'payments'],
  },
  {
    id: 'b2c-points-escrow', audience: 'B2C', name: '點數暫存／釋放／取消回退', critical: true,
    evidence: [p('app/teacher-escrow/page.tsx', 'ui'), p('app/api/points/route.ts', 'api'), p('app/api/points-escrow/route.ts', 'api'), p('lib/pointsEscrow.ts', 'service'), p('lib/pointsStorage.ts', 'data')],
    tests: ['e2e/points-escrow-edge-cases-fixed.spec.ts', 'e2e/points-escrow-classroom-flow.spec.ts', 'e2e/points-escrow-release.spec.ts', 'e2e/admin-teacher-escrow.spec.ts'],
    apiGroups: ['points', 'points-escrow'],
  },
  {
    id: 'classroom-wait-device', audience: 'B2C/B2B', name: '等待室／設備權限／進入教室', critical: true,
    evidence: [p('app/classroom/wait/page.tsx', 'ui'), p('app/checkDevices/page.tsx', 'ui'), p('app/api/classroom/session/route.ts', 'api'), p('app/api/speed-test/route.ts', 'api')],
    tests: ['e2e/classroom_wait_verification.spec.ts', 'e2e/classroom-wait-device-permissions.spec.ts', 'e2e/wait-page-redirect.spec.ts'],
    apiGroups: ['classroom', 'speed-test'],
  },
  {
    id: 'classroom-live-whiteboard', audience: 'B2C/B2B', name: '視訊／Agora／白板／即時同步', critical: true,
    evidence: [p('app/classroom/room/page.tsx', 'ui'), p('app/api/agora/token/route.ts', 'api'), p('app/api/whiteboard/room/route.ts', 'api'), p('app/api/whiteboard/event/route.ts', 'api'), p('lib/whiteboardService.ts', 'service'), p('lib/agora', 'service')],
    tests: ['e2e/classroom_room_verification.spec.ts', 'e2e/classroom_room_whiteboard_sync.spec.ts', 'e2e/classroom_flow.spec.ts', 'e2e/classroom_stress_test_multi_duration.spec.ts'],
    apiGroups: ['agora', 'classroom', 'signaling', 'whiteboard', 'netless', 'token'],
  },
  {
    id: 'classroom-materials', audience: 'B2C/B2B', name: 'PDF 教材／線上預覽／同步', critical: true,
    evidence: [p('app/api/courses/[id]/materials/route.ts', 'api'), p('app/api/courses/[id]/materials/preview/route.ts', 'api'), p('app/api/whiteboard/pdf/route.ts', 'api'), p('lib/pdfUtils.ts', 'service'), p('lib/s3.ts', 'data')],
    tests: ['e2e/materials_pdf_preview.spec.ts', 'e2e/classroom_room_whiteboard_sync.spec.ts'],
    apiGroups: ['courses', 'whiteboard'],
  },
  {
    id: 'recommendation-onboarding', audience: 'B2C', name: '問卷／推薦／行為追蹤', critical: false,
    evidence: [p('app/questionnaire/page.tsx', 'ui'), p('app/api/questionnaire/route.ts', 'api'), p('app/api/recommendations/route.ts', 'api'), p('lib/questionnaireService.ts', 'service'), p('lib/recommendationEngine.ts', 'service'), p('app/api/tracking/course-click/route.ts', 'api')],
    tests: ['e2e/recommendation_onboarding.spec.ts', 'e2e/homepage_verification.spec.ts'],
    apiGroups: ['questionnaire', 'recommendations', 'survey', 'tracking'],
  },
  {
    id: 'teacher-review-management', audience: 'B2C/Admin', name: '老師資料／變更申請／審核', critical: true,
    evidence: [p('app/teachers/page.tsx', 'ui'), p('app/admin/teacher-reviews/page.tsx', 'ui'), p('app/api/teachers/[id]/review-request/route.ts', 'api'), p('app/api/admin/teacher-reviews/route.ts', 'api'), p('lib/teacherReviewService.ts', 'service')],
    tests: ['e2e/course_management_flow.spec.ts'],
    apiGroups: ['teachers', 'admin'],
    forcedStatus: 'PARTIAL', note: '缺完整 pending／approve／reject／resubmit 與角色隔離回歸。',
  },
  {
    id: 'course-review-management', audience: 'B2C/Admin', name: '課程建立／送審／管理員核准', critical: true,
    evidence: [p('app/admin/course-reviews/page.tsx', 'ui'), p('app/api/admin/course-reviews/route.ts', 'api'), p('lib/organizationService.ts', 'service')],
    tests: ['e2e/course_management_flow.spec.ts'],
    apiGroups: ['admin', 'courses'],
    forcedStatus: 'PARTIAL', note: '存在主流程測試，但拒絕／重送／越權案例不足。',
  },
  {
    id: 'admin-operations', audience: 'Admin', name: '訂單／統計／設定／角色／定價後台', critical: true,
    // 沒有 app/api/admin/orders/route.ts —— /admin/orders 頁面（見 components/OrdersManager.tsx）
    // 走的是共用的 app/api/orders/route.ts（已有 withAuth/withAdmin + 自身角色隔離），不是漏掉的路由。
    evidence: [p('app/admin/orders/page.tsx', 'ui'), p('app/admin/analytics/page.tsx', 'ui'), p('app/admin/settings/page.tsx', 'ui'), p('app/admin/roles/page.tsx', 'ui'), p('app/api/orders/route.ts', 'api'), p('app/api/admin/stats/route.ts', 'api'), p('app/api/admin/settings/route.ts', 'api'), p('app/api/admin/roles/route.ts', 'api')],
    tests: ['e2e/pricing_comprehensive.spec.ts', 'e2e/probe_admin_pricing.spec.ts', 'e2e/enterprise_general_security_contract.spec.ts'],
    apiGroups: ['admin', 'orders', 'shared'],
    forcedStatus: 'PARTIAL', note: 'stats／teacher-reviews／teacher-reviews/history／payments／subscriptions／key-logs／ai-models(POST)／workflows 現已補上共用 auth/role guard（見 e2e/enterprise_general_security_contract.spec.ts）；settings/pricing/roles 的 GET 故意保持公開（Header/公開頁需要），POST 已鎖 admin。仍缺完整的 admin 操作 API contract（拒絕/越權案例）。',
  },
  {
    id: 'ai-chat-workflow', audience: '共通', name: 'AI Chat／Agent／Tool calling／Workflow', critical: true,
    evidence: [p('app/apps/ai-chat/page.tsx', 'ui'), p('app/api/ai-chat/route.ts', 'api'), p('app/api/ai-chat/dispatch/route.ts', 'api'), p('app/api/workflows/execute/route.ts', 'api'), p('lib/workflowEngine.ts', 'service'), p('lib/workflowService.ts', 'service'), p('lib/platform-agents.ts', 'service')],
    tests: ['e2e/enterprise_general_security_contract.spec.ts'],
    apiGroups: ['ai-chat', 'chat', 'workflows'],
    forcedStatus: 'PARTIAL', note: 'workflows 的 CRUD/execute 與 9 個 action node route（gmail-send、http-request 等）先前完全沒有 auth（http-request 等同公開 SSRF 工具），已補 withAdmin／withAdminOrHmac，workflowEngine 內部呼叫改用 HMAC 簽名；仍未驗多 provider、工具呼叫失敗回復。figma-export／notebooklm-create／export-file／context7-retrieve 仍是 TODO stub，只是現在至少不再是匿名可打。',
  },
  {
    id: 'email-notifications', audience: '共通', name: 'Email 驗證／提醒／郵件服務', critical: false,
    evidence: [p('app/api/auth/verify-email/route.ts', 'api'), p('app/api/auth/resend-verification/route.ts', 'api'), p('lib/email', 'service'), p('lib/emailService.ts', 'service')],
    tests: ['e2e/email_verification_flow.spec.ts', 'e2e/email_service_verification.spec.ts', 'e2e/email_hybrid_schema.spec.ts', 'e2e/email_link_base_url.spec.ts'],
    apiGroups: ['auth', 'calendar', 'test'],
  },
  {
    id: 'attendance-checkin', audience: 'B2C/B2B', name: 'QR 報到／票券／通知', critical: false,
    evidence: [p('app/api/attendance/checkin/route.ts', 'api'), p('lib/attendance', 'service'), p('lib/ticket', 'service')],
    tests: ['e2e/attendance_checkin_qr.spec.ts'],
    apiGroups: ['attendance'],
  },
  {
    id: 'integrations-automation', audience: '共通', name: 'App integration／LINE／Make／自動化', critical: false,
    evidence: [p('app/add-app/page.tsx', 'ui'), p('app/api/app-integrations/route.ts', 'api'), p('app/api/integration/make-webhook/route.ts', 'api'), p('app/api/line/webhook/[integrationId]/route.ts', 'api'), p('lib/integration', 'service')],
    tests: ['e2e/line_pay_simulated.spec.ts'],
    apiGroups: ['app-integrations', 'integration', 'line'],
    forcedStatus: 'PARTIAL', note: '有整合程式碼，但 Make／LINE webhook／秘密欄位保護缺專用回歸。',
  },
  {
    id: 'scheduled-jobs-reminders', audience: '共通', name: '日曆／提醒／Cron／排程工作', critical: true,
    evidence: [p('app/calendar/page.tsx', 'ui'), p('app/api/calendar/reminders/route.ts', 'api'), p('app/api/cron/process-reminders/route.ts', 'api'), p('app/api/cron/daily-report/route.ts', 'api'), p('lib/dailyReportService.ts', 'service'), p('lib/email', 'service')],
    tests: ['scripts/test-reminder-flow.ts', 'e2e/enterprise_general_security_contract.spec.ts'],
    apiGroups: ['calendar', 'cron'],
    forcedStatus: 'PARTIAL', note: 'reminders 主 route 與 backfill/migrate 兩支 sibling route 先前用 client 自報的 isAdmin query/body 判斷權限（形同沒有守門），已改成 withAuth/withAnyAuth 由 session role 決定，internal enroll→reminders 呼叫改用 HMAC 簽名；仍缺 scheduler／重試／重複執行的完整 contract。',
  },
  {
    id: 'app-permissions', audience: '共通/Admin', name: '應用程式權限／整合服務設定', critical: true,
    evidence: [p('app/apps/page.tsx', 'ui'), p('app/api/apps/permissions/route.ts', 'api'), p('lib/appPermissionsService.ts', 'service'), p('app/api/app-integrations/route.ts', 'api')],
    tests: ['e2e/enterprise_general_security_contract.spec.ts'],
    apiGroups: ['apps', 'app-integrations'],
    forcedStatus: 'PARTIAL',
    note: '先前這整組完全沒有 auth，已鎖 admin：' +
      'app/api/app-integrations/route.ts 的 GET 原本匿名 scan 全表就能拿到所有使用者的第三方 ' +
      'API 金鑰／LINE channelAccessToken／channelSecret（明文存在 config），POST/PUT/DELETE 任何人 ' +
      '都能寫入/覆寫/刪除任意 userId 的整合設定；app-integrations/test 會拿呼叫端提供的 config 去連線 ' +
      '外部服務，等同匿名可用的 SSRF/憑證探測工具；apps/permissions 的 GET/POST 能讀寫全站權限矩陣；' +
      'line/push 不帶 userEmail 時會廣播給所有已綁定 LINE 的使用者；image-analysis 任何人都能觸發 ' +
      '付費的 AI 視覺模型呼叫（已改用 withAdminOrHmac，因為 workflow 引擎會用 HMAC 呼叫）。全部已補 ' +
      '匿名拒絕回歸測試（e2e/enterprise_general_security_contract.spec.ts）。仍缺 secret masking（GET ' +
      '回傳目前仍是明文 config，只是現在多了 admin 門檻）與已登入非 admin 角色的越權測試。',
  },
  {
    id: 'learning-content-analysis', audience: '平台附加', name: '教學教材／內容影像分析與學習問卷', critical: false,
    evidence: [p('app/learning-content/page.tsx', 'ui'), p('app/questionnaire/[mode]/page.tsx', 'ui'), p('app/api/learning-content-analysis/route.ts', 'api'), p('app/api/questionnaire/route.ts', 'api'), p('lib/learningContentAnalysis.ts', 'service'), p('lib/questionnaireService.ts', 'service'), p('types/questionnaire.ts', 'data')],
    tests: ['e2e/learning_content_analysis.spec.ts'],
    apiGroups: ['learning-content-analysis', 'questionnaire', 'scan-product', 'image-analysis'],
    forcedStatus: 'PARTIAL',
    note: '已重構為教材／課程內容影像分析與學習問卷：新頁面使用真正 session、新 API 支援課程 access check，問卷重用既有 learning questionnaire。舊 /product-scan、/medicine-product 與 /api/scan-product 僅保留相容入口，不再發點數。仍缺真實 AI provider contract、分析結果持久化與教材檔案／PDF pipeline。',
  },
  {
    id: 'platform-observability', audience: '共通', name: 'Debug／健康檢查／錯誤／上傳', critical: false,
    evidence: [p('app/api/ping/route.ts', 'api'), p('app/api/test-db/route.ts', 'api'), p('app/api/client-error/route.ts', 'api'), p('app/api/uploads/avatar/[...path]/route.ts', 'api'), p('lib/awsHealthChecker.ts', 'service')],
    tests: ['e2e/smoke.spec.ts'],
    apiGroups: ['ping', 'test-db', 'client-error', 'uploads', 'avatar', 'debug', 'debug-env'],
    forcedStatus: 'PARTIAL', note: '有 smoke 但缺 production-safe health／secret exposure／upload authorization matrix。',
  },
];

function abs(relativePath) { return path.join(ROOT, relativePath); }
function exists(relativePath) { return fs.existsSync(abs(relativePath)); }
function read(relativePath) {
  if (!exists(relativePath)) return '';
  return fs.statSync(abs(relativePath)).isFile() ? fs.readFileSync(abs(relativePath), 'utf8') : '';
}

const report = modules.map((module) => {
  const missingEvidence = module.evidence.filter((item) => !exists(item.path)).map((item) => item.path);
  const existingTests = module.tests.filter(exists);
  const layers = ['ui', 'api', 'service', 'data'].reduce((acc, layer) => {
    acc[layer] = module.evidence.some((item) => item.layer === layer && exists(item.path));
    return acc;
  }, {});
  const source = module.evidence.map((item) => read(item.path)).join('\n');
  const hasStub = /\bSTUB\b|TODO:\s*(實現|implement)|not implemented yet/i.test(source);
  let status = module.forcedStatus;
  if (!status) {
    if (missingEvidence.length > 0) status = 'PARTIAL';
    else if (hasStub) status = 'NOT_IMPLEMENTED';
    else if (existingTests.length === 0) status = 'UNTESTED';
    else if (!layers.api || !layers.service) status = 'PARTIAL';
    else status = 'COVERED';
  }
  return {
    id: module.id,
    audience: module.audience,
    name: module.name,
    critical: module.critical,
    status,
    layers,
    evidenceCount: module.evidence.length - missingEvidence.length,
    evidenceTotal: module.evidence.length,
    tests: existingTests,
    missingEvidence,
    note: module.note || '',
  };
});

const allRouteFiles = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === 'route.ts' || entry.name === 'route.js') allRouteFiles.push(full);
  }
}
walk(abs('app/api'));

const mappedApiGroups = new Set(modules.flatMap((module) => module.apiGroups));
const apiGroups = [...new Set(allRouteFiles.map((file) => {
  const relative = path.relative(abs('app/api'), file).replaceAll(path.sep, '/');
  return relative.split('/')[0];
}))].sort();
const unmappedApiGroups = apiGroups.filter((group) => !mappedApiGroups.has(group));

const summary = report.reduce((acc, module) => {
  acc[module.status] = (acc[module.status] || 0) + 1;
  return acc;
}, {});

const output = {
  generatedAt: new Date().toISOString(),
  summary,
  apiGroupCount: apiGroups.length,
  apiGroups,
  unmappedApiGroups,
  modules: report,
};

if (args.has('--json')) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log('Enterprise + General Module Architecture Matrix');
  console.log(`Summary: ${Object.entries(summary).map(([key, value]) => `${key}=${value}`).join(' | ')}`);
  console.log(`API domains: ${apiGroups.length}; unmapped domains: ${unmappedApiGroups.length}`);
  console.log('');
  for (const module of report) {
    const layerText = Object.entries(module.layers).map(([layer, covered]) => `${layer}=${covered ? 'yes' : 'no'}`).join(' ');
    console.log(`[${module.status}] ${module.audience} / ${module.name}${module.critical ? ' [critical]' : ''}`);
    console.log(`  Layers: ${layerText}; tests=${module.tests.length}/${module.evidenceTotal}`);
    if (module.missingEvidence.length) console.log(`  Missing: ${module.missingEvidence.join(', ')}`);
    if (module.note) console.log(`  Note: ${module.note}`);
  }
  console.log('');
  console.log(`Unmapped API domains: ${unmappedApiGroups.length ? unmappedApiGroups.join(', ') : 'none'}`);
}

if (args.has('--strict')) {
  const blocking = report.filter((module) => module.critical && module.status !== 'COVERED');
  process.exitCode = blocking.length > 0 ? 1 : 0;
}
