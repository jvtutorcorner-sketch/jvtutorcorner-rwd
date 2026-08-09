#!/usr/bin/env node

/**
 * Static coverage audit for the two product surfaces documented in
 * docs/b2b-b2c-module-matrix.md.
 *
 * This intentionally does not touch DynamoDB or a running server. It answers
 * a different question from the E2E suites: which promised capabilities have
 * executable evidence, which are only partially covered, and which are still
 * blocked by missing implementation.
 *
 * Usage:
 *   node scripts/audit-enterprise-general-test-coverage.mjs
 *   node scripts/audit-enterprise-general-test-coverage.mjs --json
 *   node scripts/audit-enterprise-general-test-coverage.mjs --strict
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = new Set(process.argv.slice(2));

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(absolute(relativePath));
}

function sourceContains(relativePaths, pattern) {
  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  return relativePaths.some((relativePath) => {
    if (!exists(relativePath)) return false;
    return regex.test(fs.readFileSync(absolute(relativePath), 'utf8'));
  });
}

function allExist(relativePaths) {
  return relativePaths.every(exists);
}

function anyExist(relativePaths) {
  return relativePaths.some(exists);
}

function result(area, feature, status, evidence, tests, gap, critical = false) {
  return { area, feature, status, evidence, tests, gap, critical };
}

const b2bRoutes = [
  'app/api/organizations/route.ts',
  'app/api/organizations/[id]/route.ts',
  'app/api/organizations/[id]/members/route.ts',
  'app/api/organizations/[id]/members/[profileId]/route.ts',
  'app/api/organizations/public/route.ts',
  'app/api/org-units/route.ts',
  'app/api/org-units/[id]/route.ts',
  'app/api/org-units/[id]/move/route.ts',
  'app/api/licenses/route.ts',
  'app/api/licenses/[id]/route.ts',
  'app/api/licenses/[id]/assign/route.ts',
];

const b2cFlowTests = [
  'e2e/b2c_verification.spec.ts',
  'e2e/student_enrollment_flow.spec.ts',
  'e2e/student_courses_verification.spec.ts',
  'e2e/teacher_courses_verification.spec.ts',
  'e2e/course_alignment_verification.spec.ts',
  'e2e/course_management_flow.spec.ts',
];

const results = [
  result(
    'B2B',
    '企業註冊、公開組織清單、CSV 批次匯入',
    allExist([
      'scripts/verify-b2b-enterprise-registration.mjs',
      'e2e/b2b_enterprise_registration_ui_flow.spec.ts',
    ]) ? 'COVERED' : 'UNTESTED',
    ['app/login/register_enterprise/page.tsx', 'app/api/register/route.ts', 'app/api/organizations/public/route.ts'],
    ['scripts/verify-b2b-enterprise-registration.mjs', 'e2e/b2b_enterprise_registration_ui_flow.spec.ts'],
    '需定期確認測試使用的網域、CSV 與 CAPTCHA bypass fixture 仍可用。',
  ),
  result(
    'B2B',
    '組織、部門、成員、席次與授權 CRUD',
    allExist([
      'scripts/verify-b2b-seat-membership.mjs',
      'scripts/verify-b2b-access-orgunits.mjs',
      'scripts/verify-b2b-http-routes.mjs',
      'e2e/b2b_admin_ui_flow.spec.ts',
      'e2e/b2b_license_panel_ui_flow.spec.ts',
    ]) ? 'COVERED' : 'PARTIAL',
    b2bRoutes,
    [
      'scripts/verify-b2b-seat-membership.mjs',
      'scripts/verify-b2b-access-orgunits.mjs',
      'scripts/verify-b2b-http-routes.mjs',
      'e2e/b2b_admin_ui_flow.spec.ts',
      'e2e/b2b_license_panel_ui_flow.spec.ts',
    ],
    '核心 service、HTTP wiring 與主要 UI 路徑都有證據；測試會寫入外部 DynamoDB，執行前需確認環境與清理策略。',
    true,
  ),
  result(
    'B2B',
    'B2C/B2B 課程存取閘門',
    exists('scripts/verify-b2c-b2b-course-access.mjs') ? 'COVERED' : 'UNTESTED',
    ['lib/accessControl.ts', 'app/api/courses/[id]/materials/preview/route.ts', 'app/api/whiteboard/room/route.ts'],
    ['scripts/verify-b2c-b2b-course-access.mjs'],
    '目前涵蓋共用 access gate，但不是完整跨租戶 E2E。',
    true,
  ),
  result(
    'B2B',
    '跨租戶隔離（Org A/B）',
    !sourceContains(['lib/auth/sessionManager.ts'], /tenantId/) || !exists('e2e/b2b_tenant_isolation.spec.ts')
      ? 'BLOCKED'
      : 'COVERED',
    ['lib/auth/sessionManager.ts', 'lib/auth/orgAccess.ts'],
    ['e2e/b2b_tenant_isolation.spec.ts', 'e2e/b2c_verification.spec.ts'],
    'SessionPayload 尚無 tenantId，且沒有獨立可執行的 Org A/B 真實 SSO fixture；目前只能算設計缺口，不應以 skip 當成通過。',
    true,
  ),
  result(
    'B2B',
    'dept_admin 部門／子部門範圍限制',
    sourceContains(['lib/auth/orgAccess.ts'], /requireOrgUnitAccess/) &&
    exists('e2e/b2b_dept_admin_scope.spec.ts') &&
    exists('scripts/verify-b2b-dept-admin-scope.mjs')
      ? 'PARTIAL'
      : 'NOT_IMPLEMENTED',
    ['lib/auth/orgAccess.ts', 'app/api/org-units/route.ts', 'app/api/organizations/[id]/members/route.ts', 'app/admin/layout.tsx'],
    ['e2e/b2b_dept_admin_scope.spec.ts', 'scripts/verify-b2b-dept-admin-scope.mjs'],
    'API 層守門（requireOrgUnitAccess/requireMemberScopeAccess）與測試都已存在（25 項斷言，含 Playwright 版與無頭腳本版）；停在 PARTIAL 是因為產品沒有任何 UI 能把某個成員設成 dept_admin + 指定 orgUnitId，所以沒有對應的瀏覽器 E2E 能走完整條使用者路徑。',
    true,
  ),
  result(
    'B2B',
    'Google SSO／企業白名單登入',
    sourceContains(['app/api/auth/callback/google/route.ts'], /STUB|prototype|valid code string/i)
      ? 'NOT_IMPLEMENTED'
      : sourceContains(['lib/auth/googleSSO.ts'], /verifyGoogleIdToken/) &&
        sourceContains(['e2e/enterprise_general_security_contract.spec.ts'], /forged code\/state/)
        ? 'PARTIAL'
        : 'UNTESTED',
    ['lib/auth/googleSSO.ts', 'app/api/auth/google/start/route.ts', 'app/api/auth/callback/google/route.ts', 'app/login/page.tsx'],
    ['e2e/enterprise_general_security_contract.spec.ts'],
    'callback 已改成真正的 authorization code exchange + id_token 簽章/issuer/audience/nonce/email_verified 驗證 + state cookie CSRF 防護 + 網域白名單；有測試證明偽造 code/state 一定被拒絕、絕不會設下 session。停在 PARTIAL（非 COVERED）是因為環境沒有真的 GOOGLE_CLIENT_ID/SECRET，無法對真實 Google 帳號跑一次成功的完整登入路徑 —— 那部分仍是 BLOCKED，需要真實憑證才能補測。',
    true,
  ),
  result(
    'B2B',
    '企業帳單／組織層級金流',
    anyExist([
      'app/api/organizations/billing/route.ts',
      'app/api/organizations/subscription/route.ts',
      'app/api/organization-billing/route.ts',
    ]) ? 'PARTIAL' : 'NOT_IMPLEMENTED',
    ['lib/types/b2b.ts', 'app/api/organizations/route.ts'],
    ['e2e/b2b_billing_flow.spec.ts'],
    '目前只有 Organization billing 欄位與個人支付測試，沒有企業付款、發票、續約或 webhook 的專屬路徑與測試。',
  ),
  result(
    'B2C',
    '公開頁、SEO、訪客可及性',
    exists('e2e/b2c_verification.spec.ts') ? 'PARTIAL' : 'UNTESTED',
    ['app/page.tsx', 'app/courses/page.tsx', 'middleware.ts'],
    ['e2e/b2c_verification.spec.ts'],
    '既有 M1/M3 測試存在，但 M1 有已知失敗項，且 M4 邊界以 skip；需區分 failed、skipped 與 covered。',
    true,
  ),
  result(
    'B2C',
    '註冊、登入、Session、Email 驗證、忘記密碼、Profile',
    anyExist(['e2e/email_verification_flow.spec.ts', 'e2e/navbar_verification.spec.ts', 'e2e/enterprise_general_security_contract.spec.ts'])
      ? 'PARTIAL'
      : 'UNTESTED',
    ['app/api/register/route.ts', 'app/api/login/route.ts', 'app/api/auth/me/route.ts', 'app/api/profile/route.ts', 'app/api/forgot-password/route.ts'],
    ['e2e/email_verification_flow.spec.ts', 'e2e/navbar_verification.spec.ts', 'e2e/enterprise_general_security_contract.spec.ts'],
    '有註冊／驗證的 UI 證據，但沒有一支完整且不依賴頁面偶然狀態的 auth API contract suite；/auth/me、logout、forgot-password、profile 權限邊界仍需補。',
    true,
  ),
  result(
    'B2C',
    '課程瀏覽、報名、學生／老師課程頁',
    allExist([
      'e2e/student_enrollment_flow.spec.ts',
      'e2e/student_courses_verification.spec.ts',
      'e2e/teacher_courses_verification.spec.ts',
      'e2e/course_alignment_verification.spec.ts',
    ]) ? 'COVERED' : 'PARTIAL',
    ['app/api/courses/route.ts', 'app/api/enroll/route.ts', 'app/student_courses/page.tsx', 'app/teacher_courses/page.tsx'],
    ['e2e/student_enrollment_flow.spec.ts', 'e2e/student_courses_verification.spec.ts', 'e2e/teacher_courses_verification.spec.ts', 'e2e/course_alignment_verification.spec.ts'],
    '主流程有覆蓋；仍需在 CI 中確認找不到課程時不是無聲 skip。',
    true,
  ),
  result(
    'B2C',
    '付款、點數、退款、Escrow',
    allExist([
      'e2e/stripe_payment_verification.spec.ts',
      'e2e/line_pay_simulated.spec.ts',
      'e2e/order_refund.spec.ts',
      'e2e/points-escrow-edge-cases-fixed.spec.ts',
    ]) ? 'COVERED' : 'PARTIAL',
    ['app/api/stripe', 'app/api/linepay', 'app/api/orders', 'app/api/points-escrow'],
    ['e2e/stripe_payment_verification.spec.ts', 'e2e/line_pay_simulated.spec.ts', 'e2e/order_refund.spec.ts', 'e2e/points-escrow-edge-cases-fixed.spec.ts'],
    '主要支付 provider 與資產狀態有測試；真實金流、外部 webhook 與環境 secrets 仍需依 provider 分開執行。',
    true,
  ),
  result(
    'B2C',
    '等待室、教室、白板、PDF 同步',
    anyExist(['e2e/classroom_wait_verification.spec.ts', 'e2e/classroom_room_verification.spec.ts', 'e2e/classroom_room_whiteboard_sync.spec.ts'])
      ? 'COVERED'
      : 'UNTESTED',
    ['app/classroom/wait/page.tsx', 'app/classroom/room/page.tsx', 'app/api/whiteboard/room/route.ts'],
    ['e2e/classroom_wait_verification.spec.ts', 'e2e/classroom_room_verification.spec.ts', 'e2e/classroom_room_whiteboard_sync.spec.ts', 'e2e/materials_pdf_preview.spec.ts'],
    '有多層測試；壓力測試需單獨執行，不能當成一般功能 smoke test。',
  ),
  result(
    'B2C',
    '問卷、推薦、行為追蹤',
    exists('e2e/recommendation_onboarding.spec.ts') ? 'COVERED' : 'UNTESTED',
    ['app/api/questionnaire/route.ts', 'app/api/recommendations/route.ts', 'app/api/tracking/course-click/route.ts'],
    ['e2e/recommendation_onboarding.spec.ts'],
    '已有首頁／問卷流程測試；建議補 API 失敗與冷啟動空資料案例。',
  ),
  result(
    'B2C',
    'AI Chat、tool calling、多 provider、workflow tools',
    anyExist(['e2e/ai_chat_verification.spec.ts', 'e2e/enterprise_general_security_contract.spec.ts', 'scripts/test-ai-chat.mjs']) ? 'PARTIAL' : 'UNTESTED',
    ['app/api/ai-chat/route.ts', 'app/api/ai-chat/dispatch/route.ts', 'app/api/workflows/execute/route.ts'],
    ['e2e/enterprise_general_security_contract.spec.ts', 'e2e/ai_chat_verification.spec.ts', 'scripts/test-ai-chat.mjs'],
    '目前有 UI/API 程式碼，但沒有對應專用驗證腳本；多 provider 與工具拒絕／錯誤路徑屬高風險缺口。',
  ),
  result(
    'B2C',
    '老師資料審核、課程審核、後台營運',
    anyExist(['e2e/course_management_flow.spec.ts', 'e2e/admin-teacher-escrow.spec.ts']) ? 'PARTIAL' : 'UNTESTED',
    ['app/api/admin/teacher-reviews/route.ts', 'app/api/admin/course-reviews/route.ts', 'app/admin'],
    ['e2e/course_management_flow.spec.ts', 'e2e/admin-teacher-escrow.spec.ts'],
    '有課程建立／部分後台流程，但教師資料修改審核、拒絕、重送、權限隔離與 admin settings 尚未形成完整回歸套件。',
    true,
  ),
];

const skipped = [];
for (const relativePath of ['e2e/b2c_verification.spec.ts', 'e2e/email_plus_addressing.spec.ts', 'e2e/navbar_verification.spec.ts']) {
  if (!exists(relativePath)) continue;
  const lines = fs.readFileSync(absolute(relativePath), 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/test\.skip|test\.fixme|test\.skip\(/.test(line)) {
      skipped.push({ file: relativePath, line: index + 1, text: line.trim() });
    }
  });
}

const summary = results.reduce((acc, item) => {
  acc[item.status] = (acc[item.status] || 0) + 1;
  return acc;
}, {});

const report = {
  generatedAt: new Date().toISOString(),
  root: ROOT,
  summary,
  skipped,
  results,
};

if (args.has('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Enterprise + General Feature Test Coverage Audit');
  console.log(`Root: ${ROOT}`);
  console.log(`Summary: ${Object.entries(summary).map(([key, value]) => `${key}=${value}`).join(' | ')}`);
  console.log('');
  for (const item of results) {
    console.log(`[${item.status}] ${item.area} / ${item.feature}${item.critical ? ' [critical]' : ''}`);
    console.log(`  Evidence: ${item.evidence.join(', ')}`);
    console.log(`  Tests:    ${item.tests.join(', ')}`);
    console.log(`  Gap:      ${item.gap}`);
  }
  console.log('');
  console.log(`Skipped/fixme declarations found: ${skipped.length}`);
  for (const item of skipped) console.log(`  - ${item.file}:${item.line} ${item.text}`);
}

if (args.has('--strict')) {
  const blocking = results.filter((item) => item.critical && !['COVERED'].includes(item.status));
  if (blocking.length > 0) {
    process.exitCode = 1;
  }
}
