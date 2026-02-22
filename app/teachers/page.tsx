import React from 'react';
import { TEACHERS } from '@/data/teachers';
import { TeacherCard } from '@/components/TeacherCard';
import SearchForm from '@/components/SearchForm';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import Pagination from '@/components/Pagination';

export default async function TeachersPage({ searchParams }: { searchParams: Promise<any> }) {
  const spa = await searchParams;
  const teacherQuery = (spa?.teacher || '').toLowerCase().trim();
  const languageQuery = (spa?.language || '').toLowerCase().trim();

  const limit = parseInt(spa?.limit || '20', 10);
  const page = parseInt(spa?.page || '1', 10);

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

  // Client-side filtering (simulated on server for searchParams)
  const filteredTeachers = teachers.filter(t => {
    const name = (t.name || t.displayName || '').toLowerCase();
    const lats = (t.languages || []).map((l: string) => l.toLowerCase());

    if (teacherQuery && !name.includes(teacherQuery)) return false;
    if (languageQuery && !lats.some((l: string) => l.includes(languageQuery))) return false;

    return true;
  });

  // Pagination logic
  const totalItems = filteredTeachers.length;
  const startIndex = (page - 1) * limit;
  const paginatedTeachers = filteredTeachers.slice(startIndex, startIndex + limit);

  return (
    <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '24px' }}>專業師資</h1>

      <section style={{ marginBottom: '32px' }}>
        <SearchForm
          targetPath="/teachers"
          initial={{ teacher: spa?.teacher, language: spa?.language }}
        />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
        {paginatedTeachers.map(teacher => (
          <TeacherCard key={teacher.id || teacher.roid_id} teacher={teacher} />
        ))}
      </div>

      <Pagination
        totalItems={totalItems}
        pageSize={limit}
        currentPage={page}
      />

      {totalItems === 0 && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#666' }}>
          目前沒有符合條件的老師。
        </div>
      )}
    </main>
  );
}
