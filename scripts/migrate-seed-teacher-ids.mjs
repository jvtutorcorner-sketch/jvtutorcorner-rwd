#!/usr/bin/env node
/**
 * scripts/migrate-seed-teacher-ids.mjs
 *
 * 早期 seed 腳本把 data/teachers.ts 的示範資料寫進 DynamoDB，因此教師表裡存在
 * `t1`~`t4` 這種寫死的短 ID。這些其實是正常的教師資料，只是主鍵格式跟真正註冊
 * 的教師（UUID）不一致，會讓 /teachers、課程與審核紀錄無法用同一套邏輯串接。
 *
 * 本腳本把這些短 ID 換成 UUID：
 *   1. 備份所有要搬移的教師資料到 .local_data/
 *   2. 以新的 UUID 寫入同樣內容（保留 legacySeedId 方便追溯）
 *   3. 更新關聯資料表中的 teacherId
 *   4. 刪除舊的短 ID 記錄
 *
 * 預設為 dry-run，只列出將要做的事；加上 --apply 才會真的寫入。
 *
 *   node scripts/migrate-seed-teacher-ids.mjs
 *   node scripts/migrate-seed-teacher-ids.mjs --apply
 */
import { config } from 'dotenv';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
config({ path: path.join(ROOT, '.env.local'), quiet: true });

const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand, UpdateCommand } =
  await import('@aws-sdk/lib-dynamodb');

const APPLY = process.argv.includes('--apply');

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

/** 關聯資料表：欄位名 -> 存放教師 ID 的屬性 */
const RELATED_TABLES = [
  { table: process.env.DYNAMODB_TABLE_TEACHER_REVIEWS || 'jvtutorcorner-teacher-reviews', key: 'id', field: 'teacherId' },
  { table: process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses', key: 'id', field: 'teacherId' },
  { table: process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles', key: 'id', field: 'teacherId' },
  { table: process.env.DYNAMODB_TABLE_ENROLLMENTS || 'jvtutorcorner-enrollments', key: 'id', field: 'teacherId' },
];

/** seed 腳本產生的主鍵格式；真正註冊的教師是 UUID，不會命中 */
const SEED_ID_PATTERN = /^t\d+$/;

const region = process.env.AWS_REGION || 'ap-northeast-1';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region,
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  }),
  { marshallOptions: { removeUndefinedValues: true } }
);

async function scanAll(TableName) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(new ScanCommand({ TableName, ExclusiveStartKey }));
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function main() {
  console.log(`${APPLY ? '🚀 APPLY' : '🔍 DRY RUN'}  region=${region}  table=${TEACHERS_TABLE}\n`);

  const teachers = await scanAll(TEACHERS_TABLE);
  const seeded = teachers.filter(t => typeof t.id === 'string' && SEED_ID_PATTERN.test(t.id));

  if (seeded.length === 0) {
    console.log('沒有需要搬移的 seed 教師資料，結束。');
    return;
  }

  // id 對照表：舊短 ID -> 新 UUID
  const idMap = new Map(seeded.map(t => [t.id, randomUUID()]));
  console.log('將搬移的教師：');
  for (const t of seeded) {
    console.log(`  ${t.id} -> ${idMap.get(t.id)}  (${t.name || t.displayName || '未命名'}, status=${t.status || 'active'})`);
  }

  // 先掃出所有受影響的關聯資料，dry-run 也看得到影響範圍
  const relatedUpdates = [];
  for (const { table, key, field } of RELATED_TABLES) {
    let items;
    try {
      items = await scanAll(table);
    } catch (e) {
      console.log(`\n⚠️  略過 ${table}：${e.name}`);
      continue;
    }
    const affected = items.filter(i => idMap.has(i[field]));
    for (const item of affected) {
      relatedUpdates.push({ table, key, field, keyValue: item[key], from: item[field], to: idMap.get(item[field]) });
    }
    console.log(`\n${table}: ${affected.length} 筆需要更新 ${field}（總計 ${items.length} 筆）`);
    for (const item of affected) {
      console.log(`  ${key}=${item[key]}  ${field}: ${item[field]} -> ${idMap.get(item[field])}`);
    }
  }

  if (!APPLY) {
    console.log('\n(dry run，未寫入任何資料。加上 --apply 執行。)');
    return;
  }

  // 備份，讓這次搬移可以人工還原
  const backupDir = path.join(ROOT, '.local_data');
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `seed-teacher-migration-${Date.now()}.json`);
  await fs.writeFile(
    backupPath,
    JSON.stringify({ teachers: seeded, idMap: Object.fromEntries(idMap), relatedUpdates }, null, 2),
    'utf8'
  );
  console.log(`\n已備份原始資料到 ${backupPath}`);

  // 1) 先以新 UUID 寫入，確認成功後才動舊資料
  for (const teacher of seeded) {
    const newId = idMap.get(teacher.id);
    await ddb.send(new PutCommand({
      TableName: TEACHERS_TABLE,
      Item: { ...teacher, id: newId, legacySeedId: teacher.id, updatedAt: new Date().toISOString() },
    }));
    console.log(`✅ 已建立 ${newId}（原 ${teacher.id}）`);
  }

  // 2) 更新關聯資料
  for (const u of relatedUpdates) {
    await ddb.send(new UpdateCommand({
      TableName: u.table,
      Key: { [u.key]: u.keyValue },
      UpdateExpression: 'SET #f = :new',
      ConditionExpression: '#f = :old',
      ExpressionAttributeNames: { '#f': u.field },
      ExpressionAttributeValues: { ':new': u.to, ':old': u.from },
    }));
    console.log(`✅ 已更新 ${u.table} ${u.key}=${u.keyValue} 的 ${u.field}`);
  }

  // 3) 刪除舊的短 ID 記錄
  for (const teacher of seeded) {
    await ddb.send(new DeleteCommand({ TableName: TEACHERS_TABLE, Key: { id: teacher.id } }));
    console.log(`🗑️  已刪除舊記錄 ${teacher.id}`);
  }

  console.log('\n完成。');
}

main().catch(e => {
  console.error('搬移失敗：', e);
  process.exit(1);
});
