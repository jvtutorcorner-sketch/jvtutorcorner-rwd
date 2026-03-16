# Migration Scripts for B2B/B2C Schema Updates

This directory contains scripts to help migrate the DynamoDB schema from the current B2C-only design to a hybrid B2B/B2C architecture.

## 🚨 Critical Fixes (Run First)

### 1. Add EmailIndex to Profiles Table
**Priority:** 🔴 **CRITICAL - Run Immediately**

**Purpose:** Eliminates expensive Scan operations during login/registration

**Script:** `add-email-index.mjs`

**Usage:**
```bash
# Default table name
node scripts/add-email-index.mjs

# Custom table name
PROFILES_TABLE=my-custom-profiles node scripts/add-email-index.mjs
```

**What it does:**
- Checks if EmailIndex already exists
- Creates EmailIndex GSI on Profiles table
- Shows creation progress
- Can be run safely on active tables (zero downtime)

**Expected output:**
```
✅ EmailIndex creation initiated successfully!
ℹ️  Index Status: CREATING
   This may take several minutes depending on table size.
```

**Monitoring:**
```bash
# Check index status
aws dynamodb describe-table \
  --table-name jvtutorcorner-profiles \
  --query "Table.GlobalSecondaryIndexes[?IndexName=='EmailIndex'].IndexStatus" \
  --region ap-northeast-1
```

**Impact:**
- **Before:** Login queries take ~500ms (full table scan)
- **After:** Login queries take ~50ms (direct query)
- **Improvement:** 10x faster authentication

---

## 📋 Planned Migration Scripts

### 2. Standardize User IDs
**Priority:** 🟡 High (Week 1-2)

**Script:** `migrate-userid-standardization.mjs` (TO BE CREATED)

**Purpose:** Convert Orders and Enrollments from email-based userId to UUID-based userId

**What it will do:**
1. Scan Orders table
2. For each order with email-format userId:
   - Look up Profile by email
   - Update order.userId to profile.id
   - Add order.userEmail for reference
3. Repeat for Enrollments table

**Backup strategy:**
```bash
# Enable Point-in-Time Recovery first
aws dynamodb update-continuous-backups \
  --table-name jvtutorcorner-orders \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
```

---

### 3. Add B2B Fields to Existing Tables
**Priority:** 🟡 Medium (Week 3-4)

**Script:** `migrate-add-b2b-fields.mjs` (TO BE CREATED)

**Purpose:** Backfill organizationId, accountType, billingType fields

**What it will do:**
1. Add default values to existing records:
   - Profiles: `accountType = 'individual'`, `organizationId = null`
   - Enrollments: `billingType = 'individual'`, `organizationId = null`
   - Orders: `billingType = 'individual'`, `organizationId = null`

**Example:**
```typescript
// Profiles
await updateItem({
  accountType: 'individual',
  organizationId: null,
  isOrgAdmin: false
});

// Enrollments
await updateItem({
  billingType: 'individual',
  organizationId: null,
  licenseId: null
});
```

---

### 4. Seed Initial B2B Data
**Priority:** 🟢 Low (Week 3-4, for testing)

**Script:** `seed-b2b-test-data.mjs` (TO BE CREATED)

**Purpose:** Create sample organizations and licenses for testing

**What it will create:**
- 3 test organizations (small, medium, large)
- 50 licenses distributed across organizations
- 10 B2B test users
- Sample B2B enrollments

**Usage:**
```bash
# Dev/staging only
NODE_ENV=development node scripts/seed-b2b-test-data.mjs
```

---

### 5. Migrate Roles and Permissions to CloudFormation
**Priority:** 🟡 Medium (Week 1-2)

**Script:** `export-roles-permissions.mjs` (TO BE CREATED)

**Purpose:** Export existing roles and permissions from local files to DynamoDB

**What it will do:**
1. Read existing roles from local storage
2. Create Roles table (if not exists from CloudFormation)
3. Migrate all role data
4. Repeat for PagePermissions

---

## 🧪 Testing Scripts

### Verify EmailIndex Performance
**Script:** `test-email-index-performance.mjs` (TO BE CREATED)

**Purpose:** Measure query performance before/after EmailIndex

**Example output:**
```
Before EmailIndex: 487ms (Scan operation)
After EmailIndex: 43ms (Query operation)
Improvement: 11.3x faster
```

---

### Validate B2B Data Integrity
**Script:** `validate-b2b-data.mjs` (TO BE CREATED)

**Purpose:** Check data consistency after migration

**Checks:**
- All organizations have valid maxSeats >= usedSeats
- All licenses reference valid organizations
- All B2B enrollments have valid licenseId
- No orphaned licenses

---

## 📚 Manual Migration Steps

### Step 1: Deploy CloudFormation Templates

```bash
# 1. Deploy B2B tables
aws cloudformation deploy \
  --template-file cloudformation/dynamodb-b2b-tables.yml \
  --stack-name jvtutorcorner-b2b \
  --region ap-northeast-1

# 2. Deploy RAG tables (optional, for future)
aws cloudformation deploy \
  --template-file cloudformation/dynamodb-rag-tables.yml \
  --stack-name jvtutorcorner-rag \
  --region ap-northeast-1
```

