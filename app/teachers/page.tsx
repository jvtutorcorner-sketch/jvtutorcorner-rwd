import React from 'react';
import { TEACHERS } from '@/data/teachers';
import { TeacherCard } from '@/components/TeacherCard';
import SearchForm from '@/components/SearchForm';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import Pagination from '@/components/Pagination';
import { SUBJECTS } from '@/types/questionnaire';
import { T } from '@/components/IntlProvider';
import { subjectKey } from '@/lib/subjectI18n';
import type { Metadata } from 'next';
import { pageOpenGraph } from '@/lib/seo';

const TEACHERS_META_TITLE = '師資介紹';
const TEACHERS_META_DESCRIPTION = '認識 JV Tutor Corner 的線上家教老師，依科目與授課語言搜尋，查看老師簡介並預約一對一課程。';

export const metadata: Metadata = {
  title: TEACHERS_META_TITLE,
  description: TEACHERS_META_DESCRIPTION,
  // 篩選/分頁 query string 一律 canonical 回列表本身，避免重複內容
  alternates: { canonical: '/teachers' },
  openGraph: pageOpenGraph({ title: TEACHERS_META_TITLE, description: TEACHERS_META_DESCRIPTION, url: '/teachers' }),
};

export default async function TeachersPage({ searchParams }: { searchParams: Promise<any> }) {
  const spa = await searchParams;
  const teacherQuery = (spa?.teacher || '').toLowerCase().trim();
  const languageQuery = (spa?.language || '').toLowerCase().trim();
  const subjectQuery = (spa?.subject || '').trim();

  const limit = parseInt(spa?.limit || '20', 10);
  const page = parseInt(spa?.page || '1', 10);

  let teachers: any[] = [];
  try {
    const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';
    const scanCmd = new ScanCommand({ TableName: TEACHERS_TABLE });
    const result = await ddbDocClient.send(scanCmd);

    // Deduplicate by ID to prevent multiple entries
    const rawTeachers = result.Items || [];
    const uniqueMap = new Map();
    rawTeachers.sort((a, b) => (new Date(a.updatedAt || 0).getTime()) - (new Date(b.updatedAt || 0).getTime()));
    rawTeachers.forEach(t => {
      const id = t.id || t.roid_id;
      if (id) uniqueMap.set(id, t);
    });
    teachers = Array.from(uniqueMap.values());
  } catch (e) {
    console.error('[TeachersPage] DynamoDB scan error:', e);
  }

  if (teachers.length === 0) {
    teachers = TEACHERS;
  }

  const filteredTeachers = teachers.filter(t => {
    if (t.status === 'resigned') return false;

    const name = (t.name || t.displayName || '').toLowerCase();
    const lats = (t.languages || []).map((l: string) => l.toLowerCase());
    const teacherSubjects: string[] = t.subjects || [];

    if (teacherQuery && !name.includes(teacherQuery)) return false;
    if (languageQuery && !lats.some((l: string) => l.includes(languageQuery))) return false;
    if (subjectQuery && !teacherSubjects.some(s => s.includes(subjectQuery) || subjectQuery.includes(s))) return false;

    return true;
  });

  const totalItems = filteredTeachers.length;
  const startIndex = (page - 1) * limit;
  const paginatedTeachers = filteredTeachers.slice(startIndex, startIndex + limit);

  return (
    <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '24px' }}><T k="menu_teachers" /></h1>

      <section style={{ marginBottom: '24px' }}>
        <SearchForm
          targetPath="/teachers"
          initial={{ teacher: spa?.teacher, language: spa?.language }}
        />
      </section>

      {/* 科目篩選 */}
      <section style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', color: '#555', marginRight: '4px' }}><T k="teachers_subject_label" /></span>
          <a
            href="/teachers"
            style={{
              padding: '4px 12px',
              borderRadius: '999px',
              fontSize: '13px',
              border: '1px solid',
              borderColor: !subjectQuery ? '#22c55e' : '#d1d5db',
              background: !subjectQuery ? '#f0fdf4' : '#fff',
              color: !subjectQuery ? '#16a34a' : '#6b7280',
              textDecoration: 'none',
            }}
          >
            <T k="all" />
          </a>
          {SUBJECTS.map(s => (
            <a
              key={s}
              href={`/teachers?subject=${encodeURIComponent(s)}`}
              style={{
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '13px',
                border: '1px solid',
                borderColor: subjectQuery === s ? '#22c55e' : '#d1d5db',
                background: subjectQuery === s ? '#f0fdf4' : '#fff',
                color: subjectQuery === s ? '#16a34a' : '#6b7280',
                textDecoration: 'none',
              }}
            >
              <T k={subjectKey(s)} fallback={s} />
            </a>
          ))}
        </div>
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
          {subjectQuery ? (
            <T k="teachers_empty_subject" tVars={{ subject: subjectKey(subjectQuery) }} />
          ) : (
            <T k="teachers_empty_all" />
          )}
        </div>
      )}
    </main>
  );
}
