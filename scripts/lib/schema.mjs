// scripts/lib/schema.mjs
//
// THE declarative DynamoDB schema for the tables this repo provisions.
//
// scripts/setup-db.mjs builds its CreateTable / UpdateTable calls from these
// definitions, and scripts/verify-schema.mjs checks both a live AWS account and
// cloudformation/dynamodb-b2b-tables.yml against them. That is what makes
// "setup-db.mjs is the source of truth" enforceable rather than aspirational:
// there is one object graph, and everything else is compared to it.
//
// Before this existed the same tables were described in three places that
// disagreed on every key — the CloudFormation template said PK `organizationId`
// and GSI `OrganizationIdIndex`, setup-db.mjs said PK `id` and GSI `byOrgId`,
// and the application code issued its queries against the latter. A stack-created
// environment produced tables the app could not read.
//
// ── Conventions ───────────────────────────────────────────────────────────────
//   * Partition key is `id` unless the table predates the convention. The
//     exceptions are recorded below with a note, not silently.
//   * GSIs are named `by<Field>` in camelCase for tables this file owns.
//     PascalCase `<Field>Index` names on older tables are kept as-is, because
//     renaming an index means rebuilding it and rewriting every caller.

/** Attribute type shorthand. */
const S = 'S';

export const TABLES = {
  organizations: {
    envVar: 'DYNAMODB_TABLE_ORGANIZATIONS',
    defaultName: 'jvtutorcorner-organizations',
    label: 'Organizations',
    purpose: 'B2B-Organizations',
    partitionKey: 'id',
    attributes: { id: S, billingEmail: S, status: S },
    indexes: [
      { name: 'BillingEmailIndex', hash: 'billingEmail' },
      { name: 'StatusIndex', hash: 'status' },
    ],
    stream: true,
  },

  orgUnits: {
    envVar: 'DYNAMODB_TABLE_ORG_UNITS',
    defaultName: 'jvtutorcorner-org-units',
    label: 'OrgUnits',
    purpose: 'B2B-OrgUnits',
    partitionKey: 'id',
    attributes: { id: S, orgId: S, parentId: S, path: S },
    indexes: [
      { name: 'byOrgId', hash: 'orgId', range: 'path' },
      { name: 'byParentId', hash: 'parentId' },
    ],
    stream: true,
  },

  licenses: {
    envVar: 'DYNAMODB_TABLE_LICENSES',
    defaultName: 'jvtutorcorner-licenses',
    label: 'Licenses',
    purpose: 'B2B-Licenses',
    partitionKey: 'id',
    attributes: { id: S, orgId: S, userId: S, status: S },
    indexes: [
      { name: 'byOrgId', hash: 'orgId', range: 'status' },
      { name: 'byUserId', hash: 'userId' },
    ],
    stream: true,
  },

  enrollments: {
    // Historically read from ENROLLMENTS_TABLE; both names are accepted.
    envVar: 'ENROLLMENTS_TABLE',
    envVarAlt: 'DYNAMODB_TABLE_ENROLLMENTS',
    defaultName: 'jvtutorcorner-enrollments',
    label: 'Enrollments',
    purpose: 'Enrollments',
    partitionKey: 'id',
    attributes: { id: S, userId: S, courseId: S, orderId: S, orgId: S, createdAt: S },
    indexes: [
      { name: 'byUserId', hash: 'userId', range: 'createdAt' },
      { name: 'byCourseId', hash: 'courseId', range: 'createdAt' },
      { name: 'byOrderId', hash: 'orderId' },
      { name: 'byOrgId', hash: 'orgId', range: 'createdAt' },
    ],
    stream: true,
  },

  courseSessions: {
    envVar: 'DYNAMODB_TABLE_COURSE_SESSIONS',
    defaultName: 'jvtutorcorner-course-sessions',
    label: 'CourseSessions',
    purpose: 'Course-Sessions',
    partitionKey: 'id',
    attributes: { id: S, courseId: S, teacherId: S, roomId: S, startTime: S, status: S },
    indexes: [
      { name: 'byCourseId', hash: 'courseId', range: 'startTime' },
      { name: 'byTeacherId', hash: 'teacherId', range: 'startTime' },
      { name: 'byRoomId', hash: 'roomId' },
      // All sessions across all courses, by lifecycle state and schedule order.
      // Serves schedule-driven capacity pre-scaling (SCHEDULED starting soon, all
      // LIVE) and a settlement sweep (LIVE past endTime + grace, filtered in code).
      // Null-key safe: every write path in lib/courseSessionService.ts sets
      // `status` to a non-null string and never removes it.
      { name: 'byStatus', hash: 'status', range: 'startTime' },
    ],
    stream: true,
  },

  classSummaries: {
    envVar: 'DYNAMODB_TABLE_CLASS_SUMMARIES',
    defaultName: 'jvtutorcorner-class-summaries',
    label: 'ClassSummaries',
    purpose: 'AI-Class-Summaries',
    partitionKey: 'summaryId',
    attributes: { summaryId: S, status: S, orderId: S, courseId: S, createdAt: S },
    indexes: [
      // The background worker sweeps PENDING rows by status; also serves a
      // schedule-driven retry of stuck RECORDING rows. Null-key safe: status is
      // always a non-null string.
      { name: 'byStatus', hash: 'status', range: 'createdAt' },
      { name: 'byOrderId', hash: 'orderId' },
      { name: 'byCourseId', hash: 'courseId', range: 'createdAt' },
    ],
    stream: false,
  },

  planUpgrades: {
    envVar: 'DYNAMODB_TABLE_PLAN_UPGRADES',
    defaultName: 'jvtutorcorner-plan-upgrades',
    label: 'PlanUpgrades',
    purpose: 'Plan-Upgrades',
    // NOTE: not `id`. The table predates the convention and every caller keys
    // on upgradeId; renaming the partition key means recreating the table.
    partitionKey: 'upgradeId',
    attributes: { upgradeId: S, userId: S },
    indexes: [{ name: 'byUserId', hash: 'userId' }],
    stream: false,
  },

  pointsEscrow: {
    envVar: 'DYNAMODB_TABLE_POINTS_ESCROW',
    defaultName: 'jvtutorcorner-points-escrow',
    label: 'PointsEscrow',
    purpose: 'Points-Escrow',
    // NOTE: not `id`, same reason as planUpgrades.
    partitionKey: 'escrowId',
    attributes: { escrowId: S, orderId: S, studentId: S, teacherId: S },
    indexes: [
      { name: 'byOrderId', hash: 'orderId' },
      { name: 'byStudentId', hash: 'studentId' },
      { name: 'byTeacherId', hash: 'teacherId' },
    ],
    stream: false,
  },

  // Append-only point ledger. Every balance mutation writes one row here in the
  // same transaction as the user-points update, so a balance can always be
  // reconstructed and reconciled. See lib/pointsLedger.ts.
  pointTransactions: {
    envVar: 'DYNAMODB_TABLE_POINT_TRANSACTIONS',
    defaultName: 'jvtutorcorner-point-transactions',
    label: 'PointTransactions',
    purpose: 'Points-Ledger',
    partitionKey: 'userId',
    sortKey: 'sk', // `${createdAt}#${txId}`
    attributes: { userId: S, sk: S, refId: S },
    // byRef: look up every ledger row for an order/escrow/reservation.
    indexes: [{ name: 'byRef', hash: 'refId' }],
    stream: false,
  },

  // Per-request AI/RTC usage ledger (cost meter). Written by the AI Gateway
  // (Phase 2) and the RTC cost meter (Phase 1). Amounts are integer micro-USD.
  aiUsageLedger: {
    envVar: 'DYNAMODB_TABLE_AI_USAGE_LEDGER',
    defaultName: 'jvtutorcorner-ai-usage-ledger',
    label: 'AiUsageLedger',
    purpose: 'AI-Usage-Ledger',
    partitionKey: 'pk', // date bucket `yyyy-mm-dd` (or `tenant#yyyy-mm-dd`)
    sortKey: 'sk', // `${ts}#${requestId}`
    attributes: { pk: S, sk: S, sessionId: S, userId: S, tenantMonth: S },
    indexes: [
      { name: 'bySession', hash: 'sessionId' },
      { name: 'byUser', hash: 'userId', range: 'sk' },
      { name: 'byTenantMonth', hash: 'tenantMonth' },
    ],
    stream: false,
  },

  // Pre-aggregated cost counters (per lesson/tenant/teacher/course/student/
  // feature/global). Updated with atomic ADD in the same transaction as the
  // ledger write, so dashboards and per-lesson budget checks read one item
  // instead of scanning the ledger.
  costRollups: {
    envVar: 'DYNAMODB_TABLE_COST_ROLLUPS',
    defaultName: 'jvtutorcorner-cost-rollups',
    label: 'CostRollups',
    purpose: 'Cost-Rollups',
    partitionKey: 'scopeKey', // e.g. LESSON#<id> | TENANT#<id>#yyyymm | GLOBAL#yyyymm
    attributes: { scopeKey: S },
    indexes: [],
    stream: false,
  },
};