### Step 2: Enable Point-in-Time Recovery

```bash
# Critical tables only
for table in jvtutorcorner-profiles jvtutorcorner-orders jvtutorcorner-enrollments
do
  aws dynamodb update-continuous-backups \
    --table-name $table \
    --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
    --region ap-northeast-1
done
```

### Step 3: Run Critical Fixes

```bash
# 1. Add EmailIndex (REQUIRED)
node scripts/add-email-index.mjs

# Wait for index to be ACTIVE (5-10 minutes)
# Monitor:
watch -n 10 'aws dynamodb describe-table --table-name jvtutorcorner-profiles --query "Table.GlobalSecondaryIndexes[?IndexName=='\''EmailIndex'\''].IndexStatus"'

# 2. Standardize UserIds (after EmailIndex is active)
node scripts/migrate-userid-standardization.mjs

# 3. Add B2B fields
node scripts/migrate-add-b2b-fields.mjs
```

### Step 4: Update Code

Replace all Scan operations with Query:

**Before:**
```typescript
const scanRes = await ddbDocClient.send(new ScanCommand({
  TableName: PROFILES_TABLE,
  FilterExpression: 'email = :email',
  ExpressionAttributeValues: { ':email': email }
}));
```

**After:**
```typescript
const queryRes = await ddbDocClient.send(new QueryCommand({
  TableName: PROFILES_TABLE,
  IndexName: 'EmailIndex',
  KeyConditionExpression: 'email = :email',
  ExpressionAttributeValues: { ':email': email }
}));
```

### Step 5: Deploy Application Code

```bash
# 1. Update environment variables
# Add to .env.production:
DYNAMODB_TABLE_ORGANIZATIONS=jvtutorcorner-organizations
DYNAMODB_TABLE_LICENSES=jvtutorcorner-licenses

# 2. Deploy to staging first
npm run build
amplify publish --stage staging

# 3. Run smoke tests
npm run test:e2e

# 4. Deploy to production
amplify publish --stage production
```

---

## 🔄 Rollback Procedures

### If EmailIndex Creation Fails

```bash
# Remove the index
aws dynamodb update-table \
  --table-name jvtutorcorner-profiles \
  --global-secondary-index-updates \
    "[{\"Delete\":{\"IndexName\":\"EmailIndex\"}}]" \
  --region ap-northeast-1
```

### If Data Migration Fails

```bash
# Restore from Point-in-Time (example: restore to 1 hour ago)
aws dynamodb restore-table-to-point-in-time \
  --source-table-name jvtutorcorner-profiles \
  --target-table-name jvtutorcorner-profiles-restored \
  --restore-date-time $(date -u -d '1 hour ago' +"%Y-%m-%dT%H:%M:%S") \
  --region ap-northeast-1

# Verify restored data
# Then rename tables if needed
```

---

## 📊 Monitoring

### CloudWatch Metrics to Watch

```bash
# Query latency (should decrease after EmailIndex)
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name SuccessfulRequestLatency \
  --dimensions Name=TableName,Value=jvtutorcorner-profiles \
              Name=Operation,Value=Query \
  --start-time $(date -u -d '1 hour ago' +"%Y-%m-%dT%H:%M:%S") \
  --end-time $(date -u +"%Y-%m-%dT%H:%M:%S") \
  --period 300 \
  --statistics Average \
  --region ap-northeast-1
```

### DynamoDB Console Checks

1. Go to AWS Console → DynamoDB → Tables → jvtutorcorner-profiles
2. Check "Indexes" tab → EmailIndex status should be "Active"
3. Check "Monitor" tab → "Read/Write Capacity" should show stable usage
4. Check "Items" tab → Verify sample items still have email field

---

## ❓ FAQ

**Q: Can I run add-email-index.mjs on a production table?**  
A: Yes! GSI creation is a non-blocking operation. Your table remains available during creation.

**Q: How long does EmailIndex creation take?**  
A: Depends on table size. For 100 items: ~1 minute. For 10,000 items: ~5-10 minutes.

**Q: Will adding EmailIndex increase costs?**  
A: Minimal. GSIs cost ~$0.25/GB/month storage. For 10K users (~5MB): < $0.01/month.

**Q: What if EmailIndex creation fails?**  
A: Check CloudWatch Logs. Common causes: insufficient IAM permissions, table is being updated already.

**Q: Can I delete EmailIndex if needed?**  
A: Yes, but don't! It's critical for performance. Use the rollback procedure if absolutely necessary.

---

## 📞 Support

For issues or questions:
1. Check the main [DB_SCHEMA_GAP_ANALYSIS.md](../DB_SCHEMA_GAP_ANALYSIS.md)
2. Review [B2B_IMPLEMENTATION_GUIDE.md](../B2B_IMPLEMENTATION_GUIDE.md)
3. Contact Backend Lead or Database Architect

---

**Last Updated:** February 19, 2026  
**Status:** add-email-index.mjs is ready to use. Other scripts pending implementation.
