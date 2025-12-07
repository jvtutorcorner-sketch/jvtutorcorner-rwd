#!/usr/bin/env node
import { fileURLToPath } from 'url';
import path from 'path';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || process.env.TEACHERS_TABLE || 'jvtutorcorner-teachers';
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || process.env.COURSES_TABLE || 'jvtutorcorner-courses';

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

async function loadData() {
  // Import the TypeScript data modules via runtime import
  const coursesModule = await import(path.resolve(__dirname, '../data/courses.ts'));
  const teachersModule = await import(path.resolve(__dirname, '../data/teachers.ts'));
  return { courses: coursesModule.COURSES || [], teachers: teachersModule.TEACHERS || [] };
}

function nowISO() {
  return new Date().toISOString();
}

async function seed() {
  const { courses, teachers } = await loadData();

  console.log('Seeding teachers into:', TEACHERS_TABLE);
  console.log('Seeding courses into:', COURSES_TABLE);

  let success = 0;
  let errors = 0;

  // Ensure both tables exist; if not, fallback to local files per table
  let teachersTableExists = true;
  let coursesTableExists = true;
  try {
    await client.send(new DescribeTableCommand({ TableName: TEACHERS_TABLE }));
  } catch (e) {
    teachersTableExists = false;
    console.warn(`Table ${TEACHERS_TABLE} not found or not accessible.`);
  }
  try {
    await client.send(new DescribeTableCommand({ TableName: COURSES_TABLE }));
  } catch (e) {
    coursesTableExists = false;
    console.warn(`Table ${COURSES_TABLE} not found or not accessible.`);
  }

  if (!teachersTableExists) {
    const outPath = path.resolve(__dirname, '../.local_data/teachers.json');
    try {
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, JSON.stringify(teachers, null, 2), 'utf8');
      console.log('Wrote local teachers file:', outPath);
    } catch (err) {
      console.error('Failed writing local teachers fallback file:', err);
      errors += teachers.length;
    }
  } else {
    for (const t of teachers) {
      const item = { ...t, createdAt: nowISO() };
      try {
        await ddbDocClient.send(new PutCommand({ TableName: TEACHERS_TABLE, Item: item }));
        console.log('Put teacher:', t.id);
        success++;
      } catch (e) {
        console.error('Failed put teacher:', t.id, e);
        errors++;
      }
    }
  }

  if (!coursesTableExists) {
    const outPath = path.resolve(__dirname, '../.local_data/courses.json');
    try {
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, JSON.stringify(courses, null, 2), 'utf8');
      console.log('Wrote local courses file:', outPath);
    } catch (err) {
      console.error('Failed writing local courses fallback file:', err);
      errors += courses.length;
    }
  } else {
    for (const c of courses) {
      const item = { ...c, createdAt: nowISO() };
      try {
        await ddbDocClient.send(new PutCommand({ TableName: COURSES_TABLE, Item: item }));
        console.log('Put course:', c.id);
        success++;
      } catch (e) {
        console.error('Failed put course:', c.id, e);
        errors++;
      }
    }
  }

  console.log(`Done. success=${success}, errors=${errors}`);
}

seed().catch((e) => {
  console.error('Seeding failed:', e);
  process.exit(1);
});
