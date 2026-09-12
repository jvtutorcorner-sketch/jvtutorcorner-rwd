#!/usr/bin/env node
/**
 * scripts/verify-schema.mjs
 *
 * Fail loudly when a DynamoDB table shape drifts from its declaration.
 *
 * There are three places a table shape can be written down in this repo:
 *   1. scripts/lib/schema.mjs                     — the declaration
 *   2. cloudformation/dynamodb-b2b-tables.yml     — the CloudFormation mirror
 *   3. the live AWS account                       — what actually exists
 *
 * They used to disagree on every key: the template declared Organizations with
 * partition key `organizationId` and a GSI called `OrganizationIdIndex`, while
 * the application queried partition key `id` and GSI `byOrgId`. Whichever tool
 * created your environment decided whether the app worked. Nothing detected it,
 * because nothing compared them.
 *
 * This does. Run it in CI.
 *
 * Usage:
 *   node scripts/verify-schema.mjs             # check the template; check live if credentialed
 *   node scripts/verify-schema.mjs --template  # template only, no AWS calls
 *   node scripts/verify-schema.mjs --live      # live account only
 *
 * Exit code 0 = no drift, 1 = drift found.
 */

import fs from 'fs';
import path from 'path';
import {
  DynamoDBClient,
  DescribeTableCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import dotenv from 'dotenv';

import {
  TABLES,
  REQUIRED_INDEXES_ON_EXISTING_TABLES,
  resolveTableName,
  keySchema,
  indexKeySchema,
} from './lib/schema.mjs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const args = process.argv.slice(2);
const templateOnly = args.includes('--template');
const liveOnly = args.includes('--live');

const TEMPLATE_PATH = path.resolve(process.cwd(), 'cloudformation/dynamodb-b2b-tables.yml');

/** Tables the CloudFormation template is expected to mirror. */
const TEMPLATE_TABLES = ['organizations', 'orgUnits', 'licenses'];

const problems = [];

function fail(scope, message) {
  problems.push(`${scope}: ${message}`);
  console.log(`   ❌ ${message}`);
}

function pass(message) {
  console.log(`   ✅ ${message}`);
}

function describeKeySchema(schema) {
  return (schema || [])
    .map((k) => `${k.AttributeName}:${k.KeyType === 'HASH' ? 'PK' : 'SK'}`)
    .join(', ');
}

// ── Live account ──────────────────────────────────────────────────────────────

async function verifyLive() {
  console.log('\n🔍 Checking the live AWS account\n');

  const region = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;

  const config = { region };
  if (accessKeyId && secretAccessKey) config.credentials = { accessKeyId, secretAccessKey };
  const client = new DynamoDBClient(config);

  const allDefs = [
    ...Object.values(TABLES).map((def) => ({ def, ownedByUs: true })),
    ...Object.values(REQUIRED_INDEXES_ON_EXISTING_TABLES).map((def) => ({ def, ownedByUs: false })),
  ];

  for (const { def, ownedByUs } of allDefs) {
    const tableName = resolveTableName(def);
    console.log(`📦 ${def.label} (${tableName})`);

    let table;
    try {
      const res = await client.send(new DescribeTableCommand({ TableName: tableName }));
      table = res.Table;
    } catch (err) {
      if (err instanceof ResourceNotFoundException) {
        fail('live', `${tableName} does not exist — run: node scripts/setup-db.mjs`);
        continue;
      }
      fail('live', `${tableName} could not be described: ${err.message}`);
      continue;
    }

    // Primary key. This is the one that cannot be repaired in place: changing a
    // partition key means recreating the table and migrating every row.
    if (ownedByUs) {
      const expectedKey = describeKeySchema(keySchema(def));
      const actualKey = describeKeySchema(table.KeySchema);
      if (expectedKey !== actualKey) {
        fail(
          'live',
          `${tableName} primary key is [${actualKey}], expected [${expectedKey}] — ` +
            `this needs a table rebuild and data migration, not a script re-run`
        );
      } else {
        pass(`primary key [${actualKey}]`);
      }
    }

    // Indexes.
    const actualIndexes = new Map(
      (table.GlobalSecondaryIndexes || []).map((gsi) => [gsi.IndexName, gsi])
    );

    for (const index of def.indexes || []) {
      const actual = actualIndexes.get(index.name);
      if (!actual) {
        fail('live', `${tableName} is missing GSI "${index.name}" — run: node scripts/setup-db.mjs`);
        continue;
      }
      const expectedKey = describeKeySchema(indexKeySchema(index));
      const actualKey = describeKeySchema(actual.KeySchema);
      if (expectedKey !== actualKey) {
        fail(
          'live',
          `${tableName} GSI "${index.name}" keys are [${actualKey}], expected [${expectedKey}]`
        );
      } else {
        pass(`GSI ${index.name} [${actualKey}]`);
      }
    }

    // Extra indexes are reported but are not failures — they may be legacy
    // indexes still serving un-migrated callers.
    for (const name of actualIndexes.keys()) {
      if (!(def.indexes || []).some((i) => i.name === name)) {
        console.log(`   ℹ️  undeclared GSI "${name}" present (legacy?)`);
      }
    }

    console.log('');
  }
}

// ── CloudFormation template ───────────────────────────────────────────────────

/**
 * Minimal targeted reader for the template.
 *
 * A full YAML parse would need a dependency that understands CloudFormation's
 * short tags (!Ref, !GetAtt, !Sub). All this needs is, per table resource, the
 * KeySchema and the GSI names with their key schemas — so it reads the
 * indentation-delimited blocks directly. If the template's formatting changes
 * shape this reports "could not read", which is a visible failure rather than a
 * silent pass.
 */
function readTemplateTables(text) {
  const lines = text.split(/\r?\n/);
  const resources = {};

  let current = null;
  let section = null; // 'KeySchema' | 'GlobalSecondaryIndexes' | null
  let currentIndex = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // Resource heading: two-space indent, "Name:" with no value.
    const resourceMatch = indent === 2 ? trimmed.match(/^([A-Za-z0-9]+):$/) : null;
    if (resourceMatch) {
      current = resourceMatch[1];
      resources[current] = { keySchema: [], indexes: {} };
      section = null;
      currentIndex = null;
      continue;
    }

    if (!current) continue;

    if (trimmed === 'KeySchema:' && indent === 6) {
      section = 'KeySchema';
      currentIndex = null;
      continue;
    }
    if (trimmed === 'GlobalSecondaryIndexes:') {
      section = 'GlobalSecondaryIndexes';
      currentIndex = null;
      continue;
    }
    if (trimmed === 'AttributeDefinitions:' || trimmed === 'Tags:' || trimmed === 'Properties:') {
      if (trimmed !== 'Properties:') section = null;
      currentIndex = null;
      continue;
    }

    const indexNameMatch = trimmed.match(/^-\s*IndexName:\s*(\S+)$/);
    if (indexNameMatch && section === 'GlobalSecondaryIndexes') {
      currentIndex = indexNameMatch[1];
      resources[current].indexes[currentIndex] = [];
      continue;
    }

    const attrMatch = trimmed.match(/^-\s*AttributeName:\s*(\S+)$/);
    if (attrMatch) {
      const target =
        section === 'KeySchema'
          ? resources[current].keySchema
          : currentIndex
            ? resources[current].indexes[currentIndex]
            : null;
      if (target) target.push({ AttributeName: attrMatch[1], KeyType: null });
      continue;
    }

    const keyTypeMatch = trimmed.match(/^KeyType:\s*(\S+)$/);
    if (keyTypeMatch) {
      const target =
        section === 'KeySchema'
          ? resources[current].keySchema
          : currentIndex
            ? resources[current].indexes[currentIndex]
            : null;
      if (target && target.length > 0) {
        target[target.length - 1].KeyType = keyTypeMatch[1];
      }
      continue;
    }
  }

  return resources;
}

