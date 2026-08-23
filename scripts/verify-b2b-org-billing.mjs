// scripts/verify-b2b-org-billing.mjs
/**
 * Regression script for the manual B2B billing module (lib/orgBillingService.ts).
 *
 * Requires the jvtutorcorner-org-invoices DynamoDB table to exist first — deploy
 * cloudformation/dynamodb-org-invoices-table.yml (or override the table name via
 * DYNAMODB_TABLE_ORG_INVOICES in .env.local if you used a different name). This script
 * was written before that table existed in any environment, so it has not been run for
 * real yet — run it once after deploying to get first real pass/fail evidence.
 *
 * Runs against the real DynamoDB tables from .env.local and hard-deletes everything it
 * creates in a finally block. All records are tagged with a per-run domain so a killed
 * run can be found and cleaned up manually — the org id is printed up front.
 *
 * Usage:
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2b-org-billing.mjs
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const { ddbDocClient } = await import('../lib/dynamo.ts');
const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
const { createOrganization, getOrganizationById, deleteOrganization } = await import('../lib/organizationService.ts');
const orgBillingService = (await import('../lib/orgBillingService.ts')).default;
const { ORG_INVOICES_TABLE } = await import('../lib/orgBillingService.ts');

const RUN_TAG = `b2bbilling-${Date.now()}`;

let passCount = 0;
let failCount = 0;

function assert(condition, label) {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${label}`);
  } else {
    failCount++;
    console.log(`  ❌ ${label}`);
  }
}

async function assertThrows(fn, label, messagePattern) {
  try {
    await fn();
    failCount++;
    console.log(`  ❌ ${label} (did not throw)`);
  } catch (err) {
    const ok = !messagePattern || messagePattern.test(err.message || '');
    if (ok) {
      passCount++;
      console.log(`  ✅ ${label} (threw: ${err.message})`);
    } else {
      failCount++;
      console.log(`  ❌ ${label} (threw unexpected: ${err.message})`);
    }
  }
}

console.log(`=== B2B org billing verification (${RUN_TAG}) ===\n`);

const org = await createOrganization({
  name: `Billing Verify Org ${RUN_TAG}`,
  planTier: 'business',
  maxSeats: 10,
  billingEmail: `billing-${RUN_TAG}@example.com`
});
console.log(`Created org ${org.id}. If this script is killed, clean it up manually (org + any jvtutorcorner-org-invoices rows tagged ${RUN_TAG}).`);

const invoiceIds = [];

try {
  console.log('\n--- 1. Create invoice ---');
  const inv1 = await orgBillingService.createInvoice({
    orgId: org.id,
    periodStart: '2026-01-01',
    periodEnd: '2026-02-01',
    amount: 50000,
    currency: 'TWD',
    dueDate: '2026-01-15',
    createdBy: 'test-runner'
  });
  invoiceIds.push(inv1.id);
  assert(inv1.status === 'unpaid', 'new invoice defaults to unpaid');
  assert(inv1.seats === org.maxSeats, 'seats defaults to org.maxSeats when omitted');

  await assertThrows(
    () => orgBillingService.createInvoice({
      orgId: org.id,
      periodStart: '2026-02-01',
      periodEnd: '2026-01-01', // end before start
      amount: 100,
      currency: 'TWD',
      dueDate: '2026-01-15',
      createdBy: 'test-runner'
    }),
    'periodEnd before periodStart is rejected',
    /periodEnd must be after periodStart/
  );

  await assertThrows(
    () => orgBillingService.createInvoice({
      orgId: org.id,
      periodStart: '2026-01-01',
      periodEnd: '2026-02-01',
      amount: -1,
      currency: 'TWD',
      dueDate: '2026-01-15',
      createdBy: 'test-runner'
    }),
    'negative amount is rejected',
    /non-negative/
  );

  console.log('\n--- 2. Overdue detection (read-only, no auto-suspend) ---');
  // inv1's dueDate (2026-01-15) is in the past relative to "now" for any run after that
  // date — force a definitely-past due date instead so this test is not date-dependent.
  const pastDue = await orgBillingService.createInvoice({
    orgId: org.id,
    periodStart: '2020-01-01',
    periodEnd: '2020-02-01',
    amount: 12345,
    currency: 'TWD',
    dueDate: '2020-01-15',
    createdBy: 'test-runner'
  });
  invoiceIds.push(pastDue.id);

  let status = await orgBillingService.getOrgBillingStatus(org.id);
  assert(status.overdueInvoices.some((i) => i.id === pastDue.id), 'past-due unpaid invoice appears in overdueInvoices');
  assert(status.totalOutstanding >= pastDue.amount, 'totalOutstanding includes the overdue invoice amount');
  assert(status.contractStatus === 'no_contract', 'contractStatus is no_contract before any contract dates are set');

  const orgAfterOverdue = await getOrganizationById(org.id);
  assert(orgAfterOverdue.status === 'trial', 'org.status is untouched by an overdue invoice (no auto-suspend)');

  console.log('\n--- 3. Mark paid / void ---');
  const paid = await orgBillingService.markInvoicePaid({ id: pastDue.id });
  assert(paid.status === 'paid', 'markInvoicePaid sets status to paid');
  assert(!!paid.paidAt, 'markInvoicePaid sets paidAt');

  status = await orgBillingService.getOrgBillingStatus(org.id);
  assert(!status.overdueInvoices.some((i) => i.id === pastDue.id), 'paid invoice no longer counts as overdue');

  await assertThrows(
    () => orgBillingService.markInvoicePaid({ id: pastDue.id === 'never' ? 'never' : `${pastDue.id}-nonexistent` }),
    'marking a nonexistent invoice paid is rejected',
    /not found/
  );

  await assertThrows(
    () => orgBillingService.voidInvoice(pastDue.id),
    'voiding an already-paid invoice is rejected',
    /already-paid/
  );

  const voided = await orgBillingService.voidInvoice(inv1.id);
  assert(voided.status === 'void', 'voidInvoice sets status to void');

  await assertThrows(
    () => orgBillingService.markInvoicePaid({ id: inv1.id }),
    'marking a void invoice paid is rejected',
    /void invoice/
  );

  console.log('\n--- 4. List invoices ---');
  const list = await orgBillingService.listInvoicesByOrg(org.id);
  assert(list.length === 2, `listInvoicesByOrg returns both invoices (got ${list.length})`);

  console.log('\n--- 5. Contract renewal ---');
  const renewed = await orgBillingService.renewOrganizationContract({
    orgId: org.id,
    newContractEndDate: '2027-01-01',
    invoice: { amount: 60000, currency: 'TWD', dueDate: '2026-12-15' },
    actorId: 'test-runner'
  });
  assert(renewed.contractEndDate === '2027-01-01', 'renewOrganizationContract updates contractEndDate');
  assert(!!renewed.invoice, 'renewOrganizationContract can issue the renewal invoice in the same call');
  if (renewed.invoice) invoiceIds.push(renewed.invoice.id);

  status = await orgBillingService.getOrgBillingStatus(org.id);
  assert(status.contractStatus === 'active', 'contractStatus is active once contractEndDate is far in the future');

  await assertThrows(
    () => orgBillingService.renewOrganizationContract({
      orgId: org.id,
      newContractEndDate: '2026-06-01', // before the current contractEndDate
      actorId: 'test-runner'
    }),
    'renewing to an earlier date than the current contract end is rejected',
    /must be after/
  );
} finally {
  console.log('\n--- cleanup ---');
  for (const id of invoiceIds) {
    try {
      await ddbDocClient.send(new DeleteCommand({ TableName: ORG_INVOICES_TABLE, Key: { id } }));
      console.log(`  ✅ Deleted invoice ${id}`);
    } catch (e) {
      console.log(`  ⚠️ Failed to delete invoice ${id}: ${e.message}`);
    }
  }
  await deleteOrganization(org.id, true);
  console.log('cleanup done.');
}

console.log(`\n=== Result: ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount > 0 ? 1 : 0);
