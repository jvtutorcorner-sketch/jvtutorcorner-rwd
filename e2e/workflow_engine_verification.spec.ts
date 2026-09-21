/**
 * 對應 skill: .agents/skills/workflow-engine/SKILL.md
 *
 * 工作流程引擎與 action node 的權限 contract。所有 SYS 請求都故意缺必填欄位，
 * 在寫資料、寄信、外呼 HTTP 或連 Qdrant 之前就回 400。
 *
 *   npx playwright test e2e/workflow_engine_verification.spec.ts --project=chromium
 */
import { test, type APIRequestContext } from '@playwright/test';
import { contractTitle, runContractCase, studentContext, type ContractCase } from './helpers/auth-helpers';

const ACTION_NODES = [
  'execute',
  'gmail-send',
  'resend-send',
  'http-request',
  'figma-export',
  'export-file',
  'import-file',
  'context7-retrieve',
  'notebooklm-create',
  'qdrant-knowledge-base',
];

test.describe('工作流程引擎 Verification (workflow-engine)', () => {
  let student: APIRequestContext;

  test.beforeAll(async () => {
    student = (await studentContext()).request;
  });
  test.afterAll(async () => {
    await student?.dispose();
  });

  const CASES: ContractCase[] = [
    { who: 'G', method: 'GET', path: '/api/workflows', expect: 401 },
    { who: 'S', method: 'GET', path: '/api/workflows', expect: 403 },
    { who: 'SYS', method: 'GET', path: '/api/workflows', expect: 200 },
    { who: 'S', method: 'POST', path: '/api/workflows', body: {}, expect: 403 },
    { who: 'SYS', method: 'POST', path: '/api/workflows', body: {}, expect: 400, note: '缺 name' },
    { who: 'G', method: 'GET', path: '/api/workflows/e2e-nonexistent', expect: 401 },
    { who: 'S', method: 'GET', path: '/api/workflows/e2e-nonexistent', expect: 403 },
    { who: 'SYS', method: 'GET', path: '/api/workflows/e2e-nonexistent', expect: 404 },
    { who: 'G', method: 'PUT', path: '/api/workflows/e2e-nonexistent', body: {}, expect: 401 },
    { who: 'G', method: 'DELETE', path: '/api/workflows/e2e-nonexistent', expect: 401 },
    { who: 'SYS', method: 'POST', path: '/api/workflows/http-request', body: { url: 'ftp://x' }, expect: 400, note: '只允許 http(s)' },
    { who: 'G', method: 'GET', path: '/api/workflows/check-compatibility', expect: [200, 403], note: '只在 development 開放' },
    { who: 'G', method: 'POST', path: '/api/workflows/check-compatibility', body: {}, expect: 405 },
  ];
  for (const node of ACTION_NODES) {
    const path = `/api/workflows/${node}`;
    CASES.push(
      { who: 'G', method: 'POST', path, body: {}, expect: 401 },
      { who: 'S', method: 'POST', path, body: {}, expect: 403 },
      { who: 'SYS', method: 'POST', path, body: {}, expect: 400, note: '缺必填欄位' }
    );
  }

  for (const c of CASES) {
    test(contractTitle(c), async ({ request }) => {
      await runContractCase(c, { guest: request, student });
    });
  }
});
