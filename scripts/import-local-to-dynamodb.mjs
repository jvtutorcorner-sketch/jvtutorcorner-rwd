#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-northeast-1';
const endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT || process.env.AWS_DYNAMODB_ENDPOINT;
const ordersTable = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
const enrollTable = process.env.ENROLLMENTS_TABLE || 'jvtutorcorner-enrollments';

const client = new DynamoDBClient(endpoint ? { region, endpoint } : { region });
const doc = DynamoDBDocumentClient.from(client);

const DATA_DIR = path.resolve(process.cwd(), '.local_data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const ENROLL_FILE = path.join(DATA_DIR, 'enrollments.json');

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error('Failed to read', file, e?.message || e);
    return [];
  }
}

async function ensureTableExists(tableName) {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return { exists: true };
  } catch (err) {
    return { exists: false, error: err };
  }
}

async function importItems(tableName, items) {
  let success = 0;
  const errors = [];
  for (const item of items) {
    try {
      await doc.send(new PutCommand({ TableName: tableName, Item: item }));
      success++;
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      errors.push({ item, error: msg });
    }
  }
  return { success, errors };
}

(async function main(){
  console.log('Import local .local_data into DynamoDB');
  console.log('Region:', region, 'Endpoint:', endpoint || '(AWS)');
  console.log('Orders table:', ordersTable);
  console.log('Enrollments table:', enrollTable);

  const orders = readJson(ORDERS_FILE);
  const enrolls = readJson(ENROLL_FILE);

  console.log('Found local orders:', orders.length, 'enrollments:', enrolls.length);

  const ordersTableCheck = await ensureTableExists(ordersTable);
  const enrollTableCheck = await ensureTableExists(enrollTable);

  if (!ordersTableCheck.exists) {
    console.error('Orders table not found or access denied:', ordersTableCheck.error?.message || ordersTableCheck.error);
  }
  if (!enrollTableCheck.exists) {
    console.error('Enrollments table not found or access denied:', enrollTableCheck.error?.message || enrollTableCheck.error);
  }

  if (!ordersTableCheck.exists || !enrollTableCheck.exists) {
    console.error('Aborting import. Ensure tables exist and your AWS credentials have necessary permissions (dynamodb:PutItem, dynamodb:DescribeTable).');
    process.exit(1);
  }

  if (orders.length > 0) {
    console.log('Importing orders...');
    const res = await importItems(ordersTable, orders);
    console.log(`Orders imported: ${res.success}, errors: ${res.errors.length}`);
    if (res.errors.length > 0) console.error('Order import errors sample:', res.errors.slice(0,3));
  }

  if (enrolls.length > 0) {
    console.log('Importing enrollments...');
    const res2 = await importItems(enrollTable, enrolls);
    console.log(`Enrollments imported: ${res2.success}, errors: ${res2.errors.length}`);
    if (res2.errors.length > 0) console.error('Enroll import errors sample:', res2.errors.slice(0,3));
  }

  console.log('Import finished.');
})();
