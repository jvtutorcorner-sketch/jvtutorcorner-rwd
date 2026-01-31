"use client";

import React from 'react';
import { useParams } from 'next/navigation';
import { TEACHERS } from '@/data/teachers';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useT } from '@/components/IntlProvider';
import Link from 'next/link';

export default function TeacherDetailPage() {
  const { id } = useParams();
  const t = useT();
  const teacher = TEACHERS.find(t => t.id === id);

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
      <PageBreadcrumb />
      
      <div style={{ display: 'flex', gap: '32px', marginTop: '24px', flexWrap: 'wrap' }}>
        <img 
          src={teacher.avatarUrl} 
          alt={teacher.name} 
          style={{ width: '200px', height: '200px', borderRadius: '50%', objectFit: 'cover' }}
        />
        <div style={{ flex: 1 }}>
          <h1>{teacher.name}</h1>
          <p style={{ fontSize: '1.2rem', color: '#666' }}>{teacher.subjects.join(' · ')}</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '16px 0' }}>
            {teacher.languages.map(lang => (
              <span key={lang} style={{ background: '#f3f4f6', padding: '4px 12px', borderRadius: '16px', fontSize: '14px' }}>
                {lang}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '40px', padding: '24px', background: '#f9fafb', borderRadius: '12px' }}>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '16px' }}>關於老師</h3>
        <p style={{ lineHeight: '1.6', whiteSpace: 'pre-line' }}>{teacher.intro}</p>
      </div>

    </main>
  );
}
