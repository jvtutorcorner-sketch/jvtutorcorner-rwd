// scripts/migrate-user-role-to-student.ts
//
// One-time migration: update all DynamoDB profile records where role = 'user'
// to role = 'student', aligning with the formal role system (admin/teacher/student).
//
// Usage (dry-run by default):
//   npx ts-node -r tsconfig-paths/register scripts/migrate-user-role-to-student.ts
//
// To actually write changes:
//   npx ts-node -r tsconfig-paths/register scripts/migrate-user-role-to-student.ts --execute

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
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

const PROFILES_TABLE =
  process.env.DYNAMODB_TABLE_PROFILES ||
  process.env.PROFILES_TABLE ||
  'jvtutorcorner-profiles';

// ─── Scan with filter ─────────────────────────────────────────────────────────

async function scanLegacyUserProfiles(): Promise<any[]> {
  const items: any[] = [];
  let lastKey: any = undefined;
  do {
    const res: any = await docClient.send(
      new ScanCommand({
        TableName: PROFILES_TABLE,
        FilterExpression: '#r = :legacy',
        ExpressionAttributeNames: { '#r': 'role' },
        ExpressionAttributeValues: { ':legacy': 'user' },
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      })
    );
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('='.repeat(70));
  console.log('  migrate-user-role-to-student: Update legacy role=user → student');
  console.log('='.repeat(70));
  console.log(`  Table : ${PROFILES_TABLE}`);
  console.log(`  Region: ${region}`);
  console.log(`  Mode  : ${execute ? '⚡ EXECUTE (writing changes)' : '🔍 DRY-RUN (no writes)'}`);
  if (!execute) {
    console.log('  To apply changes, run with --execute flag.');
  }
  console.log('');

  console.log(`[1/2] Scanning ${PROFILES_TABLE} for role='user' records...`);
  const profiles = await scanLegacyUserProfiles();
  console.log(`      Found ${profiles.length} record(s) with legacy role='user'.`);

  if (profiles.length === 0) {
    console.log('\n  Nothing to migrate. All done!');
    console.log('='.repeat(70));
    return;
  }

  console.log('');
  console.log('[2/2] Updating records...');

  let migrated = 0;
  let errors = 0;
  const now = new Date().toISOString();

  for (const profile of profiles) {
    const id = profile.id || profile.roid_id;
    const email = profile.email || '(no email)';
    console.log(`      → id=${id}  email=${email}  role: 'user' → 'student'`);

    if (execute) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: PROFILES_TABLE,
            Key: { id },
            UpdateExpression: 'SET #r = :student, updatedAt = :now',
            ConditionExpression: '#r = :legacy',
            ExpressionAttributeNames: { '#r': 'role' },
            ExpressionAttributeValues: {
              ':student': 'student',
              ':legacy': 'user',
              ':now': now,
            },
          })
        );
        migrated++;
      } catch (e: any) {
        if (e.name === 'ConditionalCheckFailedException') {
          console.warn(`      ⚠ Skipped id=${id}: role changed since scan (no longer 'user')`);
        } else {
          console.error(`      ✗ Error updating id=${id}:`, e.message);
          errors++;
        }
      }
    } else {
      migrated++;
    }
  }

  console.log('');
  console.log('='.repeat(70));
  if (execute) {
    console.log(`  Done! Migrated: ${migrated}, Errors: ${errors}`);
  } else {
    console.log(`  Dry-run complete — would migrate ${migrated} record(s). No changes made.`);
    console.log('  Run with --execute to apply.');
  }
  console.log('='.repeat(70));
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
