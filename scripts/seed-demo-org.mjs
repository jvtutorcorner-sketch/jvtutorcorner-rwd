// scripts/seed-demo-org.mjs
/**
 * Seeds one persistent demo organization for local B2B demos — NOT a test script, does not
 * clean up after itself. Safe to re-run: if a demo org with the same billing email already
 * exists, it's hard-deleted (org + units + demo profiles) before recreating fresh, so this
 * always leaves exactly one clean copy of the demo data.
 *
 * Creates:
 *   示範科技股份有限公司 (active, business plan, 10 seats, 1-year contract)
 *     工程部
 *       ├─ 後端團隊  (member: demo-member-backend@example.com)
 *       └─ 前端團隊  (member: demo-member-frontend@example.com)
 *     業務部          (member: demo-member-sales@example.com)
 *
 *   demo-org-admin@example.com   — org admin (whole-org access), password: Demo1234!
 *   demo-dept-admin@example.com  — dept admin scoped to 工程部 (+ its children only),
 *                                  password: Demo1234!
 *
 * Log in as demo-org-admin@example.com or demo-dept-admin@example.com (captcha bypass
 * secret from .env.local's LOGIN_BYPASS_SECRET, same as the e2e tests use) to demo what
 * each role actually sees — the dept admin should NOT see 業務部 or its member.
 *
 * Usage:
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/seed-demo-org.mjs
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const { randomUUID } = await import('crypto');
const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
const { ddbDocClient } = await import('../lib/dynamo.ts');
const organizationService = (await import('../lib/organizationService.ts')).default;
const orgUnitService = (await import('../lib/orgUnitService.ts')).default;
const orgMembershipService = (await import('../lib/orgMembershipService.ts')).default;
const { putProfile, findProfileByEmail, PROFILES_TABLE } = await import('../lib/profilesService.ts');
const { hashPassword } = await import('../lib/auth/password.ts');

const BILLING_EMAIL = 'billing@demo-tech.example';
const DEMO_PASSWORD = 'Demo1234!';

const DEMO_EMAILS = [
  'demo-org-admin@example.com',
  'demo-dept-admin@example.com',
  'demo-member-backend@example.com',
  'demo-member-frontend@example.com',
  'demo-member-sales@example.com'
];

async function cleanupExisting() {
  const existing = await organizationService.getOrganizationByEmail(BILLING_EMAIL);
  if (!existing) return;

  console.log(`Found existing demo org ${existing.id}, cleaning up before reseeding...`);

  for (const email of DEMO_EMAILS) {
    const profile = await findProfileByEmail(email).catch(() => null);
    if (profile?.id) {
      if (profile.orgId === existing.id) {
        await orgMembershipService.removeMemberFromOrg({ orgId: existing.id, profileId: profile.id }).catch(() => {});
      }
      await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id: profile.id } })).catch(() => {});
    }
  }

  let remaining = (await orgUnitService.listOrgUnitsByOrg(existing.id)).map((u) => u.id);
  for (let round = 0; round < remaining.length + 1 && remaining.length > 0; round++) {
    const stillFailing = [];
    for (const id of remaining) {
      try {
        await orgUnitService.deleteOrgUnit(id, true);
      } catch {
        stillFailing.push(id);
      }
    }
    remaining = stillFailing;
  }

  await organizationService.deleteOrganization(existing.id, true);
  console.log('Cleanup done.\n');
}

await cleanupExisting();

console.log('=== Seeding demo organization ===\n');

const org = await organizationService.createOrganization({
  name: '示範科技股份有限公司',
  domain: 'demo-tech.example',
  planTier: 'business',
  maxSeats: 10,
  billingEmail: BILLING_EMAIL,
  industry: '軟體服務',
  country: '台灣'
});

const now = new Date();
const oneYearOut = new Date(now.getTime());
oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
await organizationService.updateOrganization(org.id, {
  status: 'active',
  contractStartDate: now.toISOString(),
  contractEndDate: oneYearOut.toISOString(),
  billingCycle: 'annual'
});
console.log(`✅ Organization: ${org.name} (${org.id})`);

const engineering = await orgUnitService.createOrgUnit({ orgId: org.id, name: '工程部' });
const backend = await orgUnitService.createOrgUnit({ orgId: org.id, name: '後端團隊', parentId: engineering.id });
const frontend = await orgUnitService.createOrgUnit({ orgId: org.id, name: '前端團隊', parentId: engineering.id });
const sales = await orgUnitService.createOrgUnit({ orgId: org.id, name: '業務部' });
console.log(`✅ Org units: 工程部 (${engineering.id}) > 後端團隊/前端團隊, 業務部 (${sales.id})`);

async function createDemoProfile(email, firstName, lastName) {
  const id = randomUUID();
  await putProfile({
    id,
    email,
    firstName,
    lastName,
    role: 'student',
    plan: 'free',
    isB2B: false,
    password: hashPassword(DEMO_PASSWORD),
    emailVerified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return id;
}

const orgAdminId = await createDemoProfile('demo-org-admin@example.com', '組織', '管理員');
const deptAdminId = await createDemoProfile('demo-dept-admin@example.com', '部門', '管理員');
const memberBackendId = await createDemoProfile('demo-member-backend@example.com', '後端', '工程師');
const memberFrontendId = await createDemoProfile('demo-member-frontend@example.com', '前端', '工程師');
const memberSalesId = await createDemoProfile('demo-member-sales@example.com', '業務', '代表');

await orgMembershipService.assignMemberWithLicense({
  orgId: org.id,
  profileId: orgAdminId,
  isOrgAdmin: true,
  assignedBy: 'seed-script'
});
console.log('✅ demo-org-admin@example.com — org admin');

await orgMembershipService.assignMemberWithLicense({
  orgId: org.id,
  profileId: deptAdminId,
  orgUnitId: engineering.id,
  assignedBy: 'seed-script'
});
await orgMembershipService.setMemberDeptAdmin({
  orgId: org.id,
  profileId: deptAdminId,
  isDeptAdmin: true,
  deptAdminUnitId: engineering.id
});
console.log('✅ demo-dept-admin@example.com — dept admin of 工程部 (+ 後端/前端團隊)');

await orgMembershipService.assignMemberWithLicense({
  orgId: org.id,
  profileId: memberBackendId,
  orgUnitId: backend.id,
  assignedBy: 'seed-script'
});
console.log('✅ demo-member-backend@example.com — 後端團隊');

await orgMembershipService.assignMemberWithLicense({
  orgId: org.id,
  profileId: memberFrontendId,
  orgUnitId: frontend.id,
  assignedBy: 'seed-script'
});
console.log('✅ demo-member-frontend@example.com — 前端團隊');

await orgMembershipService.assignMemberWithLicense({
  orgId: org.id,
  profileId: memberSalesId,
  orgUnitId: sales.id,
  assignedBy: 'seed-script'
});
console.log('✅ demo-member-sales@example.com — 業務部 (dept admin 看不到這個人，示範範圍隔離)');

console.log('\n=== Done ===');
console.log(`Organization ID: ${org.id}`);
console.log(`Admin console:   http://localhost:3000/admin/organizations/${org.id}`);
console.log(`\nDemo logins (password: ${DEMO_PASSWORD}):`);
console.log('  demo-org-admin@example.com   — sees everything in the org');
console.log('  demo-dept-admin@example.com  — only sees 工程部/後端團隊/前端團隊, NOT 業務部');
console.log('\nRe-run this script anytime to reset the demo data back to this clean state.');
