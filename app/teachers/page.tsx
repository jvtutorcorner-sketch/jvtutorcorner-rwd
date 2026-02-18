import React from 'react';
import { TEACHERS } from '@/data/teachers';
import { TeacherCard } from '@/components/TeacherCard';
import { useT, ServerT } from '@/components/IntlProvider';
import SearchForm from '@/components/SearchForm';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

export default async function TeachersPage() {
  const t = ServerT; // Use server-side translation helper if available, or just render keys

  let teachers: any[] = [];
  try {
    const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';
    const scanCmd = new ScanCommand({ TableName: TEACHERS_TABLE });
    const result = await ddbDocClient.send(scanCmd);
    teachers = result.Items || [];
  } catch (e) {
    console.error('[TeachersPage] DynamoDB scan error:', e);
  }

  // Fallback to static data if DB is empty for demo
  if (teachers.length === 0) {
    teachers = TEACHERS;
  }

  return (
    <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageBreadcrumb />
      <h1 style={{ marginBottom: '24px' }}><ServerT s="menu_teachers" /></h1>

      <section style={{ marginBottom: '32px' }}>
        <SearchForm targetPath="/teachers" />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
        {teachers.map(teacher => (
          <TeacherCard key={teacher.id || teacher.roid_id} teacher={teacher} />
        ))}
      </div>

      {teachers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#666' }}>
          目前沒有符合條件的老師。
        </div>
      )}
    </main>
  );
}
