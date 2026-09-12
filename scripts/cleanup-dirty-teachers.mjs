// scripts/cleanup-dirty-teachers.mjs
/**
 * 刪除 jvtutorcorner-teachers 表中由 E2E 測試產生的殘留教師資料。
 *
 * 每次跑 e2e/navbar_verification.spec.ts 之類的測試都會透過 /api/register
 * 註冊一個新教師，並在公開教師表留下一筆空白資料（Teacher User_<timestamp>），
 * whiteboard helper 則會留下 group N-teacher。這支腳本負責清掉它們。
 *
 * 預設為 dry-run，只列出將被刪除的資料，不做任何寫入。
 * 實際執行前會先把完整資料備份成 JSON。
 *
 *   node scripts/cleanup-dirty-teachers.mjs              # dry-run 預覽
 *   node scripts/cleanup-dirty-teachers.mjs --confirm    # 實際刪除
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } = await import('@aws-sdk/lib-dynamodb');

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

/** E2E helper 產生的固定命名格式 */
const TEST_NAME_PATTERNS = [
  /^Teacher User_\d{13}$/,
  /^group[ -]\d+-teacher$/i,
];

const isDirtyTeacher = (t) =>
  TEST_NAME_PATTERNS.some(p => p.test(String(t?.name || '').trim()));

const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
}));

async function scanAll(TableName) {
  let items = [];
  let ExclusiveStartKey;
  do {
    const res = await client.send(new ScanCommand({ TableName, ExclusiveStartKey }));
    items = items.concat(res.Items || []);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function main() {
  const confirm = process.argv.includes('--confirm');

  const teachers = await scanAll(TEACHERS_TABLE);
  const targets = teachers.filter(isDirtyTeacher);

  console.log(`表格 ${TEACHERS_TABLE} 共 ${teachers.length} 筆，符合測試命名的有 ${targets.length} 筆。`);
  if (targets.length === 0) {
    console.log('沒有需要清除的資料。');
    return;
  }

  // 安全檢查：有掛課程的教師不刪，避免留下孤兒課程
  const courses = await scanAll(COURSES_TABLE);
  const courseCount = new Map();
  for (const c of courses) {
    const key = c.teacherId || c.teacherEmail;
    if (key) courseCount.set(key, (courseCount.get(key) || 0) + 1);
  }

  const withCourses = targets.filter(t => courseCount.get(t.id) || courseCount.get(t.email));
  const deletable = targets.filter(t => !courseCount.get(t.id) && !courseCount.get(t.email));

  for (const t of deletable) {
    console.log(`  DELETE ${String(t.id).padEnd(38)} ${String(t.name).padEnd(28)} ${t.email || '-'}`);
  }
  for (const t of withCourses) {
    const n = courseCount.get(t.id) || courseCount.get(t.email);
    console.log(`  SKIP   ${String(t.id).padEnd(38)} ${String(t.name).padEnd(28)} 尚有 ${n} 堂課程`);
  }

  if (!confirm) {
    console.log(`\n[dry-run] 未做任何變更。確認無誤後加上 --confirm 實際刪除 ${deletable.length} 筆。`);
    return;
  }

  // 備份後才刪除
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = resolve(__dirname, '..', `teachers-backup-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify(deletable, null, 2), 'utf8');
  console.log(`\n已備份 ${deletable.length} 筆至 ${backupPath}`);

  let deleted = 0;
  for (let i = 0; i < deletable.length; i += 25) {
    const chunk = deletable.slice(i, i + 25);
    let unprocessed = {
      [TEACHERS_TABLE]: chunk.map(t => ({ DeleteRequest: { Key: { id: t.id } } })),
    };
    // BatchWrite 可能部分失敗，未處理的項目要重送
    for (let attempt = 0; attempt < 5 && Object.keys(unprocessed).length > 0; attempt++) {
      const res = await client.send(new BatchWriteCommand({ RequestItems: unprocessed }));
      const remaining = res.UnprocessedItems || {};
      const done = (unprocessed[TEACHERS_TABLE]?.length || 0) - (remaining[TEACHERS_TABLE]?.length || 0);
      deleted += done;
      unprocessed = (remaining[TEACHERS_TABLE]?.length) ? remaining : {};
      if (Object.keys(unprocessed).length > 0) {
        await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
      }
    }
    if (Object.keys(unprocessed).length > 0) {
      console.error(`  ⚠️  有 ${unprocessed[TEACHERS_TABLE].length} 筆重試後仍失敗`);
    }
  }

  console.log(`已刪除 ${deleted} 筆。`);

  const after = await scanAll(TEACHERS_TABLE);
  console.log(`表格剩餘 ${after.length} 筆，其中仍符合測試命名的有 ${after.filter(isDirtyTeacher).length} 筆。`);
}

main().catch(err => {
  console.error('清除失敗:', err);
  process.exit(1);
});