/**
 * Tables this repo does not create but adds indexes to.
 * Each entry is a GSI that must exist for the application to work.
 */
export const REQUIRED_INDEXES_ON_EXISTING_TABLES = {
  profiles: {
    envVar: 'DYNAMODB_TABLE_PROFILES',
    envVarAlt: 'PROFILES_TABLE',
    defaultName: 'jvtutorcorner-profiles',
    label: 'Profiles',
    indexes: [
      { name: 'byOrgId', hash: 'orgId', attributes: { orgId: S } },
      // LINE login lookup (findProfileByLineUid). Sparse by nature — only
      // profiles that have linked a LINE account carry `lineUid`.
      { name: 'LineUidIndex', hash: 'lineUid', attributes: { lineUid: S } },
      // Email lookup for suspend/ban flows (findProfilesByEmail) — must not
      // miss duplicate accounts sharing an email.
      { name: 'EmailIndex', hash: 'email', attributes: { email: S } },
    ],
  },
  courses: {
    envVar: 'DYNAMODB_TABLE_COURSES',
    defaultName: 'jvtutorcorner-courses',
    label: 'Courses',
    indexes: [{ name: 'byTeacherId', hash: 'teacherId', attributes: { teacherId: S } }],
  },
};

// ── Derivations ───────────────────────────────────────────────────────────────

