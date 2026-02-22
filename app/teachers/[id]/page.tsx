import React from 'react';
import { TEACHERS } from '@/data/teachers';
import { ServerT } from '@/components/IntlProvider';
import Link from 'next/link';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import TeacherEditButton from '@/components/auth/TeacherEditButton';

export default async function TeacherDetailPage({ params }: { params: any }) {
  const { id } = await params;

  let teacher: any = null;
  try {
    const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';
    const getCmd = new GetCommand({ TableName: TEACHERS_TABLE, Key: { id } });
    const result = await ddbDocClient.send(getCmd);
    teacher = result.Item || null;
  } catch (e) {
    console.error('[TeacherDetailPage] DynamoDB get error:', e);
  }

  // Fallback to static data
  if (!teacher) {
    teacher = TEACHERS.find(t => t.id === id);
  }

  if (!teacher) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <h2>找不到該老師</h2>
        <Link href="/teachers">回到列表</Link>
      </div>
    );
  }

  return (
    <main style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>

      <div style={{ display: 'flex', gap: '32px', marginTop: '24px', flexWrap: 'wrap' }}>
        <img
          src={teacher.avatarUrl}
          alt={teacher.name}
          style={{ width: '200px', height: '200px', borderRadius: '50%', objectFit: 'cover' }}
        />
        <div style={{ flex: 1 }}>
          <h1>{teacher.name}</h1>
          <p style={{ fontSize: '1.2rem', color: '#666', marginBottom: '8px' }}>
            {(teacher.subjects || []).join(' · ')}
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '16px 0' }}>
            {(teacher.languages || []).map((lang: string) => (
              <span key={lang} style={{ background: '#f3f4f6', padding: '4px 12px', borderRadius: '16px', fontSize: '14px' }}>
                {lang}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '40px', padding: '24px', background: '#f9fafb', borderRadius: '12px' }}>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '16px' }}>
          關於老師
        </h3>
        <p style={{ lineHeight: '1.6', whiteSpace: 'pre-line' }}>{teacher.intro}</p>
      </div>

    </main>
  );
}
