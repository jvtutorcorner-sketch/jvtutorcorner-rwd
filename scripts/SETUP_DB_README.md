# DynamoDB Setup Script - Usage Guide

## Overview

This script initializes and updates all DynamoDB tables required for the B2B/B2C hybrid LMS platform with proper idempotency and error handling.

## Files

- **`scripts/setup-db.ts`** - TypeScript version (recommended for development)
- **`scripts/setup-db.mjs`** - JavaScript ES Module version (no compilation needed)

## What It Does

### Tables Created (NEW):
1. **`jvtutorcorner-organizations`**
   - Purpose: B2B corporate accounts
   - PK: `id` (String)
   - GSI: `BillingEmailIndex`, `StatusIndex`
   - Attributes: `name`, `domain`, `planTier`, `status`, `maxSeats`, `usedSeats`, etc.

2. **`jvtutorcorner-org-units`**
   - Purpose: Hierarchical organizational structure (departments, teams)
   - PK: `id` (String)
   - GSI 1: `byOrgId` (PK: `orgId`, SK: `path`) - List all units in an org
   - GSI 2: `byParentId` (PK: `parentId`) - Find direct children
   - Attributes: `orgId`, `parentId`, `path`, `level`, `managerId`, etc.

3. **`jvtutorcorner-licenses`**
   - Purpose: B2B seat licenses
   - PK: `id` (String)
   - GSI 1: `byOrgId` (PK: `orgId`, SK: `status`) - Find org licenses
   - GSI 2: `byUserId` (PK: `userId`) - Find user's licenses
   - Attributes: `orgId`, `userId`, `status`, `totalSeats`, `usedSeats`, etc.

### Tables Updated (EXISTING):
4. **`jvtutorcorner-profiles`**
   - Action: Adds `byOrgId` GSI if it doesn't exist
   - GSI: `byOrgId` (PK: `orgId`) - Query employees by organization

5. **`jvtutorcorner-courses`**
   - Action: Verifies table exists (no changes)

## Authentication Patterns

### ✅ Production (Amplify/EC2 with IAM Role)
```bash
# DO NOT set AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY
# The script uses the attached IAM role automatically
node scripts/setup-db.mjs
```

### ✅ Local Development (with credentials)
```bash
# Set credentials in .env.local:
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=ap-northeast-1

# Then run:
node scripts/setup-db.mjs
```

## Usage

### Option 1: JavaScript Version (No Compilation)

```bash
# Ensure @aws-sdk/client-dynamodb is installed
npm install @aws-sdk/client-dynamodb

# Run the script
node scripts/setup-db.mjs
```

### Option 2: TypeScript Version (Recommended for Development)

```bash
# Install dependencies
npm install --save-dev typescript ts-node @types/node
npm install @aws-sdk/client-dynamodb

# Run with ts-node
npx ts-node scripts/setup-db.ts

# Or compile first
npx tsc scripts/setup-db.ts
node scripts/setup-db.js
```

### Option 3: Add to package.json Scripts

Add to your `package.json`:
```json
{
  "scripts": {
    "setup:db": "node scripts/setup-db.mjs",
    "setup:db:ts": "ts-node scripts/setup-db.ts"
  }
}
```

Then run:
```bash
npm run setup:db
# or
npm run setup:db:ts
```

## Environment Variables

### Required
- **`AWS_REGION`** - AWS region (default: `ap-northeast-1`)

### Optional (Local Dev Only)
- **`AWS_ACCESS_KEY_ID`** - AWS access key
- **`AWS_SECRET_ACCESS_KEY`** - AWS secret key

### Optional (Table Name Overrides)
- **`DYNAMODB_TABLE_ORGANIZATIONS`** - Default: `jvtutorcorner-organizations`
- **`DYNAMODB_TABLE_ORG_UNITS`** - Default: `jvtutorcorner-org-units`
- **`DYNAMODB_TABLE_LICENSES`** - Default: `jvtutorcorner-licenses`
- **`DYNAMODB_TABLE_PROFILES`** - Default: `jvtutorcorner-profiles`
- **`DYNAMODB_TABLE_COURSES`** - Default: `jvtutorcorner-courses`

