// scripts/migrate-email-keys.ts
//
// One-time migration: re-key DynamoDB records that store email as userId
// to use the proper profile id (roid_id || id).
//
// Tables migrated:
//   1. jvtutorcorner-user-points  — PK is userId; email-keyed records deleted + re-created
//   2. jvtutorcorner-calendar-reminders — userId field updated in-place
//   3. jvtutorcorner-enrollments  — backfill missing userId field
//
// Usage (dry-run by default):
//   npx ts-node -r tsconfig-paths/register scripts/migrate-email-keys.ts
//
// To actually write changes:
//   npx ts-node -r tsconfig-paths/register scripts/migrate-email-keys.ts --execute

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const execute = process.argv.includes('--execute');

const region = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';
const POINTS_TABLE = process.env.DYNAMODB_TABLE_USER_POINTS || 'jvtutorcorner-user-points';
const REMINDERS_TABLE = process.env.DYNAMODB_TABLE_CALENDAR_REMINDERS || 'jvtutorcorner-calendar-reminders';
const ENROLLMENTS_TABLE = process.env.ENROLLMENTS_TABLE || process.env.DYNAMODB_TABLE_ENROLLMENTS || 'jvtutorcorner-enrollments';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function scanAll(tableName: string): Promise<any[]> {
  const items: any[] = [];
  let lastKey: any = undefined;
  do {
    const res: any = await docClient.send(new ScanCommand({
      TableName: tableName,
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    }));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// ─── Step 1: Build email → canonicalId map from Profiles ──────────────────────

async function buildEmailToIdMap(): Promise<Map<string, string>> {
  console.log(`\n[1/4] Scanning profiles from ${PROFILES_TABLE}...`);
  const profiles = await scanAll(PROFILES_TABLE);
  console.log(`      Found ${profiles.length} profiles.`);

  const emailToId = new Map<string, string>();
  const noId: string[] = [];

  for (const p of profiles) {
    const canonicalId = p.roid_id || p.id;
    if (!canonicalId) {
      noId.push(p.email || '(no email)');
      continue;
    }
    if (p.email) {
      emailToId.set(String(p.email).toLowerCase(), canonicalId);
    }
  }

  if (noId.length > 0) {
    console.warn(`      ⚠ ${noId.length} profiles have no roid_id or id — skipped:`);
    noId.slice(0, 10).forEach(e => console.warn(`        - ${e}`));
    if (noId.length > 10) console.warn(`        ... and ${noId.length - 10} more`);
  }

  console.log(`      Built email→id map for ${emailToId.size} profiles.`);
  return emailToId;
}

// ─── Step 2: Migrate points records ───────────────────────────────────────────

async function migratePoints(emailToId: Map<string, string>) {
  console.log(`\n[2/4] Migrating points from ${POINTS_TABLE}...`);
  const records = await scanAll(POINTS_TABLE);
  console.log(`      Found ${records.length} records.`);

  let migrated = 0, skipped = 0, alreadyCorrect = 0, errors = 0;
  const now = new Date().toISOString();

  for (const rec of records) {
    const userId: string = rec.userId || '';
    if (!userId.includes('@')) {
      alreadyCorrect++;
      continue;
    }

    const properUserId = emailToId.get(userId.toLowerCase());
    if (!properUserId) {
      console.warn(`      ✗ UNMIGRATEABLE points: userId=${userId} — no matching profile`);
      skipped++;
      continue;
    }

    // Check if proper-id record already exists
    const existingRes: any = await docClient.send(
      new ScanCommand({
        TableName: POINTS_TABLE,
        FilterExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': properUserId },
        Limit: 1,
      })
    );
    const existing = existingRes.Items?.[0];
    const existingBalance = typeof existing?.balance === 'number' ? existing.balance : 0;
    const newBalance = Math.max(rec.balance || 0, existingBalance);

    console.log(`      → ${userId} → ${properUserId} (balance: ${rec.balance} + existing ${existingBalance} = ${newBalance})`);

    if (execute) {
      try {
        await docClient.send(new PutCommand({
          TableName: POINTS_TABLE,
          Item: { userId: properUserId, balance: newBalance, updatedAt: now, migratedFrom: userId },
        }));
        await docClient.send(new DeleteCommand({
          TableName: POINTS_TABLE,
          Key: { userId },
        }));
        migrated++;
      } catch (e: any) {
        console.error(`      ✗ Error migrating ${userId}:`, e.message);
        errors++;
      }
    } else {
      migrated++;
    }
  }

  console.log(`      Points: migrated=${migrated}, already_correct=${alreadyCorrect}, skipped=${skipped}, errors=${errors}`);
}

// ─── Step 3: Migrate calendar reminder records ─────────────────────────────────

async function migrateReminders(emailToId: Map<string, string>) {
  console.log(`\n[3/4] Migrating reminders from ${REMINDERS_TABLE}...`);
  const records = await scanAll(REMINDERS_TABLE);
  console.log(`      Found ${records.length} records.`);

  let migrated = 0, skipped = 0, alreadyCorrect = 0, errors = 0;
  const now = new Date().toISOString();

  for (const rec of records) {
    const userId: string = rec.userId || '';
    if (!userId.includes('@')) {
      alreadyCorrect++;
      continue;
    }

    const properUserId = emailToId.get(userId.toLowerCase());
    if (!properUserId) {
      console.warn(`      ✗ UNMIGRATEABLE reminder: id=${rec.id}, userId=${userId}`);
      skipped++;
      continue;
    }

    console.log(`      → reminder ${rec.id}: ${userId} → ${properUserId}`);

    if (execute) {
      try {
        await docClient.send(new UpdateCommand({
          TableName: REMINDERS_TABLE,
          Key: { id: rec.id },
          UpdateExpression: 'SET userId = :uid, updatedAt = :now',
          ExpressionAttributeValues: { ':uid': properUserId, ':now': now },
        }));
        migrated++;
      } catch (e: any) {
        console.error(`      ✗ Error migrating reminder ${rec.id}:`, e.message);
        errors++;
      }
    } else {
      migrated++;
    }
  }

  console.log(`      Reminders: migrated=${migrated}, already_correct=${alreadyCorrect}, skipped=${skipped}, errors=${errors}`);
}

// ─── Step 4: Backfill missing userId in enrollment records ────────────────────

async function backfillEnrollments(emailToId: Map<string, string>) {
  console.log(`\n[4/4] Backfilling enrollments from ${ENROLLMENTS_TABLE}...`);
  const records = await scanAll(ENROLLMENTS_TABLE);
  console.log(`      Found ${records.length} records.`);

  let backfilled = 0, skipped = 0, alreadyHasId = 0, errors = 0;
  const now = new Date().toISOString();

  for (const rec of records) {
    if (rec.userId && !rec.userId.includes('@')) {
      alreadyHasId++;
      continue;
    }

    const email = rec.email || '';
    if (!email) {
      skipped++;
      continue;
    }

    const properUserId = emailToId.get(email.toLowerCase());
    if (!properUserId) {
      // No matching profile — can't backfill, that's fine (guest enrollment)
      skipped++;
      continue;
    }

    console.log(`      → enrollment ${rec.id}: backfill userId=${properUserId} (email=${email})`);

    if (execute) {
      try {
        await docClient.send(new UpdateCommand({
          TableName: ENROLLMENTS_TABLE,
          Key: { id: rec.id },
          UpdateExpression: 'SET userId = :uid, updatedAt = :now',
          ExpressionAttributeValues: { ':uid': properUserId, ':now': now },
        }));
        backfilled++;
      } catch (e: any) {
        console.error(`      ✗ Error backfilling enrollment ${rec.id}:`, e.message);
        errors++;
      }
    } else {
      backfilled++;
    }
  }

  console.log(`      Enrollments: backfilled=${backfilled}, already_has_id=${alreadyHasId}, skipped=${skipped}, errors=${errors}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('='.repeat(70));
  console.log('  migrate-email-keys: Fix email-as-userId across DynamoDB tables');
  console.log('='.repeat(70));
  console.log(`  Mode: ${execute ? '⚡ EXECUTE (writing changes)' : '🔍 DRY-RUN (no writes)'}`);
  if (!execute) {
    console.log('  To apply changes, run with --execute flag.');
  }
  console.log('');

  const emailToId = await buildEmailToIdMap();
  await migratePoints(emailToId);
  await migrateReminders(emailToId);
  await backfillEnrollments(emailToId);

  console.log('');
  console.log('='.repeat(70));
  console.log(`  Done! ${execute ? 'Changes written.' : 'Dry-run complete — no changes made.'}`);
  console.log('='.repeat(70));
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
