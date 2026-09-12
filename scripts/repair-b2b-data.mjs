// scripts/repair-b2b-data.mjs
/**
 * One-off repair of B2B/B2C data written by code paths fixed on 2026-09-10.
 * DRY RUN by default — prints what it would change. Pass --apply to write.
 *
 *   node --import ./scripts/lib/ts-resolve-hook.mjs scripts/repair-b2b-data.mjs            # report only
 *   node --import ./scripts/lib/ts-resolve-hook.mjs scripts/repair-b2b-data.mjs --apply    # repair
 *
 * What it repairs:
 *   1. enrollments: orgId / orderId / courseSessionId stored as NULL. These are GSI
 *      key attributes (byOrgId / byOrderId); once those indexes exist, re-putting such
 *      a row is rejected, and during backfill the rows are silently left unindexed.
 *      Also rows labelled sourceType 'B2B_SEAT': no code path has ever created a seat
 *      enrollment, so every such row is a personal purchase the old POST /api/enroll
 *      stamped with the buyer's orgId. They become 'B2C' and lose orgId.
 *   2. course-sessions: roomId stored as NULL (byRoomId GSI key).
 *   3. licenses: expiresAt stored as an ISO string by the old PATCH path — converted
 *      to epoch seconds (otherwise the license reads as already expired).
 *   4. licenses: more than one active license per user, or an active license in an
 *      org the user is no longer a member of. The license profile.licenseId points at
 *      (in the member's current org) is kept; the rest are revoked.
 *   5. organizations: usedSeats recomputed from active licenses where it drifted.
 *
 * Order matters when deploying: ship the code first, run this, THEN add the missing
 * GSIs with `node scripts/setup-db.mjs` (see the report printed at the end).
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const { ScanCommand, UpdateCommand, GetCommand } = await import('@aws-sdk/lib-dynamodb');
const { ddbDocClient } = await import('../lib/dynamo.ts');

const APPLY = process.argv.includes('--apply');

const T = {
  enrollments: process.env.ENROLLMENTS_TABLE || process.env.DYNAMODB_TABLE_ENROLLMENTS || 'jvtutorcorner-enrollments',
  sessions: process.env.DYNAMODB_TABLE_COURSE_SESSIONS || 'jvtutorcorner-course-sessions',
  licenses: process.env.DYNAMODB_TABLE_LICENSES || 'jvtutorcorner-licenses',
  orgs: process.env.DYNAMODB_TABLE_ORGANIZATIONS || 'jvtutorcorner-organizations',
  profiles: process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles',
};

const summary = {};
function count(key, n = 1) {
  summary[key] = (summary[key] || 0) + n;
}

async function scanAll(TableName) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddbDocClient.send(new ScanCommand({ TableName, ExclusiveStartKey }));
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function write(label, command) {
  console.log(`  ${APPLY ? '✏️ ' : '🔎 would'} ${label}`);
  if (!APPLY) return true;
  try {
    await ddbDocClient.send(command);
    return true;
  } catch (e) {
    console.error(`    ❌ ${e.name}: ${e.message}`);
    count('writeErrors');
    return false;
  }
}

function toEpochSeconds(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Math.floor(value > 1e11 ? value / 1000 : value);
  const s = String(value).trim();
  if (/^\d+$/.test(s)) return toEpochSeconds(Number(s));
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
}

// ── 1. enrollments ─────────────────────────────────────────────────────────────
console.log(`\n📦 1. ${T.enrollments}: NULL index keys / mislabelled B2B_SEAT`);
for (const item of await scanAll(T.enrollments)) {
  const removes = ['orgId', 'orderId', 'courseSessionId'].filter(
    (k) => k in item && (item[k] === null || item[k] === '')
  );
  const mislabelled = item.sourceType === 'B2B_SEAT';
  if (mislabelled && item.orgId && !removes.includes('orgId')) removes.push('orgId');
  if (removes.length === 0 && !mislabelled) continue;

  const names = Object.fromEntries(removes.map((k) => [`#${k}`, k]));
  let expr = '';
  const values = {};
  if (mislabelled) {
    expr += 'SET sourceType = :b2c';
    values[':b2c'] = 'B2C';
    count('enrollmentsRelabelled');
  }
  if (removes.length) {
    expr += `${expr ? ' ' : ''}REMOVE ${removes.map((k) => `#${k}`).join(', ')}`;
    count('enrollmentsNullKeysRemoved');
  }
  await write(
    `enrollment ${item.id}: ${mislabelled ? 'B2B_SEAT→B2C ' : ''}REMOVE [${removes.join(', ')}]`,
    new UpdateCommand({
      TableName: T.enrollments,
      Key: { id: item.id },
      UpdateExpression: expr,
      ...(removes.length ? { ExpressionAttributeNames: names } : {}),
      ...(Object.keys(values).length ? { ExpressionAttributeValues: values } : {}),
      ConditionExpression: 'attribute_exists(id)',
    })
  );
}

// ── 2. course sessions ─────────────────────────────────────────────────────────
console.log(`\n📦 2. ${T.sessions}: NULL roomId`);
for (const item of await scanAll(T.sessions)) {
  if (!('roomId' in item) || (item.roomId !== null && item.roomId !== '')) continue;
  count('sessionsNullRoomIdRemoved');
  await write(
    `course-session ${item.id}: REMOVE roomId`,
    new UpdateCommand({
      TableName: T.sessions,
      Key: { id: item.id },
      UpdateExpression: 'REMOVE roomId',
      ConditionExpression: 'attribute_exists(id)',
    })
  );
}

// ── 3. license expiresAt type ──────────────────────────────────────────────────
console.log(`\n📦 3. ${T.licenses}: expiresAt stored as a string`);
const licenses = await scanAll(T.licenses);
for (const lic of licenses) {
  if (lic.expiresAt === undefined || lic.expiresAt === null || typeof lic.expiresAt === 'number') continue;
  const epoch = toEpochSeconds(lic.expiresAt);
  if (!Number.isFinite(epoch)) {
    console.warn(`  ⚠️ license ${lic.id}: unparseable expiresAt "${lic.expiresAt}" — fix by hand`);
    count('licensesUnparseableExpiry');
    continue;
  }
  count('licensesExpiryConverted');
  const label = `license ${lic.id}: expiresAt "${lic.expiresAt}" → ${epoch}`;
  lic.expiresAt = epoch;
  await write(
    label,
    new UpdateCommand({
      TableName: T.licenses,
      Key: { id: lic.id },
      UpdateExpression: 'SET expiresAt = :e',
      ExpressionAttributeValues: { ':e': epoch },
      ConditionExpression: 'attribute_exists(id)',
    })
  );
}

// ── 4. duplicate / stray active licenses ───────────────────────────────────────
console.log(`\n📦 4. ${T.licenses}: duplicate or stray active licenses`);
const activeByUser = new Map();
for (const lic of licenses) {
  if (lic.status !== 'active' || !lic.userId) continue;
  if (!activeByUser.has(lic.userId)) activeByUser.set(lic.userId, []);
  activeByUser.get(lic.userId).push(lic);
}
const revoked = [];
for (const [userId, held] of activeByUser) {
  const { Item: profile } = await ddbDocClient.send(new GetCommand({ TableName: T.profiles, Key: { id: userId } }));
  const memberOrgId = profile?.orgId || null;
  const inOrg = held.filter((l) => l.orgId === memberOrgId);
  const keep =
    inOrg.find((l) => l.id === profile?.licenseId) ||
    inOrg.sort((a, b) => String(b.assignedAt || b.createdAt).localeCompare(String(a.assignedAt || a.createdAt)))[0] ||
    null;
  const toRevoke = held.filter((l) => l !== keep);
  if (toRevoke.length === 0) continue;

  for (const lic of toRevoke) {
    const why = lic.orgId !== memberOrgId ? `user is not a member of org ${lic.orgId}` : 'duplicate active license';
    count('licensesRevoked');
    const ok = await write(
      `license ${lic.id} (user ${userId}): revoke — ${why}`,
      new UpdateCommand({
        TableName: T.licenses,
        Key: { id: lic.id },
        UpdateExpression: 'SET #s = :revoked, updatedAt = :now REMOVE userId',
        ConditionExpression: '#s = :active',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':revoked': 'revoked', ':active': 'active', ':now': new Date().toISOString() },
      })
    );
    if (ok) revoked.push(lic.id);
  }
  if (keep && profile && profile.licenseId !== keep.id) {
    count('profilePointersFixed');
    await write(
      `profile ${userId}: licenseId ${profile.licenseId ?? '∅'} → ${keep.id}`,
      new UpdateCommand({
        TableName: T.profiles,
        Key: { id: userId },
        UpdateExpression: 'SET licenseId = :lid, updatedAt = :now',
        ExpressionAttributeValues: { ':lid': keep.id, ':now': new Date().toISOString() },
        ConditionExpression: 'attribute_exists(id)',
      })
    );
  }
}

// ── 5. usedSeats reconciliation ────────────────────────────────────────────────
console.log(`\n📦 5. ${T.orgs}: usedSeats vs active licenses`);
// In a dry run `revoked` holds the licenses step 4 WOULD revoke (write() returns true
// without writing), so the projected counts below match what --apply would produce.
for (const org of await scanAll(T.orgs)) {
  const actual = licenses.filter(
    (l) => l.orgId === org.id && l.status === 'active' && !revoked.includes(l.id)
  ).length;
  const recorded = org.usedSeats ?? 0;
  if (recorded === actual) continue;
  count('orgsSeatDrift');
  await write(
    `org ${org.id} (${org.name}): usedSeats ${recorded} → ${actual}` +
      (actual > (org.maxSeats ?? 0) ? `  ⚠️ exceeds maxSeats ${org.maxSeats}` : ''),
    new UpdateCommand({
      TableName: T.orgs,
      Key: { id: org.id },
      UpdateExpression: 'SET usedSeats = :actual, updatedAt = :now',
      ConditionExpression: 'usedSeats = :recorded',
      ExpressionAttributeValues: { ':actual': actual, ':recorded': recorded, ':now': new Date().toISOString() },
    })
  );
}

console.log(`\n=== ${APPLY ? 'APPLIED' : 'DRY RUN (pass --apply to write)'} ===`);
console.table(summary);
console.log(
  '\nNext: once the fixed code is deployed and this has been applied, add the missing GSIs:\n' +
    '  node scripts/setup-db.mjs\n  node scripts/verify-schema.mjs'
);
