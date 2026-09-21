#!/usr/bin/env node
/**
 * scripts/migrate-teacher-ids.mjs
 *
 * One-time migration: make every teacher foreign key the canonical profile id.
 *
 * ── The rule being enforced ───────────────────────────────────────────────────
 * A teacher is referenced by `teacherId`, and that value is
 * `profile.roid_id || profile.id` — the same precedence lib/identity.ts and
 * lib/teacherIdentity.ts use. Never an email.
 *
 * ── What is wrong today ───────────────────────────────────────────────────────
 *   courses         teacherId may be missing, or hold an email; teacherEmail
 *                   holds the email. app/api/courses/route.ts used to write
 *                   `teacherEmail: body.teacherEmail || body.teacherId`, so the
 *                   two columns could hold the same value in either spelling.
 *   points-escrow   teacherId was copied from the course as
 *                   `teacherId || teacherEmail`, so an email could land in it.
 *                   That one matters most: releaseEscrow() credits points with
 *                   setUserPoints(record.teacherId), so an email-keyed escrow
 *                   pays into a balance no teacher-facing read ever looks at.
 *   orders          courseTeacherId, same origin, same problem.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   node scripts/migrate-teacher-ids.mjs             # dry run, writes nothing
 *   node scripts/migrate-teacher-ids.mjs --execute   # apply
 *   node scripts/migrate-teacher-ids.mjs --execute --table=courses
 *
 * Dry run is the default and prints every intended change. Run it, read the
 * report, then re-run with --execute.
 *
 * Safe to re-run: rows already carrying a canonical id are skipped.
 *
 * ── Ordering against scripts/migrate-seed-teacher-ids.mjs ─────────────────────
 * That script is a different job: it re-keys the TEACHERS table, replacing seed
 * ids ('t1'..'t4') with UUIDs. This one re-points foreign keys at PROFILE ids.
 * Run the seed migration first if you still have seed-id teachers, so the
 * profile index this script builds is stable before references are rewritten.
 */

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
const tableArg = process.argv.find((a) => a.startsWith('--table='));
const onlyTable = tableArg ? tableArg.split('=')[1] : null;

const REGION = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';

function createClient() {
  const config = { region: REGION };
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
  if (accessKeyId && secretAccessKey) {
    config.credentials = { accessKeyId, secretAccessKey };
  }
  return new DynamoDBClient(config);
}

const docClient = DynamoDBDocumentClient.from(createClient(), {
  marshallOptions: { removeUndefinedValues: true },
});

const PROFILES_TABLE =
  process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const ESCROW_TABLE = process.env.DYNAMODB_TABLE_POINTS_ESCROW || 'jvtutorcorner-points-escrow';
const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function scanAll(tableName) {
  const items = [];
  let lastKey;
  do {
    const res = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      })
    );
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

function looksLikeEmail(value) {
  return typeof value === 'string' && value.includes('@');
}

/** profile.roid_id || profile.id — the canonical id. */
function canonicalIdOf(profile) {
  if (!profile) return null;
  return profile.roid_id || profile.id || null;
}

/**
 * Build one in-memory index of every profile so the migration issues a single
 * table read instead of a lookup per row. Keyed by every spelling a row might
 * legitimately hold: lowercased email, id, and roid_id.
 */
async function buildProfileIndex() {
  console.log(`\n📇 Indexing profiles from ${PROFILES_TABLE}...`);
  const profiles = await scanAll(PROFILES_TABLE);
  const index = new Map();

  for (const profile of profiles) {
    const canonical = canonicalIdOf(profile);
    if (!canonical) continue;
    if (profile.email) index.set(String(profile.email).toLowerCase(), canonical);
    if (profile.id) index.set(String(profile.id), canonical);
    if (profile.roid_id) index.set(String(profile.roid_id), canonical);
  }

  console.log(`   ${profiles.length} profiles -> ${index.size} lookup keys`);
  return index;
}

function resolve(index, raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  return index.get(value) || index.get(value.toLowerCase()) || null;
}

// ─── Reporting ────────────────────────────────────────────────────────────────

const report = { updated: 0, skipped: 0, unresolved: [], errors: [] };

function logChange(table, key, field, from, to) {
  console.log(`   ${execute ? 'UPDATE' : 'would update'} ${table}[${key}] ${field}: ${from ?? '(none)'} -> ${to}`);
}

// ─── 1. courses ───────────────────────────────────────────────────────────────

async function migrateCourses(index) {
  console.log(`\n📚 [courses] ${COURSES_TABLE}`);
  const rows = await scanAll(COURSES_TABLE);
  console.log(`   ${rows.length} rows`);

  for (const row of rows) {
    const current = row.teacherId;

    // Already a canonical id that the profile index confirms? Nothing to do.
    if (current && !looksLikeEmail(current) && resolve(index, current) === current) {
      report.skipped++;
      continue;
    }

    // Resolve from whichever spelling this row happens to carry.
    const canonical =
      resolve(index, current) ?? resolve(index, row.teacherEmail);

    if (!canonical) {
      report.unresolved.push({
        table: 'courses',
        key: row.id,
        teacherId: current ?? null,
        teacherEmail: row.teacherEmail ?? null,
      });
      continue;
    }

    if (canonical === current) {
      report.skipped++;
      continue;
    }

    logChange('courses', row.id, 'teacherId', current, canonical);

    if (execute) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: COURSES_TABLE,
            Key: { id: row.id },
            UpdateExpression: 'SET teacherId = :tid, updatedAt = :now',
            ExpressionAttributeValues: {
              ':tid': canonical,
              ':now': new Date().toISOString(),
            },
            ConditionExpression: 'attribute_exists(id)',
          })
        );
        report.updated++;
      } catch (err) {
        report.errors.push({ table: 'courses', key: row.id, error: err.message });
      }
    } else {
      report.updated++;
    }
  }
}