## Example Runs

### Successful Run
```bash
$ node scripts/setup-db.mjs

╔════════════════════════════════════════════════════════╗
║   DynamoDB Setup - B2B/B2C Hybrid LMS Platform         ║
╚════════════════════════════════════════════════════════╝

Region: ap-northeast-1
Timestamp: 2026-02-19T10:30:00.000Z

🔑 [Setup] Using IAM role (production mode)

📦 [Organizations] Creating table: jvtutorcorner-organizations
✅ [Organizations] Table creation initiated
⏳ [jvtutorcorner-organizations] Waiting for table to become ACTIVE...
✅ [jvtutorcorner-organizations] Table is now ACTIVE

📦 [OrgUnits] Creating table: jvtutorcorner-org-units
✅ [OrgUnits] Table creation initiated
⏳ [jvtutorcorner-org-units] Waiting for table to become ACTIVE...
✅ [jvtutorcorner-org-units] Table is now ACTIVE

📦 [Licenses] Creating table: jvtutorcorner-licenses
✅ [Licenses] Table creation initiated
⏳ [jvtutorcorner-licenses] Waiting for table to become ACTIVE...
✅ [jvtutorcorner-licenses] Table is now ACTIVE

🔄 [Profiles] Updating table: jvtutorcorner-profiles
📝 [Profiles] Adding GSI: byOrgId
✅ [Profiles] GSI creation initiated
⏳ [jvtutorcorner-profiles] Waiting for GSI "byOrgId" to become ACTIVE...
✅ [jvtutorcorner-profiles] GSI "byOrgId" is now ACTIVE

🔍 [Courses] Verifying table: jvtutorcorner-courses
✅ [Courses] Table exists
   Status: ACTIVE

╔════════════════════════════════════════════════════════╗
║                    SETUP SUMMARY                       ║
╚════════════════════════════════════════════════════════╝

✅ Successful steps: 5/5
❌ Failed steps: 0/5

🎉 All steps completed successfully!

Next steps:
  1. Verify tables in AWS Console
  2. Update environment variables in your .env.local:
     DYNAMODB_TABLE_ORGANIZATIONS=jvtutorcorner-organizations
     DYNAMODB_TABLE_ORG_UNITS=jvtutorcorner-org-units
     DYNAMODB_TABLE_LICENSES=jvtutorcorner-licenses
  3. Deploy your application
```

### Idempotent Run (Tables Already Exist)
```bash
$ node scripts/setup-db.mjs

📦 [Organizations] Creating table: jvtutorcorner-organizations
⚠️  [Organizations] Table already exists, skipping creation

📦 [OrgUnits] Creating table: jvtutorcorner-org-units
⚠️  [OrgUnits] Table already exists, skipping creation

📦 [Licenses] Creating table: jvtutorcorner-licenses
⚠️  [Licenses] Table already exists, skipping creation

🔄 [Profiles] Updating table: jvtutorcorner-profiles
✅ [Profiles] GSI "byOrgId" already exists, no update needed

🔍 [Courses] Verifying table: jvtutorcorner-courses
✅ [Courses] Table exists
   Status: ACTIVE

✅ Successful steps: 5/5
❌ Failed steps: 0/5

🎉 All steps completed successfully!
```

## IAM Permissions Required