/** Resolve a table's runtime name from the environment, falling back to its default. */
export function resolveTableName(def, env = process.env) {
  return (
    (def.envVar && env[def.envVar]) ||
    (def.envVarAlt && env[def.envVarAlt]) ||
    def.defaultName
  );
}

/** DynamoDB AttributeDefinitions for a table definition. */
export function attributeDefinitions(def) {
  return Object.entries(def.attributes).map(([AttributeName, AttributeType]) => ({
    AttributeName,
    AttributeType,
  }));
}

/** DynamoDB KeySchema for a table's primary key. */
export function keySchema(def) {
  const schema = [{ AttributeName: def.partitionKey, KeyType: 'HASH' }];
  if (def.sortKey) schema.push({ AttributeName: def.sortKey, KeyType: 'RANGE' });
  return schema;
}

/** KeySchema for one index definition. */
export function indexKeySchema(index) {
  const schema = [{ AttributeName: index.hash, KeyType: 'HASH' }];
  if (index.range) schema.push({ AttributeName: index.range, KeyType: 'RANGE' });
  return schema;
}

/** Full GlobalSecondaryIndexes block for a table definition. */
export function globalSecondaryIndexes(def) {
  return (def.indexes || []).map((index) => ({
    IndexName: index.name,
    KeySchema: indexKeySchema(index),
    Projection: { ProjectionType: 'ALL' },
  }));
}

/** A complete CreateTableCommand input for a table definition. */
export function createTableParams(def, env = process.env) {
  const params = {
    TableName: resolveTableName(def, env),
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: attributeDefinitions(def),
    KeySchema: keySchema(def),
    SSESpecification: { Enabled: true },
    Tags: [
      { Key: 'Project', Value: 'jvtutorcorner' },
      { Key: 'Purpose', Value: def.purpose },
    ],
  };

  const gsis = globalSecondaryIndexes(def);
  if (gsis.length > 0) params.GlobalSecondaryIndexes = gsis;

  if (def.stream) {
    params.StreamSpecification = {
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES',
    };
  }

  return params;
}