// ─── 2. points-escrow ─────────────────────────────────────────────────────────

async function migrateEscrow(index) {
  console.log(`\n💰 [points-escrow] ${ESCROW_TABLE}`);
  const rows = await scanAll(ESCROW_TABLE);
  console.log(`   ${rows.length} rows`);

  for (const row of rows) {
    const current = row.teacherId;

    if (current && !looksLikeEmail(current) && resolve(index, current) === current) {
      report.skipped++;
      continue;
    }

    const canonical = resolve(index, current);

    if (!canonical) {
      report.unresolved.push({
        table: 'points-escrow',
        key: row.escrowId,
        teacherId: current ?? null,
        status: row.status,
      });
      continue;
    }

    if (canonical === current) {
      report.skipped++;
      continue;
    }

    // A RELEASED escrow already paid out — to the WRONG balance if its
    // teacherId was an email. Re-keying the row does not move those points
    // back; that needs a deliberate points correction, so flag it loudly
    // instead of quietly rewriting history.
    if (row.status === 'RELEASED') {
      console.log(
        `   ⚠️  RELEASED escrow ${row.escrowId} paid ${row.points} pts to "${current}" ` +
          `(should have been ${canonical}). Re-keying the row will NOT move those points — ` +
          `reconcile the balance manually.`
      );
    }

    logChange('points-escrow', row.escrowId, 'teacherId', current, canonical);

    if (execute) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: ESCROW_TABLE,
            Key: { escrowId: row.escrowId },
            UpdateExpression:
              'SET teacherId = :tid, updatedAt = :now, migratedFromTeacherKey = :old',
            ExpressionAttributeValues: {
              ':tid': canonical,
              ':now': new Date().toISOString(),
              ':old': current ?? null,
            },
            ConditionExpression: 'attribute_exists(escrowId)',
          })
        );
        report.updated++;
      } catch (err) {
        report.errors.push({ table: 'points-escrow', key: row.escrowId, error: err.message });
      }
    } else {
      report.updated++;
    }
  }
}

// ─── 3. orders ────────────────────────────────────────────────────────────────

async function migrateOrders(index) {
  console.log(`\n🧾 [orders] ${ORDERS_TABLE}`);

  let rows;
  try {
    rows = await scanAll(ORDERS_TABLE);
  } catch (err) {
    console.log(`   skipped: ${err.message}`);
    return;
  }
  console.log(`   ${rows.length} rows`);

  for (const row of rows) {
    const current = row.courseTeacherId ?? row.teacherId;
    if (!current) {
      report.skipped++;
      continue;
    }

    if (!looksLikeEmail(current) && resolve(index, current) === current) {
      report.skipped++;
      continue;
    }

    const canonical = resolve(index, current);
    if (!canonical || canonical === current) {
      if (!canonical) {
        report.unresolved.push({ table: 'orders', key: row.orderId, teacherId: current });
      } else {
        report.skipped++;
      }
      continue;
    }

    const field = row.courseTeacherId !== undefined ? 'courseTeacherId' : 'teacherId';
    logChange('orders', row.orderId, field, current, canonical);

    if (execute) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: ORDERS_TABLE,
            Key: { orderId: row.orderId },
            UpdateExpression: `SET ${field} = :tid, updatedAt = :now`,
            ExpressionAttributeValues: {
              ':tid': canonical,
              ':now': new Date().toISOString(),
            },
            ConditionExpression: 'attribute_exists(orderId)',
          })
        );
        report.updated++;
      } catch (err) {
        report.errors.push({ table: 'orders', key: row.orderId, error: err.message });
      }
    } else {
      report.updated++;
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   Teacher foreign key migration -> canonical ids        ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`Region : ${REGION}`);
  console.log(`Mode   : ${execute ? '⚠️  EXECUTE (writes)' : '🔍 DRY RUN (no writes)'}`);
  if (onlyTable) console.log(`Table  : ${onlyTable} only`);

  const index = await buildProfileIndex();

  if (index.size === 0) {
    console.error('\n❌ No profiles indexed — refusing to run. Check credentials and PROFILES_TABLE.');
    process.exit(1);
  }

  if (!onlyTable || onlyTable === 'courses') await migrateCourses(index);
  if (!onlyTable || onlyTable === 'escrow') await migrateEscrow(index);
  if (!onlyTable || onlyTable === 'orders') await migrateOrders(index);

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║                       SUMMARY                          ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`${execute ? 'Updated' : 'Would update'} : ${report.updated}`);
  console.log(`Already correct  : ${report.skipped}`);
  console.log(`Unresolved       : ${report.unresolved.length}`);
  console.log(`Errors           : ${report.errors.length}`);

  if (report.unresolved.length > 0) {
    console.log('\n⚠️  Rows whose teacher could not be resolved to a profile:');
    for (const row of report.unresolved.slice(0, 50)) {
      console.log(`   ${row.table}[${row.key}] teacherId=${row.teacherId} teacherEmail=${row.teacherEmail ?? '-'}`);
    }
    if (report.unresolved.length > 50) {
      console.log(`   ... and ${report.unresolved.length - 50} more`);
    }
    console.log('   These need a decision: the teacher profile may have been deleted or renamed.');
  }

  if (report.errors.length > 0) {
    console.log('\n❌ Write errors:');
    report.errors.forEach((e) => console.log(`   ${e.table}[${e.key}]: ${e.error}`));
    process.exit(1);
  }

  if (!execute) {
    console.log('\n🔍 Dry run complete — nothing was written.');
    console.log('   Re-run with --execute to apply.');
  } else {
    console.log('\n✅ Migration complete.');
  }
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