The AWS user/role running this script needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DescribeTable",
        "dynamodb:UpdateTable",
        "dynamodb:ListTables",
        "dynamodb:TagResource"
      ],
      "Resource": [
        "arn:aws:dynamodb:ap-northeast-1:*:table/jvtutorcorner-*"
      ]
    }
  ]
}
```

## Features

### ✅ Idempotency
- Checks if tables exist before creating
- Skips creation if table already exists
- Checks if GSIs exist before adding
- Safe to run multiple times

### ✅ Error Handling
- Catches `ResourceNotFoundException` gracefully
- Handles `ResourceInUseException` (race conditions)
- Provides detailed error messages
- Non-zero exit code on failures

### ✅ Wait Logic
- Waits for tables to become ACTIVE (up to 2 minutes)
- Waits for GSIs to become ACTIVE (up to 5 minutes)
- Polls every 5-10 seconds with status updates

### ✅ Clean Credential Pattern
- Uses IAM role in production (recommended)
- Uses explicit credentials only if set in environment
- No hardcoded credentials in code

## Troubleshooting

### Error: "Access Denied"
**Problem:** IAM role lacks DynamoDB permissions

**Solution:**
1. Check your IAM role has `dynamodb:CreateTable` permission
2. Verify the resource ARN matches your table name pattern
3. For local dev, ensure `.env.local` has valid AWS credentials

### Error: "ResourceInUseException: Table already exists"
**Problem:** Table is being created in another process

**Solution:**
- This is normal, the script will skip creation
- Wait for the other process to complete
- Run the script again

### Error: "Timeout waiting for table to become ACTIVE"
**Problem:** Table creation is taking longer than expected

**Solution:**
1. Check AWS Console to see table status
2. If creating large tables, increase timeout in script
3. Might be temporary AWS issue, try again

### Error: "Cannot update table: ResourceInUseException"
**Problem:** GSI is already being added in another process

**Solution:**
- Wait for the other update to complete (~5-10 minutes for GSI)
- Run the script again

## Verification

After running the script, verify in AWS Console:

```bash
# List tables
aws dynamodb list-tables --region ap-northeast-1

# Describe specific table
aws dynamodb describe-table \
  --table-name jvtutorcorner-organizations \
  --region ap-northeast-1
```

Expected output should show:
- Table status: `ACTIVE`
- GSIs status: `ACTIVE`
- Billing mode: `PAY_PER_REQUEST`
- Stream enabled: `true`

## Cost Estimates

### Table Creation (One-time)
- **Cost:** $0 (no charge to create tables)

### Monthly Costs (Estimated)
With **PAY_PER_REQUEST** billing:
- **Low usage** (dev/staging): ~$1-5/month
- **Medium usage** (1,000 orgs): ~$10-20/month
- **High usage** (10,000 orgs): ~$50-100/month

Actual costs depend on:
- Read/Write request volume
- Item sizes
- GSI usage
- Data storage

## Next Steps

After running setup successfully:

1. **Update Environment Variables**
   ```bash
   # Add to .env.local
   DYNAMODB_TABLE_ORGANIZATIONS=jvtutorcorner-organizations
   DYNAMODB_TABLE_ORG_UNITS=jvtutorcorner-org-units
   DYNAMODB_TABLE_LICENSES=jvtutorcorner-licenses
   ```

2. **Test Organization Creation**
   ```bash
   curl -X POST http://localhost:3000/api/organizations \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test Corp",
       "planTier": "business",
       "maxSeats": 10,
       "billingEmail": "admin@test.com"
     }'
   ```

3. **Deploy to Production**
   ```bash
   git add scripts/setup-db.*
   git commit -m "feat: Add DynamoDB setup script for B2B tables"
   git push origin main
   ```

4. **Run on Production**
   ```bash
   # SSH to your production server or use AWS SSM
   # Make sure IAM role is attached
   node scripts/setup-db.mjs
   ```

## Related Documentation

- [B2B_SECURITY_REVIEW.md](../B2B_SECURITY_REVIEW.md) - Security patterns and deployment guide
- [DB_SCHEMA_GAP_ANALYSIS.md](../DB_SCHEMA_GAP_ANALYSIS.md) - Database schema analysis
- [lib/organizationService.ts](../lib/organizationService.ts) - Organization CRUD operations
- [lib/orgUnitService.ts](../lib/orgUnitService.ts) - Org unit hierarchy logic

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review error messages carefully
3. Verify IAM permissions
4. Check AWS Console for table status
5. Consult AWS DynamoDB documentation

---

**Last Updated:** 2026-02-19  
**Author:** Senior AWS Backend Developer & DynamoDB Architect
