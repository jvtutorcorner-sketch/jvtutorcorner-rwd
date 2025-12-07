#!/usr/bin/env node
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-northeast-1";
const endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT || process.env.AWS_DYNAMODB_ENDPOINT;
const ordersTable = process.env.DYNAMODB_TABLE_ORDERS || "jvtutorcorner-orders";
const enrollTable = process.env.ENROLLMENTS_TABLE || "jvtutorcorner-enrollments";
const teachersTable = process.env.DYNAMODB_TABLE_TEACHERS || "jvtutorcorner-teachers";
const coursesTable = process.env.DYNAMODB_TABLE_COURSES || "jvtutorcorner-courses";

const client = new DynamoDBClient(endpoint ? { region, endpoint } : { region });

async function tableExists(tableName) {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (err) {
    if (err?.name === "ResourceNotFoundException") return false;
    return false;
  }
}

async function createTableIfNotExists(tableName, pkName = "id") {
  const exists = await tableExists(tableName);
  if (exists) {
    console.log(`Table already exists: ${tableName}`);
    return;
  }

  const params = {
    TableName: tableName,
    AttributeDefinitions: [{ AttributeName: pkName, AttributeType: "S" }],
    KeySchema: [{ AttributeName: pkName, KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  };

  console.log(`Creating table ${tableName} (primary key: ${pkName})...`);
  await client.send(new CreateTableCommand(params));
  console.log(`Create request sent for ${tableName}. It may take a few seconds to become ACTIVE.`);
}

(async function main() {
  try {
    console.log("DynamoDB create-tables helper");
    console.log(`Region: ${region}`);
    if (endpoint) console.log(`Endpoint: ${endpoint}`);
    console.log(`Orders table: ${ordersTable}`);
    console.log(`Enrollments table: ${enrollTable}`);
    console.log(`Teachers table: ${teachersTable}`);
    console.log(`Courses table: ${coursesTable}`);

    await createTableIfNotExists(ordersTable, "orderId");
    await createTableIfNotExists(enrollTable, "id");
    await createTableIfNotExists(teachersTable, "id");
    await createTableIfNotExists(coursesTable, "id");

    console.log("Done. Tables creation requested.");
    console.log("You can verify via AWS Console or with AWS CLI: aws dynamodb describe-table --table-name <name>");
  } catch (err) {
    console.error("Error creating tables:", err?.message || err);
    process.exit(1);
  }
})();
