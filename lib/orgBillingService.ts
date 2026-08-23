/**
 * Org Billing Service — manual invoice tracking for enterprise accounts.
 *
 * This is deliberately NOT a payment gateway integration. There is no Stripe (or any
 * other provider) wired up for org-level billing: no stripeCustomerId/stripeSubscriptionId
 * on Organization, no checkout flow, no webhook. A system administrator creates invoices
 * by hand (from an offline contract/quote) and marks them paid by hand once payment is
 * confirmed through whatever channel the sales/finance team actually uses (bank transfer,
 * an existing Stripe invoice sent manually, etc.). If real gateway-driven billing is
 * needed later, this is the layer to replace — the Organization/OrgInvoice data model and
 * the API routes that read it (billing status banner, invoice list) do not need to change.
 *
 * Overdue handling is intentionally passive: getOrgBillingStatus() computes "overdue" at
 * read time from (status === 'unpaid' && dueDate < now) and nothing else in the app acts
 * on it — an overdue org is NOT auto-suspended, licenses keep working, members keep their
 * course access. This was an explicit product decision (see conversation), not an
 * oversight: an unpaid invoice is a sales/finance problem to chase, not a reason to lock a
 * paying customer's staff and students out of their courses.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import type { OrgInvoice, CreateOrgInvoiceInput } from './types/b2b';
import { getOrganizationById } from './organizationService';

const REGION = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
export const ORG_INVOICES_TABLE = process.env.DYNAMODB_TABLE_ORG_INVOICES || 'jvtutorcorner-org-invoices';

function createDynamoClient(): DynamoDBDocumentClient {
  const clientConfig: any = { region: REGION };

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;

  if (accessKeyId && secretAccessKey) {
    console.log('[OrgBillingService] Using explicit AWS credentials (local dev mode)');
    clientConfig.credentials = { accessKeyId, secretAccessKey };
  } else {
    console.log('[OrgBillingService] Using IAM role (production mode)');
  }

  const client = new DynamoDBClient(clientConfig);
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true }
  });
}

const ddbDocClient = createDynamoClient();

// ==========================================
// Invoice CRUD
// ==========================================

export async function createInvoice(input: CreateOrgInvoiceInput): Promise<OrgInvoice> {
  const org = await getOrganizationById(input.orgId);
  if (!org) {
    throw new Error('Organization not found');
  }
  if (new Date(input.periodEnd).getTime() <= new Date(input.periodStart).getTime()) {
    throw new Error('periodEnd must be after periodStart');
  }
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error('amount must be a non-negative number');
  }

  const now = new Date().toISOString();
  const invoice: OrgInvoice = {
    id: randomUUID(),
    orgId: input.orgId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    seats: input.seats ?? org.maxSeats,
    amount: input.amount,
    currency: input.currency,
    status: 'unpaid',
    dueDate: input.dueDate,
    notes: input.notes,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now
  };

  try {
    await ddbDocClient.send(new PutCommand({
      TableName: ORG_INVOICES_TABLE,
      Item: invoice,
      ConditionExpression: 'attribute_not_exists(id)'
    }));
    console.log(`[OrgBillingService] ✅ Created invoice ${invoice.id} for org ${input.orgId} (${input.amount} ${input.currency})`);
    return invoice;
  } catch (error: any) {
    console.error('[OrgBillingService] ❌ Failed to create invoice:', error.message);
    throw new Error(`Failed to create invoice: ${error.message}`);
  }
}

export async function getInvoiceById(id: string): Promise<OrgInvoice | null> {
  try {
    const result = await ddbDocClient.send(new GetCommand({ TableName: ORG_INVOICES_TABLE, Key: { id } }));
    return (result.Item as OrgInvoice) || null;
  } catch (error: any) {
    console.error(`[OrgBillingService] ❌ Failed to get invoice ${id}:`, error.message);
    throw new Error(`Failed to get invoice: ${error.message}`);
  }
}

export async function listInvoicesByOrg(orgId: string): Promise<OrgInvoice[]> {
  try {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: ORG_INVOICES_TABLE,
      IndexName: 'byOrgId',
      KeyConditionExpression: 'orgId = :orgId',
      ExpressionAttributeValues: { ':orgId': orgId },
      ScanIndexForward: false // most recent dueDate first
    }));
    return (result.Items as OrgInvoice[]) || [];
  } catch (error: any) {
    console.error(`[OrgBillingService] ❌ Failed to list invoices for org ${orgId}:`, error.message);
    throw new Error(`Failed to list invoices: ${error.message}`);
  }
}

export interface MarkInvoicePaidInput {
  id: string;
  paidAt?: string;
  notes?: string;
}

export async function markInvoicePaid(input: MarkInvoicePaidInput): Promise<OrgInvoice> {
  const invoice = await getInvoiceById(input.id);
  if (!invoice) {
    throw new Error('Invoice not found');
  }
  if (invoice.status === 'void') {
    throw new Error('Cannot mark a void invoice as paid');
  }

  const now = new Date().toISOString();
  const result = await ddbDocClient.send(new UpdateCommand({
    TableName: ORG_INVOICES_TABLE,
    Key: { id: input.id },
    UpdateExpression: 'SET #status = :paid, paidAt = :paidAt, notes = if_not_exists(:notes, notes), updatedAt = :now',
    ConditionExpression: 'attribute_exists(id) AND #status <> :void',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':paid': 'paid',
      ':void': 'void',
      ':paidAt': input.paidAt || now,
      ':notes': input.notes,
      ':now': now
    },
    ReturnValues: 'ALL_NEW'
  }));

  console.log(`[OrgBillingService] ✅ Marked invoice ${input.id} paid`);
  return result.Attributes as OrgInvoice;
}

export async function voidInvoice(id: string): Promise<OrgInvoice> {
  const invoice = await getInvoiceById(id);
  if (!invoice) {
    throw new Error('Invoice not found');
  }
  if (invoice.status === 'paid') {
    throw new Error('Cannot void an already-paid invoice — use accounting correction instead');
  }

  const now = new Date().toISOString();
  const result = await ddbDocClient.send(new UpdateCommand({
    TableName: ORG_INVOICES_TABLE,
    Key: { id },
    UpdateExpression: 'SET #status = :void, updatedAt = :now',
    ConditionExpression: 'attribute_exists(id) AND #status <> :paid',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':void': 'void', ':paid': 'paid', ':now': now },
    ReturnValues: 'ALL_NEW'
  }));

  console.log(`[OrgBillingService] ✅ Voided invoice ${id}`);
  return result.Attributes as OrgInvoice;
}

// ==========================================
// Contract renewal
// ==========================================

export interface RenewContractInput {
  orgId: string;
  /** New contract end date (ISO 8601). Must be after the org's current contractEndDate (or after today, if none is set). */
  newContractEndDate: string;
  /** Optionally issue the next period's invoice in the same call. */
  invoice?: {
    amount: number;
    currency: string;
    dueDate: string;
    notes?: string;
  };
  actorId: string;
}

