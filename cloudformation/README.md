# DynamoDB CloudFormation - jvtutorcorner tables

This folder contains a CloudFormation template to create DynamoDB tables used
by the project.

Files:
- `dynamodb-tables.yml` — creates two tables (teachers and courses). Default
  names are `jvtutorcorner-teachers` and `jvtutorcorner-courses`.

How to deploy
1. Ensure you have AWS CLI configured with credentials that have permissions
   to create DynamoDB tables in the target account/region.

2. Deploy using `aws cloudformation deploy`:

```bash
aws cloudformation deploy \
  --template-file cloudformation/dynamodb-tables.yml \
  --stack-name jvtutorcorner-dynamodb \
  --parameter-overrides TeachersTableName=jvtutorcorner-teachers CoursesTableName=jvtutorcorner-courses \
  --region ap-northeast-1
```

3. After deployment, note the output table names / ARNs. Update your environment
   variables or application configuration if you changed the default names.

IAM permissions required
- `dynamodb:CreateTable`
- `dynamodb:DescribeTable`
- `cloudformation:CreateStack` / `cloudformation:DescribeStacks` (if using CFN)

Notes
- The template uses `PAY_PER_REQUEST` billing (on-demand). Adjust if you need
  provisioned capacity.
- A TTL attribute `expiresAt` is declared but disabled by default. Enable it
  after deciding your retention policy.
CloudFormation template to create DynamoDB tables for the JVTC project.

Files
- `dynamodb-tables.yml`: CloudFormation template that creates two DynamoDB tables:
  - Orders table (primary key: `orderId`)
  - Enrollments table (primary key: `id`)

Usage (Admin)

1) Deploy via AWS Console
- Sign in to AWS Console with an administrator account.
- Go to CloudFormation → Create stack → With new resources (standard).
- Upload `dynamodb-tables.yml`, set stack name (e.g., `jvtutorcorner-dynamodb`), optionally override parameter values.
- Create the stack and wait until `CREATE_COMPLETE`.

2) Deploy via AWS CLI

Replace `<STACK_NAME>` if desired:

```bash
aws cloudformation deploy \
  --template-file cloudformation/dynamodb-tables.yml \
  --stack-name jvtutorcorner-dynamodb \
  --parameter-overrides OrdersTableName=jvtutorcorner-orders EnrollmentsTableName=jvtutorcorner-enrollments
```

3) After deployment
- The CloudFormation outputs include the table names and ARNs. You can use these values to set the environment variables for the application.

Recommended minimal IAM policy for the application user

Ask an administrator to attach a minimal policy to the application IAM user (or role) so the app can operate on the tables. Replace `<ACCOUNT_ID>` and table names as necessary.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBTableAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Scan",
        "dynamodb:Query",
        "dynamodb:DescribeTable"
      ],
      "Resource": [
        "arn:aws:dynamodb:${AWS::Region}:<ACCOUNT_ID>:table/jvtutorcorner-orders",
        "arn:aws:dynamodb:${AWS::Region}:<ACCOUNT_ID>:table/jvtutorcorner-enrollments"
      ]
    }
  ]
}
```

Notes
- Creating tables requires permissions such as `dynamodb:CreateTable`. If you prefer the minimal-change route, ask an admin to run the CloudFormation deployment, then attach the minimal policy above to the `amplify-user` or application role.
- For local development you can continue to use the `scripts/create-dynamo-tables.mjs` with `DYNAMODB_LOCAL_ENDPOINT` pointing to a local DynamoDB instance.