const TEMPLATE_RESOURCE_NAMES = {
  organizations: 'OrganizationsTable',
  orgUnits: 'OrgUnitsTable',
  licenses: 'LicensesTable',
};

function verifyTemplate() {
  console.log('\n🔍 Checking cloudformation/dynamodb-b2b-tables.yml\n');

  if (!fs.existsSync(TEMPLATE_PATH)) {
    fail('template', `${TEMPLATE_PATH} not found`);
    return;
  }

  const resources = readTemplateTables(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

  for (const key of TEMPLATE_TABLES) {
    const def = TABLES[key];
    const resourceName = TEMPLATE_RESOURCE_NAMES[key];
    console.log(`📄 ${def.label} (${resourceName})`);

    const resource = resources[resourceName];
    if (!resource) {
      fail('template', `resource ${resourceName} is missing from the template`);
      console.log('');
      continue;
    }

    if (resource.keySchema.length === 0) {
      fail('template', `could not read a KeySchema for ${resourceName}`);
      console.log('');
      continue;
    }

    const expectedKey = describeKeySchema(keySchema(def));
    const actualKey = describeKeySchema(resource.keySchema);
    if (expectedKey !== actualKey) {
      fail(
        'template',
        `${resourceName} primary key is [${actualKey}], schema.mjs declares [${expectedKey}]`
      );
    } else {
      pass(`primary key [${actualKey}]`);
    }

    for (const index of def.indexes || []) {
      const actual = resource.indexes[index.name];
      if (!actual) {
        const present = Object.keys(resource.indexes).join(', ') || 'none';
        fail(
          'template',
          `${resourceName} is missing GSI "${index.name}" (template declares: ${present})`
        );
        continue;
      }
      const expectedIdxKey = describeKeySchema(indexKeySchema(index));
      const actualIdxKey = describeKeySchema(actual);
      if (expectedIdxKey !== actualIdxKey) {
        fail(
          'template',
          `${resourceName} GSI "${index.name}" keys are [${actualIdxKey}], expected [${expectedIdxKey}]`
        );
      } else {
        pass(`GSI ${index.name} [${actualIdxKey}]`);
      }
    }

    console.log('');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   Schema drift check                                   ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('Declaration: scripts/lib/schema.mjs');

  if (!liveOnly) verifyTemplate();

  if (!templateOnly) {
    const hasCreds =
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.CI_AWS_ACCESS_KEY_ID ||
      process.env.AWS_PROFILE ||
      process.env.AWS_ROLE_ARN ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;

    if (hasCreds || liveOnly) {
      await verifyLive();
    } else {
      console.log('\nℹ️  No AWS credentials found — skipping the live check.');
      console.log('   Pass --live to force it, or --template to silence this note.\n');
    }
  }

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                        RESULT                          ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  if (problems.length === 0) {
    console.log('\n✅ No drift found.\n');
    return;
  }

  console.log(`\n❌ ${problems.length} problem(s):\n`);
  problems.forEach((p) => console.log(`   - ${p}`));
  console.log('');
  process.exit(1);
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