export interface RenewContractResult {
  contractEndDate: string;
  invoice: OrgInvoice | null;
}

export async function renewOrganizationContract(input: RenewContractInput): Promise<RenewContractResult> {
  const org = await getOrganizationById(input.orgId);
  if (!org) {
    throw new Error('Organization not found');
  }

  const currentEnd = org.contractEndDate ? new Date(org.contractEndDate).getTime() : Date.now();
  if (new Date(input.newContractEndDate).getTime() <= currentEnd) {
    throw new Error('newContractEndDate must be after the current contract end date');
  }

  // updateOrganization lives in organizationService — imported lazily here to avoid a
  // module-load-order cycle (organizationService doesn't import this file, but importing
  // both at top-level in either direction has bitten this codebase before, e.g.
  // orgMembershipService's comment about avoiding cycles with the single-table services).
  const { updateOrganization } = await import('./organizationService');
  const periodStart = org.contractEndDate || new Date().toISOString();
  const updated = await updateOrganization(input.orgId, { contractEndDate: input.newContractEndDate });

  let invoice: OrgInvoice | null = null;
  if (input.invoice) {
    invoice = await createInvoice({
      orgId: input.orgId,
      periodStart,
      periodEnd: input.newContractEndDate,
      amount: input.invoice.amount,
      currency: input.invoice.currency,
      dueDate: input.invoice.dueDate,
      notes: input.invoice.notes,
      createdBy: input.actorId
    });
  }

  console.log(`[OrgBillingService] ✅ Renewed contract for org ${input.orgId} through ${updated.contractEndDate}`);
  return { contractEndDate: updated.contractEndDate!, invoice };
}

// ==========================================
// Billing status summary (read-only, no side effects)
// ==========================================

export type ContractStatus = 'no_contract' | 'active' | 'expiring_soon' | 'expired';

export interface OrgBillingStatus {
  contractStatus: ContractStatus;
  contractEndDate: string | null;
  overdueInvoices: OrgInvoice[];
  totalOutstanding: number;
  /** Present only when overdueInvoices is non-empty and every overdue invoice shares one currency; null if mixed or none. */
  totalOutstandingCurrency: string | null;
}

const EXPIRING_SOON_WINDOW_DAYS = 30;

export async function getOrgBillingStatus(orgId: string): Promise<OrgBillingStatus> {
  const org = await getOrganizationById(orgId);
  if (!org) {
    throw new Error('Organization not found');
  }

  const invoices = await listInvoicesByOrg(orgId);
  const now = Date.now();
  const overdueInvoices = invoices.filter((inv) => inv.status === 'unpaid' && new Date(inv.dueDate).getTime() < now);

  const currencies = new Set(overdueInvoices.map((inv) => inv.currency));
  const totalOutstanding = overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0);

  let contractStatus: ContractStatus = 'no_contract';
  if (org.contractEndDate) {
    const endMs = new Date(org.contractEndDate).getTime();
    const daysLeft = (endMs - now) / (1000 * 60 * 60 * 24);
    if (daysLeft < 0) contractStatus = 'expired';
    else if (daysLeft <= EXPIRING_SOON_WINDOW_DAYS) contractStatus = 'expiring_soon';
    else contractStatus = 'active';
  }

  return {
    contractStatus,
    contractEndDate: org.contractEndDate || null,
    overdueInvoices,
    totalOutstanding,
    totalOutstandingCurrency: overdueInvoices.length > 0 && currencies.size === 1 ? [...currencies][0] : null
  };
}

export default {
  createInvoice,
  getInvoiceById,
  listInvoicesByOrg,
  markInvoicePaid,
  voidInvoice,
  renewOrganizationContract,
  getOrgBillingStatus
};
